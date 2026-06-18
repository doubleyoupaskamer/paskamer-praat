"""
═══════════════════════════════════════════════════════════════════════════
Doubleyou - Shopify Wallet Top-up Router (v1.0.0)
═══════════════════════════════════════════════════════════════════════════

Verwerkt de Shopify `orders/paid` webhook en schrijft top-up bedragen
automatisch bij in de Firestore `users/{uid}.wallet_balance` van het merk.

ENV VARS (in /app/backend/.env):
    SHOPIFY_WEBHOOK_SECRET             - vereist (HMAC signing secret)
    SHOPIFY_SHOP_DOMAIN                - optioneel (bv. doubleyousmallandtall.nl)
    FIREBASE_PROJECT_ID                - vereist voor automatische credit
    FIREBASE_SERVICE_ACCOUNT_JSON_B64  - base64-encoded service-account JSON

FALLBACK:
    Als Firebase Admin nog niet geconfigureerd is, wordt elke geverifieerde
    order in MongoDB (`shopify_topup_queue`) bewaard met status="pending_credit".
    Een admin kan dan via /api/wallet/admin/queue de wachtrij ophalen en
    handmatig crediten via de bestaande admin_wallet flow.

ENDPOINTS:
    POST /api/wallet/webhook/shopify       - Shopify orders/paid webhook
    GET  /api/wallet/health                - status (config check)
    GET  /api/wallet/admin/queue           - lijst pending topups (admin)
    POST /api/wallet/admin/replay/{id}     - re-credit een queue-item (admin)
═══════════════════════════════════════════════════════════════════════════
"""
from fastapi import APIRouter, HTTPException, Header, Request
from typing import Optional
import os
import hmac
import hashlib
import base64
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger("shopify_wallet")

wallet_router = APIRouter(prefix="/api/wallet", tags=["wallet"])

# ── ENV ─────────────────────────────────────────────────────────────────
SHOPIFY_WEBHOOK_SECRET            = os.environ.get("SHOPIFY_WEBHOOK_SECRET", "")
SHOPIFY_SHOP_DOMAIN               = os.environ.get("SHOPIFY_SHOP_DOMAIN", "")
FIREBASE_PROJECT_ID               = os.environ.get("FIREBASE_PROJECT_ID", "")
FIREBASE_SERVICE_ACCOUNT_JSON_B64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON_B64", "")
ADMIN_SECRET                      = os.environ.get("ADMIN_GEN_SECRET", "")

# ── Firebase Admin lazy init ────────────────────────────────────────────
_fb_app = None
_firestore_client = None
_fb_init_error: Optional[str] = None


def _init_firebase():
    """Lazy init firebase-admin met service account uit env."""
    global _fb_app, _firestore_client, _fb_init_error
    if _firestore_client is not None or _fb_init_error is not None:
        return _firestore_client
    if not FIREBASE_SERVICE_ACCOUNT_JSON_B64 or not FIREBASE_PROJECT_ID:
        _fb_init_error = "FIREBASE_SERVICE_ACCOUNT_JSON_B64 of FIREBASE_PROJECT_ID ontbreekt"
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        sa_json = json.loads(base64.b64decode(FIREBASE_SERVICE_ACCOUNT_JSON_B64).decode("utf-8"))
        cred = credentials.Certificate(sa_json)
        _fb_app = firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID}, name="dy-wallet")
        _firestore_client = firestore.client(_fb_app)
        logger.info("Firebase Admin geïnitialiseerd voor project %s", FIREBASE_PROJECT_ID)
        return _firestore_client
    except Exception as e:
        _fb_init_error = f"Firebase init faalde: {e}"
        logger.exception("Firebase init faalde")
        return None


# ── HMAC verificatie ────────────────────────────────────────────────────
def _verify_hmac(raw_body: bytes, header_hmac: str) -> bool:
    if not SHOPIFY_WEBHOOK_SECRET or not header_hmac:
        return False
    digest = hmac.new(
        SHOPIFY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, header_hmac)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_attrs(order: dict) -> dict:
    """Extract wallet_topup_uid & amount uit note_attributes/line_items properties."""
    attrs = {}
    # 1. Cart-level note attributes (preferred - set via cart/{vid}:1?attributes[key]=val)
    for a in order.get("note_attributes") or []:
        if a.get("name") and a.get("value") is not None:
            attrs[str(a["name"])] = str(a["value"])
    # 2. Line-item-level properties (fallback)
    for li in order.get("line_items") or []:
        for p in li.get("properties") or []:
            if p.get("name") and p.get("value") is not None:
                attrs.setdefault(str(p["name"]), str(p["value"]))
    return attrs


def _credit_firestore(uid: str, amount_eur: float, order_id: str, order: dict) -> dict:
    """
    Atomic credit naar Firestore. Idempotent via payments.shopify_order_id.
    Return dict met new_balance + payment_id.
    """
    db = _init_firebase()
    if db is None:
        raise RuntimeError(f"Firestore niet beschikbaar: {_fb_init_error}")
    from firebase_admin import firestore as _fs

    payments_ref = db.collection("payments")
    user_ref = db.collection("users").document(uid)

    # Idempotency: bestaat al een payment-doc voor deze order?
    existing = list(payments_ref.where("shopify_order_id", "==", str(order_id)).limit(1).stream())
    if existing:
        doc = existing[0].to_dict() or {}
        return {
            "status": "already_processed",
            "payment_id": existing[0].id,
            "new_balance": doc.get("wallet_balance_after"),
        }

    # Increment balance atomically
    user_ref.set(
        {
            "wallet_balance": _fs.Increment(amount_eur),
            "wallet_currency": (order.get("currency") or "EUR"),
            "wallet_last_updated": _iso_now(),
        },
        merge=True,
    )

    # Read new balance (after write)
    snap = user_ref.get()
    new_balance = (snap.to_dict() or {}).get("wallet_balance", 0) if snap.exists else amount_eur

    # Log payment
    pay_doc = {
        "uid": uid,
        "type": "topup",
        "amount_cents": int(round(amount_eur * 100)),
        "currency": order.get("currency", "EUR"),
        "status": "completed",
        "source": "shopify",
        "shopify_order_id": str(order_id),
        "shopify_order_name": order.get("name") or order.get("order_number"),
        "shopify_customer_email": (order.get("customer") or {}).get("email"),
        "wallet_balance_after": new_balance,
        "created_at": _fs.SERVER_TIMESTAMP,
        "updated_at": _fs.SERVER_TIMESTAMP,
        "idempotency_key": f"order-{order_id}",
    }
    pay_ref = payments_ref.add(pay_doc)
    # add() returns (timestamp, DocumentReference) in firestore-python
    payment_id = pay_ref[1].id if isinstance(pay_ref, tuple) else pay_ref.id

    return {"status": "credited", "payment_id": payment_id, "new_balance": new_balance}


def _credit_b2c_firestore(uid: str, amount_eur: float, order_id: str, order: dict) -> dict:
    """
    Atomic credit naar Firestore voor B2C wallet (gescheiden van B2B merken-wallet).
    Schrijft naar users/{uid}.b2c_wallet_balance i.p.v. wallet_balance.
    Idempotent via payments.shopify_order_id.
    """
    db = _init_firebase()
    if db is None:
        raise RuntimeError(f"Firestore niet beschikbaar: {_fb_init_error}")
    from firebase_admin import firestore as _fs

    payments_ref = db.collection("payments")
    user_ref = db.collection("users").document(uid)

    # Idempotency: check op shopify_order_id + wallet_type=b2c
    existing = list(payments_ref
                    .where("shopify_order_id", "==", str(order_id))
                    .where("wallet_type", "==", "b2c")
                    .limit(1).stream())
    if existing:
        doc = existing[0].to_dict() or {}
        return {
            "status": "already_processed",
            "payment_id": existing[0].id,
            "new_balance": doc.get("b2c_wallet_balance_after"),
        }

    # Increment B2C balance atomically
    user_ref.set(
        {
            "b2c_wallet_balance": _fs.Increment(amount_eur),
            "b2c_wallet_currency": (order.get("currency") or "EUR"),
            "b2c_wallet_last_updated": _iso_now(),
        },
        merge=True,
    )

    snap = user_ref.get()
    new_balance = (snap.to_dict() or {}).get("b2c_wallet_balance", 0) if snap.exists else amount_eur

    pay_doc = {
        "uid": uid,
        "type": "topup",
        "wallet_type": "b2c",
        "amount_cents": int(round(amount_eur * 100)),
        "currency": order.get("currency", "EUR"),
        "status": "completed",
        "source": "shopify_b2c",
        "shopify_order_id": str(order_id),
        "shopify_order_name": order.get("name") or order.get("order_number"),
        "shopify_customer_email": (order.get("customer") or {}).get("email"),
        "b2c_wallet_balance_after": new_balance,
        "created_at": _fs.SERVER_TIMESTAMP,
        "updated_at": _fs.SERVER_TIMESTAMP,
        "idempotency_key": f"b2c-order-{order_id}",
    }
    pay_ref = payments_ref.add(pay_doc)
    payment_id = pay_ref[1].id if isinstance(pay_ref, tuple) else pay_ref.id

    return {"status": "credited", "payment_id": payment_id, "new_balance": new_balance}


# ══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════
@wallet_router.get("/health")
async def health():
    return {
        "shopify_webhook_secret_set": bool(SHOPIFY_WEBHOOK_SECRET),
        "shopify_shop_domain":         SHOPIFY_SHOP_DOMAIN or None,
        "firebase_project_id":         FIREBASE_PROJECT_ID or None,
        "firebase_admin_ready":        _init_firebase() is not None,
        "firebase_init_error":         _fb_init_error,
        "ts": _iso_now(),
    }


@wallet_router.get("/setup-url")
async def setup_url(request: Request):
    """
    Eenvoudige plaintext page met DE webhook-URL die je in Shopify moet plakken.
    Open deze URL in je browser, selecteer-alles (Ctrl+A) en kopieer.
    Geen chat-highlight contamination.
    """
    from fastapi.responses import PlainTextResponse
    url = "https://paskamer-stability.preview.emergentagent.com/api/wallet/webhook/shopify"
    return PlainTextResponse(url)


@wallet_router.get("/setup")
async def setup_helper():
    """1-klik HTML-pagina met de webhook-URL en een 'Kopieer' knop."""
    from fastapi.responses import HTMLResponse
    url = "https://paskamer-stability.preview.emergentagent.com/api/wallet/webhook/shopify"
    secret_set = bool(SHOPIFY_WEBHOOK_SECRET)
    fb_ready = _init_firebase() is not None
    html = f"""<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Doubleyou | Shopify Webhook Setup</title>
<style>
  body {{ background:#0a0806; color:#fcf8ef; font:16px/1.5 system-ui,-apple-system,sans-serif;
         margin:0; padding:40px 20px; min-height:100vh; }}
  .wrap {{ max-width:640px; margin:0 auto; }}
  h1 {{ font-size:1.6rem; color:#d4910a; margin:0 0 8px; }}
  .lead {{ color:rgba(252,248,239,.7); margin:0 0 28px; }}
  .field {{ background:#1e1a0f; border:1px solid rgba(212,145,10,.4); border-radius:12px;
            padding:16px; margin-bottom:16px; }}
  .field-label {{ font-size:11px; letter-spacing:.12em; text-transform:uppercase;
                  color:#d4910a; font-weight:600; margin-bottom:8px; }}
  .field-value {{ font-family:'SF Mono',Monaco,monospace; font-size:14px;
                  word-break:break-all; user-select:all; padding:10px; background:#0a0806;
                  border-radius:8px; border:1px solid rgba(252,248,239,.1); }}
  .btn {{ display:inline-block; background:#d4910a; color:#0a0806; padding:12px 24px;
          border:none; border-radius:100px; font-weight:700; cursor:pointer;
          font-size:15px; margin-top:8px; transition:transform .15s; }}
  .btn:hover {{ transform:scale(1.03); background:#e8a31f; }}
  .btn.ok {{ background:#3a7d3a; color:#fff; }}
  .status {{ display:flex; gap:8px; margin:20px 0; flex-wrap:wrap; }}
  .pill {{ display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
           background:rgba(255,255,255,.05); border-radius:100px; font-size:13px; }}
  .pill.ok {{ color:#7ee07e; }}
  .pill.no {{ color:#ff8a8a; }}
  .steps {{ background:rgba(212,145,10,.06); border:1px solid rgba(212,145,10,.2);
            border-radius:12px; padding:18px 22px; margin-top:24px; }}
  .steps h2 {{ margin:0 0 12px; font-size:1rem; color:#d4910a; }}
  .steps ol {{ margin:0; padding-left:20px; }}
  .steps li {{ margin-bottom:10px; color:rgba(252,248,239,.85); }}
</style></head>
<body><div class="wrap">
  <h1>🔗 Shopify Webhook Setup</h1>
  <p class="lead">1 klik = URL in je klembord. Plak 'm daarna in Shopify.</p>

  <div class="status">
    <span class="pill {'ok' if secret_set else 'no'}">{'✅' if secret_set else '⏳'} Signing secret: {'actief' if secret_set else 'wacht op'}</span>
    <span class="pill {'ok' if fb_ready else 'no'}">{'✅' if fb_ready else '⏳'} Firebase Admin: {'klaar' if fb_ready else 'wacht op JSON'}</span>
  </div>

  <div class="field">
    <div class="field-label">Webhook URL (kopieer en plak in Shopify)</div>
    <div class="field-value" id="url">{url}</div>
    <button class="btn" id="copyBtn" onclick="copyUrl()">📋 Kopieer URL</button>
  </div>

  <div class="steps">
    <h2>Stappen in Shopify Admin</h2>
    <ol>
      <li>Settings → Notifications → Webhooks</li>
      <li>Klik op de bestaande "Betaling van bestelling" webhook → ⋯ → Bewerken</li>
      <li>URL-veld leegmaken (Ctrl+A → Delete)</li>
      <li>Klik hierboven <strong>"📋 Kopieer URL"</strong> → in Shopify URL-veld <strong>Ctrl+V</strong></li>
      <li>Webhook-API-versie: <strong>2025-01</strong> (géén Release-kandidaat)</li>
      <li>Opslaan ✓</li>
    </ol>
  </div>
</div>
<script>
  async function copyUrl() {{
    const url = document.getElementById('url').textContent.trim();
    const btn = document.getElementById('copyBtn');
    try {{
      await navigator.clipboard.writeText(url);
      btn.textContent = '✅ Gekopieerd!';
      btn.classList.add('ok');
      setTimeout(() => {{ btn.textContent = '📋 Kopieer URL'; btn.classList.remove('ok'); }}, 2500);
    }} catch (e) {{
      // Fallback: select de tekst
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('url'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = '⚠️ Druk Ctrl+C nu';
    }}
  }}
</script></body></html>"""
    return HTMLResponse(html)


@wallet_router.post("/webhook/shopify")
async def shopify_webhook(request: Request,
                          x_shopify_hmac_sha256: Optional[str] = Header(None),
                          x_shopify_topic: Optional[str] = Header(None),
                          x_shopify_shop_domain: Optional[str] = Header(None)):
    """
    Shopify `orders/paid` webhook.
    Vereist X-Shopify-Hmac-Sha256 header (validated met SHOPIFY_WEBHOOK_SECRET).
    """
    raw = await request.body()
    if not _verify_hmac(raw, x_shopify_hmac_sha256 or ""):
        logger.warning("Shopify webhook met ongeldige HMAC (topic=%s, shop=%s)",
                       x_shopify_topic, x_shopify_shop_domain)
        raise HTTPException(status_code=401, detail="Invalid HMAC signature")

    try:
        order = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    order_id = order.get("id") or order.get("order_id")
    if not order_id:
        return {"status": "ignored", "reason": "no order id"}

    attrs = _extract_attrs(order)
    uid = attrs.get("wallet_topup_uid") or attrs.get("uid")
    amount_cents_raw = attrs.get("wallet_topup_amount_cents") or attrs.get("amount_cents")

    # ── B2C WALLET TOPUP DETECTIE ──────────────────────────────────────
    # B2C top-up gebruikt aparte attribute-namen om B2C en B2B strikt
    # gescheiden te houden. Detecteer en bewaar voor latere routing.
    b2c_uid = attrs.get("b2c_wallet_topup_uid")
    b2c_amount_cents_raw = attrs.get("b2c_wallet_topup_amount_cents")
    is_b2c_topup = bool(b2c_uid)
    if is_b2c_topup:
        uid = b2c_uid
        amount_cents_raw = b2c_amount_cents_raw or amount_cents_raw

    # ── PREMIUM SUBSCRIPTION FLOW ──────────────────────────────────────
    # Cart-attributes: premium_user_key, premium_email, premium_plan='monthly'
    premium_user_key = attrs.get("premium_user_key")
    premium_email    = attrs.get("premium_email")
    premium_plan     = attrs.get("premium_plan", "monthly")

    if premium_user_key or premium_email:
        # Premium upgrade order
        mongo_db = getattr(request.app.state, "mongo_db", None)
        if mongo_db is None:
            return {"status": "error", "reason": "no mongo db"}

        # Periode bepalen: monthly=30d, yearly=365d
        days = 365 if premium_plan == "yearly" else 30
        now = datetime.now(timezone.utc)

        # Idempotency: check of order al verwerkt
        existing = await mongo_db.premium_users.find_one(
            {"shopify_orders": str(order_id)}
        )
        if existing:
            return {"ok": True, "status": "already_processed", "order_id": str(order_id),
                    "user_key": existing.get("user_key")}

        # Bestaand record ophalen via user_key OR email
        key = premium_user_key or premium_email
        rec = None
        if premium_user_key:
            rec = await mongo_db.premium_users.find_one({"user_key": premium_user_key})
        if not rec and premium_email:
            rec = await mongo_db.premium_users.find_one({"email": premium_email})

        # Bepaal nieuwe end-datum: extend bij bestaand actief, anders +days vanaf nu
        from datetime import timedelta
        current_end_iso = (rec or {}).get("current_period_end")
        base_dt = now
        if current_end_iso:
            try:
                cur = datetime.fromisoformat(current_end_iso.replace('Z', '+00:00'))
                if cur > now:
                    base_dt = cur  # stack op huidige periode
            except Exception:
                pass
        new_end = base_dt + timedelta(days=days)

        update_doc = {
            "$set": {
                "user_key": key,
                "email":    premium_email or (rec or {}).get("email"),
                "is_premium": True,
                "plan": f"premium_{premium_plan}_shopify",
                "current_period_start": now.isoformat(),
                "current_period_end":   new_end.isoformat(),
                "premium_activated":    True,
                "source":               "shopify",
                "shop_domain":          x_shopify_shop_domain,
                "last_payment_at":      now.isoformat(),
                "last_shopify_order":   str(order_id),
            },
            "$addToSet": {"shopify_orders": str(order_id)},
            "$setOnInsert": {"created_at": now.isoformat()},
        }
        await mongo_db.premium_users.update_one({"user_key": key}, update_doc, upsert=True)

        return {"ok": True, "type": "premium",
                "user_key": key, "plan": premium_plan,
                "expires_at": new_end.isoformat(),
                "order_id": str(order_id)}

    # ── WALLET TOPUP FLOW (default) ────────────────────────────────────
    # Bedrag bepalen: 1) attribuut amount_cents, 2) total_price van order
    amount_eur = 0.0
    try:
        if amount_cents_raw:
            amount_eur = int(amount_cents_raw) / 100.0
        else:
            amount_eur = float(order.get("total_price") or 0.0)
    except Exception:
        amount_eur = 0.0

    if not uid or amount_eur <= 0:
        # Geen wallet-marker → genegeerd (kan een normale Shopify product order zijn)
        return {"status": "ignored", "reason": "no wallet_topup_uid or zero amount",
                "order_id": str(order_id)}

    # Probeer Firestore credit. Anders → queue in Mongo.
    mongo_db = getattr(request.app.state, "mongo_db", None)
    try:
        if is_b2c_topup:
            result = _credit_b2c_firestore(uid, amount_eur, str(order_id), order)
        else:
            result = _credit_firestore(uid, amount_eur, str(order_id), order)
        # Log óók in Mongo voor audit
        if mongo_db is not None:
            try:
                await mongo_db.shopify_topup_log.insert_one({
                    "order_id":   str(order_id),
                    "uid":        uid,
                    "amount_eur": amount_eur,
                    "wallet_type": "b2c" if is_b2c_topup else "b2b",
                    "status":     result.get("status", "credited"),
                    "received_at": _iso_now(),
                })
            except Exception:
                pass
        return {"ok": True, **result, "order_id": str(order_id), "amount_eur": amount_eur}
    except Exception as e:
        logger.error("Firestore credit faalde voor order %s uid %s: %s", order_id, uid, e)
        # Fallback: bewaar in MongoDB queue
        if mongo_db is not None:
            try:
                await mongo_db.shopify_topup_queue.update_one(
                    {"order_id": str(order_id)},
                    {"$setOnInsert": {
                        "order_id":    str(order_id),
                        "uid":         uid,
                        "amount_eur":  amount_eur,
                        "currency":    order.get("currency", "EUR"),
                        "status":      "pending_credit",
                        "shop_domain": x_shopify_shop_domain,
                        "customer":    (order.get("customer") or {}).get("email"),
                        "received_at": _iso_now(),
                        "error":       str(e)[:500],
                    }},
                    upsert=True,
                )
            except Exception as inner:
                logger.exception("Mongo queue insert ook gefaald: %s", inner)
        # Shopify retried tot 19 keer bij 5xx → liever 200 + queue
        return {"ok": False, "queued": True, "order_id": str(order_id),
                "amount_eur": amount_eur, "uid": uid, "error": str(e)[:200]}


# ── Admin endpoints (alleen met X-Admin-Secret) ─────────────────────────
def _check_admin(secret: Optional[str]):
    if not ADMIN_SECRET or secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@wallet_router.get("/admin/queue")
async def admin_queue(request: Request, x_admin_secret: Optional[str] = Header(None), limit: int = 50):
    _check_admin(x_admin_secret)
    mongo_db = getattr(request.app.state, "mongo_db", None)
    if mongo_db is None:
        return {"items": [], "count": 0}
    items = await mongo_db.shopify_topup_queue.find(
        {"status": "pending_credit"}, {"_id": 0}
    ).sort("received_at", -1).to_list(limit)
    return {"items": items, "count": len(items)}


@wallet_router.post("/admin/replay/{order_id}")
async def admin_replay(order_id: str, request: Request, x_admin_secret: Optional[str] = Header(None)):
    """Manueel een queue-item re-crediten zodra Firebase Admin werkt."""
    _check_admin(x_admin_secret)
    mongo_db = getattr(request.app.state, "mongo_db", None)
    if mongo_db is None:
        raise HTTPException(status_code=503, detail="Mongo niet beschikbaar")
    item = await mongo_db.shopify_topup_queue.find_one({"order_id": str(order_id)}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Queue-item niet gevonden")
    try:
        result = _credit_firestore(item["uid"], float(item["amount_eur"]), str(order_id),
                                   {"currency": item.get("currency", "EUR"), "name": order_id})
        await mongo_db.shopify_topup_queue.update_one(
            {"order_id": str(order_id)},
            {"$set": {"status": "credited", "credited_at": _iso_now(),
                      "payment_id": result.get("payment_id")}}
        )
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay faalde: {e}")
