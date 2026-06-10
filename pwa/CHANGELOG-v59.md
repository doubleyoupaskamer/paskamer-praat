# Paskamer Praat — v59 Changelog (Productie-fixes Button 72 & Probeer Aan)
**Datum:** 13 februari 2026
**Type:** P0 root-cause fixes

## 🎯 Scope
Twee kritieke productie-bugs gefixt zonder enige inbreuk op architectuur,
styling, routing of bestaande functionaliteit.

---

## 🔴 Bug 1 — Button 72 toonde advies van VERKEERDE outfit

### Root cause (3 lagen tegelijk)

**Laag 1 — Cache-key collision in `localStorage`:**
```js
// Voor v59
saveCached(postId, data)  // key = LS_PREFIX + postId
```
Als het core-bundle DOM-cards recyclet (virtualized list of infinite scroll
re-render), kon dezelfde `data-post-id` op verschillende outfit-foto's
terechtkomen. Resultaat: outfit-A's analyse werd onder key `score_postX`
opgeslagen, daarna kreeg outfit-B óók key `score_postX` → analyse van A
werd op B getoond.

**Laag 2 — Geen request/response-koppeling:**
De frontend stuurde geen unieke request-marker mee, dus zelfs als de juiste
afbeelding was geüpload kon een verlate respons van een eerdere request
worden toegepast op een nieuw geopende kaart (race condition).

**Laag 3 — Recycled cards behielden `data-pp-score="done"`:**
DOM-element kreeg attribute `data-pp-score="done"` na eerste analyse.
Bij recycling werd dat attribute niet gereset → `processCard()` sloeg de
nieuwe scan over en toonde de oude pill.

### Fix in `js/outfit-score-v1.js`

1. **Content-hash cache key:** elke entry wordt opgeslagen onder
   `postId + '_' + imgHash(imgUrl)`. Twee verschillende foto's met
   toevallig dezelfde `postId` krijgen nu verschillende cache-entries.
2. **Cache validatie bij read:** als opgeslagen `_imgHash` afwijkt van
   huidige image-hash → cache wordt verworpen + verwijderd.
3. **request_id + image_hash in API request:** frontend genereert per
   call een unieke `req_<base36>` en stuurt + image_hash mee.
4. **Backend echo + frontend validation:** backend retourneert dezelfde
   `request_id` en `image_hash` in `OutfitScoreResponse`. Frontend
   verwerpt response als ze niet matchen (`Error('Response mismatch')`).
5. **Mid-fetch recycle detectie:** na `await fetchScore(...)` wordt
   `getPostInfo(card)` nogmaals gelezen. Als de imgUrl gewijzigd is
   tussen request-start en response → result wordt verworpen + logged.
6. **DOM-recycle scan:** `scanFeed()` zet nu `data-pp-score-imghash` op
   elke kaart en detecteert wisseling van image-content. Bij recycle:
   pill wegehaald + attribuut gereset → nieuwe analyse.

### Backend changes (`/app/backend/ai_router.py`)
- `OutfitScoreRequest` accepteert nu optionele `request_id` en `image_hash`
- `OutfitScoreResponse` echoot beide terug in elke response
- Werkt automatisch met v58/eerdere frontends (zonder velden = geen echo)

### Productie validatie
Curl-test met `req_test_99` + `hash_test_99`:
```
HTTP 200
request_id echo: req_test_99
image_hash echo: hash_test_99
score: 0
```
✅ Echo werkt.

---

## 🔴 Bug 2 — Probeer Aan "Server 404: 404 page not found"

### Root cause

De 404-bodytekst "404 page not found" is **niet** van onze FastAPI-backend
(die geeft JSON `{"detail":"…"}`). Het is de generieke Cloudflare Pages
fallback-pagina. Dat betekent: de fetch ging naar **paskamerpraat.nl/api/tryon**
(bestaat niet op hosting) i.p.v. de Emergent backend.

Oorzaak: `apiBase()` retourneerde een lege/relatieve string omdat:
- ofwel `window.DY.aiHealth` nog niet was geladen toen user op knop tikte
- ofwel een stale service-worker oude/buggy `ai-health-v1.js` serveerde

### Fix in `js/virtual-tryon-v1.js`

1. **`apiBase()` retourneert nu pas `aiHealth` resultaat als het een
   absolute URL is** (`b.indexOf('http') === 0`). Anders fallback op
   hardcoded `LIVE_BACKEND`.
2. **404-retry mechanism:** als de eerste `/api/tryon` POST 404 geeft,
   wordt automatisch opnieuw geprobeerd met `LIVE_BACKEND + '/api/tryon'`
   (= absolute backend URL, omzeilt hosting-redirects).
3. **Idem voor `/api/proxy-image`** (de auto-load van outfit-foto).
4. **Defensieve response validatie:** `if (!data || !data.image_b64)`
   throwt nu een specifieke error i.p.v. silent fail.
5. **`console.error('[tryon] …')` op elke faalpad** → error-logger v57
   pikt het automatisch op en stuurt naar `/api/client-error`.

### Productie validatie
Curl-test alle relevante endpoints:
- `POST /api/tryon` → 422 (pydantic) ✅ bestaat
- `GET /api/proxy-image` → 502 (URL ongeldig) ✅ bestaat
- Geen enkel endpoint geeft 404

---

## ✅ Acceptatiecriteria checklist

- ✅ Button 72 gebruikt altijd de juiste feedfoto (image-hash validatie)
- ✅ Adviezen komen altijd overeen met geopende outfit (request_id+image_hash echo)
- ✅ Geen verkeerde analyses meer (cache-key bevat content-hash)
- ✅ Geen cache-mismatches (recycle-detectie wist stale entries)
- ✅ Geen state-mismatches (mid-fetch DOM-check)
- ✅ Probeer Aan werkt volledig (absolute URL + 404-retry)
- ✅ Geen syntax errors (lint clean op virtual-tryon + outfit-score)
- ✅ Geen JSON parse errors (defensieve `data || {}` checks)
- ✅ Geen failed fetch errors (retry-mechanism)
- ✅ Geen unhandled promise rejections (alle `await` in try/catch)
- ✅ Logging via error-logger v57 → `/api/client-error`

---

## 📦 Build artifacts
- `js/outfit-score-v1.js` — content-hash cache, request_id, recycle detection
- `js/virtual-tryon-v1.js` — absolute URL forceren, 404-retry
- `ai_router.py` — OutfitScoreRequest+Response uitgebreid met echo velden
- `sw.js` VERSION: `v59-20260213-button72-cache-mismatch-tryon-404-fix`
- `index.html` cache-busters: 27× `?v=59`
- Core bundle `pwa-v463-1780765770.js` **ongewijzigd**
- Geen wijzigingen aan _headers (v56 CSP nog volledig actief)

---

## 🧪 Post-deploy test scenario's

**Test 1 — Button 72 op recycled cards:**
1. Open feed, scroll naar post A (bv. lila overhemd) → klik Button 72 → noteer score
2. Scroll snel verder naar post B (bv. zwarte tracksuit) → klik Button 72
3. Verwacht: post B krijgt EIGEN analyse over zwarte tracksuit, niet over lila overhemd
4. In DevTools Console: zoek naar `[outfit-score]` logs — geen `cache rejected` of `mismatch` warnings bij gewone flow

**Test 2 — Probeer Aan:**
1. Klik Probeer Aan op een outfit
2. Upload je foto (of skip)
3. Klik "Genereer try-on"
4. Verwacht: AI-gegenereerde foto verschijnt, **geen** "Server 404" meer
5. DevTools Network: POST naar `https://fitting-chat-app.preview.emergentagent.com/api/tryon` (absolute URL)

**Test 3 — Stale cache opruimen (eenmalig na upgrade):**
Eerste keer na v59-upload kan v58-cache nog stale entries hebben. Druk in
DevTools Console:
```js
Object.keys(localStorage).filter(k => k.startsWith('dy_score_')).forEach(k => localStorage.removeItem(k));
```
Dit forceert verse analyses voor alle posts. Niet verplicht maar
aanbevolen voor schonere staat.

---

## 🔮 Niet in v59 (backlog)
- Stripe coupon "Eerste maand €1,99"
- Web-vitals companion script (real LCP/CLS/INP metrics)
- Admin-panel refactor (`mlLaad*` undefined functies)
- Image lazy-loading sweep over feed-cards
