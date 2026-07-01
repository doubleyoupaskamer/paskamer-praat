# Paskamer Praat v58 Changelog
**Datum:** 13 februari 2026
**Type:** Rollback alleen responsive shims terug naar v56-niveau

## ⏪ Rollback

Op verzoek: de `responsive-shims-v1.css` uit v57 (item G touch-targets,
safe-area-insets, 100dvh, reduced-motion etc.) is **volledig verwijderd**.

**Wat is teruggedraaid:**
- ❌ `css/responsive-shims-v1.css` bestand verwijderd uit ZIP
- ❌ `<link rel="stylesheet" href="/css/responsive-shims-v1.css?v=57">`
  weggehaald uit `index.html`
- ❌ Lege `/css/` directory verwijderd
- Je responsive instellingen werken nu **exact zoals in v56**

## ✅ Wat blijft uit v57 (op verzoek behouden)

- ✅ **H. error-logger-v1.js** (productie logging)
- ✅ **D. button-watchdog-v1.js** (stuck-button recovery)
- ✅ **F. Performance hints** (preconnect/dns-prefetch in `<head>`)
- ✅ Backend `POST /api/client-error` + `GET /api/client-error/recent`
- ✅ CSP fix uit v56 (`_headers`)
- ✅ Stripe webhook met signature verification (v55)

## 📦 Build artifacts
- Cache-busters: 27× `?v=58` in `index.html`
- `sw.js` VERSION: `v58-20260213-rollback-responsive-shims`
- Core bundle `pwa-v463-1780765770.js` ongewijzigd

## 🧪 Verificatie post-deploy
1. Upload v58 ZIP naar hosting root
2. Hard refresh (Cmd+Shift+R)
3. DevTools Network geen 404 op `/css/responsive-shims-v1.css`
4. Visuele responsiveness van je layout = **identiek aan v56**
