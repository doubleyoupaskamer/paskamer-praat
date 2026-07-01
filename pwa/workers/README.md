# Cloudflare Workers Paskamer Praat

**4 productieklare workers** dekken alle server-side cron functionaliteiten. Backend cron (`weekly_reports.py` via APScheduler) blijft parallel actief voor brand-email flows.

---

## 1. `pvdw-worker-v1.2.js` Post van de Week ⭐ (UPGRADE v1.1 → v1.2)

**Vervang** bestaande `doubleyou-pvdw-worker`.

Selecteert wekelijks de post met de meeste likes (min. 25), keert DSP-bonus uit, en verstuurt notificaties naar admin + winnaar.

**Wijzigingen t.o.v. v1.1:**
- ✅ `notifyAdmin()` → schrijft naar `brand_admin_log`
- ✅ `notifyWinnaar()` → in-app melding via `meldingen` collectie
- ✅ `sendAdminMail()` → e-mail via Firebase Trigger Email extension (`mail/{id}`)

**Cron:** `0 23 * * 0` (zondag 23:00 UTC)

**Environment variables:**
```
FIREBASE_PROJECT_ID   = doubleyou-journal
FIREBASE_SERVICE_KEY  = <base64 service account JSON>
WORKER_SECRET         = <random secret>
WORKER_ADMIN_EMAIL    = admin@paskamerpraat.nl   (optioneel admin mail)
WORKER_APP_URL        = https://paskamerpraat.nl (optioneel deeplink)
```

---

## 2. `brand-autocomplete-worker-v1.0.js` Brand Campaign Auto-Complete

Zet elke campagne automatisch op `status='completed'` zodra `eindDatum` gepasseerd is.

**Cron:** `0 * * * *` (elk uur)

**Environment variables:** zelfde als PVDW (herzelfde service account).

---

## 3. `post-boosts-expire-worker-v1.0.js` Post Boosts Expire 🆕 v1.0

**Nieuw:** zonder deze worker blijven geboostte posts eeuwig `boost_active=true`, ook nadat de `boost_until` datum gepasseerd is.

**Wat doet het:**
- Query `posts` én `feed_posts` waar `boost_active=true` AND `boost_until <= now`
- Patch `boost_active=false`, `boost_expired_at=<iso>`
- Update gekoppelde `post_boosts/{boostId}` naar `status='expired'`

**Cron:** `0 * * * *` (elk uur) uurprecisie is voldoende

**Environment variables:** zelfde als PVDW.

---

## 4. `studio-cleanup-worker-v1.0.js` Paskamer Studio Stale Sessions 🆕 v1.0

**Nieuw:** live_sessions kunnen "stale" worden als de host tab crasht (mobiel Safari, iOS, netwerk-drop). Zonder cleanup blijven ze eeuwig als `status='live'` in de grid staan.

**Detectie-logica:**
- Absolute limiet: `startedAt` > **6 uur oud** → altijd sluiten
- Heartbeat: geen `updateTime` bump in **30 min** → sluiten
- Sluit door: `status='ended'`, `endedReason='auto_stale_<reden>'`

**Cron:** `*/15 * * * *` (elke 15 min)

**Environment variables:**
```
FIREBASE_PROJECT_ID       = doubleyou-journal
FIREBASE_SERVICE_KEY      = <base64 service account JSON>
WORKER_SECRET             = <random secret>
MAX_SESSION_MS            = 21600000    (optioneel 6u default)
STALE_MS                  = 1800000     (optioneel 30m default)
DELETE_SUBCOLLECTIONS     = false       (true = ook chat/reactions wissen)
```

---

## Deploy stappen (alle workers)

Cloudflare Dashboard → Workers & Pages → Workers → **Create Worker**

Voor elke worker:
1. Naam kiezen (zie hieronder)
2. Code plakken uit `.js` bestand
3. Settings → Variables → env vars instellen (zelfde service key voor alle 4)
4. Settings → Triggers → Cron Triggers → cron pattern invoeren
5. Save & Deploy

**Aanbevolen worker-namen:**
| Bestand | Cloudflare Worker naam |
|---|---|
| `pvdw-worker-v1.2.js` | `doubleyou-pvdw-worker` (bestaande) |
| `brand-autocomplete-worker-v1.0.js` | `doubleyou-brand-autocomplete-worker` |
| `post-boosts-expire-worker-v1.0.js` | `doubleyou-post-boosts-expire-worker` |
| `studio-cleanup-worker-v1.0.js` | `doubleyou-studio-cleanup-worker` |

---

## Firestore Rules

Rules v13 dekt alle collecties die deze workers schrijven:
- `weekly_rankings`, `dsp_log`, `brand_admin_log`, `meldingen`, `mail` (PVDW)
- `campaigns` (brand-autocomplete)
- `posts`, `feed_posts`, `post_boosts` (boost-expire)
- `live_sessions` + `chat`, `reactions` subcols (studio-cleanup)
- `worker_audit_log` (alle workers)

Alle workers gebruiken **service account** dat Firestore rules bypasst. `WORKER_SECRET` is alleen nodig voor handmatige `/run` triggers.

---

## Test

Elke worker heeft twee endpoints:
- `GET /health` → status + versie
- `POST /run` met `Authorization: Bearer <WORKER_SECRET>` → run direct + JSON response

```bash
curl -X POST https://doubleyou-boost-expire.<jouw>.workers.dev/run \
  -H "Authorization: Bearer <SECRET>"
```

---

## Overzicht cron dekking

| Functionaliteit | Cron | Worker | Status |
|---|---|---|---|
| Post van de Week + DSP + mail | 1×/week | pvdw v1.2 | ✅ |
| Brand campaigns auto-complete | 1×/uur | brand-autocomplete | ✅ |
| Post boosts expire | 1×/uur | post-boosts-expire v1.0 🆕 | ✅ |
| Studio stale sessions cleanup | 1×/15 min | studio-cleanup v1.0 🆕 | ✅ |
| Weekly brand reports mail | 1×/week | backend APScheduler | ✅ (backend) |
| Stories 24h expire | | Client-side filter | ⚠️ Optioneel |
