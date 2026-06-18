"""
═══════════════════════════════════════════════════════════════════════════
PaskamerPraat, Wallet + Shopify Payments Router (v1.0.0)
═══════════════════════════════════════════════════════════════════════════

FastAPI router voor:
  - GET  /api/wallet/balance            (user reads own balance)
  - GET  /api/wallet/transactions       (user reads own history)
  - POST /api/wallet/topup/checkout     (creëer Shopify checkout URL)
  - POST /api/wallet/webhook/shopify    (Shopify order webhook)
  - POST /api/wallet/admin/adjust       (admin handmatige correctie)

INSTRUCTIE:
  Importeer in /app/backend/server.py:

      from extensions_wallet import wallet_router
      app.include_router(wallet_router)

ENV VARS REQUIRED (NIET hard-coded):
  SHOPIFY_SHOP_DOMAIN              = "your-store.myshopify.com"
  SHOPIFY_ADMIN_API_TOKEN          = "shpat_xxx" (Admin API access token)
  SHOPIFY_WEBHOOK_SECRET           = "shopify_webhook_signing_secret"
  SHOPIFY_TOPUP_VARIANT_DEFAULT_ID = "gid://shopify/ProductVariant/123"
  FIREBASE_PROJECT_ID              = "doubleyou-journal"
  FIREBASE_SERVICE_ACCOUNT_JSON_B64 = (base64-encoded service account key)
  WALLET_BACKEND_SECRET            = "shared secret voor admin endpoints"

SECURITY:
  - User mag GEEN wallet_balance direct schrijven (server-only)
  - Webhook signature gevalideerd via HMAC-SHA256
  - Idempotency via shopify_order_id uniqueness
  - Admin endpoints require X-Admin-Secret header
═══════════════════════════════════════════════════════════════════════════
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import time
import hmac
import hashlib
import base64
import json
import httpx
from datetime import datetime, timezone

wallet_router = APIRouter(prefix="/api/wallet", tags=["wallet"])

# ── ENV CONFIG ──────────────────────────────────────────────────────────
SHOPIFY_SHOP_DOMAIN              = os.environ.get("SHOPIFY_SHOP_DOMAIN", "")
SHOPIFY_ADMIN_API_TOKEN          = os.environ.get("SHOPIFY_ADMIN_API_TOKEN", "")
SHOPIFY_WEBHOOK_SECRET           = os.environ.get("SHOPIFY_WEBHOOK_SECRET", "")
SHOPIFY_TOPUP_VARIANT_DEFAULT_ID = os.environ.get("SHOPIFY_TOPUP_VARIANT_DEFAULT_ID", "")
WALLET_BACKEND_SECRET            = os.environ.get("WALLET_BACKEND_SECRET", "")
FIREBASE_PROJECT_ID              = os.environ.get("FIREBASE_PROJECT_ID", "")


def _require_shopify_config():
    if not (SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_API_TOKEN):
        raise HTTPException(
            status_code=503,
            detail="Shopify niet geconfigureerd. Set SHOPIFY_SHOP_DOMAIN + SHOPIFY_ADMIN_API_TOKEN env vars."
        )


def _verify_shopify_webhook(raw_body: bytes, hmac_header: str) -> bool:
    """Validate Shopify webhook signature (HMAC-SHA256)."""
    if not SHOPIFY_WEBHOOK_SECRET or not hmac_header:
        return False
    digest = hmac.new(
        SHOPIFY_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).digest()
    computed = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(computed, hmac_header)


# ── SCHEMAS ─────────────────────────────────────────────────────────────
class WalletBalanceResponse(BaseModel):
    uid: str
    wallet_balance_cents: int
    currency: str = "EUR"
    last_updated: Optional[str] = None


class TransactionRecord(BaseModel):
    id: str
    type: str
    amount_cents: int
    currency: str
    ts: str
    source: str
    description: Optional[str] = None
    ref_id: Optional[str] = None


class TopupCheckoutRequest(BaseModel):
    uid: str
    amount_cents: int = Field(..., ge=1000, le=1000000)  # min €10, max €10000
    return_url: Optional[str] = None
    variant_id: Optional[str] = None


class TopupCheckoutResponse(BaseModel):
    checkout_url: str
    draft_order_id: str
    expires_at: Optional[str] = None


class AdminAdjustRequest(BaseModel):
    uid: str
    delta_cents: int  # positive=credit, negative=debit
    reason: str
    admin_uid: str


# ── ENDPOINTS ───────────────────────────────────────────────────────────
@wallet_router.get("/balance", response_model=WalletBalanceResponse)
async def get_balance(uid: str, x_user_token: Optional[str] = Header(None)):
    """
    User reads own balance. In productie: Firebase ID token verifiëren ipv plain uid.
    Voor MVP: vereenvoudigde flow, frontend stuurt verified uid.
    """
    # TODO: Firebase ID token verification via firebase-admin SDK
    doc = await _firestore_get_user(uid)
    return WalletBalanceResponse(
        uid=uid,
        wallet_balance_cents=int(doc.get("wallet_balance", 0) * 100),
        currency=doc.get("wallet_currency", "EUR"),
        last_updated=doc.get("wallet_last_updated"),
    )


@wallet_router.get("/transactions")
async def get_transactions(uid: str, limit: int = 50):
    """Lijst recente transacties voor user."""
    docs = await _firestore_query(
        collection="payments",
        where=[("uid", "==", uid)],
        order_by=[("created_at", "desc")],
        limit=limit,
    )
    return {"uid": uid, "transactions": docs, "count": len(docs)}


@wallet_router.post("/topup/checkout", response_model=TopupCheckoutResponse)
async def create_topup_checkout(req: TopupCheckoutRequest):
    """
    Creëer een Shopify Draft Order met custom amount → return checkout URL.
    Gebruikt Shopify Admin API GraphQL.
    """
    _require_shopify_config()
    variant_id = req.variant_id or SHOPIFY_TOPUP_VARIANT_DEFAULT_ID
    if not variant_id:
        raise HTTPException(status_code=400, detail="Geen Shopify variant_id geconfigureerd voor topup")

    # GraphQL: draftOrderCreate
    mutation = """
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }
    """
    line_item = {
        "variantId": variant_id,
        "quantity": 1,
        "appliedDiscount": None,
        "customAttributes": [
            {"key": "wallet_topup_uid",          "value": req.uid},
            {"key": "wallet_topup_amount_cents", "value": str(req.amount_cents)}
        ]
    }
    variables = {
        "input": {
            "lineItems": [line_item],
            "tags": ["wallet_topup", f"uid:{req.uid}"],
            "note": f"Wallet topup voor uid {req.uid} ({req.amount_cents} cents)",
            "useCustomerDefaultAddress": False
        }
    }
    url = f"https://{SHOPIFY_SHOP_DOMAIN}/admin/api/2024-10/graphql.json"
    headers = {"X-Shopify-Access-Token": SHOPIFY_ADMIN_API_TOKEN, "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(url, headers=headers, json={"query": mutation, "variables": variables})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Shopify API error {r.status_code}: {r.text[:200]}")
    data = r.json()
    errs = data.get("data", {}).get("draftOrderCreate", {}).get("userErrors", [])
    if errs:
        raise HTTPException(status_code=400, detail=f"Shopify validation: {errs}")
    draft = data["data"]["draftOrderCreate"]["draftOrder"]

    # Log pending payment
    await _firestore_create("payments", {
        "uid": req.uid,
        "type": "topup",
        "amount_cents": req.amount_cents,
        "currency": "EUR",
        "status": "pending",
        "shopify_checkout_id": draft["id"],
        "idempotency_key": f"draft-{draft['id']}",
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
    })

    return TopupCheckoutResponse(
        checkout_url=draft["invoiceUrl"],
        draft_order_id=draft["id"],
    )


@wallet_router.post("/webhook/shopify")
async def shopify_webhook(request: Request, x_shopify_hmac_sha256: Optional[str] = Header(None)):
    """
    Shopify orders/paid webhook → credit wallet als topup attributes aanwezig.
    Idempotent: dubbele webhook calls met zelfde order_id worden gedetecteerd.
    """
    raw = await request.body()
    if not _verify_shopify_webhook(raw, x_shopify_hmac_sha256 or ""):
        raise HTTPException(status_code=401, detail="Invalid Shopify HMAC")

    order = json.loads(raw)
    order_id    = str(order.get("id", ""))
    order_gid   = order.get("admin_graphql_api_id", f"gid://shopify/Order/{order_id}")
    note_attrs  = {a["name"]: a["value"] for a in order.get("note_attributes", [])}
    uid           = note_attrs.get("wallet_topup_uid")
    amount_cents  = int(note_attrs.get("wallet_topup_amount_cents", "0"))
    customer_id   = (order.get("customer") or {}).get("admin_graphql_api_id", "")

    if not uid or amount_cents <= 0:
        return {"status": "ignored", "reason": "no wallet_topup attributes"}

    # Idempotency check
    existing = await _firestore_query(
        collection="payments",
        where=[("shopify_order_id", "==", order_id)],
        limit=1,
    )
    if existing:
        return {"status": "already_processed", "order_id": order_id}

    # Credit wallet atomically
    new_balance = await _firestore_credit_wallet(uid, amount_cents)

    # Log payment
    payment_id = await _firestore_create("payments", {
        "uid": uid,
        "type": "topup",
        "amount_cents": amount_cents,
        "currency": order.get("currency", "EUR"),
        "status": "completed",
        "shopify_order_id": order_id,
        "shopify_customer_id": customer_id,
        "webhook_received_at": _iso_now(),
        "wallet_credited_at":  _iso_now(),
        "idempotency_key": f"order-{order_id}",
        "wallet_balance_after": new_balance,
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
    })

    # Append to user transactions array
    await _firestore_append_user_transaction(uid, {
        "id": payment_id,
        "type": "topup",
        "amount_cents": amount_cents,
        "currency": "EUR",
        "ts": _iso_now(),
        "source": "shopify",
        "ref_id": order_id,
        "description": f"Shopify topup #{order_id}"
    })

    # Update customer_id if first time
    if customer_id:
        await _firestore_update_user(uid, {"shopify_customer_id": customer_id})

    return {"status": "credited", "order_id": order_id, "amount_cents": amount_cents, "new_balance_cents": new_balance}


@wallet_router.post("/admin/adjust")
async def admin_adjust(req: AdminAdjustRequest, x_admin_secret: Optional[str] = Header(None)):
    """Admin: handmatige saldo-aanpassing met audit trail."""
    if x_admin_secret != WALLET_BACKEND_SECRET or not WALLET_BACKEND_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    new_balance = await _firestore_credit_wallet(req.uid, req.delta_cents)
    payment_id = await _firestore_create("payments", {
        "uid": req.uid,
        "type": "manual_adjust",
        "amount_cents": req.delta_cents,
        "currency": "EUR",
        "status": "completed",
        "idempotency_key": f"admin-{req.admin_uid}-{int(time.time())}",
        "wallet_balance_after": new_balance,
        "metadata": {"reason": req.reason, "admin_uid": req.admin_uid},
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
    })
    await _firestore_append_user_transaction(req.uid, {
        "id": payment_id,
        "type": "manual_adjust",
        "amount_cents": req.delta_cents,
        "currency": "EUR",
        "ts": _iso_now(),
        "source": "admin",
        "ref_id": req.admin_uid,
        "description": req.reason,
    })
    return {"status": "ok", "new_balance_cents": new_balance, "payment_id": payment_id}


@wallet_router.get("/health")
async def health():
    return {
        "shopify_configured": bool(SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_API_TOKEN),
        "webhook_secret_set": bool(SHOPIFY_WEBHOOK_SECRET),
        "firebase_configured": bool(FIREBASE_PROJECT_ID),
        "ts": _iso_now(),
    }


# ══════════════════════════════════════════════════════════════════════
# FIRESTORE HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════════
# In productie: gebruik firebase-admin Python SDK.
# Voor nu: REST API stubs die FAIL met heldere error als FIREBASE niet geconfigureerd.

async def _firestore_get_user(uid: str) -> dict:
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd. Install firebase-admin + service account.")

async def _firestore_query(collection: str, where=None, order_by=None, limit=50) -> list:
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd.")

async def _firestore_create(collection: str, data: dict) -> str:
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd.")

async def _firestore_credit_wallet(uid: str, delta_cents: int) -> int:
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd.")

async def _firestore_append_user_transaction(uid: str, tx: dict):
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd.")

async def _firestore_update_user(uid: str, patch: dict):
    raise HTTPException(status_code=501, detail="Firebase Admin SDK niet geïnitialiseerd.")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()
