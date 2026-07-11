from fastapi import FastAPI, APIRouter, HTTPException, Header
from fastapi.responses import Response, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage


# Configure logging EARLY so logger is available in route handlers
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Expose mongo db via app.state zodat sub-routers (bv. shopify_wallet) er bij kunnen
app.state.mongo_db = db

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ── Shopify Wallet router (orders/paid webhook + admin queue) ──────────
try:
    from shopify_wallet import wallet_router as _shopify_wallet_router
    app.include_router(_shopify_wallet_router)
    logger.info("Shopify wallet router geladen op /api/wallet/*")
except Exception as _e:
    logger.exception("Shopify wallet router niet geladen: %s", _e)

# ── B2C Post Boost router ──────────────────────────────────────────
try:
    from boost_router import boost_router as _boost_router
    app.include_router(_boost_router)
    logger.info("B2C Boost router geladen op /api/boost/*")
except Exception as _e:
    logger.exception("Boost router niet geladen: %s", _e)

# ── Weekly Campaign Reports (cron + admin trigger) ─────────────────
try:
    import weekly_reports
    logger.info("weekly_reports module geladen")
except Exception as _e:
    logger.exception("weekly_reports niet geladen: %s", _e)
    weekly_reports = None  # type: ignore

# ── SEO Sitemap.xml + robots.txt (Fase D) ──────────────────────────
try:
    from sitemap_router import sitemap_router as _sitemap_router
    app.include_router(_sitemap_router)
    logger.info("sitemap router geladen op /api/sitemap.xml + /api/robots.txt")
except Exception as _e:
    logger.exception("sitemap router niet geladen: %s", _e)


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks


# ════════════════════════════════════════════════════════════════
# PWA DEPLOY BUNDLE DOWNLOAD
# Serveert /app/*.zip bundles voor handmatige Cloudflare deploys
# ════════════════════════════════════════════════════════════════
@api_router.get("/downloads/{filename}")
async def download_bundle(filename: str):
    # Restrictie: alleen toegestane extensies, geen path traversal (/, ..)
    ALLOWED_EXTS = (".zip", ".jpg", ".jpeg", ".png", ".webp", ".pdf", ".md", ".js", ".html", ".css", ".txt")
    if not filename.lower().endswith(ALLOWED_EXTS) or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Ongeldige bestandsnaam")

    # Zoek bestand in /app (zips) of /app/pwa/branding (logo's, individuele bestanden)
    candidates = [Path("/app") / filename, Path("/app/pwa/branding") / filename]
    path = next((p for p in candidates if p.exists() and p.is_file()), None)
    if not path:
        raise HTTPException(status_code=404, detail="Bestand niet gevonden")

    # Bepaal MIME
    ext = path.suffix.lower()
    media_types = {
        ".zip": "application/zip",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".md":  "text/markdown",
        ".js":  "application/javascript",
        ".html":"text/html",
        ".css": "text/css",
        ".txt": "text/plain",
    }
    return FileResponse(
        path=str(path),
        media_type=media_types.get(ext, "application/octet-stream"),
        filename=filename,
    )


# ════════════════════════════════════════════════════════════════
# v60.1.46, AI Health + Wardrobe Recommend endpoints
# Geactiveerd om "Wat te dragen deze week"-popup netwerkfout op te lossen.
# ════════════════════════════════════════════════════════════════
class WardrobeRecommendRequest(BaseModel):
    user_key: Optional[str] = None
    saved_items: Optional[List[dict]] = None
    recent_scores: Optional[List[dict]] = None
    weather: Optional[str] = None
    occasion: Optional[str] = "dagelijks"


@api_router.get("/ai/health")
async def ai_health():
    """Health check voor frontend AI-gating (ai-health-v1.js)."""
    key_set = bool(os.environ.get("EMERGENT_LLM_KEY"))
    return {
        "status": "ok",
        "emergent_key_configured": key_set,
        "endpoints": ["/api/wardrobe/recommend"],
    }


# ════════════════════════════════════════════════════════════════════════
# v60.1.252 . CENTRALE AI AUTORISATIE (server-side defense-in-depth)
#
# Verifieert de Bearer ID-token, checkt Premium status, en beheert de
# maandelijkse quota-teller in Firestore `ai_usage/{uid}_{YYYY-MM}`.
# Wordt aangeroepen door alle beschermde AI-endpoints (tryon, outfit-
# score, style-assistant, wardrobe-recommend, weekly-stylist).
#
# STRICT MODE:
#   - `AI_STRICT_AUTH=true` in .env → hard 401/403 bij ontbrekend/verlopen
#     token of quota-op. Aanbevolen voor productie.
#   - Uitgeschakeld (default) → soft check: log warning maar sta door.
# ════════════════════════════════════════════════════════════════════════
AI_FREE_LIMIT = int(os.environ.get("AI_FREE_LIMIT", "5") or 5)
AI_STRICT_AUTH = str(os.environ.get("AI_STRICT_AUTH", "true")).lower() in ("1", "true", "yes", "on")

# v60.1.267 . AI RATE LIMITING (sliding window per user_key)
# Voorkomt spam/abuse van de Emergent LLM key. Gebruikt MongoDB om de
# laatste N timestamps per uid bij te houden. Retourneert HTTP 429
# wanneer de drempel is overschreden.
AI_RATE_LIMIT_MAX = int(os.environ.get("AI_RATE_LIMIT_MAX", "10") or 10)
AI_RATE_LIMIT_WINDOW_SEC = int(os.environ.get("AI_RATE_LIMIT_WINDOW_SEC", "60") or 60)


async def _ai_rate_limit_check(uid: str, endpoint: str) -> None:
    """Sliding-window rate limiter: max AI_RATE_LIMIT_MAX requests per
    AI_RATE_LIMIT_WINDOW_SEC seconds per uid. Gooit HTTPException(429).

    - Soft-fail bij Mongo-outage: laat door zodat de app blijft werken.
    - Aparte collectie `ai_rate_limits` (buiten Firestore): {user_key, ts[]}
    """
    if not uid:
        return  # anon calls hebben al andere guards; sla over
    try:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=AI_RATE_LIMIT_WINDOW_SEC)
        cutoff_ts = cutoff.timestamp()
        now_ts = now.timestamp()
        # Push nieuwe timestamp + set metadata (upsert). Haal de oude lijst
        # daarna op en filter zelf zodat cross-driver compat gewaarborgd is.
        result = await db.ai_rate_limits.find_one_and_update(
            {"user_key": uid},
            {
                "$push": {"ts": now_ts},
                "$set": {"last_endpoint": endpoint, "last_ts": now.isoformat()},
            },
            upsert=True,
            return_document=True,
        )
        current_list = (result or {}).get("ts", []) if result else []
        recent = [t for t in current_list if isinstance(t, (int, float)) and t >= cutoff_ts]
        # Verwijder verlopen timestamps periodiek uit Mongo
        if len(recent) != len(current_list):
            try:
                await db.ai_rate_limits.update_one({"user_key": uid}, {"$set": {"ts": recent}})
            except Exception:
                pass
        if len(recent) > AI_RATE_LIMIT_MAX:
            retry_after = AI_RATE_LIMIT_WINDOW_SEC
            try:
                oldest = min(recent)
                retry_after = max(1, int(AI_RATE_LIMIT_WINDOW_SEC - (now_ts - oldest)))
            except Exception:
                pass
            raise HTTPException(
                429,
                {
                    "error": "rate_limited",
                    "message": f"Te veel AI-verzoeken. Wacht {retry_after} seconden en probeer opnieuw.",
                    "limit": AI_RATE_LIMIT_MAX,
                    "window_sec": AI_RATE_LIMIT_WINDOW_SEC,
                    "retry_after_sec": retry_after,
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("[ai-ratelimit] soft-fail voor uid=%s endpoint=%s: %s", uid, endpoint, e)
        return  # soft fail


def _ai_month_key(now: Optional[datetime] = None) -> str:
    d = now or datetime.now(timezone.utc)
    return f"{d.year:04d}-{d.month:02d}"


def _ai_get_firestore():
    """Haal de Firestore-client op via de gedeelde shopify_wallet app.
    Returns None als Firebase niet geconfigureerd is (soft-fail voor dev)."""
    try:
        import shopify_wallet
        client = shopify_wallet._init_firebase()
        return client
    except Exception:
        return None


def _ai_check_admin_email(email: str) -> bool:
    """Admin emails krijgen altijd premium-toegang (bypass quota)."""
    email = (email or "").lower().strip()
    if not email:
        return False
    admin_env = (os.environ.get("ADMIN_USER_EMAIL", "") + "," +
                 os.environ.get("ADMIN_PREMIUM_EMAILS", "")).lower()
    admin_set = {e.strip() for e in admin_env.split(",") if e.strip()}
    return email in admin_set


def _ai_parse_expiry(raw) -> Optional[datetime]:
    """Parse expires_at (ISO string of datetime) naar UTC datetime.
    Returns None bij ontbrekend/invalide waarde."""
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        # Support ISO 8601 met Z suffix
        s = str(raw).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def _ai_is_premium(uid: str, email: Optional[str]) -> bool:
    """Check Premium via Mongo `premium_users` (bestaande collection).

    v60.1.255: expires_at wordt geverifieerd. Verlopen premium →
    is_premium flag wordt automatisch verlaagd zodat de user direct
    terugvalt op het gratis 5/maand model.
    """
    if _ai_check_admin_email(email or ""):
        return True
    if not uid and not email:
        return False
    try:
        rec = None
        if uid:
            rec = await db.premium_users.find_one({"user_key": uid})
        if not rec and email:
            rec = await db.premium_users.find_one({"email": (email or "").lower().strip()})
        if not rec:
            return False
        if not rec.get("is_premium"):
            return False
        # v60.1.255: check expires_at
        expiry = _ai_parse_expiry(rec.get("expires_at"))
        if expiry is None:
            # Geen expiry-datum bekend → interpreteer als lifetime/actief
            return True
        now = datetime.now(timezone.utc)
        if expiry > now:
            return True  # nog geldig
        # Verlopen → downgrade automatisch zodat verdere calls direct 5/maand quota gebruiken
        try:
            await db.premium_users.update_one(
                {"_id": rec.get("_id")},
                {"$set": {
                    "is_premium": False,
                    "expired_at_check": now.isoformat(),
                    "downgraded_by": "ai_guard_auto",
                }},
            )
            logger.info("[ai-guard] premium verlopen voor uid=%s email=%s (was %s)", uid, email, expiry.isoformat())
        except Exception as e:
            logger.warning("[ai-guard] downgrade-write faalde: %s", e)
        return False
    except Exception:
        return False


def _ai_get_usage_and_inc(firestore_client, uid: str) -> int:
    """Leest de huidige maand-teller EN incrementeert deze atomair.
    Returns het NIEUWE count-getal. Wanneer Firestore niet beschikbaar
    is, geeft 0 terug (soft-fail)."""
    if not firestore_client or not uid:
        return 0
    try:
        from firebase_admin import firestore as _fs
        doc_id = f"{uid}_{_ai_month_key()}"
        ref = firestore_client.collection("ai_usage").document(doc_id)
        # Increment atomically
        ref.set({
            "userId": uid,
            "month": _ai_month_key(),
            "count": _fs.Increment(1),
            "laatsteUpdate": _fs.SERVER_TIMESTAMP,
            "source": "backend",
        }, merge=True)
        snap = ref.get()
        data = snap.to_dict() if snap and snap.exists else {}
        return int(data.get("count") or 0)
    except Exception as e:
        logger.warning("ai_usage increment faalde voor %s: %s", uid, e)
        return 0


def _ai_check_and_inc_atomic(firestore_client, uid: str, limit: int) -> tuple:
    """v60.1.256   Transactional check-and-increment.

    Voorkomt race condition bij gelijktijdige requests: leest count en
    verhoogt hem alleen als count < limit, allemaal in één Firestore
    transactie. Returns (new_count, allowed).

    - allowed=False → user is over quota, count is niet verhoogd
    - allowed=True  → nieuwe count na increment
    """
    if not firestore_client or not uid:
        return (0, True)  # soft-fail: sta door bij Firestore-outage
    try:
        from firebase_admin import firestore as _fs
        doc_id = f"{uid}_{_ai_month_key()}"
        ref = firestore_client.collection("ai_usage").document(doc_id)
        transaction = firestore_client.transaction()

        @_fs.transactional
        def _run(tx):
            snap = ref.get(transaction=tx)
            current = 0
            first_shown = False
            if snap.exists:
                data = snap.to_dict() or {}
                current = int(data.get("count") or 0)
                first_shown = bool(data.get("firstShown"))
            if current >= limit:
                return (current, False)
            tx.set(ref, {
                "userId": uid,
                "month": _ai_month_key(),
                "count": current + 1,
                "firstShown": first_shown or (current == 0),  # markeer bij eerste
                "laatsteUpdate": _fs.SERVER_TIMESTAMP,
                "source": "backend",
            }, merge=True)
            return (current + 1, True)

        return _run(transaction)
    except Exception as e:
        logger.warning("[ai-guard] transactional inc faalde voor %s: %s", uid, e)
        return (0, True)  # soft-fail door, backend logt de fout


def _ai_get_usage_only(firestore_client, uid: str) -> int:
    """Leest de huidige count zonder increment (voor pre-check)."""
    if not firestore_client or not uid:
        return 0
    try:
        doc_id = f"{uid}_{_ai_month_key()}"
        snap = firestore_client.collection("ai_usage").document(doc_id).get()
        data = snap.to_dict() if snap and snap.exists else {}
        return int(data.get("count") or 0)
    except Exception:
        return 0


async def _verify_ai_access(authorization: Optional[str], *, endpoint: str = "ai") -> dict:
    """Hard AI-authorisatie:
        - Bearer token vereist (in STRICT mode → 401 zonder)
        - Verifieert token via Firebase Admin
        - Premium bypasst quota; anders check + increment maandteller
        - 403 bij quota-op (non-premium)
    Returns dict met {uid, email, premium, count}.
    """
    fs = _ai_get_firestore()

    # Geen Firebase configuratie → soft mode (log en laat door)
    if fs is None:
        if AI_STRICT_AUTH:
            raise HTTPException(503, "Firebase Admin niet geconfigureerd; AI-toegang tijdelijk niet beschikbaar")
        logger.warning("[ai-guard] geen Firebase   %s call zonder auth toegestaan", endpoint)
        return {"uid": None, "email": None, "premium": False, "count": 0, "strict": False}

    if not authorization or not authorization.startswith("Bearer "):
        if AI_STRICT_AUTH:
            raise HTTPException(401, "Login vereist voor AI-functionaliteit")
        logger.warning("[ai-guard] %s call zonder Bearer token (soft mode)", endpoint)
        return {"uid": None, "email": None, "premium": False, "count": 0, "strict": False}

    try:
        from firebase_admin import auth as fb_auth
        import shopify_wallet
        token = authorization[7:]
        decoded = fb_auth.verify_id_token(token, app=shopify_wallet._fb_app)
    except Exception as e:
        logger.warning("[ai-guard] token verify faalde: %s", e)
        raise HTTPException(401, "Ongeldig of verlopen sessie-token")

    uid = decoded.get("uid")
    email = decoded.get("email")
    if not uid:
        raise HTTPException(401, "Token bevat geen uid")

    # v60.1.267: Rate limiting (sliding window) VOOR premium/quota check.
    # Voorkomt dat premium users de API kunnen spammen.
    await _ai_rate_limit_check(uid, endpoint)

    premium = await _ai_is_premium(uid, email)
    if premium:
        return {"uid": uid, "email": email, "premium": True, "count": 0, "strict": True}

    # v60.1.256: Non-premium → ATOMISCH check + increment quota
    # (voorkomt race condition bij gelijktijdige requests)
    new_count, allowed = _ai_check_and_inc_atomic(fs, uid, AI_FREE_LIMIT)
    if not allowed:
        raise HTTPException(
            402,
            {
                "error": "quota_exceeded",
                "message": f"Je hebt je {AI_FREE_LIMIT} gratis AI-analyses voor deze maand gebruikt. Upgrade naar Premium voor onbeperkt gebruik.",
                "limit": AI_FREE_LIMIT,
                "count": new_count,
                "upgrade": True,
            },
        )
    return {"uid": uid, "email": email, "premium": False, "count": new_count, "strict": True}


@api_router.post("/wardrobe/recommend")
async def wardrobe_recommend(req: WardrobeRecommendRequest, authorization: Optional[str] = Header(None)):
    """Genereert 3 outfit-ideeën uit opgeslagen looks via Emergent LLM Key.

    Fallback bij geen items of geen key: heldere, niet-crashende response zodat
    de popup nooit een lege/Netwerkfout staat ziet.
    """
    await _verify_ai_access(authorization, endpoint="wardrobe_recommend")
    saved = req.saved_items or []
    if not saved:
        return {
            "ok": True,
            "fallback": True,
            "ideas": [],
            "message": "Bewaar eerst 1 of meer looks via het kaart-menu om persoonlijke aanbevelingen te krijgen.",
        }

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return {
            "ok": True,
            "fallback": True,
            "ideas": [
                {"titel": "Klassieke combinatie",
                 "omschrijving": "Combineer je favoriete top met een neutrale broek voor een tijdloze look."},
                {"titel": "Layer it up",
                 "omschrijving": "Probeer je opgeslagen jas over een fijngebreide trui, perfect voor de huidige tijd van het jaar."},
                {"titel": "Statement accent",
                 "omschrijving": "Voeg één opvallend item toe (kleur, textuur of accessoire) aan een rustige basis-outfit."},
            ],
            "message": "AI service niet geconfigureerd. Toon algemene tips.",
        }

    # Met Emergent LLM Key: real recommendation via Claude/Gemini
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        import asyncio

        items_text = "\n".join([
            f"- {i.get('title','onbekend')} ({i.get('category','')})"
            for i in saved[:10]
        ])
        prompt = (
            f"Je bent een persoonlijke stylist voor Tall & Plus Size mode. "
            f"FOCUS UITSLUITEND op de kledingstukken en hun combinaties. "
            f"Negeer irrelevante context.\n\n"
            f"Stel 3 outfit-combinaties voor uit deze opgeslagen looks:\n{items_text}\n\n"
            f"Gelegenheid: {req.occasion}. Weer: {req.weather or 'normaal'}.\n"
            f"Geef EXACT 3 ideeën, elk met titel (max 30 tekens) en korte omschrijving (max 120 tekens). "
            f"Antwoord in JSON: [{{\"titel\":\"...\",\"omschrijving\":\"...\"}}]"
        )
        chat = LlmChat(api_key=key, session_id=f"wardrobe-{req.user_key or 'anon'}",
                       system_message="Je bent een Nederlandse stylist voor de Paskamer Praat community.").with_model("openai", "gpt-4o-mini")
        # v60.1.271: harde timeout om oneindige hangs te voorkomen (bug: modal
        # bleef 10+ min bij "Onze stylist is je looks aan het combineren...").
        reply = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=30.0)
        import json as _json
        import re as _re
        m = _re.search(r"\[.*\]", reply, _re.DOTALL)
        ideas = _json.loads(m.group(0)) if m else []
        return {"ok": True, "ideas": ideas[:3]}
    except asyncio.TimeoutError:
        return {
            "ok": True,
            "fallback": True,
            "ideas": [
                {"titel": "Klassieke combi", "omschrijving": "Combineer een top-favoriet met een neutrale broek voor tijdloos comfort."},
                {"titel": "Layered look", "omschrijving": "Draag je jas over een fijngebreide trui, ideaal voor deze tijd van het jaar."},
                {"titel": "Statement accent", "omschrijving": "Voeg een opvallend item (kleur of textuur) toe aan een rustige basis."},
            ],
            "message": "AI service reageerde te traag, algemene tips getoond.",
        }
    except Exception as e:
        return {
            "ok": True,
            "fallback": True,
            "ideas": [
                {"titel": "Try a classic", "omschrijving": "Combineer je top-favoriet met een neutrale onderkant."},
            ],
            "message": f"AI tijdelijk onbeschikbaar. Fallback geactiveerd. ({str(e)[:80]})",
        }


# ════════════════════════════════════════════════════════════════
# PASKAMERPRAAT, Admin Image Generator (Gemini Nano Banana)
# v60.1.14, admin-only hero/banner generator via EMERGENT_LLM_KEY
# ════════════════════════════════════════════════════════════════

class ImageGenRequest(BaseModel):
    prompt: str
    aspect: Optional[str] = "portrait"  # portrait (1024x1536) | landscape (1200x630) | square | vertical_9_16 | wide_16_9
    style_hint: Optional[str] = "paskamerpraat"  # auto-prepend brand style if set
    # v60.1.242: optionele referentie-afbeelding voor image-to-image / style-transfer
    reference_image_base64: Optional[str] = None
    reference_mime_type: Optional[str] = None  # 'image/png' | 'image/jpeg' | 'image/webp'


PASKAMERPRAAT_STYLE_PROMPT = (
    "Editorial fashion photography in the style of high-end magazines. "
    "Warm cinematic lighting, golden hour glow, cream and clay color palette "
    "(#fcf8ef cream, #d4910a clay-gold accents, #0a0806 deep brown background). "
    "Inclusive body diversity, tall and plus-size models, petite and unisex bodies, "
    "natural skin textures, no airbrushing, confident and grounded poses. "
    "Body-positive composition, no diet or weight-loss imagery. "
    "Soft film grain, shallow depth of field, muted earth tones. "
)


def _check_admin_access(x_admin_secret: Optional[str], x_user_email: Optional[str]) -> None:
    """v60.1.44: shared admin-gate voor image + video endpoints.
    
    Defense in depth:
    1. ADMIN_GEN_SECRET moet matchen (gatekeeper)
    2. ADMIN_USER_EMAIL moet matchen indien gezet (email gate)
    
    Raises HTTPException 403 bij falen.
    """
    expected_secret = os.environ.get('ADMIN_GEN_SECRET')
    if not expected_secret or x_admin_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Forbidden: invalid admin secret")
    
    expected_email = os.environ.get('ADMIN_USER_EMAIL')
    if expected_email:
        if not x_user_email or x_user_email.strip().lower() != expected_email.strip().lower():
            raise HTTPException(status_code=403, detail="Forbidden: account heeft geen toegang tot deze functie")


@api_router.post("/admin/generate-image")
async def generate_image(
    req: ImageGenRequest,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Admin-only endpoint to generate hero/banner images via Gemini Nano Banana.
    
    Auth: X-Admin-Secret + X-User-Email (defense in depth).
    Returns: { ok, mime_type, base64, prompt_used }
    """
    _check_admin_access(x_admin_secret, x_user_email)
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY niet geconfigureerd")
    
    aspect_hint = {
        "portrait":     "Portrait aspect ratio 2:3 (1024x1536), vertical composition, full-body or 3/4 body shot.",
        "landscape":    "Landscape aspect ratio 16:9 (1200x630), wide horizontal composition suitable for social media banner.",
        "square":       "Square aspect ratio 1:1, balanced central composition.",
        "wide_16_9":    "Landscape aspect ratio 16:9 (1920x1080), cinematic widescreen composition for hero banner / desktop.",
        "vertical_9_16": "Vertical aspect ratio 9:16 (1080x1920), tall mobile-first composition ideal for stories/reels/TikTok.",
    }.get(req.aspect, "Portrait aspect ratio 2:3.")
    
    full_prompt = (
        f"{PASKAMERPRAAT_STYLE_PROMPT}{aspect_hint}\n\n"
        f"SUBJECT: {req.prompt}"
    )
    if req.reference_image_base64:
        full_prompt += "\n\nSTYLE REFERENCE: use the uploaded reference image as the primary visual/style anchor. Match its palette, mood, and composition. Retain the subject described above but transform it in the reference's style."
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"paskamerpraat-imggen-{uuid.uuid4()}",
            system_message="You are a professional fashion editorial image generator."
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        
        # v60.1.242: als referentie-afbeelding aanwezig, geef mee via file_contents
        msg_kwargs = {"text": full_prompt}
        if req.reference_image_base64:
            try:
                # Schrijf tijdelijk naar disk zodat emergentintegrations het als file kan lezen
                import tempfile
                mime = req.reference_mime_type or "image/png"
                ext = ".png" if "png" in mime else (".webp" if "webp" in mime else ".jpg")
                tmp_path = None
                try:
                    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                        tmp.write(base64.b64decode(req.reference_image_base64))
                        tmp_path = tmp.name
                    # Probeer FileContentWithMimeType als beschikbaar
                    try:
                        from emergentintegrations.llm.chat import FileContentWithMimeType  # type: ignore
                        msg_kwargs["file_contents"] = [FileContentWithMimeType(file_path=tmp_path, mime_type=mime)]
                    except ImportError:
                        try:
                            from emergentintegrations.llm.chat import ImageContent  # type: ignore
                            msg_kwargs["file_contents"] = [ImageContent(image_base64=req.reference_image_base64)]
                        except ImportError:
                            logger.warning("emergentintegrations: geen bekende image-content class gevonden; prompt-only fallback")
                    msg = UserMessage(**msg_kwargs)
                    text, images = await chat.send_message_multimodal_response(msg)
                finally:
                    if tmp_path:
                        try:
                            os.unlink(tmp_path)
                        except Exception:
                            pass
            except Exception as ref_err:
                logger.exception("Reference image handling failed, falling back to text-only: %s", ref_err)
                msg = UserMessage(text=full_prompt)
                text, images = await chat.send_message_multimodal_response(msg)
        else:
            msg = UserMessage(text=full_prompt)
            text, images = await chat.send_message_multimodal_response(msg)
        
        if not images:
            raise HTTPException(status_code=502, detail=f"Geen afbeelding gegenereerd. Model response: {text[:200] if text else 'leeg'}")
        
        img = images[0]
        return {
            "ok": True,
            "mime_type": img.get('mime_type', 'image/png'),
            "base64": img['data'],
            "prompt_used": full_prompt,
            "aspect": req.aspect,
            "text_response": text[:500] if text else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail=f"Generatie mislukt: {str(e)}")


# ════════════════════════════════════════════════════════════════
# v60.1.44, Admin Video Generator (Sora 2 via EMERGENT_LLM_KEY)
# Text-to-video, UGC/editorial quality, admin-only
# ════════════════════════════════════════════════════════════════

class VideoGenRequest(BaseModel):
    prompt: str
    size: Optional[str] = "1280x720"     # "1280x720" | "1792x1024" | "1024x1792" | "1024x1024"
    duration: Optional[int] = 8           # 4 | 8 | 12 seconds
    model: Optional[str] = "sora-2"       # "sora-2" | "sora-2-pro"
    style_hint: Optional[str] = "paskamerpraat"
    # v60.1.242: optionele referentie-afbeelding voor image-to-video
    reference_image_base64: Optional[str] = None
    reference_mime_type: Optional[str] = None


PASKAMERPRAAT_VIDEO_STYLE = (
    "Editorial fashion video in the style of high-end magazine campaigns. "
    "Cinematic warm lighting, soft golden hour glow, shallow depth of field. "
    "Subtle natural camera movement (slow dolly or gentle pan), realistic motion. "
    "Inclusive body diversity (tall, plus-size, petite, unisex bodies), natural skin textures, "
    "real proportions, no airbrushing, no AI uncanny artifacts. "
    "Confident grounded poses with realistic small movements. "
    "Warm earth-tone palette (cream, camel, clay-gold, deep brown). "
    "Sharp UGC/social media reel quality, 24fps cinematic feel, no flicker. "
)


@api_router.post("/admin/generate-video")
async def generate_video(
    req: VideoGenRequest,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Admin-only Sora 2 text-to-video generation   ASYNC JOB PATTERN.

    v60.1.241: Sync request van 2-5 min blokkeert de proxy/ingress
    (Cloudflare/K8s geven 502 na ~60-100s). Nu:
      - POST retourneert direct { job_id, status:'pending' }
      - GET /api/admin/video-job/{job_id} pollt status
      - Achterin loopt de Sora 2 call in een background task
    """
    _check_admin_access(x_admin_secret, x_user_email)

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY niet geconfigureerd")

    # Validate inputs
    valid_sizes = {"1280x720", "1792x1024", "1024x1792", "1024x1024"}
    valid_durations = {4, 8, 12}
    valid_models = {"sora-2", "sora-2-pro"}
    if req.size not in valid_sizes:
        raise HTTPException(status_code=400, detail=f"Invalid size. Allowed: {sorted(valid_sizes)}")
    if req.duration not in valid_durations:
        raise HTTPException(status_code=400, detail=f"Invalid duration. Allowed: {sorted(valid_durations)}")
    if req.model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Invalid model. Allowed: {sorted(valid_models)}")

    full_prompt = f"{PASKAMERPRAAT_VIDEO_STYLE}\n\nSCENE: {req.prompt}"
    if req.reference_image_base64:
        full_prompt += "\n\nSTYLE REFERENCE: base the visual style, palette, and framing on the uploaded reference image."
    job_id = uuid.uuid4().hex

    _VIDEO_JOBS[job_id] = {
        "status": "pending",
        "created": datetime.now(timezone.utc).isoformat(),
        "model": req.model,
        "size": req.size,
        "duration": req.duration,
    }

    import asyncio
    asyncio.create_task(_run_video_job(
        job_id, full_prompt, req.model, req.size, req.duration, api_key,
        reference_image_base64=req.reference_image_base64,
        reference_mime_type=req.reference_mime_type,
    ))

    return {
        "ok": True,
        "job_id": job_id,
        "status": "pending",
        "poll_url": f"/api/admin/video-job/{job_id}",
        "estimated_seconds": 180,
    }


# In-memory job store (admin-only, single-instance is prima; oude jobs auto-cleaned)
_VIDEO_JOBS: dict = {}


def _cleanup_old_jobs():
    """Verwijder klaar/fout jobs ouder dan 1 uur."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    stale = []
    for jid, j in _VIDEO_JOBS.items():
        try:
            created = datetime.fromisoformat(j.get("created", ""))
            if created < cutoff and j.get("status") in ("done", "error"):
                stale.append(jid)
        except Exception:
            pass
    for jid in stale:
        _VIDEO_JOBS.pop(jid, None)


async def _run_video_job(job_id: str, prompt: str, model: str, size: str, duration: int, api_key: str,
                          reference_image_base64: Optional[str] = None,
                          reference_mime_type: Optional[str] = None):
    """Background task: run Sora 2 in thread executor, update job store."""
    import asyncio
    _cleanup_old_jobs()
    _VIDEO_JOBS[job_id]["status"] = "running"
    _VIDEO_JOBS[job_id]["started"] = datetime.now(timezone.utc).isoformat()
    try:
        from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration
        video_gen = OpenAIVideoGeneration(api_key=api_key)
        loop = asyncio.get_event_loop()

        def _call_sora():
            # v60.1.242: probeer image_to_video als er een referentie is,
            # anders text_to_video (huidige flow).
            if reference_image_base64:
                # Probeer verschillende signatures op basis van SDK-versie
                _ = reference_mime_type or "image/png"
                img_bytes = base64.b64decode(reference_image_base64)
                for attempt in [
                    lambda: video_gen.image_to_video(
                        prompt=prompt, image=img_bytes, model=model, size=size, duration=duration, max_wait_time=600
                    ),
                    lambda: video_gen.image_to_video(
                        prompt=prompt, image_base64=reference_image_base64,
                        model=model, size=size, duration=duration, max_wait_time=600
                    ),
                    lambda: video_gen.text_to_video(
                        prompt=prompt, model=model, size=size, duration=duration, max_wait_time=600,
                        reference_image=img_bytes
                    ),
                    lambda: video_gen.text_to_video(
                        prompt=prompt, model=model, size=size, duration=duration, max_wait_time=600
                    ),
                ]:
                    try:
                        return attempt()
                    except (AttributeError, TypeError):
                        continue
                # Alle attempts gefaald → laatste text_to_video fallback zonder ref
                return video_gen.text_to_video(
                    prompt=prompt, model=model, size=size, duration=duration, max_wait_time=600
                )
            return video_gen.text_to_video(
                prompt=prompt, model=model, size=size, duration=duration, max_wait_time=600
            )

        video_bytes = await loop.run_in_executor(None, _call_sora)
        if not video_bytes:
            _VIDEO_JOBS[job_id]["status"] = "error"
            _VIDEO_JOBS[job_id]["error"] = "Video generatie mislukt (geen output van Sora 2)"
            return
        b64 = base64.b64encode(video_bytes).decode('ascii')
        _VIDEO_JOBS[job_id]["status"] = "done"
        _VIDEO_JOBS[job_id]["finished"] = datetime.now(timezone.utc).isoformat()
        _VIDEO_JOBS[job_id]["mime_type"] = "video/mp4"
        _VIDEO_JOBS[job_id]["base64"] = b64
        _VIDEO_JOBS[job_id]["size_bytes"] = len(video_bytes)
        _VIDEO_JOBS[job_id]["prompt_used"] = prompt
    except Exception as e:
        logger.exception(f"Video generation background task failed (job_id={job_id})")
        _VIDEO_JOBS[job_id]["status"] = "error"
        _VIDEO_JOBS[job_id]["error"] = f"{type(e).__name__}: {str(e)[:400]}"


@api_router.get("/admin/video-job/{job_id}")
async def video_job_status(
    job_id: str,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Poll de status van een video-generation job."""
    _check_admin_access(x_admin_secret, x_user_email)
    _cleanup_old_jobs()
    job = _VIDEO_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} niet gevonden of verlopen")
    # Bij 'done' return het volledige payload; anders alleen status
    if job.get("status") == "done":
        return {
            "ok": True,
            "job_id": job_id,
            "status": "done",
            "mime_type": job["mime_type"],
            "base64": job["base64"],
            "size_bytes": job["size_bytes"],
            "prompt_used": job.get("prompt_used"),
            "size": job.get("size"),
            "duration": job.get("duration"),
            "model": job.get("model"),
        }
    if job.get("status") == "error":
        return {"ok": False, "job_id": job_id, "status": "error", "error": job.get("error")}
    # pending / running
    return {"ok": True, "job_id": job_id, "status": job.get("status", "pending"), "created": job.get("created"), "started": job.get("started")}


# ─── Legacy synchronous fallback (voor backwards compat) ─────────────
@api_router.post("/admin/generate-video-sync")
async def generate_video_sync(
    req: VideoGenRequest,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """DEPRECATED: sync versie. Gebruik /admin/generate-video (async) i.p.v. deze.
    Blijft beschikbaar voor als er directe scripts zijn die de oude vorm gebruiken."""
    _check_admin_access(x_admin_secret, x_user_email)

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY niet geconfigureerd")

    valid_sizes = {"1280x720", "1792x1024", "1024x1792", "1024x1024"}
    valid_durations = {4, 8, 12}
    valid_models = {"sora-2", "sora-2-pro"}
    if req.size not in valid_sizes:
        raise HTTPException(status_code=400, detail=f"Invalid size. Allowed: {sorted(valid_sizes)}")
    if req.duration not in valid_durations:
        raise HTTPException(status_code=400, detail=f"Invalid duration. Allowed: {sorted(valid_durations)}")
    if req.model not in valid_models:
        raise HTTPException(status_code=400, detail=f"Invalid model. Allowed: {sorted(valid_models)}")

    full_prompt = f"{PASKAMERPRAAT_VIDEO_STYLE}\n\nSCENE: {req.prompt}"

    try:
        from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration
        import asyncio
        video_gen = OpenAIVideoGeneration(api_key=api_key)
        loop = asyncio.get_event_loop()
        video_bytes = await loop.run_in_executor(
            None,
            lambda: video_gen.text_to_video(
                prompt=full_prompt,
                model=req.model,
                size=req.size,
                duration=req.duration,
                max_wait_time=600,
            )
        )

        if not video_bytes:
            raise HTTPException(status_code=502, detail="Video generatie mislukt (geen output)")

        b64 = base64.b64encode(video_bytes).decode('ascii')
        return {
            "ok": True,
            "mime_type": "video/mp4",
            "base64": b64,
            "prompt_used": full_prompt,
            "size": req.size,
            "duration": req.duration,
            "model": req.model,
            "size_bytes": len(video_bytes),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video generation failed")
        raise HTTPException(status_code=500, detail=f"Video generatie mislukt: {str(e)}")


# ════════════════════════════════════════════════════════════════════════
# PREMIUM SUBSCRIPTION (v60.1.119), volledig via Shopify (zie shopify_wallet.py)
# Stripe is verwijderd; alle Premium-betalingen lopen nu via Shopify Cart
# attributes (premium_user_key, premium_email, premium_plan). Deze sectie
# behoudt enkel de read-only endpoints + admin-grant/revoke flows.
# ════════════════════════════════════════════════════════════════════════
from fastapi import Request


@api_router.get("/premium/status")
async def premium_status(user_key: str, email: Optional[str] = None):
    # Admin-override: emails in ADMIN_PREMIUM_EMAILS krijgen altijd premium
    admin_emails = [
        e.strip().lower()
        for e in os.environ.get("ADMIN_PREMIUM_EMAILS", "").split(",")
        if e.strip()
    ]
    candidate_email = (email or "").strip().lower()
    candidate_key = (user_key or "").strip().lower()
    if admin_emails and (candidate_email in admin_emails or candidate_key in admin_emails):
        return {
            "is_premium": True,
            "plan": "premium_admin",
            "activated_at": "admin-override",
            "email": email or user_key,
        }

    rec = await db.premium_users.find_one({"user_key": user_key})
    if not rec and email:
        rec = await db.premium_users.find_one({"email": email})
    if not rec:
        return {"is_premium": False}
    # v60.1.255: verify expires_at → auto-downgrade bij verlopen premium
    now = datetime.now(timezone.utc)
    is_premium_flag = bool(rec.get("is_premium"))
    expiry = _ai_parse_expiry(rec.get("expires_at"))
    if is_premium_flag and expiry is not None and expiry <= now:
        try:
            await db.premium_users.update_one(
                {"_id": rec.get("_id")},
                {"$set": {
                    "is_premium": False,
                    "expired_at_check": now.isoformat(),
                    "downgraded_by": "premium_status_endpoint",
                }},
            )
        except Exception:
            pass
        is_premium_flag = False
    return {
        "is_premium": is_premium_flag,
        "plan": rec.get("plan"),
        "activated_at": rec.get("activated_at"),
        "expires_at": rec.get("expires_at"),
        "email": rec.get("email"),
    }


@api_router.post("/billing/portal")
async def billing_portal(user_key: str):
    # Shopify Customer Account portal, zelfservice voor abonnement-beheer.
    shop_domain = os.environ.get("SHOPIFY_SHOP_DOMAIN") or "doubleyousmallandtall.nl"
    return {
        "url": f"https://{shop_domain}/account",
        "provider": "shopify",
        "note": "Log in met het e-mailadres waarmee de Premium-aankoop is gedaan.",
    }


# ════════════════════════════════════════════════════════════════════════
# Outfit Score, Echte Gemini Vision implementatie (v60.1.76)
# Analyseert kledingoutfit foto via Gemini 3.1 Pro Preview vision model.
# Fallback naar deterministic placeholder bij key/parse fout zodat de
# frontend nooit een lege state krijgt.
# ════════════════════════════════════════════════════════════════════════
class OutfitScoreRequest(BaseModel):
    photo_b64: Optional[str] = None
    photo_url: Optional[str] = None        # v60.1.89: server-side fetch optie
    photo_mime: Optional[str] = "image/jpeg"
    uid: Optional[str] = None
    request_id: Optional[str] = None
    image_hash: Optional[str] = None


def _outfit_score_fallback(req: OutfitScoreRequest) -> dict:
    """Deterministic placeholder zodat de frontend nooit blanco staat."""
    h = req.image_hash or req.request_id or ""
    score = 70 + (sum(ord(c) for c in h) % 26)  # 70-95
    if score >= 90:
        label, tips = "Iconisch", ["Sterke silhouet en kleurkeuze", "Geweldige proporties"]
    elif score >= 80:
        label, tips = "Top fit", ["Mooie balans tussen lagen", "Accessoires passen perfect"]
    elif score >= 70:
        label, tips = "Goede look", ["Voeg een statement-stuk toe", "Speel met textuur"]
    else:
        label, tips = "Solide basis", ["Probeer iets meer contrast", "Schoenen kunnen scherper"]
    return {
        "score": score,
        "label": label,
        "tips": tips,
        "summary": "AI-analyse niet beschikbaar; heuristische score op basis van afbeelding-hash.",
        "color_palette": [],
        "breakdown": {"kleur": score, "fit": score, "styling": score, "occasion": score},
        "source": "fallback",
        "request_id": req.request_id,
        "image_hash": req.image_hash,
    }


@api_router.post("/outfit-score")
async def outfit_score(req: OutfitScoreRequest, authorization: Optional[str] = Header(None)):
    await _verify_ai_access(authorization, endpoint="outfit_score")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    # v60.1.89: als photo_b64 ontbreekt maar photo_url is gegeven,
    # fetch de afbeelding server-side. Dit omzeilt browser-CORS issues
    # bij Firebase Storage (was bron van hallucinatie: canvas raakte
    # tainted, toDataURL gaf leeg beeld, Gemini hallucineerde dan een
    # generieke "overhemd + stropdas" outfit).
    b64 = req.photo_b64
    photo_source = "client-b64"
    if (not b64) and req.photo_url:
        try:
            import base64 as _b64lib
            import httpx
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as cx:
                r = await cx.get(req.photo_url, headers={"User-Agent": "Doubleyou/1.0"})
                r.raise_for_status()
                ct = (r.headers.get("content-type") or "").lower()
                if not ct.startswith("image/"):
                    logger.warning("Outfit score: photo_url niet image content-type: %s", ct)
                else:
                    b64 = _b64lib.b64encode(r.content).decode("ascii")
                    photo_source = "server-fetched"
        except Exception as e:
            logger.warning("Outfit score: server-side image fetch mislukte: %s", e)
    if (not api_key) or (not b64):
        out = _outfit_score_fallback(req)
        out["photo_source"] = photo_source
        return out

    # v60.1.92: sanity check, b64 payload moet redelijke image-grootte
    # hebben. Te klein = placeholder/icon/avatar = niet scoren.
    try:
        import base64 as _b64check
        raw_len = len(_b64check.b64decode(b64, validate=False))
        if raw_len < 8 * 1024:                       # < 8KB
            logger.warning(
                "Outfit score: image te klein (%d bytes), waarschijnlijk "
                "placeholder/avatar. Geen analyse, fallback met note.",
                raw_len
            )
            out = _outfit_score_fallback(req)
            out["photo_source"] = photo_source
            out["error_hint"] = "image-too-small"
            return out
    except Exception:
        pass

    system_prompt = (
        "Je bent een professionele Tall & Plus Size fashion stylist voor Doubleyou. "
        "Je krijgt EEN foto van een outfit. Volg STRIKT deze stappen:\n"
        "\n"
        "FOCUS-DIRECTIVE (v60.1.244): Analyseer UITSLUITEND de meest prominente persoon "
        "in de foto en HUN kleding, silhouet, houding en pasvorm. NEGEER volledig: "
        "achtergrondkleuren, meubilair, muren, decor, gordijnen, verlichting van de "
        "omgeving, andere personen op de achtergrond, en willekeurige objecten. "
        "Als er meerdere personen zijn, richt je op de centrale/grootste persoon. "
        "Baseer stijl-classificatie en tips UITSLUITEND op de zichtbare kledingstukken "
        "en het silhouet van de persoon.\n"
        "\n"
        "STAP 1 - KIJK ZORGVULDIG naar de persoon en HUN kleding. Identificeer per kledingstuk:\n"
        "  - Type (bv. hoodie, sweater, T-shirt, blouse, overhemd, jurk, broek, "
        "joggingbroek, jeans, rok, blazer, jas, schoenen, sneakers, etc.)\n"
        "  - Kleur (specifieke benoeming)\n"
        "  - Stijlcategorie: sportief / casual / smart-casual / zakelijk / avond / lounge\n"
        "STAP 2 - Bepaal de DOMINANTE stijlcategorie van de OUTFIT als geheel.\n"
        "STAP 3 - Geef tips die PASSEN bij de werkelijk zichtbare stijl. "
        "GEEF NOOIT tips over boord/dasknoop/stropdas/colbert/manchet bij een "
        "casual/sportieve look (hoodie, sweater, jogger, T-shirt, sneakers).\n"
        "STAP 4 - Geef de score volgens richtlijn.\n"
        "\n"
        "Antwoord UITSLUITEND in valide JSON. Geen markdown, geen toelichting buiten JSON. "
        "Schema:\n"
        "{\n"
        '  "score": <int 0-100>,\n'
        '  "stijl": "<sportief|casual|smart-casual|zakelijk|avond|lounge>",\n'
        '  "kledingstukken": ["<type kledingstuk + kleur, bv. zwarte hoodie>", "..."],\n'
        '  "label": "<korte titel, max 3 woorden NL, gerelateerd aan stijl>",\n'
        '  "summary": "<1 zin NL, max 140 tekens; benoem stijl + kernobservatie>",\n'
        '  "tips": ["<tip 1 NL, passend bij stijl>", "<tip 2 NL>", "<tip 3 NL>"],\n'
        '  "color_palette": ["#hex1", "#hex2", "#hex3"],\n'
        '  "breakdown": {"kleur": <int>, "fit": <int>, "styling": <int>, "occasion": <int>}\n'
        "}\n"
        "Wees concreet, vriendelijk en focus op pasvorm voor tall (1.85m+) of plus size lichamen. "
        "Score-richtlijn: 90+ iconisch, 80-89 top fit, 70-79 goede look, 60-69 solide basis, <60 verbetering nodig. "
        "BELANGRIJK: zelfs als de foto onduidelijk is, baseer je antwoord ALTIJD op wat je daadwerkelijk ziet. "
        "Verzin nooit kledingstukken die niet zichtbaar zijn."
    )

    try:
        from emergentintegrations.llm.chat import ImageContent  # type: ignore
        chat = LlmChat(
            api_key=api_key,
            session_id=f"outfit-score-{req.request_id or req.image_hash or uuid.uuid4()}",
            system_message=system_prompt,
        ).with_model("gemini", "gemini-3.1-pro-preview")

        # Strip eventuele data:URL prefix
        if b64.startswith("data:"):
            try:
                b64 = b64.split(",", 1)[1]
            except Exception:
                pass

        image = ImageContent(image_base64=b64)
        msg = UserMessage(
            text="Analyseer deze outfit en geef een score volgens het JSON-schema in je instructies.",
            file_contents=[image],
        )

        reply = await chat.send_message(msg)
        text = reply if isinstance(reply, str) else getattr(reply, "content", str(reply))

        # Parse JSON, strip eventuele markdown code fences
        import json
        import re
        cleaned = text.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        # Pak eerste JSON-blok als er extra tekst omheen staat
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            cleaned = m.group(0)
        data = json.loads(cleaned)

        # Sanitize & normaliseer
        score = int(max(0, min(100, int(data.get("score", 75)))))
        label = str(data.get("label", "Goede look"))[:40]
        summary = str(data.get("summary", ""))[:200]
        tips = [str(t)[:140] for t in (data.get("tips") or [])][:5]
        palette = [str(c)[:9] for c in (data.get("color_palette") or [])][:6]
        bd_in = data.get("breakdown") or {}
        breakdown = {
            "kleur":    int(max(0, min(100, int(bd_in.get("kleur",    score))))),
            "fit":      int(max(0, min(100, int(bd_in.get("fit",      score))))),
            "styling":  int(max(0, min(100, int(bd_in.get("styling",  score))))),
            "occasion": int(max(0, min(100, int(bd_in.get("occasion", score))))),
        }
        stijl = str(data.get("stijl", "")).lower().strip()
        kledingstukken = [str(k)[:60] for k in (data.get("kledingstukken") or [])][:8]

        # v60.1.87: Safety net, bij sportief/casual mogen tips NIET
        # gaan over formele kleding-elementen (stropdas, dasknoop, boord,
        # manchet, colbert, etc.). Dit was de bron van klacht "AI niet
        # accuraat" wanneer Gemini incidenteel formele tips opdiste bij
        # een hoodie/sweater foto.
        FORMELE_TERMEN = (
            "stropdas", "dasknoop", "das ", "boord", "manchet",
            "colbert", "vest met das", "overhemd", "blouse manchet"
        )
        CASUAL_TYPES = ("sportief", "casual", "lounge", "smart-casual")
        if stijl in CASUAL_TYPES:
            for t in tips:
                if any(term in t.lower() for term in FORMELE_TERMEN):
                    logger.warning(
                        "Outfit score: formele tip ontvangen bij stijl=%s, "
                        "tips worden hergegenereerd: %s", stijl, t
                    )
                    # Vervang door generieke veilige casual tips
                    tips = [
                        "Speel met laagjes voor extra dimensie.",
                        "Houd kleurpalet rustig of voeg een statement-stuk toe.",
                        "Schoenen mogen sportief of clean blijven.",
                    ]
                    break

        return {
            "score": score,
            "label": label,
            "summary": summary,
            "tips": tips,
            "color_palette": palette,
            "breakdown": breakdown,
            "stijl": stijl or None,
            "kledingstukken": kledingstukken,
            "source": "gemini-3.1-pro-preview",
            "photo_source": photo_source,
            "request_id": req.request_id,
            "image_hash": req.image_hash,
        }
    except Exception as e:
        logger.warning("Outfit score Gemini Vision mislukt, fallback gebruikt: %s", e)
        out = _outfit_score_fallback(req)
        out["error_hint"] = str(e)[:120]
        return out


# ════════════════════════════════════════════════════════════════════════
# ADMIN PREMIUM MANAGEMENT (v60.1.57), Full entitlement system
# ════════════════════════════════════════════════════════════════════════
def _mask(key: Optional[str]) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "***"
    return key[:7] + "…" + key[-4:]


class GrantRevokeBody(BaseModel):
    email: str
    days: Optional[int] = 30
    note: Optional[str] = None


@api_router.get("/admin/premium/payments-status")
async def admin_payments_status(
    request: Request,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    shop_domain = os.environ.get("SHOPIFY_SHOP_DOMAIN") or ""
    webhook_secret = os.environ.get("SHOPIFY_WEBHOOK_SECRET") or ""
    return {
        "provider": "shopify",
        "shopify_shop_domain": shop_domain,
        "shopify_webhook_secret_set": bool(webhook_secret),
        "webhook_url": f"{str(request.base_url).rstrip('/')}/api/wallet/webhook/shopify",
        "admin_premium_emails": [e.strip() for e in os.environ.get("ADMIN_PREMIUM_EMAILS", "").split(",") if e.strip()],
        "environment": "preview" if "preview" in str(request.base_url) else "production",
    }


@api_router.get("/admin/premium/users")
async def admin_premium_users(
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    cursor = db.premium_users.find({}, {"_id": 0}).sort("activated_at", -1).limit(200)
    users = await cursor.to_list(length=200)
    admin_emails = [e.strip().lower() for e in os.environ.get("ADMIN_PREMIUM_EMAILS", "").split(",") if e.strip()]
    # Voeg admin-overrides toe als ze niet al in de DB staan
    existing = {u.get("email", "").lower() for u in users}
    for ae in admin_emails:
        if ae not in existing:
            users.insert(0, {
                "user_key": ae, "email": ae, "is_premium": True,
                "plan": "premium_admin", "source": "admin_override",
                "activated_at": "admin-override",
            })
    return {"users": users, "count": len(users)}


@api_router.post("/admin/premium/grant")
async def admin_premium_grant(
    body: GrantRevokeBody,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    if not body.email or "@" not in body.email:
        raise HTTPException(status_code=400, detail="Geldig email-adres vereist")
    email = body.email.strip().lower()
    days = max(1, min(int(body.days or 30), 3650))
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    rec = {
        "user_key": email,
        "email": email,
        "plan": "premium_grant",
        "is_premium": True,
        "source": "admin_grant",
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "granted_by": x_user_email,
        "note": (body.note or "")[:200],
    }
    await db.premium_users.update_one({"user_key": email}, {"$set": rec}, upsert=True)
    await db.premium_audit.insert_one({
        "action": "grant", "target_email": email, "days": days,
        "actor": x_user_email, "at": datetime.now(timezone.utc).isoformat(),
        "note": body.note,
    })
    return {"ok": True, "email": email, "expires_at": expires_at, "days": days}


@api_router.post("/admin/premium/revoke")
async def admin_premium_revoke(
    body: GrantRevokeBody,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email vereist")
    res = await db.premium_users.update_one(
        {"$or": [{"user_key": email}, {"email": email}]},
        {"$set": {"is_premium": False, "revoked_at": datetime.now(timezone.utc).isoformat(), "revoked_by": x_user_email}},
    )
    await db.premium_audit.insert_one({
        "action": "revoke", "target_email": email,
        "actor": x_user_email, "at": datetime.now(timezone.utc).isoformat(),
        "matched": res.matched_count,
    })
    return {"ok": True, "matched": res.matched_count, "email": email}


@api_router.get("/admin/premium/transactions")
async def admin_premium_transactions(
    limit: int = 50,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    limit = max(1, min(int(limit or 50), 200))
    cursor = db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    txns = await cursor.to_list(length=limit)
    return {"transactions": txns, "count": len(txns)}


# ════════════════════════════════════════════════════════════════════════
# v60.1.257 . Admin AI Usage Management
#   Endpoints om support-vragen als "mijn AI-quota klopt niet" snel af te
#   handelen: kijk stand op, en reset teller indien nodig. Alle acties
#   worden gelogd naar `premium_audit` collection voor traceerbaarheid.
# ════════════════════════════════════════════════════════════════════════
class AiUsageResetBody(BaseModel):
    uid: Optional[str] = None
    email: Optional[str] = None
    month: Optional[str] = None  # 'YYYY-MM'; default = huidige maand
    note: Optional[str] = None


async def _resolve_uid_from_email(email: str) -> Optional[str]:
    """Zoek Firebase uid op basis van email (via Firebase Admin Auth)."""
    email = (email or "").strip().lower()
    if not email:
        return None
    try:
        import shopify_wallet
        from firebase_admin import auth as fb_auth
        user = fb_auth.get_user_by_email(email, app=shopify_wallet._fb_app)
        return user.uid if user else None
    except Exception:
        return None


@api_router.get("/admin/ai-usage/lookup")
async def admin_ai_usage_lookup(
    uid: Optional[str] = None,
    email: Optional[str] = None,
    month: Optional[str] = None,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Bekijk de huidige AI-usage teller van een user (support-tool)."""
    _check_admin_access(x_admin_secret, x_user_email)
    if not uid and not email:
        raise HTTPException(400, "uid of email is vereist")
    resolved_uid = uid
    if not resolved_uid and email:
        resolved_uid = await _resolve_uid_from_email(email)
    if not resolved_uid:
        raise HTTPException(404, "Geen Firebase-user gevonden voor deze email/uid")
    fs = _ai_get_firestore()
    if not fs:
        raise HTTPException(503, "Firestore niet beschikbaar")
    month = (month or _ai_month_key()).strip()
    doc_id = f"{resolved_uid}_{month}"
    try:
        snap = fs.collection("ai_usage").document(doc_id).get()
        data = snap.to_dict() if snap and snap.exists else None
    except Exception as e:
        raise HTTPException(500, f"Firestore fetch faalde: {e}")
    return {
        "uid": resolved_uid,
        "email": email,
        "month": month,
        "doc_id": doc_id,
        "exists": data is not None,
        "count": int((data or {}).get("count") or 0),
        "limit": AI_FREE_LIMIT,
        "remaining": max(0, AI_FREE_LIMIT - int((data or {}).get("count") or 0)),
        "firstShown": bool((data or {}).get("firstShown")),
        "laatsteUpdate": str((data or {}).get("laatsteUpdate") or ""),
    }


@api_router.post("/admin/ai-usage/reset")
async def admin_ai_usage_reset(
    body: AiUsageResetBody,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Reset de AI-usage teller van een user voor huidige (of opgegeven) maand.
    Zet count=0 en firstShown=false zodat de user opnieuw start.
    Wordt gelogd in premium_audit voor traceerbaarheid."""
    _check_admin_access(x_admin_secret, x_user_email)
    if not body.uid and not body.email:
        raise HTTPException(400, "uid of email is vereist")
    resolved_uid = body.uid
    if not resolved_uid and body.email:
        resolved_uid = await _resolve_uid_from_email(body.email)
    if not resolved_uid:
        raise HTTPException(404, "Geen Firebase-user gevonden voor deze email/uid")
    fs = _ai_get_firestore()
    if not fs:
        raise HTTPException(503, "Firestore niet beschikbaar")
    month = (body.month or _ai_month_key()).strip()
    doc_id = f"{resolved_uid}_{month}"
    # Haal huidige stand op vóór reset (voor audit trail)
    prev_count = 0
    try:
        prev = fs.collection("ai_usage").document(doc_id).get()
        if prev.exists:
            prev_count = int((prev.to_dict() or {}).get("count") or 0)
    except Exception:
        pass
    # Reset naar 0 (behoud month/userId, verwijder firstShown zodat user opnieuw
    # de first-use popup ziet).
    try:
        fs.collection("ai_usage").document(doc_id).set({
            "userId": resolved_uid,
            "month": month,
            "count": 0,
            "firstShown": False,
            "resetBy": x_user_email,
            "resetAt": datetime.now(timezone.utc).isoformat(),
            "resetNote": (body.note or "")[:200],
        }, merge=False)  # merge=False = volledig overschrijven
    except Exception as e:
        raise HTTPException(500, f"Firestore reset faalde: {e}")
    # Audit log naar Mongo
    try:
        await db.premium_audit.insert_one({
            "action": "ai_usage_reset",
            "target_uid": resolved_uid,
            "target_email": body.email,
            "month": month,
            "prev_count": prev_count,
            "actor": x_user_email,
            "at": datetime.now(timezone.utc).isoformat(),
            "note": body.note,
        })
    except Exception:
        pass
    return {
        "ok": True,
        "uid": resolved_uid,
        "email": body.email,
        "month": month,
        "prev_count": prev_count,
        "new_count": 0,
        "remaining": AI_FREE_LIMIT,
    }


@api_router.get("/admin/premium/webhooks")
async def admin_premium_webhooks(
    limit: int = 50,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    limit = max(1, min(int(limit or 50), 200))
    # Shopify-events: combineer topup_log (wallet) + premium-activaties uit premium_users
    cursor = db.shopify_topup_log.find({}, {"_id": 0}).sort("received_at", -1).limit(limit)
    events = await cursor.to_list(length=limit)
    return {"events": events, "count": len(events), "source": "shopify"}


@api_router.get("/admin/premium/entitlements")
async def admin_premium_entitlements(
    email: str,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Centralized entitlement resolver.
    Priority: admin override > Shopify-paid > Firestore cache > none.
    """
    _check_admin_access(x_admin_secret, x_user_email)
    email_norm = (email or "").strip().lower()
    admin_emails = [e.strip().lower() for e in os.environ.get("ADMIN_PREMIUM_EMAILS", "").split(",") if e.strip()]

    source = "none"
    is_premium = False
    detail = {}

    if email_norm in admin_emails:
        is_premium = True
        source = "admin_override"
        detail = {"reason": "in ADMIN_PREMIUM_EMAILS env"}
    else:
        rec = await db.premium_users.find_one({"$or": [{"user_key": email_norm}, {"email": email_norm}]}, {"_id": 0})
        if rec and rec.get("is_premium"):
            is_premium = True
            source = rec.get("source") or "shopify"
            detail = {"activated_at": rec.get("activated_at"), "plan": rec.get("plan"), "expires_at": rec.get("expires_at")}

    features = {
        "virtual_tryon": is_premium,
        "style_score":   is_premium,
        "ai_fit_chat":   is_premium,
        "similar_search": is_premium,
        "premium_badge":  is_premium,
        "outfit_analyse": is_premium,
    }
    return {
        "email": email_norm,
        "is_premium": is_premium,
        "source": source,
        "detail": detail,
        "features": features,
    }


# ════════════════════════════════════════════════════════════════════════
# STABILIZATION STUBS (v60.1.58), silences 404 noise van legacy endpoints.
# Deze endpoints zijn referenced in frontend code maar nog niet gekoppeld
# aan echte features. Returnen graceful empty/no-op responses zodat console
# errors verdwijnen en flows niet crashen.
# ════════════════════════════════════════════════════════════════════════
class ClientErrorBody(BaseModel):
    kind: Optional[str] = None
    message: Optional[str] = None
    stack: Optional[str] = None
    url: Optional[str] = None
    lineno: Optional[int] = None
    colno: Optional[int] = None
    ua: Optional[str] = None
    session_id: Optional[str] = None
    ts: Optional[str] = None


@api_router.post("/client-error")
async def log_client_error(body: ClientErrorBody):
    """Frontend error reporter - stores client-side JS errors in MongoDB."""
    try:
        doc = body.model_dump() if hasattr(body, "model_dump") else body.dict()
        doc["received_at"] = datetime.now(timezone.utc).isoformat()
        await db.client_errors.insert_one(doc)
    except Exception as e:
        logger.warning(f"client-error log mislukt: {e}")
    return {"ok": True}


@api_router.delete("/client-error")
async def delete_all_client_errors(older_than_hours: Optional[int] = None):
    if older_than_hours and older_than_hours > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=older_than_hours)).isoformat()
        res = await db.client_errors.delete_many({"received_at": {"$lt": cutoff}})
    else:
        res = await db.client_errors.delete_many({})
    return {"ok": True, "deleted": res.deleted_count}


@api_router.delete("/client-error/{err_id}")
async def delete_client_error(err_id: str):
    from bson import ObjectId
    try:
        oid = ObjectId(err_id)
        res = await db.client_errors.delete_one({"_id": oid})
        return {"ok": True, "deleted": res.deleted_count}
    except Exception:
        return {"ok": False, "deleted": 0}


@api_router.get("/client-error/recent")
async def recent_client_errors(limit: int = 200):
    limit = max(1, min(int(limit or 200), 500))
    cursor = db.client_errors.find({}).sort("received_at", -1).limit(limit)
    out = []
    async for d in cursor:
        d["_id"] = str(d.get("_id", ""))
        out.append(d)
    return {"errors": out, "count": len(out)}


# ── AI prefetch hooks (PP_Engine, niet UI-gekoppeld, graceful stub) ────
class AiScoreBody(BaseModel):
    outfit_id: Optional[str] = None
    image_url: Optional[str] = None
    user_id: Optional[str] = None


@api_router.post("/ai/score-outfit")
async def ai_score_outfit(body: AiScoreBody, authorization: Optional[str] = Header(None)):
    """v60.1.244: forward naar /outfit-score endpoint als er een image_url is,
    anders fallback naar heuristische score."""
    await _verify_ai_access(authorization, endpoint="ai_score_outfit")
    if body.image_url:
        # Reuse de bestaande outfit-score implementatie
        try:
            forward_req = OutfitScoreRequest(
                photo_url=body.image_url,
                request_id=body.outfit_id,
                image_hash=None,
                uid=body.user_id,
            )
            result = await outfit_score(forward_req)
            # Normaliseer naar het legacy /ai/score-outfit response schema
            return {
                "score": result.get("score", 75),
                "breakdown": result.get("breakdown", {}),
                "outfit_id": body.outfit_id,
                "label": result.get("label"),
                "summary": result.get("summary"),
                "tips": result.get("tips", []),
                "source": result.get("source", "gemini"),
            }
        except Exception as e:
            logger.warning(f"ai/score-outfit forward failed: {e}")
    # Fallback: deterministic pseudo-score voor backwards compat
    h = body.outfit_id or body.image_url or ""
    score = 70 + (sum(ord(c) for c in h[:64]) % 26)
    return {"score": score, "breakdown": {"silhouette": score - 4, "color": score, "fit": score + 2}, "outfit_id": body.outfit_id, "source": "fallback"}


class AiAssistBody(BaseModel):
    session_id: Optional[str] = None
    message: Optional[str] = None
    context: Optional[dict] = None


@api_router.post("/ai/style-assistant")
async def ai_style_assistant(body: AiAssistBody, authorization: Optional[str] = Header(None)):
    """v60.1.244: echte conversational stylist via Claude Sonnet 4.5 (Emergent LLM)."""
    await _verify_ai_access(authorization, endpoint="ai_style_assistant")
    if not body.message or not body.message.strip():
        return {"reply": "Stel een vraag over stijl, kleur, pasvorm of outfit-combinaties.", "messages": [], "session_id": body.session_id}

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return {"reply": "Style Assistant tijdelijk niet beschikbaar (config missing).", "messages": [], "session_id": body.session_id}

    system_prompt = (
        "Je bent de Paskamer Praat Style Assistant   een warme, deskundige Nederlandstalige "
        "personal stylist gespecialiseerd in Tall (1.85m+) en Plus Size mode. "
        "\n"
        "FOCUS-DIRECTIVE: Richt je advies UITSLUITEND op:\n"
        "- kleding, silhouet, pasvorm, kleurcombinaties, styling-tips;\n"
        "- de lichaamsvorm en proporties die de gebruiker beschrijft;\n"
        "- gelegenheid, seizoen en budget als die worden genoemd.\n"
        "\n"
        "NEGEER volledig irrelevante topics (politiek, dieet, weight-loss). "
        "Geef ALTIJD een concreet, actionable antwoord in max 3 korte alinea's. "
        "Gebruik body-positive taal. Antwoord in het Nederlands."
    )

    try:
        session_id = body.session_id or f"stylist-{uuid.uuid4()}"
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        reply = await chat.send_message(UserMessage(text=str(body.message)[:1000]))
        text = reply if isinstance(reply, str) else getattr(reply, "content", str(reply))
        return {
            "reply": (text or "").strip()[:1500],
            "messages": [{"role": "assistant", "content": (text or "").strip()[:1500]}],
            "session_id": session_id,
            "source": "claude-sonnet-4-5",
        }
    except Exception as e:
        logger.warning(f"Style Assistant Claude call failed: {e}")
        return {
            "reply": "Ik kan even geen advies geven   probeer het straks opnieuw.",
            "messages": [],
            "session_id": body.session_id,
            "error_hint": str(e)[:120],
        }


class AiSimilarBody(BaseModel):
    outfit_id: Optional[str] = None
    image_url: Optional[str] = None
    limit: Optional[int] = 6


@api_router.post("/ai/similar-items")
async def ai_similar_items(body: AiSimilarBody):
    return {"items": [], "outfit_id": body.outfit_id}


# ── Overige legacy stubs, voorkomen 404 spam ──────────────────────────
class TryonBody(BaseModel):
    # v60.1.244: uitgebreid schema . accepteert nu ook base64 payloads
    # zoals virtual-tryon-v1.js verstuurt.
    base_image_url: Optional[str] = None
    garment_image_url: Optional[str] = None
    user_id: Optional[str] = None
    # Nieuwe velden matching frontend virtual-tryon-v1.js contract:
    user_photo_b64: Optional[str] = None
    user_photo_mime: Optional[str] = None
    outfit_photo_b64: Optional[str] = None
    outfit_photo_mime: Optional[str] = None
    extra_prompt: Optional[str] = None
    uid: Optional[str] = None
    session_id: Optional[str] = None


@api_router.post("/tryon")
async def virtual_tryon(body: TryonBody, authorization: Optional[str] = Header(None)):
    """Virtual try-on v60.1.244 (real implementation via Gemini Nano Banana).

    Compose user photo + outfit reference into a realistic try-on image.
    Focus EXCLUSIVELY on the person and their clothing/silhouette.

    Returns: { ok, image_b64, mime_type, caption }   matching frontend contract.
    """
    await _verify_ai_access(authorization, endpoint="tryon")
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return {"ok": False, "error": "EMERGENT_LLM_KEY niet geconfigureerd", "image_b64": None}

    # v60.1.244: accepteer zowel base64 als URL. Fetch server-side als alleen URL.
    async def _resolve_image(b64: Optional[str], url: Optional[str], mime_hint: Optional[str]):
        if b64:
            if b64.startswith("data:"):
                try:
                    b64 = b64.split(",", 1)[1]
                except Exception:
                    pass
            return b64, (mime_hint or "image/jpeg")
        if url:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as cx:
                    r = await cx.get(url, headers={"User-Agent": "PaskamerPraat/1.0"})
                    r.raise_for_status()
                    ct = (r.headers.get("content-type") or "image/jpeg").lower()
                    if not ct.startswith("image/"):
                        ct = "image/jpeg"
                    return base64.b64encode(r.content).decode("ascii"), ct
            except Exception as e:
                logger.warning(f"Tryon: kon URL niet fetchen: {e}")
                return None, None
        return None, None

    user_b64, user_mime = await _resolve_image(body.user_photo_b64, body.base_image_url, body.user_photo_mime)
    outfit_b64, outfit_mime = await _resolve_image(body.outfit_photo_b64, body.garment_image_url, body.outfit_photo_mime)

    if not user_b64 or not outfit_b64:
        return {
            "ok": False,
            "error": "Beide foto's (gebruiker + outfit) zijn verplicht.",
            "image_b64": None,
        }

    tryon_prompt = (
        "TASK: Create a photorealistic virtual try-on composite image.\n"
        "\n"
        "INSTRUCTIONS:\n"
        "1. Take the person from the FIRST reference image (user photo).\n"
        "2. Replace their current outfit with the clothing shown in the SECOND reference image (outfit photo).\n"
        "3. Preserve the person's face, skin tone, body proportions, pose, and background EXACTLY.\n"
        "4. Match the outfit's fit realistically to the person's silhouette (Tall or Plus Size body positive).\n"
        "5. Preserve realistic fabric drape, folds, shadows, and lighting continuity.\n"
        "\n"
        "FOCUS-DIRECTIVE: Concentrate exclusively on the person and the clothing. "
        "Do NOT alter facial features, background, or add new elements. "
        "Keep the composition centered on the person's body and outfit fit.\n"
    )
    if body.extra_prompt:
        tryon_prompt += f"\nEXTRA USER NOTE: {str(body.extra_prompt)[:400]}\n"

    try:
        import tempfile
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        # Schrijf beide afbeeldingen naar temp files
        tmp_paths = []
        file_contents = []
        for b64, mime in [(user_b64, user_mime), (outfit_b64, outfit_mime)]:
            ext = ".png" if "png" in (mime or "") else (".webp" if "webp" in (mime or "") else ".jpg")
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(base64.b64decode(b64))
                tmp_paths.append(tmp.name)
        try:
            # Probeer FileContentWithMimeType als beschikbaar
            try:
                from emergentintegrations.llm.chat import FileContentWithMimeType  # type: ignore
                for p, mime in zip(tmp_paths, [user_mime, outfit_mime]):
                    file_contents.append(FileContentWithMimeType(file_path=p, mime_type=mime or "image/jpeg"))
            except ImportError:
                try:
                    from emergentintegrations.llm.chat import ImageContent  # type: ignore
                    for b64 in [user_b64, outfit_b64]:
                        file_contents.append(ImageContent(image_base64=b64))
                except ImportError:
                    return {"ok": False, "error": "SDK ondersteunt geen image inputs", "image_b64": None}

            chat = LlmChat(
                api_key=api_key,
                session_id=body.session_id or f"tryon-{uuid.uuid4()}",
                system_message="You are a professional virtual try-on AI. Generate photorealistic, body-positive composite images.",
            )
            chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

            msg = UserMessage(text=tryon_prompt, file_contents=file_contents)
            text, images = await chat.send_message_multimodal_response(msg)

            if not images:
                return {
                    "ok": False,
                    "error": "AI kon geen composite genereren. Probeer duidelijkere foto's.",
                    "image_b64": None,
                    "caption": text[:200] if text else None,
                }

            img = images[0]
            return {
                "ok": True,
                "image_b64": img["data"],
                "mime_type": img.get("mime_type", "image/png"),
                "caption": (text or "")[:280] if text else None,
                "session_id": body.session_id,
            }
        finally:
            for p in tmp_paths:
                try:
                    os.unlink(p)
                except Exception:
                    pass
    except Exception as e:
        logger.exception("Virtual tryon failed")
        return {"ok": False, "error": f"Try-on mislukt: {str(e)[:200]}", "image_b64": None}


@api_router.get("/proxy-image")
async def proxy_image_stub(url: Optional[str] = None):
    return {"ok": False, "error": "proxy-image niet actief", "url": url}


class ReportBody(BaseModel):
    target_id: Optional[str] = None
    reason: Optional[str] = None
    user_id: Optional[str] = None


@api_router.post("/report")
async def report_stub(body: ReportBody):
    await db.reports.insert_one({**body.model_dump(), "received_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "received": True}


class WeeklyStylistBody(BaseModel):
    user_id: Optional[str] = None
    week: Optional[str] = None


@api_router.post("/weekly-stylist")
async def weekly_stylist_stub(body: WeeklyStylistBody, authorization: Optional[str] = Header(None)):
    await _verify_ai_access(authorization, endpoint="weekly_stylist")
    return {"ok": False, "error": "Weekly stylist nog niet geactiveerd."}


# ── AI health (compatibility shim) ─────────────────────────────────────
# Pre-existing /api/ai/health is reeds gedefinieerd boven (regel 111).
# Geen duplicaat nodig, oude shim verwijderd.


# Include the router in the main app
app.include_router(api_router)

# v60.1.35 STABILITY: CORS spec verbiedt allow_credentials=True met origin '*'.
# Browsers weigeren dergelijke responses. Als CORS_ORIGINS '*' bevat, dwingen we
# allow_credentials=False af. In productie hoort CORS_ORIGINS specifieke origins
# te bevatten (bv. 'https://paskamerpraat.nl').
_raw_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
_cors_origins = [o.strip() for o in _raw_origins if o.strip()]
_wildcard = (len(_cors_origins) == 1 and _cors_origins[0] == '*')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _wildcard,
    allow_origins=_cors_origins or ['*'],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    try:
        if weekly_reports is not None:
            weekly_reports.shutdown_scheduler()
    except Exception:
        pass


@app.on_event("startup")
async def _startup_weekly_scheduler():
    """Start de weekly-reports scheduler (ma 09:00 NL-tijd)."""
    try:
        if weekly_reports is not None:
            weekly_reports.start_scheduler()
    except Exception as e:
        logger.exception("weekly scheduler start mislukt: %s", e)


@app.post("/api/admin/weekly-reports/run")
async def admin_run_weekly_reports(
    x_admin_secret: Optional[str] = Header(None, alias="X-Admin-Secret"),
    force: bool = False
):
    """
    Handmatige trigger voor het weekrapport. Vereist X-Admin-Secret header.
    Query param: ?force=true forceert verzending ook als laatst <6 dagen geleden.
    """
    secret = os.environ.get("ADMIN_GEN_SECRET", "")
    if not secret or x_admin_secret != secret:
        raise HTTPException(status_code=403, detail="forbidden")
    if weekly_reports is None:
        raise HTTPException(status_code=500, detail="weekly_reports module niet geladen")
    return weekly_reports.run_weekly_for_all_campaigns(force=force)


def _verify_admin_token(authorization: Optional[str]) -> str:
    """Verifieer Bearer JWT en check admin-email. Returns uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    try:
        from firebase_admin import auth as fb_auth
        from shopify_wallet import _init_firebase, _fb_app  # noqa: F401
        _init_firebase()
        import shopify_wallet
        token = authorization[7:]
        # shopify_wallet uses a NAMED app ('dy-wallet'); verify_id_token must use that app
        decoded = fb_auth.verify_id_token(token, app=shopify_wallet._fb_app)
        email = (decoded.get("email") or "").lower().strip()
        admin_emails = (os.environ.get("ADMIN_USER_EMAIL", "") + "," +
                        os.environ.get("ADMIN_PREMIUM_EMAILS", "")).lower()
        admin_set = {e.strip() for e in admin_emails.split(",") if e.strip()}
        if email not in admin_set:
            raise HTTPException(403, f"forbidden: {email} is geen admin")
        return decoded["uid"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}")


@app.post("/api/admin/weekly-reports/send-one")
async def admin_send_one_weekly_report(
    cid: str,
    authorization: Optional[str] = Header(None),
    force: bool = True
):
    """Verstuur testrapport voor 1 specifieke campagne. Vereist admin Bearer token."""
    _verify_admin_token(authorization)
    if weekly_reports is None:
        raise HTTPException(status_code=500, detail="weekly_reports module niet geladen")
    if not cid:
        raise HTTPException(status_code=400, detail="cid query param verplicht")
    return weekly_reports.run_weekly_for_all_campaigns(force=force, only_campaign_id=cid)


@app.post("/api/admin/weekly-reports/backfill-emails")
async def admin_backfill_emails(
    authorization: Optional[str] = Header(None),
    dry_run: bool = True
):
    """
    Backfill ontbrekende `email` velden op brands/campaigns op basis van:
      • brands/{brandId}.email  ← users/{brandId}.email  (brandId === auth uid)
      • campaigns/{cid}.email   ← brands/{brandId}.email
    Met ?dry_run=false écht schrijven.
    """
    _verify_admin_token(authorization)
    if weekly_reports is None:
        raise HTTPException(status_code=500, detail="weekly_reports module niet geladen")
    from shopify_wallet import _init_firebase
    db = _init_firebase()
    if db is None:
        raise HTTPException(503, "Firestore niet beschikbaar")

    summary = {
        "dry_run": dry_run,
        "brands_scanned": 0, "brands_updated": 0, "brands_no_user_email": 0,
        "campaigns_scanned": 0, "campaigns_updated": 0, "campaigns_no_brand_email": 0,
        "examples": []
    }

    # 1) Brands ophalen . vul email uit users.email als brand.email leeg is
    try:
        for bd in db.collection("brands").limit(500).stream():
            summary["brands_scanned"] += 1
            b = bd.to_dict() or {}
            existing = (b.get("email") or "").strip()
            if existing and "@" in existing:
                continue
            try:
                user_snap = db.collection("users").document(bd.id).get()
                if not user_snap.exists:
                    summary["brands_no_user_email"] += 1
                    continue
                u = user_snap.to_dict() or {}
                user_email = (u.get("email") or "").strip()
                if not user_email or "@" not in user_email:
                    summary["brands_no_user_email"] += 1
                    continue
                if not dry_run:
                    db.collection("brands").document(bd.id).update({"email": user_email})
                summary["brands_updated"] += 1
                if len(summary["examples"]) < 5:
                    summary["examples"].append({"brand": bd.id, "email": user_email})
            except Exception as e:
                logger.warning("backfill brand %s: %s", bd.id, e)
    except Exception as e:
        raise HTTPException(500, f"brand-scan mislukte: {e}")

    # 2) Campaigns . vul email uit brands.email als campaign.email leeg is
    try:
        brand_emails = {}
        for bd in db.collection("brands").limit(500).stream():
            b = bd.to_dict() or {}
            if (b.get("email") or "").strip():
                brand_emails[bd.id] = b["email"].strip()
        for cd in db.collection("campaigns").limit(500).stream():
            summary["campaigns_scanned"] += 1
            c = cd.to_dict() or {}
            existing = (c.get("email") or "").strip()
            if existing and "@" in existing:
                continue
            bid = c.get("brandId")
            be = brand_emails.get(bid)
            if not be:
                summary["campaigns_no_brand_email"] += 1
                continue
            if not dry_run:
                db.collection("campaigns").document(cd.id).update({"email": be})
            summary["campaigns_updated"] += 1
    except Exception as e:
        raise HTTPException(500, f"campaign-scan mislukte: {e}")

    return summary
