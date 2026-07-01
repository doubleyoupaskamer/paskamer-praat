# Paskamer Praat v47 AI Megabundle (2026-02-13)

> **DRIE high-ROI AI features in één bundel.** Volledig non-invasief `pwa-v463-1780765770.js` is niet aangeraakt.

---

## 🎯 Wat is nieuw

### 1. Virtual Try-On (`js/virtual-tryon-v1.js`)
- **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`) genereert fotorealistische pasbeelden
- Upload jouw foto + outfit-foto → AI plakt de outfit op je toe met natuurlijke pasvorm
- Auto-resize naar 1280px (snelle uploads, lagere kosten)
- Watermerk `paskamerpraat.nl` op gedownloade/gedeelde resultaten (virale groei)
- Web Share API → desktop fallback naar PNG-download
- Pre-fill modus: `window.DY.tryOn.openWithOutfit(imageUrl)` voor "Probeer aan"-knop op feed-cards
- Firebase events: `tryon_success`, `tryon_shared`, `tryon_downloaded`, `tryon_error`

### 2. AI Outfit Score (`js/outfit-score-v1.js`)
- **Gemini Vision** scoort iedere feed-foto op 0-100 + label + 3 tips + kleurpalet
- **Auto-mode standaard AAN** sinds v47 elke feed-card krijgt direct een score-pill
- Opt-out: `window.DY.outfitScoreAuto = false` (manuele "Vraag Style Score"-knop)
- LocalStorage cache 14 dagen per `post-id` → nul herhaalkosten
- MutationObserver pakt nieuwe feed-items automatisch op (200ms debounce)
- Detail-expansie met tips + kleur-swatches bij klik
- Firebase events: `outfit_score_generated`, `outfit_score_expanded`, `outfit_score_error`

### 3. Weekly Personal Stylist (`js/weekly-stylist-v1.js`)
- Detecteert nieuwe ISO-week → toont non-blocking banner met 3 weekly picks
- Klik → fullscreen modal met intro + 3 outfit-aanbevelingen + reden + items
- "Shop deze look →"-knop linkt direct naar Zalando-zoek **+ affiliate-tagger v46 voegt automatisch je affiliate-tag toe**
- 1× per week per browserprofiel (cache `dy_weekly_YYYY-Www`)
- Handmatige trigger: `window.DY.weeklyStylist.open()` (bv. vanuit hub-menu)
- Firebase events: `weekly_banner_shown`, `weekly_picks_loaded`, `weekly_picks_error`

---

## 🔌 Backend (`/app/backend/ai_router.py`)

| Endpoint                    | Model                          | Doel                         |
| --------------------------- | ------------------------------ | ---------------------------- |
| `POST /api/tryon`           | `gemini-3.1-flash-image-preview` | Virtual try-on (vision+gen) |
| `POST /api/outfit-score`    | `gemini-3-pro-image-preview`     | Score + tips + palette      |
| `POST /api/weekly-stylist`  | `gemini-3-pro-image-preview`     | 3 picks JSON                |

- Gebruikt **`EMERGENT_LLM_KEY`** via `emergentintegrations` (geen extra secrets nodig op Emergent Deploy)
- Volledig open CORS (`*`) werkt vanaf elk PWA-domein
- Strikte input-validatie (max ~9 MB base64), 400/413/502 fouten met duidelijke detail

---

## ⚙️ Configuratie productie

In `index.html` rond regel 826 staat:

```html
<script>
  window.DY = window.DY || {};
  // window.DY.apiBase = 'https://api.paskamerpraat.nl';   // ← UNCOMMENT na backend deploy
  // window.DY.outfitScoreAuto = false;                     // ← uncomment om auto-score uit te zetten
</script>
```

**`apiBase()` auto-detectie** (in alle 3 v47 scripts):
1. Als `window.DY.apiBase` gezet → gebruik die
2. Anders op `*.emergentagent.com` → same-origin (`""`)
3. Anders op `paskamerpraat.nl` → `https://api.paskamerpraat.nl`
4. Anders → `""` (localhost / dev)

---

## 🚀 Backend deployen

Zie `DEPLOY-BACKEND.md` voor stappen per platform:
- **Emergent Deploy** (1-klik, `EMERGENT_LLM_KEY` automatisch)
- **Render** (`render.yaml` meegeleverd)
- **Railway** (`railway.json` meegeleverd)
- **Fly.io** (`fly.toml` meegeleverd)
- **Docker / VPS** (`Dockerfile` meegeleverd)

Na deploy: zet `window.DY.apiBase` in `index.html` en upload de PWA naar je hosting.

---

## 🛡️ Stabiliteit & SW

- `sw.js` VERSION → `v47-20260213-ai-megabundle-tryon-score-weekly` (forceert cache-purge op installatie)
- Alle script-tags bumped naar `?v=47` (forceert verse fetch op iOS PWA)
- Geen wijzigingen aan core `pwa-v463-1780765770.js`
- Alle 3 v47 scripts zijn **idempotent** (`__ppXxxInit` guard) dubbel laden is veilig

---

## 📦 Bestanden in deze release

```
+ js/virtual-tryon-v1.js     (15 KB)
+ js/outfit-score-v1.js      (10 KB)
+ js/weekly-stylist-v1.js    (11 KB)
M index.html                  (config-block + 3 script tags + ?v=47 bump)
M sw.js                       (VERSION bump)
+ CHANGELOG-v47.md            (deze file)
+ DEPLOY-BACKEND.md           (deploy-instructies)
+ backend/                    (FastAPI bundel voor zelf-hosten)
  ├── ai_router.py
  ├── server.py
  ├── requirements.txt
  ├── Dockerfile
  ├── render.yaml
  ├── railway.json
  └── fly.toml
```

---

## 🧪 Smoke-test

Backend draait op preview: ✅ `/api/weekly-stylist` retourneerde 3 picks in 8s.

Lokaal testen na deploy:
```bash
curl -X POST https://api.paskamerpraat.nl/api/weekly-stylist \
  -H "Content-Type: application/json" \
  -d '{"user_context":"170cm, smaak: linnen, minimalisch"}'
```
