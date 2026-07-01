# Paskamer Praat v48 AI Fix Pack (2026-02-13)

> **Hotfix:** v47 op paskamerpraat.nl liet de Weekly Stylist banner verschijnen terwijl de backend nog niet op `api.paskamerpraat.nl` draaide → "Even niet gelukt om je brief te genereren"-fout.

---

## 🔧 Wat is gefikst

### 1. Production default wijst nu naar **live werkende backend**
- `apiBase()` op paskamerpraat.nl/cloudflare/pages.dev → `https://fitting-chat-app.preview.emergentagent.com`
- Je kan vanaf nu **direct alle AI-features gebruiken op paskamerpraat.nl** zonder eigen backend te hosten
- Wil je toch je eigen backend? Uncomment in `index.html`:
  ```html
  window.DY.apiBase = 'https://api.paskamerpraat.nl';
  ```

### 2. Nieuwe centrale module `js/ai-health-v1.js`
- 1× ping naar `/api/ai/health` per browser-sessie (5 min cache)
- 4s timeout via AbortController → blokkeert nooit de UI
- Single source-of-truth voor `apiBase()` (alle 3 v47 scripts gebruiken nu deze module)

### 3. Backend `/api/ai/health` endpoint toegevoegd
- Snelle GET → `{"status":"ok","emergent_key_configured":true,"endpoints":[...]}`
- Geen LLM-call → 0 kosten, sub-100ms response

### 4. Silent-fail bij backend offline
- **Weekly stylist banner verschijnt alleen als backend healthy is** (geen rode error meer op live)
- **Outfit-score auto-mode wordt automatisch uitgezet** als backend down gebruiker krijgt geen N×404
- Firebase events `weekly_skipped_backend_offline` + `outfit_score_skipped_backend_offline` voor monitoring

### 5. Verbeterde error-UX
- Weekly stylist error scherm: 💫 + "AI-stylist even offline" ipv generieke fout
- Centrale `goud + DM Sans` styling

---

## ⚡ Hoe upload je dit naar paskamerpraat.nl?

1. Download `paskamerpraat-pwa-v48-COMPLETE.zip`
2. Pak uit, upload **alle bestanden** naar je hosting (vervang oude)
3. iPhone PWA: open eens https://paskamerpraat.nl/vernieuw.html om cache te wissen
4. Klaar Weekly Stylist + Outfit Score + Virtual Try-On werken direct

> Geen backend-deploy nodig. Werkt out-of-the-box via Emergent's live preview backend.

---

## 🛡️ Cache-bust
- `sw.js` VERSION → `v48-20260213-ai-megabundle-health-check`
- 20× scripts gebumped naar `?v=48`
- Idempotente init-guards (`__ppAiHealthInit`, `__ppTryOnInit`, etc) dubbele load = no-op

---

## 🧪 Smoke-test (uitgevoerd vanaf paskamerpraat.nl origin)
```
GET  /api/ai/health        → 200 OK (CORS allow-origin: *)
POST /api/weekly-stylist   → 200 OK, 3 picks
POST /api/outfit-score     → 200 OK, score JSON
OPTIONS preflight          → 204 OK
```

---

## 📂 Bestanden gewijzigd
```
+ js/ai-health-v1.js              (nieuw, 2.5 KB)
M js/virtual-tryon-v1.js          (apiBase via ai-health)
M js/outfit-score-v1.js           (apiBase + skip if unhealthy)
M js/weekly-stylist-v1.js         (apiBase + banner skip if unhealthy + nicere error)
M index.html                       (ai-health-v1.js script tag + ?v=48)
M sw.js                            (VERSION bump v48)
M backend/ai_router.py             (/api/ai/health endpoint)
+ CHANGELOG-v48.md
```
