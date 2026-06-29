"""
Weekly Campaign Reports — Doubleyou
══════════════════════════════════════════════════════════════════════════
Stuurt elke maandag 09:00 NL-tijd een totaal-overzicht per live campagne
naar het email-adres dat aan de campagne is gekoppeld:
  1. campaigns.{cid}.email   (campagne-specifiek)  ← prioriteit
  2. brands.{brandId}.email  (merk-eigenaar fallback)

Inhoud: HTML email body + CSV bijlage met per-plaatsing breakdown.

ENV-vars (in /app/backend/.env):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
  SMTP_FROM_NAME, SMTP_FROM_EMAIL
  WEEKLY_REPORTS_ENABLED (true/false, default: true)
  WEEKLY_REPORTS_DRY_RUN (true/false, default: false — true logt alleen)
"""
from __future__ import annotations

import io
import csv
import os
import smtplib
import logging
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from typing import Any

logger = logging.getLogger(__name__)

# ──────────────────────── ENV / CONFIG ─────────────────────────────────
SMTP_HOST       = os.environ.get("SMTP_HOST", "")
SMTP_PORT       = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER       = os.environ.get("SMTP_USER", "")
SMTP_PASS       = os.environ.get("SMTP_PASS", "")
SMTP_FROM_NAME  = os.environ.get("SMTP_FROM_NAME", "Doubleyou Analytics")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "")
WEEKLY_ENABLED  = (os.environ.get("WEEKLY_REPORTS_ENABLED", "true").lower() == "true")
WEEKLY_DRY_RUN  = (os.environ.get("WEEKLY_REPORTS_DRY_RUN", "false").lower() == "true")

PLACEMENTS = ["feed", "stories", "outfit_review", "ai_assist", "similar_items"]


def _firestore():
    """Lazy Firestore client (zelfde init als shopify_wallet — gebruikt 'dy-wallet' app)."""
    from shopify_wallet import _init_firebase  # type: ignore
    client = _init_firebase()
    if client is None:
        raise RuntimeError("Firebase niet geïnitialiseerd — controleer FIREBASE_SERVICE_ACCOUNT_JSON_B64")
    return client


# ──────────────────────── AGGREGATIE ──────────────────────────────────
def aggregate_campaign(cid: str, brand_id: str | None) -> dict:
    """Aggregeert events + likes voor 1 campagne. Resultaat: dict met totals + per-placement."""
    db = _firestore()
    per_plc = {p: {"impr": 0, "click": 0} for p in PLACEMENTS}
    totals = {"impr": 0, "click": 0, "likes": 0}

    # Events filter op campaignId
    try:
        for ev in db.collection("events").where("campaignId", "==", cid).limit(5000).stream():
            e = ev.to_dict() or {}
            etype = e.get("type")
            plc = e.get("plaatsing")
            if etype == "impression":
                totals["impr"] += 1
                if plc in per_plc:
                    per_plc[plc]["impr"] += 1
            elif etype == "campaign_click":
                totals["click"] += 1
                if plc in per_plc:
                    per_plc[plc]["click"] += 1
    except Exception as e:
        logger.warning("aggregate_campaign events fetch failed: %s", e)

    # Likes uit brand_products (alleen merk-niveau, alle producten van het merk)
    if brand_id:
        try:
            for pd in db.collection("brand_products").where("brandId", "==", brand_id).limit(200).stream():
                p = pd.to_dict() or {}
                likes_map = p.get("likes") or {}
                if isinstance(likes_map, dict):
                    totals["likes"] += len(likes_map)
        except Exception as e:
            logger.warning("aggregate_campaign likes fetch failed: %s", e)

    return {"totals": totals, "perPlacement": per_plc}


# ──────────────────────── EMAIL LOOKUP ────────────────────────────────
def _resolve_recipient(campaign_data: dict, brand_id: str | None) -> str | None:
    """1) campaigns.email  2) brands.{brandId}.email fallback."""
    email = (campaign_data.get("email") or "").strip()
    if email and "@" in email:
        return email
    if brand_id:
        try:
            db = _firestore()
            bsnap = db.collection("brands").document(brand_id).get()
            if bsnap.exists:
                bdata = bsnap.to_dict() or {}
                bemail = (bdata.get("email") or "").strip()
                if bemail and "@" in bemail:
                    return bemail
        except Exception as e:
            logger.warning("brand email lookup failed: %s", e)
    return None


# ──────────────────────── CSV BIJLAGE ─────────────────────────────────
def _build_csv(campaign_data: dict, agg: dict) -> bytes:
    """Hiërarchische CSV: 1 TOTAAL-rij + 5 placement-rijen voor deze campagne."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Campagne", "Merk", "Status", "Plaatsing", "Impressies",
                "Kliks", "CTR_%", "Likes", "CampagneId", "BrandId"])

    tot = agg["totals"]
    ctr_tot = f"{(tot['click']/tot['impr']*100):.2f}" if tot["impr"] > 0 else "0.00"
    naam = campaign_data.get("naam") or campaign_data.get("brandNaam") or ""
    merk = campaign_data.get("brandNaam") or ""
    status = campaign_data.get("status") or ""
    cid = campaign_data.get("_id") or ""
    bid = campaign_data.get("brandId") or ""

    w.writerow([naam, merk, status, "TOTAAL",
                tot["impr"], tot["click"], ctr_tot, tot["likes"], cid, bid])

    plaats_arr = campaign_data.get("plaatsingen") or []
    for plc in PLACEMENTS:
        pc = agg["perPlacement"].get(plc, {"impr": 0, "click": 0})
        # Skip placements zonder data EN niet gekocht
        if pc["impr"] == 0 and pc["click"] == 0 and plc not in plaats_arr:
            continue
        ctr = f"{(pc['click']/pc['impr']*100):.2f}" if pc["impr"] > 0 else "0.00"
        w.writerow([naam, merk, status, plc, pc["impr"], pc["click"], ctr, "", cid, bid])

    # UTF-8 BOM voor Excel compat
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


# ──────────────────────── HTML BODY ───────────────────────────────────
def _build_html(campaign_data: dict, agg: dict, week_label: str) -> str:
    naam = campaign_data.get("naam") or campaign_data.get("brandNaam") or "(campagne)"
    merk = campaign_data.get("brandNaam") or ""
    tot = agg["totals"]
    ctr = f"{(tot['click']/tot['impr']*100):.2f}%" if tot["impr"] > 0 else "—"

    rows_html = ""
    plaats_arr = campaign_data.get("plaatsingen") or []
    for plc in PLACEMENTS:
        pc = agg["perPlacement"].get(plc, {"impr": 0, "click": 0})
        if pc["impr"] == 0 and pc["click"] == 0 and plc not in plaats_arr:
            continue
        plc_ctr = f"{(pc['click']/pc['impr']*100):.2f}%" if pc["impr"] > 0 else "—"
        rows_html += (
            f"<tr><td style='padding:8px;border-top:1px solid #eee'>{plc}</td>"
            f"<td style='padding:8px;border-top:1px solid #eee;text-align:right'>{pc['impr']:,}</td>"
            f"<td style='padding:8px;border-top:1px solid #eee;text-align:right'>{pc['click']:,}</td>"
            f"<td style='padding:8px;border-top:1px solid #eee;text-align:right'>{plc_ctr}</td></tr>"
        )

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf6ef">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:32px 24px">
    <h1 style="margin:0 0 4px;font-size:22px;color:#1a1208">Weekrapport campagne</h1>
    <p style="margin:0 0 24px;color:#6b5544;font-size:13px">{week_label}</p>

    <h2 style="margin:0 0 4px;font-size:18px;color:#1a1208">{naam}</h2>
    <p style="margin:0 0 18px;color:#6b5544;font-size:13px">{merk}</p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:24px">
      <div style="flex:1;min-width:120px;background:#faf6ef;padding:14px;border-radius:8px">
        <div style="font-size:11px;color:#6b5544;text-transform:uppercase;letter-spacing:.08em">Impressies</div>
        <div style="font-size:24px;font-weight:600;color:#1a1208">{tot['impr']:,}</div>
      </div>
      <div style="flex:1;min-width:120px;background:#faf6ef;padding:14px;border-radius:8px">
        <div style="font-size:11px;color:#6b5544;text-transform:uppercase;letter-spacing:.08em">Kliks</div>
        <div style="font-size:24px;font-weight:600;color:#1a1208">{tot['click']:,}</div>
      </div>
      <div style="flex:1;min-width:120px;background:#faf6ef;padding:14px;border-radius:8px">
        <div style="font-size:11px;color:#6b5544;text-transform:uppercase;letter-spacing:.08em">CTR</div>
        <div style="font-size:24px;font-weight:600;color:#1a1208">{ctr}</div>
      </div>
      <div style="flex:1;min-width:120px;background:#faf6ef;padding:14px;border-radius:8px">
        <div style="font-size:11px;color:#6b5544;text-transform:uppercase;letter-spacing:.08em">Likes</div>
        <div style="font-size:24px;font-weight:600;color:#1a1208">{tot['likes']:,}</div>
      </div>
    </div>

    <h3 style="margin:0 0 8px;font-size:14px;color:#1a1208">Per plaatsing</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#faf6ef">
        <th style="padding:8px;text-align:left">Plaatsing</th>
        <th style="padding:8px;text-align:right">Impr.</th>
        <th style="padding:8px;text-align:right">Kliks</th>
        <th style="padding:8px;text-align:right">CTR</th>
      </tr></thead>
      <tbody>{rows_html or '<tr><td colspan=4 style="padding:14px;color:#6b5544;text-align:center">Nog geen activiteit deze week.</td></tr>'}</tbody>
    </table>

    <p style="margin:28px 0 0;font-size:12px;color:#6b5544;line-height:1.5">
      Volledige data zit in de CSV-bijlage. Vragen? Reply op deze email.<br>
      — Doubleyou Analytics
    </p>
  </div>
</body></html>"""


# ──────────────────────── SMTP VERZENDEN ──────────────────────────────
def _smtp_send(to_email: str, subject: str, html: str, csv_bytes: bytes, csv_name: str) -> bool:
    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        logger.warning("SMTP niet geconfigureerd (SMTP_HOST/SMTP_FROM_EMAIL ontbreekt) — skip send.")
        return False
    msg = EmailMessage()
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content("Je e-mailclient ondersteunt geen HTML. Zie de CSV-bijlage voor je weekrapport.")
    msg.add_alternative(html, subtype="html")
    msg.add_attachment(csv_bytes, maintype="text", subtype="csv", filename=csv_name)

    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                if SMTP_USER:
                    s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.starttls()
                if SMTP_USER:
                    s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        logger.info("Weekrapport verzonden naar %s (%s)", to_email, csv_name)
        return True
    except Exception as e:
        logger.exception("SMTP send naar %s mislukt: %s", to_email, e)
        return False


# ──────────────────────── HOOFDPROCES ─────────────────────────────────
def run_weekly_for_all_campaigns(force: bool = False, only_campaign_id: str | None = None) -> dict:
    """Itereert live campagnes, aggregeert + verstuurt. Idempotent via `last_weekly_report_sent` flag.

    Args:
      force: ook verzenden als laatste send <6 dagen geleden was
      only_campaign_id: indien gegeven, alleen die ene campagne verwerken (voor handmatige test)
    """
    if not WEEKLY_ENABLED and not force and not only_campaign_id:
        return {"skipped": "WEEKLY_REPORTS_ENABLED=false"}

    db = _firestore()
    now = datetime.now(timezone.utc)
    nu_iso = now.isoformat()
    week_start = now - timedelta(days=7)
    week_label = f"{week_start.strftime('%d %b')} — {now.strftime('%d %b %Y')}"

    sent_count = 0
    skip_count = 0
    fail_count = 0
    no_email_count = 0

    try:
        if only_campaign_id:
            snap = db.collection("campaigns").document(only_campaign_id).get()
            if not snap.exists:
                return {"error": f"campaign {only_campaign_id} niet gevonden"}
            live_campaigns = [snap]
        else:
            live_campaigns = list(db.collection("campaigns").where("status", "==", "live").limit(500).stream())
    except Exception as e:
        logger.exception("Kon campagnes niet ophalen: %s", e)
        return {"error": str(e)}

    for snap in live_campaigns:
        c = snap.to_dict() or {}
        cid = snap.id
        c["_id"] = cid
        brand_id = c.get("brandId")

        # Idempotent: skip als de laatste verzending < 6 dagen geleden was
        if not force:
            last = c.get("last_weekly_report_sent")
            if last:
                try:
                    if hasattr(last, "isoformat"):
                        last_dt = last
                    else:
                        last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                    if (now - last_dt).total_seconds() < 6 * 86400:
                        skip_count += 1
                        continue
                except Exception:
                    pass

        to_email = _resolve_recipient(c, brand_id)
        if not to_email:
            no_email_count += 1
            logger.info("Campagne %s heeft geen email — skip", cid)
            continue

        agg = aggregate_campaign(cid, brand_id)
        csv_bytes = _build_csv(c, agg)
        html = _build_html(c, agg, week_label)
        naam = c.get("naam") or c.get("brandNaam") or cid[:8]
        subject = f"Weekrapport — {naam}"
        csv_name = f"weekrapport_{naam.replace(' ', '_')[:40]}_{now.strftime('%Y-%m-%d')}.csv"

        if WEEKLY_DRY_RUN:
            logger.info("[DRY-RUN] Zou verzenden: %s → %s (impr=%s click=%s likes=%s)",
                        cid, to_email, agg["totals"]["impr"], agg["totals"]["click"], agg["totals"]["likes"])
            sent_count += 1
            continue

        ok = _smtp_send(to_email, subject, html, csv_bytes, csv_name)
        if ok:
            sent_count += 1
            # Mark as sent
            try:
                db.collection("campaigns").document(cid).update({
                    "last_weekly_report_sent": now,
                    "last_weekly_report_email": to_email
                })
            except Exception as e:
                logger.warning("Kon last_weekly_report_sent niet bijwerken voor %s: %s", cid, e)
        else:
            fail_count += 1

    summary = {
        "ts": nu_iso,
        "live_campaigns": len(live_campaigns),
        "sent": sent_count,
        "skipped_recent": skip_count,
        "skipped_no_email": no_email_count,
        "failed": fail_count,
        "dry_run": WEEKLY_DRY_RUN
    }
    logger.info("Weekly reports klaar: %s", summary)
    return summary


# ──────────────────────── SCHEDULER ───────────────────────────────────
_scheduler = None

def start_scheduler():
    """Start een APScheduler die elke maandag 09:00 Europe/Amsterdam draait."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        sched = BackgroundScheduler(timezone="Europe/Amsterdam")
        sched.add_job(
            run_weekly_for_all_campaigns,
            CronTrigger(day_of_week="mon", hour=9, minute=0),
            id="weekly_campaign_reports",
            replace_existing=True,
            misfire_grace_time=3600
        )
        sched.start()
        _scheduler = sched
        logger.info("Weekly reports scheduler gestart (ma 09:00 NL-tijd)")
        return sched
    except Exception as e:
        logger.exception("Scheduler start mislukt: %s", e)
        return None


def shutdown_scheduler():
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass
        _scheduler = None
