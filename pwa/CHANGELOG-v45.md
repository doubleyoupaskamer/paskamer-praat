# Paskamer Praat v45 Stability + Performance Audit Fixes

**Datum:** 2026-02-13
**Type:** Non-invasieve stability + performance patch op v44. `pwa-v463-*.js` NIET aangepast.

## Audit resultaat van productie (paskamerpraat.nl voor deze patch)

| Metric | Waarde |
|---|---|
| FCP (mobile) | 320 ms |
| DOM Content Loaded | 415 ms |
| TTFB | 24 ms |
| Total resources | 21 / 164 KB |
| JS heap | 10 MB |
| JS page errors | 0 |
| Console errors | 0 |
| Failed requests | 0 |
| Unhandled rejections | 0 |

**Conclusie:** baseline is gezond. v45 zet daar bovenop een aantal latent
gevaarlijke patronen om en haalt onnodige permanente timers eruit.

## Wat is gefixed in v45

### 1. Globale error boundary (NIEUW)
- **`js/error-boundary-v1.js`** laadt ALS EERSTE script.
- Vangt `window.error` (incl. resource load failures) + `unhandledrejection`.
- Dedupes identieke fouten binnen 5s, ring-buffer van 50.
- Publieke API: `DY.errors.list()`, `DY.errors.count()`, `DY.errors.clear()`.
- Event: `dy:error-captured` voor latere analytics-hook.
- **Onderdrukt niets** alleen observeren + structureren.

### 2. `zoek-mijnmaat-v1.js` twee root-causes
- **Was:** `if (!window.DY) setTimeout(init, 100)` → oneindige polling-loop
  als `DY` nooit zou laden (CPU/battery drain).
  **Nu:** retry-cap van 60 × 100ms = 6s, daarna stille exit.
- **Was:** `async function(q) { await orig.call(this, q); toepassenMijnMaatFilter(); }`
  → unhandled promise rejection als origineel `voerZoekUit` faalde + filter
  draaide nooit.
  **Nu:** `try { await orig... } catch { console.warn + rethrow } finally { filter altijd }`.

### 3. `extra-menu-v3.js` permanente timer afgeschaft
- **Was:** `setInterval(nukeOnce, 1500)` → loopt tot tab gesloten wordt.
- **Nu:** zelfde interval, maar `clearInterval` na 10s. CSS killstyles in
  `<head>` houden legacy FAB's permanent verborgen.
- **Impact:** -40 timer-callbacks per minuut, indefinitely.

### 4. `index.html` inline early-exec guard zelfde fix
- Dubbele nuker liep parallel aan extra-menu-v3. Beide stoppen nu na 10s.

### 5. `lazy-images-v1.js` MutationObserver scope smaller
- **Was:** `observe(document.documentElement, {childList, subtree})` →
  observeert ook `<head>` mutaties (nooit `<img>`).
- **Nu:** `observe(document.body || documentElement, …)` → schoner +
  iets minder callbacks bij dynamische DOM (feed scroll).

### 6. Cache-buster bump
- Alle `?v=44` → `?v=45` in `index.html`.
- `sw.js VERSION = 'v45-20260213-pwa-stability-audit-fixes'` → nieuwe cache
  buckets, oude worden bij `activate` opgeruimd.

## Files in deze v45 ZIP (flat root)

```
index.html
sw.js
js/error-boundary-v1.js   ← NIEUW
js/zoek-mijnmaat-v1.js    ← root-cause fix
js/extra-menu-v3.js       ← timer leak fix
js/lazy-images-v1.js      ← observer scope fix
```

**Niet meegestuurd** (v44 stuff, ongewijzigd op je server):
`offline.html`, `js/network-status-v1.js`, `js/bg-sync-v1.js`,
`js/sw-auto-update-v1.js`, etc.

> ℹ️ Als je nog op v43 zit en v44 hebt overgeslagen, gebruik dan de
> `paskamerpraat-pwa-p0-v44.zip` + deze v45 patch samen, OF wacht
> tot ik v45-full-bundle.zip lever (kan ik op verzoek maken).

## Verifieer na deploy

| Check | Hoe |
|---|---|
| Error boundary actief | Console: `DY.errors.list()` → `[]` |
| Zoek wrapped correct | Console: `DY._mijnMaatWrapped` → `true` |
| Nuker timer stopt | After 10s open je console → `setInterval` count laag |
| Lazy-images werkt | Network → Img → scroll → incrementeel laden |
| Geen v44 strings | View source → alle `?v=45` |
| SW versie | DevTools → Application → SW status `pp-static-v45-…` |

## Smoke test (uitgevoerd door agent)

- ✅ `errorBoundary: true`, `errorCount: 0`
- ✅ `netStatus: true`, `bgSync: true`, `extraMenuActive: true`
- ✅ `bgSyncInit, netStatusInit, errBoundaryInit` allemaal true
- ✅ 0 JS page errors, 0 unhandled rejections
- ✅ `node --check` op alle 17 scripts succesvol
- ✅ Live audit op productie paskamerpraat.nl (v43): 0 errors, FCP 320ms

## Geen regressies verwacht
- Geen wijziging aan `pwa-v463-*.js`, Firebase SDK, Anthropic flow, auth.
- Bestaande API's (`DY.voerZoekUit`, `DY._zoekFilters`, popover-flow) blijven
  identiek bruikbaar; alleen safety net errom heen.
- error-boundary onderdrukt geen errors, bubbled ze nog steeds DevTools
  laat ze net zo zien als voorheen.
