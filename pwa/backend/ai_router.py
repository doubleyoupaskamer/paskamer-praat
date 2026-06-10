"""
Paskamer Praat — AI endpoints (v47)

Drie endpoints, allemaal gemount onder /api:

  POST /api/tryon          → Virtual try-on (Gemini Nano Banana)
  POST /api/outfit-score   → Style Score + 3 tips (Gemini text)
  POST /api/weekly-stylist → 3 weekly outfit-suggesties + reden

Backend gebruikt EMERGENT_LLM_KEY via emergentintegrations library
(zie playbook). Geen aparte Gemini-key nodig voor de gebruiker.

Auth: alle endpoints accepteren een vrije `uid` of `session_id` zodat
clients zonder login ook kunnen (matched bestaande PWA gedrag).
"""
import os
import base64
import logging
import uuid
import re
from typing import List, Optional
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

logger = logging.getLogger(__name__)

ai_router = APIRouter(prefix="/api", tags=["ai"])

EMERGENT_KEY = os.getenv("EMERGENT_LLM_KEY")
GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview"
GEMINI_TEXT_MODEL  = "gemini-3-pro-image-preview"  # supports text + vision

MAX_IMAGE_B64_LEN = 12 * 1024 * 1024  # ~12 MB base64 (≈9 MB binary)


@ai_router.get("/ai/health")
async def ai_health():
    """Lichtgewicht health-check voor frontend (4s timeout-friendly)."""
    return {
        "status": "ok",
        "emergent_key_configured": bool(EMERGENT_KEY),
        "endpoints": ["/api/tryon", "/api/outfit-score", "/api/weekly-stylist", "/api/proxy-image", "/api/report"],
    }


# ─────────────────────────────────────────────────────────────
# CORS image proxy — voor Try-On pre-fill van feed images die
# strenge CORS-headers hebben (Firebase Storage, CDN). Streamt
# de image door zodat de frontend hem kan canvas-en.
# ─────────────────────────────────────────────────────────────
_ALLOWED_PROXY_HOSTS = re.compile(
    r"^https?://([a-z0-9-]+\.)*(firebasestorage\.googleapis\.com|googleusercontent\.com|"
    r"cloudfront\.net|paskamerpraat\.nl|emergentagent\.com|imgur\.com|"
    r"zalando\.(?:com|nl|de|fr)|asos-media\.com|hm\.com|cdn\.[a-z0-9-]+\.com)(/|$)",
    re.IGNORECASE,
)


@ai_router.get("/proxy-image")
async def proxy_image(url: str):
    """Stream een externe image door als same-origin (lost CORS op voor canvas)."""
    if not url or len(url) > 2000:
        raise HTTPException(status_code=400, detail="Ongeldige URL")
    if not _ALLOWED_PROXY_HOSTS.match(url):
        # Open hosts maar limiteer payload — niet voor arbitraire SSRF
        if not url.startswith(("https://", "http://")):
            raise HTTPException(status_code=400, detail="Alleen http(s) URLs")
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "PaskamerPraat/1.0"})
            if r.status_code >= 400:
                raise HTTPException(status_code=502, detail=f"Bron gaf {r.status_code}")
            ctype = r.headers.get("content-type", "image/jpeg")
            if not ctype.startswith("image/"):
                raise HTTPException(status_code=415, detail="Geen image content-type")
            if len(r.content) > 12 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Image te groot")
            return Response(
                content=r.content,
                media_type=ctype,
                headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Proxy fout: {type(e).__name__}")


# ─────────────────────────────────────────────────────────────
# Content reports — server-side queue (werkt zonder Firebase auth)
# ─────────────────────────────────────────────────────────────
class ReportPayload(BaseModel):
    post_id: str = Field(..., max_length=300)
    reason: str = Field(..., max_length=80)
    author: Optional[str] = Field(None, max_length=120)
    reporter_uid: Optional[str] = Field(None, max_length=120)
    share_url: Optional[str] = Field(None, max_length=500)
    note: Optional[str] = Field(None, max_length=500)


@ai_router.post("/report")
async def submit_report(payload: ReportPayload, request: Request):
    """Server-side report queue — schrijft naar MongoDB (collection: moderation_reports)."""
    from server import db  # lazy import to avoid circular
    doc = {
        "_id": str(uuid.uuid4()),
        "post_id": payload.post_id,
        "reason": payload.reason,
        "author": payload.author,
        "reporter_uid": payload.reporter_uid or "anonymous",
        "reporter_ip_hash": _hash_ip(request.client.host if request.client else ""),
        "share_url": payload.share_url,
        "note": payload.note,
        "status": "pending",  # pending | reviewed | dismissed | actioned
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db["moderation_reports"].insert_one(doc)
    except Exception as e:
        logger.error("Report insert failed: %s", e)
        raise HTTPException(status_code=500, detail="Opslag mislukt")
    logger.info("Report received: post=%s reason=%s", payload.post_id, payload.reason)
    return {"ok": True, "report_id": doc["_id"], "queue": "moderation_reports", "status": "pending"}


@ai_router.get("/reports/queue")
async def reports_queue(status: str = "pending", limit: int = 50):
    """Admin endpoint — lijst openstaande rapporten (geen auth in deze PWA — alleen via direct backend access)."""
    from server import db
    if limit > 200:
        limit = 200
    cursor = db["moderation_reports"].find({"status": status}).sort("ts", -1).limit(limit)
    items = []
    async for d in cursor:
        d.pop("reporter_ip_hash", None)
        items.append(d)
    return {"count": len(items), "items": items}


def _hash_ip(ip: str) -> str:
    import hashlib
    return hashlib.sha256((ip + "paskamerpraat-salt-2026").encode()).hexdigest()[:16]


# ─────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────

class TryOnRequest(BaseModel):
    user_photo_b64: str = Field(..., description="Base64 (geen data: prefix) van gebruikerfoto")
    outfit_photo_b64: str = Field(..., description="Base64 van outfit-foto")
    user_photo_mime: str = Field(default="image/jpeg")
    outfit_photo_mime: str = Field(default="image/jpeg")
    extra_prompt: Optional[str] = Field(default=None, description="Extra style-hint")
    uid: Optional[str] = Field(default=None, description="User uid voor logging")
    session_id: Optional[str] = Field(default=None)


class TryOnResponse(BaseModel):
    image_b64: str
    mime_type: str
    caption: str
    session_id: str
    error: Optional[str] = None


class OutfitScoreRequest(BaseModel):
    photo_b64: str
    photo_mime: str = "image/jpeg"
    user_context: Optional[str] = Field(
        default=None,
        description="Vrije tekst over gebruiker (lengte, bouw, stijlvoorkeur) voor persoonlijker advies",
    )
    uid: Optional[str] = None
    post_id: Optional[str] = None


class OutfitScoreResponse(BaseModel):
    score: int
    label: str
    summary: str
    tips: List[str]
    color_palette: List[str]
    session_id: str


class WeeklyStylistRequest(BaseModel):
    uid: Optional[str] = None
    user_context: Optional[str] = Field(
        default=None,
        description="Beschrijving stijlprofiel + recente posts/likes",
    )
    week: Optional[str] = Field(default=None, description="YYYY-Www, default=huidige week")


class StylistPick(BaseModel):
    title: str
    description: str
    items: List[str]
    affiliate_query: str
    reason: str


class WeeklyStylistResponse(BaseModel):
    week: str
    intro: str
    picks: List[StylistPick]
    session_id: str


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _check_key():
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="AI service niet geconfigureerd (EMERGENT_LLM_KEY ontbreekt)")


def _strip_data_url(b64: str) -> str:
    if not b64:
        return b64
    if b64.startswith("data:"):
        comma = b64.find(",")
        if comma > 0:
            return b64[comma + 1:]
    return b64


def _validate_image(b64: str, name: str) -> str:
    b64 = _strip_data_url(b64)
    if not b64:
        raise HTTPException(status_code=400, detail=f"{name}_photo_b64 ontbreekt")
    if len(b64) > MAX_IMAGE_B64_LEN:
        raise HTTPException(status_code=413, detail=f"{name} foto te groot (max ~9 MB)")
    try:
        # snelle base64-sanity check (decode eerste 32 bytes)
        base64.b64decode(b64[:128] + "==", validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{name} foto is geen geldige base64")
    return b64


# ─────────────────────────────────────────────────────────────
# 1. Virtual Try-On
# ─────────────────────────────────────────────────────────────

TRYON_PROMPT = (
    "Je krijgt twee foto's: (1) een persoon en (2) een outfit / kledingstuk. "
    "Genereer een fotorealistisch beeld waarin de persoon EXACT dit outfit draagt, "
    "met natuurlijke pasvorm, plooien, en lichtinval die past bij de oorspronkelijke "
    "foto van de persoon. Behoud gezicht, haar, huidskleur, lichaamsverhoudingen en "
    "omgeving van de eerste foto. Maak geen aanpassingen aan het gezicht. "
    "Output uitsluitend de gegenereerde afbeelding."
)


@ai_router.post("/tryon", response_model=TryOnResponse)
async def virtual_tryon(req: TryOnRequest):
    _check_key()
    user_b64 = _validate_image(req.user_photo_b64, "user")
    outfit_b64 = _validate_image(req.outfit_photo_b64, "outfit")

    session_id = req.session_id or f"tryon-{uuid.uuid4().hex[:12]}"

    prompt_text = TRYON_PROMPT
    if req.extra_prompt:
        prompt_text += f"\n\nExtra wens van gebruiker: {req.extra_prompt.strip()[:240]}"

    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message="Je bent een fotorealistische virtual-fitting assistent.",
    )
    chat.with_model("gemini", GEMINI_IMAGE_MODEL).with_params(modalities=["image", "text"])

    try:
        msg = UserMessage(
            text=prompt_text,
            file_contents=[
                ImageContent(user_b64),
                ImageContent(outfit_b64),
            ],
        )
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        logger.exception("tryon gemini error")
        raise HTTPException(status_code=502, detail=f"AI service fout: {str(e)[:160]}")

    if not images:
        return TryOnResponse(
            image_b64="",
            mime_type="image/png",
            caption=text or "Geen afbeelding gegenereerd",
            session_id=session_id,
            error="no_image",
        )

    first = images[0]
    return TryOnResponse(
        image_b64=first.get("data", ""),
        mime_type=first.get("mime_type", "image/png"),
        caption=(text or "")[:400],
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────
# 2. Outfit Score
# ─────────────────────────────────────────────────────────────

SCORE_PROMPT = """Analyseer deze outfit-foto kritisch maar opbouwend en geef terug:

1. Een score van 0-100 (eerlijk; 60-75 is normaal, 80+ is écht goed, 90+ uitzonderlijk)
2. Een korte label-categorie: "Sterk", "Solide", "Kan beter", "Nog ruwe diamant"
3. Een 1-zin samenvatting van de outfit
4. Exact 3 korte, concrete tips (max 12 woorden elk) — geen vage adviezen
5. 3 dominante kleuren in HEX format

Antwoord UITSLUITEND als JSON in dit exacte schema:
{
  "score": 87,
  "label": "Sterk",
  "summary": "...",
  "tips": ["...", "...", "..."],
  "color_palette": ["#hex1", "#hex2", "#hex3"]
}

Geen markdown fences, geen extra tekst, alleen JSON."""


@ai_router.post("/outfit-score", response_model=OutfitScoreResponse)
async def outfit_score(req: OutfitScoreRequest):
    _check_key()
    photo_b64 = _validate_image(req.photo_b64, "photo")
    session_id = f"score-{uuid.uuid4().hex[:12]}"

    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message="Je bent een eerlijke maar warme persoonlijke stylist gespecialiseerd in lange en plus-size vrouwen.",
    )
    chat.with_model("gemini", GEMINI_TEXT_MODEL).with_params(modalities=["text"])

    user_prompt = SCORE_PROMPT
    if req.user_context:
        user_prompt += f"\n\nContext gebruiker: {req.user_context.strip()[:400]}"

    try:
        msg = UserMessage(text=user_prompt, file_contents=[ImageContent(photo_b64)])
        text, _ = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        logger.exception("outfit-score error")
        raise HTTPException(status_code=502, detail=f"AI service fout: {str(e)[:160]}")

    # Parse JSON uit response
    import json
    import re
    raw = (text or "").strip()
    # Strip evt. markdown fences
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except Exception:
        # fallback: probeer JSON-object pattern te vinden
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise HTTPException(status_code=502, detail="AI gaf geen geldige JSON terug")
        try:
            data = json.loads(m.group(0))
        except Exception:
            raise HTTPException(status_code=502, detail="AI JSON parse error")

    score = int(data.get("score", 0))
    score = max(0, min(100, score))
    return OutfitScoreResponse(
        score=score,
        label=str(data.get("label", "Onbepaald"))[:40],
        summary=str(data.get("summary", ""))[:300],
        tips=[str(t)[:120] for t in (data.get("tips") or [])][:3],
        color_palette=[str(c)[:10] for c in (data.get("color_palette") or [])][:3],
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────
# 3. Weekly Stylist Brief
# ─────────────────────────────────────────────────────────────

STYLIST_PROMPT = """Je bent persoonlijke AI-stylist voor de "Paskamer Praat" community
(Nederlandse vrouwen 170 cm+ en/of plus-size). Genereer een wekelijkse stijl-brief
met 3 outfit-aanbevelingen.

Output STRIKT als JSON in dit schema:
{
  "intro": "Een korte warme intro van max 2 zinnen, persoonlijk gericht.",
  "picks": [
    {
      "title": "Korte pakkende titel (max 6 woorden)",
      "description": "1-2 zinnen waarom deze look werkt voor de gebruiker",
      "items": ["item 1", "item 2", "item 3"],
      "affiliate_query": "Eén korte zoekterm voor Zalando / Bol (max 6 woorden)",
      "reason": "Eén zin: waarom past dit bij de stijl van de gebruiker"
    }
  ]
}

Regels:
- Exact 3 picks
- Concrete itemnamen (geen merken tenzij relevant)
- affiliate_query moet exact zoekbaar zijn op een webshop (bv. "lange linnen jumpsuit zomer")
- Geen markdown fences, alleen JSON
"""


@ai_router.post("/weekly-stylist", response_model=WeeklyStylistResponse)
async def weekly_stylist(req: WeeklyStylistRequest):
    _check_key()
    now = datetime.now(timezone.utc)
    week = req.week or f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"
    session_id = f"weekly-{uuid.uuid4().hex[:12]}"

    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message="Je bent een Nederlandse persoonlijke AI-stylist met expertise in lang en plus-size.",
    )
    chat.with_model("gemini", GEMINI_TEXT_MODEL).with_params(modalities=["text"])

    prompt = STYLIST_PROMPT
    if req.user_context:
        prompt += f"\n\nUser context:\n{req.user_context.strip()[:1200]}"
    else:
        prompt += "\n\nGeen specifieke context bekend — geef veelzijdige seizoens-toepasbare picks."

    try:
        msg = UserMessage(text=prompt)
        text, _ = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        logger.exception("weekly-stylist error")
        raise HTTPException(status_code=502, detail=f"AI service fout: {str(e)[:160]}")

    import json
    import re
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise HTTPException(status_code=502, detail="AI gaf geen geldige JSON terug")
        try:
            data = json.loads(m.group(0))
        except Exception:
            raise HTTPException(status_code=502, detail="AI JSON parse error")

    picks_raw = data.get("picks") or []
    picks = []
    for p in picks_raw[:3]:
        picks.append(StylistPick(
            title=str(p.get("title", "Pick"))[:80],
            description=str(p.get("description", ""))[:400],
            items=[str(i)[:80] for i in (p.get("items") or [])][:6],
            affiliate_query=str(p.get("affiliate_query", ""))[:120],
            reason=str(p.get("reason", ""))[:240],
        ))

    return WeeklyStylistResponse(
        week=week,
        intro=str(data.get("intro", ""))[:400],
        picks=picks,
        session_id=session_id,
    )
