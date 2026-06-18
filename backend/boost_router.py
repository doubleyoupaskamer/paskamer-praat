"""
═══════════════════════════════════════════════════════════════════════
Doubleyou — B2C Post Boost Backend (v1.0.0)
═══════════════════════════════════════════════════════════════════════

NIEUWE ENDPOINTS (alle onder /api/boost/*):
    POST /api/boost/activate          - activeer boost via wallet (auth required)
    GET  /api/boost/active            - lijst actieve boosts (public, voor feed)
    POST /api/boost/admin/expire      - cron: verlopen boosts deactiveren

Veiligheid:
    - Bearer JWT (Firebase) verplicht voor /activate
    - Server checkt: user is post-eigenaar, voldoende saldo, atomic transactie
    - Idempotent via boost-id

Firestore writes (alle via firebase-admin):
    - users/{uid}.b2c_wallet_balance  (decrement)
    - posts/{id}.boost_*              (boost_active, boost_expires_at, boost_weight)
    - post_boosts/{id}                (audit record)
    - wallet_transactions/{id}        (transactie-log)
═══════════════════════════════════════════════════════════════════════
"""
from fastapi import APIRouter, HTTPException, Header, Depends, Request
from typing import Optional
from datetime import datetime, timezone, timedelta
import os, logging

logger = logging.getLogger("boost")
boost_router = APIRouter(prefix="/api/boost", tags=["boost"])

ADMIN_SECRET = os.environ.get("ADMIN_GEN_SECRET", "")

DEFAULT_PACKAGES = {
    "starter": {"naam": "Starter Boost", "uur": 24,  "prijs_cents": 199, "weight": 1.5},
    "groei":   {"naam": "Groei Boost",   "uur": 72,  "prijs_cents": 499, "weight": 2.5},
    "premium": {"naam": "Premium Boost", "uur": 168, "prijs_cents": 999, "weight": 4.0},
}


def _iso_now():
    return datetime.now(timezone.utc).isoformat()


def _verify_token(authorization: Optional[str]) -> str:
    """Verifieer Bearer JWT via firebase-admin. Returns uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")
    try:
        from firebase_admin import auth as fb_auth
        token = authorization[7:]
        decoded = fb_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as e:
        raise HTTPException(401, f"Invalid token: {e}")


def _get_firestore():
    """Krijg firestore client (lazy init via shopify_wallet._init_firebase)."""
    try:
        from shopify_wallet import _init_firebase
        db = _init_firebase()
        if db is None:
            raise HTTPException(503, "Firebase Admin niet geconfigureerd")
        return db
    except ImportError:
        raise HTTPException(503, "Firebase Admin niet beschikbaar")


@boost_router.post("/activate")
async def activate_boost(request: Request, authorization: Optional[str] = Header(None)):
    """Activeer een boost voor een eigen post met wallet saldo."""
    uid = _verify_token(authorization)
    body = await request.json()
    post_id = body.get("postId")
    pkg_key = body.get("packageKey")
    if not post_id or not pkg_key:
        raise HTTPException(400, "postId en packageKey verplicht")

    db = _get_firestore()
    from firebase_admin import firestore as _fs

    # Haal pakket-config (DB-override mogelijk)
    settings_doc = db.collection("admin_settings").document("global").get()
    settings_data = settings_doc.to_dict() if settings_doc.exists else {}
    packages = settings_data.get("boost_packages") or DEFAULT_PACKAGES
    pkg = packages.get(pkg_key)
    if not pkg:
        raise HTTPException(400, f"Onbekend pakket: {pkg_key}")

    prijs_cents = int(pkg.get("prijs_cents", 0))
    prijs_eur = prijs_cents / 100.0
    duur_uur = int(pkg.get("uur", 24))
    weight = float(pkg.get("weight", 1.5))

    # Verify post owner
    post_ref = db.collection("posts").document(post_id)
    post_snap = post_ref.get()
    if not post_snap.exists:
        # Probeer alternatieve collectie 'feed_posts'
        post_ref = db.collection("feed_posts").document(post_id)
        post_snap = post_ref.get()
        if not post_snap.exists:
            raise HTTPException(404, "Post niet gevonden")
    post_data = post_snap.to_dict() or {}
    if post_data.get("userId") != uid and post_data.get("uid") != uid:
        raise HTTPException(403, "Alleen eigen posts kunnen geboost worden")

    # Atomic transactie: check saldo + decrement + boost record
    user_ref = db.collection("users").document(uid)
    boost_ref = db.collection("post_boosts").document()
    txn_ref = db.collection("wallet_transactions").document()

    transaction = db.transaction()

    @_fs.transactional
    def _do(transaction):
        user_snap = user_ref.get(transaction=transaction)
        user_data = user_snap.to_dict() if user_snap.exists else {}
        balance = float(user_data.get("b2c_wallet_balance", 0))
        if balance < prijs_eur:
            raise HTTPException(402, f"Saldo te laag: €{balance:.2f} < €{prijs_eur:.2f}")

        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=duur_uur)

        # 1. Decrement wallet
        transaction.update(user_ref, {
            "b2c_wallet_balance": _fs.Increment(-prijs_eur),
            "b2c_wallet_last_used": now.isoformat(),
        })
        # 2. Activate boost op post
        transaction.update(post_ref, {
            "boost_active":     True,
            "boost_expires_at": expires.isoformat(),
            "boost_weight":     weight,
            "boost_id":         boost_ref.id,
            "boost_package":    pkg_key,
        })
        # 3. Create boost audit record
        transaction.set(boost_ref, {
            "post_id":      post_id,
            "user_id":      uid,
            "package":      pkg_key,
            "package_data": pkg,
            "status":       "active",
            "started_at":   now.isoformat(),
            "expires_at":   expires.isoformat(),
            "amount_cents": prijs_cents,
            "weight":       weight,
            "impressions":  0,
            "clicks":       0,
        })
        # 4. Transaction log
        transaction.set(txn_ref, {
            "user_id":     uid,
            "type":        "boost_purchase",
            "amount_eur":  -prijs_eur,
            "currency":    "EUR",
            "status":      "completed",
            "reference":   boost_ref.id,
            "post_id":     post_id,
            "created_at":  now.isoformat(),
        })
        return {"boost_id": boost_ref.id, "expires_at": expires.isoformat(), "new_balance": balance - prijs_eur}

    try:
        result = _do(transaction)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Boost activate failed")
        raise HTTPException(500, f"Activatie mislukt: {e}")

    return {
        "ok": True,
        "boostId": result["boost_id"],
        "expiresAt": result["expires_at"],
        "newBalance": result["new_balance"],
        "package": pkg_key,
    }


@boost_router.get("/active")
async def list_active(limit: int = 100):
    """Lijst actieve boosts (publiek, voor feed-ranking client)."""
    db = _get_firestore()
    now_iso = _iso_now()
    docs = db.collection("post_boosts") \
        .where("status", "==", "active") \
        .where("expires_at", ">", now_iso) \
        .limit(limit).stream()
    items = [{"id": d.id, **(d.to_dict() or {})} for d in docs]
    return {"items": items, "count": len(items), "ts": now_iso}


@boost_router.post("/admin/expire")
async def expire_boosts(x_admin_secret: Optional[str] = Header(None)):
    """Cron-job: deactiveer verlopen boosts. Aanroepen via Cloudflare cron / scheduled task."""
    if not ADMIN_SECRET or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(403, "Forbidden")
    db = _get_firestore()
    now_iso = _iso_now()
    expired = db.collection("post_boosts") \
        .where("status", "==", "active") \
        .where("expires_at", "<=", now_iso).stream()
    count = 0
    for d in expired:
        data = d.to_dict() or {}
        post_id = data.get("post_id")
        # Update boost record
        d.reference.update({"status": "expired", "expired_at": _iso_now()})
        # Reset post boost-flags (in beide mogelijke collecties)
        for col in ("posts", "feed_posts"):
            try:
                p_ref = db.collection(col).document(post_id)
                if p_ref.get().exists:
                    p_ref.update({"boost_active": False})
                    break
            except Exception:
                pass
        count += 1
    return {"ok": True, "expired_count": count, "ts": now_iso}
