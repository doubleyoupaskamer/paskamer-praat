# Cloudflare Workers — Paskamer Praat

Twee productieklare workers voor DoubleYou / Paskamer Praat:

## 1. `pvdw-worker-v1.1.js` — Post van de Week (UPDATE v1.0 → v1.1)

**Vervang** je bestaande `doubleyou-pvdw-worker` met deze code.

**Wijzigingen t.o.v. v1.0:**
- ✅ Filter verborgen/gemodereerde posts uit selectie
- ✅ DSP-bonus wordt nu atomic opgeteld bij `users/{uid}.dsp_lifetime` + `dsp_seizoen` (winnaar verschijnt direct op leaderboard)
- ✅ Extra audit-velden (`verborgenPosts`, `gemodereerdPosts`, `workerVersion`)

**Cron:** `0 23 * * 0` (ongewijzigd — zondag 23:00 UTC = maandag 00:00 AMS)

**Environment variables** (ongewijzigd):
```
FIREBASE_PROJECT_ID   = doubleyou-journal
FIREBASE_SERVICE_KEY  = <base64 service account JSON>
WORKER_SECRET         = <random secret>
```

---

## 2. `brand-autocomplete-worker-v1.0.js` — Brand Portal Auto-Complete (NIEUW)

**Maak nieuwe Worker** aan: `doubleyou-brand-autocomplete-worker`

**Functie:** zet automatisch elke campagne op `status='completed'` zodra `eindDatum` gepasseerd is.

**Cron:** `0 * * * *` (elk uur)

**Environment variables** (hergebruik dezelfde service account als pvdw):
```
FIREBASE_PROJECT_ID   = doubleyou-journal
FIREBASE_SERVICE_KEY  = <base64 service account JSON>
WORKER_SECRET         = <random secret>
```

**Test:**
- `GET /health` → status + versie
- `POST /run` met `Authorization: Bearer <WORKER_SECRET>` → run direct + JSON response

---

## Deploy stappen (beide workers)

1. Open Cloudflare Dashboard → Workers & Pages → Workers
2. **Worker 1 (update):**
   - Open `doubleyou-pvdw-worker`
   - Vervang volledige code met `pvdw-worker-v1.1.js`
   - Save & deploy
3. **Worker 2 (nieuw):**
   - "Create Worker" → naam: `doubleyou-brand-autocomplete-worker`
   - Plak `brand-autocomplete-worker-v1.0.js`
   - Settings → Variables → environment variables instellen
   - Settings → Triggers → Cron Triggers → `0 * * * *`
   - Save & deploy

## Firestore rules

Geen wijziging nodig — beide workers gebruiken service account die rules bypasst.
