"""
Paskamer Praat — Standalone AI Backend
=======================================

Minimalistische FastAPI app die alleen de v47 AI endpoints serveert:
  POST /api/tryon
  POST /api/outfit-score
  POST /api/weekly-stylist

Vereist 1 env-var: EMERGENT_LLM_KEY

Start lokaal:
  pip install -r requirements.txt
  uvicorn server:app --host 0.0.0.0 --port 8001

Of via Docker:
  docker build -t paskamer-ai .
  docker run -e EMERGENT_LLM_KEY=sk-emergent-xxx -p 8001:8001 paskamer-ai
"""
import os
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from ai_router import ai_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Paskamer Praat AI",
    description="Virtual Try-On + Outfit Score + Weekly Stylist",
    version="47.0.0",
)

# CORS — open voor PWA op paskamerpraat.nl + alle previews
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(ai_router)


@app.get("/")
def root():
    return {
        "service": "paskamerpraat-ai",
        "version": "47.0.0",
        "endpoints": [
            "POST /api/tryon",
            "POST /api/outfit-score",
            "POST /api/weekly-stylist",
        ],
    }


@app.get("/healthz")
def healthz():
    key_ok = bool(os.getenv("EMERGENT_LLM_KEY"))
    return {"status": "ok", "emergent_key_configured": key_ok}
