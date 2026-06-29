"""
Dynamic Sitemap.xml + robots.txt — Doubleyou (Fase D)
═══════════════════════════════════════════════════════════════════════
Genereert sitemap.xml uit Firestore:
  • Statische pagina's (feed, lookbook, reviews, winkel, …)
  • Brands  → /bedrijf/{slug}?id=...
  • Campaigns → /campagne/{slug}?id=...
  • Brand products → /product/{slug}?id=...
  • User profiles met `publiekProfiel === true` → /profiel/{slug}?id=...

Routes worden gemount op /api/sitemap.xml en /api/robots.txt
(Cloudflare Worker kan deze later proxien naar /sitemap.xml en /robots.txt
voor pretty URLs.)
"""
from __future__ import annotations

import logging
import unicodedata
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Response

logger = logging.getLogger("sitemap")
sitemap_router = APIRouter(tags=["sitemap"])

BASE_URL = "https://paskamerpraat.nl"

STATIC_ROUTES = [
    ("/",                     "1.0", "daily"),
    ("/feed",                 "0.9", "daily"),
    ("/looks",                "0.8", "weekly"),
    ("/reviews",              "0.8", "weekly"),
    ("/winkel",               "0.7", "weekly"),
    ("/challenges",           "0.7", "weekly"),
    ("/post-van-de-week",     "0.7", "weekly"),
    ("/outfit-vergelijker",   "0.6", "monthly"),
    ("/voorwaarden",          "0.3", "yearly"),
    ("/privacy",              "0.3", "yearly"),
    ("/community-regels",     "0.3", "yearly"),
    ("/beta",                 "0.4", "monthly"),
]


def _slugify(text: str) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFD", str(text)).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60]


def _firestore():
    try:
        from shopify_wallet import _init_firebase
        return _init_firebase()
    except Exception:
        return None


def _format_lastmod(ts) -> str:
    """Firestore Timestamp → W3C datetime."""
    try:
        if hasattr(ts, "isoformat"):
            return ts.isoformat()
        if hasattr(ts, "to_datetime"):
            return ts.to_datetime().isoformat()
        return datetime.now(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def _gather_dynamic_urls() -> list[dict]:
    """Verzamel alle dynamische entity-URLs uit Firestore (best-effort)."""
    urls: list[dict] = []
    db = _firestore()
    if db is None:
        return urls

    # Brands — alleen die met (impliciet) een naam
    try:
        for d in db.collection("brands").limit(500).stream():
            b = d.to_dict() or {}
            naam = (b.get("naam") or "").strip()
            if not naam:
                continue
            slug = _slugify(naam) or d.id
            loc = f"{BASE_URL}/bedrijf/{slug}?id={d.id}"
            urls.append({
                "loc": loc,
                "lastmod": _format_lastmod(b.get("updatedAt") or b.get("createdAt")),
                "priority": "0.7",
                "changefreq": "weekly"
            })
    except Exception as e:
        logger.warning("sitemap brands: %s", e)

    # Campaigns — alleen `status=live`
    try:
        for d in db.collection("campaigns").where("status", "==", "live").limit(500).stream():
            c = d.to_dict() or {}
            naam = (c.get("naam") or c.get("brandNaam") or "").strip()
            if not naam:
                continue
            slug = _slugify(naam) or d.id
            loc = f"{BASE_URL}/campagne/{slug}?id={d.id}"
            urls.append({
                "loc": loc,
                "lastmod": _format_lastmod(c.get("updatedAt") or c.get("createdAt")),
                "priority": "0.6",
                "changefreq": "daily"
            })
    except Exception as e:
        logger.warning("sitemap campaigns: %s", e)

    # Brand products — alleen `status=actief`
    try:
        for d in db.collection("brand_products").where("status", "==", "actief").limit(2000).stream():
            p = d.to_dict() or {}
            naam = (p.get("titel") or p.get("naam") or "").strip()
            if not naam:
                continue
            slug = _slugify(naam) or d.id
            loc = f"{BASE_URL}/product/{slug}?id={d.id}"
            urls.append({
                "loc": loc,
                "lastmod": _format_lastmod(p.get("updatedAt") or p.get("createdAt")),
                "priority": "0.5",
                "changefreq": "weekly"
            })
    except Exception as e:
        logger.warning("sitemap products: %s", e)

    # Publieke gebruikers-profielen (opt-in via users.publiekProfiel === true)
    try:
        for d in db.collection("users").where("publiekProfiel", "==", True).limit(2000).stream():
            u = d.to_dict() or {}
            naam = (u.get("gebruikersnaam") or u.get("naam") or "").strip()
            if not naam:
                continue
            slug = _slugify(naam) or d.id
            loc = f"{BASE_URL}/profiel/{slug}?id={d.id}"
            urls.append({
                "loc": loc,
                "lastmod": _format_lastmod(u.get("lastActive") or u.get("createdAt")),
                "priority": "0.4",
                "changefreq": "weekly"
            })
    except Exception as e:
        logger.warning("sitemap users: %s", e)

    return urls


@sitemap_router.get("/api/sitemap.xml")
async def get_sitemap():
    """Genereer dynamische sitemap.xml."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ]
    # Statische routes
    for path, prio, freq in STATIC_ROUTES:
        parts.append(
            f"<url><loc>{xml_escape(BASE_URL + path)}</loc>"
            f"<lastmod>{now_iso}</lastmod>"
            f"<changefreq>{freq}</changefreq>"
            f"<priority>{prio}</priority></url>"
        )
    # Dynamische routes
    for u in _gather_dynamic_urls():
        parts.append(
            f"<url><loc>{xml_escape(u['loc'])}</loc>"
            f"<lastmod>{xml_escape(u['lastmod'])}</lastmod>"
            f"<changefreq>{u['changefreq']}</changefreq>"
            f"<priority>{u['priority']}</priority></url>"
        )
    parts.append("</urlset>")
    xml = "\n".join(parts)
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@sitemap_router.get("/api/robots.txt", response_class=Response)
async def get_robots():
    """Genereer robots.txt — publieke crawl OK, private paths blocked."""
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /admin\n"
        "Disallow: /admin_\n"
        "Disallow: /brand_dashboard\n"
        "Disallow: /brand_wallet\n"
        "Disallow: /brand_settings\n"
        "Disallow: /brand_onboarding\n"
        "Disallow: /brand_campaigns\n"
        "Disallow: /brand_products\n"
        "Disallow: /brand_analytics\n"
        "Disallow: /brand_profiel\n"
        "Disallow: /wallet\n"
        "Disallow: /wallet_topup\n"
        "Disallow: /wallet_history\n"
        "Disallow: /pakketten\n"
        "Disallow: /instellingen\n"
        "Disallow: /notificaties\n"
        "Disallow: /login\n"
        "Disallow: /register\n"
        "Disallow: /wachtwoord_vergeten\n"
        "Disallow: /?pagina=admin\n"
        "Disallow: /?pagina=brand_dashboard\n"
        "Disallow: /?pagina=wallet\n"
        "\n"
        f"Sitemap: {BASE_URL}/api/sitemap.xml\n"
        f"Sitemap: {BASE_URL}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain",
                    headers={"Cache-Control": "public, max-age=86400"})
