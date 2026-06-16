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

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


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
    # Restrictie: alleen .zip in /app, geen path traversal
    if not filename.endswith(".zip") or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Ongeldige bestandsnaam")
    path = Path("/app") / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Bestand niet gevonden")
    return FileResponse(
        path=str(path),
        media_type="application/zip",
        filename=filename,
    )


# ════════════════════════════════════════════════════════════════
# v60.1.46 — AI Health + Wardrobe Recommend endpoints
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


@api_router.post("/wardrobe/recommend")
async def wardrobe_recommend(req: WardrobeRecommendRequest):
    """Genereert 3 outfit-ideeën uit opgeslagen looks via Emergent LLM Key.

    Fallback bij geen items of geen key: heldere, niet-crashende response zodat
    de popup nooit een lege/Netwerkfout staat ziet.
    """
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
                 "omschrijving": "Probeer je opgeslagen jas over een fijngebreide trui — perfect voor de huidige tijd van het jaar."},
                {"titel": "Statement accent",
                 "omschrijving": "Voeg één opvallend item toe (kleur, textuur of accessoire) aan een rustige basis-outfit."},
            ],
            "message": "AI service niet geconfigureerd — toon algemene tips.",
        }

    # Met Emergent LLM Key: real recommendation via Claude/Gemini
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        items_text = "\n".join([
            f"- {i.get('title','onbekend')} ({i.get('category','')})"
            for i in saved[:10]
        ])
        prompt = (
            f"Je bent een persoonlijke stylist. Stel 3 outfit-combinaties voor uit deze opgeslagen looks "
            f"van een gebruiker:\n{items_text}\n\nGelegenheid: {req.occasion}. Weer: {req.weather or 'normaal'}.\n"
            f"Geef EXACT 3 ideeën, elk met titel (max 30 tekens) en korte omschrijving (max 120 tekens). "
            f"Antwoord in JSON: [{{\"titel\":\"...\",\"omschrijving\":\"...\"}}]"
        )
        chat = LlmChat(api_key=key, session_id=f"wardrobe-{req.user_key or 'anon'}",
                       system_message="Je bent een Nederlandse stylist voor de Paskamer Praat community.").with_model("openai", "gpt-4o-mini")
        reply = await chat.send_message(UserMessage(text=prompt))
        import json as _json
        import re as _re
        m = _re.search(r"\[.*\]", reply, _re.DOTALL)
        ideas = _json.loads(m.group(0)) if m else []
        return {"ok": True, "ideas": ideas[:3]}
    except Exception as e:
        return {
            "ok": True,
            "fallback": True,
            "ideas": [
                {"titel": "Try a classic", "omschrijving": "Combineer je top-favoriet met een neutrale onderkant."},
            ],
            "message": f"AI tijdelijk onbeschikbaar — fallback geactiveerd. ({str(e)[:80]})",
        }


# ════════════════════════════════════════════════════════════════
# PASKAMERPRAAT — Admin Image Generator (Gemini Nano Banana)
# v60.1.14 — admin-only hero/banner generator via EMERGENT_LLM_KEY
# ════════════════════════════════════════════════════════════════

class ImageGenRequest(BaseModel):
    prompt: str
    aspect: Optional[str] = "portrait"  # portrait (1024x1536) | landscape (1200x630) | square
    style_hint: Optional[str] = "paskamerpraat"  # auto-prepend brand style if set


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
        "portrait":  "Portrait aspect ratio 2:3 (1024x1536), vertical composition, full-body or 3/4 body shot.",
        "landscape": "Landscape aspect ratio 16:9 (1200x630), wide horizontal composition suitable for social media banner.",
        "square":    "Square aspect ratio 1:1, balanced central composition.",
    }.get(req.aspect, "Portrait aspect ratio 2:3.")
    
    full_prompt = (
        f"{PASKAMERPRAAT_STYLE_PROMPT}{aspect_hint}\n\n"
        f"SUBJECT: {req.prompt}"
    )
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"paskamerpraat-imggen-{uuid.uuid4()}",
            system_message="You are a professional fashion editorial image generator."
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        
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
# v60.1.44 — Admin Video Generator (Sora 2 via EMERGENT_LLM_KEY)
# Text-to-video, UGC/editorial quality, admin-only
# ════════════════════════════════════════════════════════════════

class VideoGenRequest(BaseModel):
    prompt: str
    size: Optional[str] = "1280x720"     # "1280x720" | "1792x1024" | "1024x1792" | "1024x1024"
    duration: Optional[int] = 8           # 4 | 8 | 12 seconds
    model: Optional[str] = "sora-2"       # "sora-2" | "sora-2-pro"
    style_hint: Optional[str] = "paskamerpraat"


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
    """Admin-only Sora 2 text-to-video generation.
    
    Auth: X-Admin-Secret + X-User-Email (defense in depth).
    Long-running (2-5 min synchronous). Returns base64-encoded MP4.
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
    
    try:
        # Per playbook: nieuwe instance per request
        from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration
        import asyncio
        video_gen = OpenAIVideoGeneration(api_key=api_key)
        
        # Sora 2 generation is synchronous + long (2-5 min). Use thread executor
        # zodat asyncio event loop niet blokkeert.
        loop = asyncio.get_event_loop()
        video_bytes = await loop.run_in_executor(
            None,
            lambda: video_gen.text_to_video(
                prompt=full_prompt,
                model=req.model,
                size=req.size,
                duration=req.duration,
                max_wait_time=600,  # 10 min max
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
# STRIPE CHECKOUT (v60.1.55) — Premium subscription via emergentintegrations
# ════════════════════════════════════════════════════════════════════════
from fastapi import Request
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
)

# Server-side packages (NEVER accept amount from frontend!)
PREMIUM_PACKAGES = {
    "premium_monthly": {"amount": 4.99, "currency": "eur", "label": "Premium maandelijks"},
}

_STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")


def _get_stripe_checkout(http_request: Request) -> StripeCheckout:
    host_url = str(http_request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=_STRIPE_API_KEY, webhook_url=webhook_url)


class CheckoutSessionBody(BaseModel):
    package_id: str
    origin_url: str
    user_key: str
    email: Optional[str] = None


@api_router.post("/checkout/session")
async def create_checkout_session(body: CheckoutSessionBody, request: Request):
    if not _STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe niet geconfigureerd")
    if body.package_id not in PREMIUM_PACKAGES:
        raise HTTPException(status_code=400, detail="Ongeldig pakket")
    pkg = PREMIUM_PACKAGES[body.package_id]

    # Bouw success/cancel URLs uit frontend origin (NOOIT hardcoded)
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/feed?premium=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/feed?premium=cancel"

    metadata = {
        "package_id": body.package_id,
        "user_key": body.user_key,
        "email": (body.email or "")[:120],
        "source": "paskamerpraat_premium",
    }

    try:
        checkout = _get_stripe_checkout(request)
        req = CheckoutSessionRequest(
            amount=float(pkg["amount"]),
            currency=pkg["currency"],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata=metadata,
        )
        session: CheckoutSessionResponse = await checkout.create_checkout_session(req)
    except Exception as e:
        logger.exception("Stripe checkout creation failed")
        raise HTTPException(status_code=502, detail=f"Stripe-fout: {str(e)[:160]}")

    # Sla transactie op als 'initiated' VOOR redirect (verplichte stap)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_key": body.user_key,
        "email": body.email,
        "package_id": body.package_id,
        "amount": pkg["amount"],
        "currency": pkg["currency"],
        "payment_status": "initiated",
        "status": "open",
        "premium_activated": False,
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, request: Request):
    if not _STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Stripe niet geconfigureerd")
    try:
        checkout = _get_stripe_checkout(request)
        status: CheckoutStatusResponse = await checkout.get_checkout_status(session_id)
    except Exception as e:
        logger.exception("Stripe status fetch failed")
        raise HTTPException(status_code=502, detail=f"Stripe-fout: {str(e)[:160]}")

    txn = await db.payment_transactions.find_one({"session_id": session_id})
    premium_activated = bool(txn and txn.get("premium_activated"))

    # Idempotent: ken premium alleen toe bij EERSTE succes-poll
    if status.payment_status == "paid" and not premium_activated and txn:
        user_key = txn.get("user_key") or (status.metadata or {}).get("user_key")
        email = txn.get("email") or (status.metadata or {}).get("email")
        await db.premium_users.update_one(
            {"user_key": user_key},
            {"$set": {
                "user_key": user_key,
                "email": email,
                "plan": "premium_monthly",
                "is_premium": True,
                "source": "stripe",
                "activated_at": datetime.now(timezone.utc).isoformat(),
                "last_session_id": session_id,
            }},
            upsert=True,
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": status.payment_status,
                "status": status.status,
                "premium_activated": True,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        premium_activated = True
    elif txn:
        # Update status/payment_status zonder dubbel toekennen
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status.payment_status, "status": status.status}},
        )

    return {
        "session_id": session_id,
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "premium_activated": premium_activated,
    }


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
    return {
        "is_premium": bool(rec.get("is_premium")),
        "plan": rec.get("plan"),
        "activated_at": rec.get("activated_at"),
        "email": rec.get("email"),
    }


@api_router.post("/billing/portal")
async def billing_portal(user_key: str):
    # Stripe Customer Portal vereist een customer-id die we via test-key
    # niet beschikbaar hebben. Retourneer duidelijke melding zonder 500.
    raise HTTPException(
        status_code=501,
        detail="Abonnement-beheer wordt binnenkort beschikbaar. Stuur ons een mail voor opzegging.",
    )


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body_bytes = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    try:
        checkout = _get_stripe_checkout(request)
        evt = await checkout.handle_webhook(body_bytes, signature)
    except Exception as e:
        logger.warning(f"Stripe webhook verificatie mislukt: {e}")
        # Audit log voor admin-monitor (zelfs gefaalde events)
        await db.stripe_events.insert_one({
            "received_at": datetime.now(timezone.utc).isoformat(),
            "verified": False,
            "error": str(e)[:300],
            "raw_size": len(body_bytes or b""),
        })
        raise HTTPException(status_code=400, detail="Invalid webhook")

    # Audit log voor admin-monitor (alle geverifieerde events)
    await db.stripe_events.insert_one({
        "received_at": datetime.now(timezone.utc).isoformat(),
        "verified": True,
        "event_id": evt.event_id,
        "event_type": evt.event_type,
        "session_id": evt.session_id,
        "payment_status": evt.payment_status,
        "amount_total": evt.amount_total,
        "currency": evt.currency,
        "metadata": evt.metadata or {},
    })

    # Update transactie + activeer premium bij paid event
    if evt.session_id:
        txn = await db.payment_transactions.find_one({"session_id": evt.session_id})
        if txn and evt.payment_status == "paid" and not txn.get("premium_activated"):
            user_key = txn.get("user_key") or (evt.metadata or {}).get("user_key")
            email = txn.get("email") or (evt.metadata or {}).get("email")
            await db.premium_users.update_one(
                {"user_key": user_key},
                {"$set": {
                    "user_key": user_key,
                    "email": email,
                    "plan": "premium_monthly",
                    "is_premium": True,
                    "source": "stripe",
                    "activated_at": datetime.now(timezone.utc).isoformat(),
                    "last_session_id": evt.session_id,
                }},
                upsert=True,
            )
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {
                    "payment_status": evt.payment_status,
                    "premium_activated": True,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "webhook_event_id": evt.event_id,
                }},
            )
    return {"received": True}


# ════════════════════════════════════════════════════════════════════════
# Outfit Score - Echte Gemini Vision implementatie (v60.1.76)
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
async def outfit_score(req: OutfitScoreRequest):
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
    if not api_key or not b64:
        out = _outfit_score_fallback(req)
        out["photo_source"] = photo_source
        return out

    system_prompt = (
        "Je bent een professionele Tall & Plus Size fashion stylist voor Doubleyou. "
        "Je krijgt EEN foto van een outfit. Volg STRIKT deze stappen:\n"
        "STAP 1 - KIJK ZORGVULDIG naar de foto. Identificeer per kledingstuk:\n"
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

        # Parse JSON - strip eventuele markdown code fences
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

        # v60.1.87: Safety net - bij sportief/casual mogen tips NIET
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
# ADMIN PREMIUM MANAGEMENT (v60.1.57) — Full entitlement system
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


class TestCheckoutBody(BaseModel):
    email: Optional[str] = "[email protected]"
    origin_url: Optional[str] = "https://paskamerpraat.nl"


@api_router.get("/admin/premium/stripe-status")
async def admin_stripe_status(
    request: Request,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    key = os.environ.get("STRIPE_API_KEY") or ""
    return {
        "stripe_api_key_masked": _mask(key),
        "stripe_configured": bool(key),
        "stripe_key_type": ("test" if "test" in key else ("live" if "live" in key else "unknown")) if key else None,
        "webhook_url": f"{str(request.base_url).rstrip('/')}/api/webhook/stripe",
        "packages": PREMIUM_PACKAGES,
        "admin_premium_emails": [e.strip() for e in os.environ.get("ADMIN_PREMIUM_EMAILS", "").split(",") if e.strip()],
        "environment": "preview" if "preview" in str(request.base_url) else "production",
    }


@api_router.post("/admin/premium/test-checkout")
async def admin_test_checkout(
    body: TestCheckoutBody,
    request: Request,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    if not _STRIPE_API_KEY:
        return {"ok": False, "error": "STRIPE_API_KEY niet geconfigureerd"}
    try:
        checkout = _get_stripe_checkout(request)
        origin = (body.origin_url or "https://paskamerpraat.nl").rstrip("/")
        req = CheckoutSessionRequest(
            amount=4.99,
            currency="eur",
            success_url=f"{origin}/feed?premium=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/feed?premium=cancel",
            metadata={"package_id": "premium_monthly", "user_key": body.email or "admin_test", "email": body.email or "", "source": "admin_test"},
        )
        session = await checkout.create_checkout_session(req)
        return {
            "ok": True,
            "session_id": session.session_id,
            "url": session.url,
            "raw_response": {"session_id": session.session_id, "url": session.url},
            "tested_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.exception("Admin test checkout failed")
        return {"ok": False, "error": str(e)[:300]}


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


@api_router.get("/admin/premium/webhooks")
async def admin_premium_webhooks(
    limit: int = 50,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    _check_admin_access(x_admin_secret, x_user_email)
    limit = max(1, min(int(limit or 50), 200))
    cursor = db.stripe_events.find({}, {"_id": 0}).sort("received_at", -1).limit(limit)
    events = await cursor.to_list(length=limit)
    return {"events": events, "count": len(events)}


@api_router.get("/admin/premium/entitlements")
async def admin_premium_entitlements(
    email: str,
    x_admin_secret: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
):
    """Centralized entitlement resolver.
    Priority: admin override > Stripe-paid > Firestore cache > none.
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
            source = rec.get("source") or "stripe"
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
# STABILIZATION STUBS (v60.1.58) — silences 404 noise van legacy endpoints.
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
    """Frontend error reporter — stores client-side JS errors in MongoDB."""
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


# ── AI prefetch hooks (PP_Engine, niet UI-gekoppeld — graceful stub) ────
class AiScoreBody(BaseModel):
    outfit_id: Optional[str] = None
    image_url: Optional[str] = None
    user_id: Optional[str] = None


@api_router.post("/ai/score-outfit")
async def ai_score_outfit(body: AiScoreBody):
    h = body.outfit_id or body.image_url or ""
    score = 70 + (sum(ord(c) for c in h[:64]) % 26)
    return {"score": score, "breakdown": {"silhouette": score - 4, "color": score, "fit": score + 2}, "outfit_id": body.outfit_id}


class AiAssistBody(BaseModel):
    session_id: Optional[str] = None
    message: Optional[str] = None
    context: Optional[dict] = None


@api_router.post("/ai/style-assistant")
async def ai_style_assistant(body: AiAssistBody):
    return {"reply": "Style Assistant wordt binnenkort geactiveerd.", "messages": [], "session_id": body.session_id}


class AiSimilarBody(BaseModel):
    outfit_id: Optional[str] = None
    image_url: Optional[str] = None
    limit: Optional[int] = 6


@api_router.post("/ai/similar-items")
async def ai_similar_items(body: AiSimilarBody):
    return {"items": [], "outfit_id": body.outfit_id}


# ── Overige legacy stubs — voorkomen 404 spam ──────────────────────────
class TryonBody(BaseModel):
    base_image_url: Optional[str] = None
    garment_image_url: Optional[str] = None
    user_id: Optional[str] = None


@api_router.post("/tryon")
async def virtual_tryon_stub(body: TryonBody):
    return {"ok": False, "error": "Virtual try-on tijdelijk niet beschikbaar — wordt later opnieuw geactiveerd.", "result_url": None}


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
async def weekly_stylist_stub(body: WeeklyStylistBody):
    return {"ok": False, "error": "Weekly stylist nog niet geactiveerd."}


# ── AI health (compatibility shim) ─────────────────────────────────────
# Pre-existing /api/ai/health is reeds gedefinieerd boven (regel 111).
# Geen duplicaat nodig - oude shim verwijderd.


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
