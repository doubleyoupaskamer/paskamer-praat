from fastapi import FastAPI, APIRouter, HTTPException, Header
from fastapi.responses import Response
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
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage


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


@api_router.post("/admin/generate-image")
async def generate_image(req: ImageGenRequest, x_admin_secret: Optional[str] = Header(None)):
    """Admin-only endpoint to generate hero/banner images via Gemini Nano Banana.
    
    Auth: shared secret via X-Admin-Secret header.
    Returns: { ok, mime_type, base64, prompt_used }
    """
    expected_secret = os.environ.get('ADMIN_GEN_SECRET')
    if not expected_secret or x_admin_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Forbidden")
    
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
