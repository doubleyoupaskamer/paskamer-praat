# PaskamerPraat.nl — PWA Stability Recovery (v60.1)

## Problem statement (origineel, Nederlands)
Onboarding, Routing, PWA & Stability Recovery Audit voor PaskamerPraat.nl. Geen redesign, geen nieuwe features, geen verwijdering van bestaande code. Pure optimalisatie, bugfixing en stabiliteitsverbetering.

## Tech stack
- **Static PWA** (HTML/CSS/JS) — geen build step
- **Firebase** (Firestore + Auth) — back-end
- **Service Worker** — caching + offline
- **Hosting:** Cloudflare Pages (gebaseerd op `_headers` + `_redirects` bestanden)

## Codebase context
- Uitgepakte basis: `/app/pwa/` (uit `paskamerpraat-pwa-v60-COMPLETE.zip`)
- Originele back-up: `/app/paskamerpraat-v60-original.zip`
- Fixed output: `/app/paskamerpraat-pwa-v60.1-FIXED.zip`

## Wat is geleverd (v60.1)
✅ **Bug 1 — Dubbele onboarding/route renders** opgelost
   - Service Worker registratie idempotent gemaakt (sw-auto-update-v1.js)
   - Duplicate `reg.update()` block in pwa-v463 verwijderd
   - `onAuthReady` skipt identieke auth state changes (token refresh)
   - `toonPagina` heeft re-render guard voor identieke pagina-keys

✅ **Bug 2 — iOS "Voeg toe" knop werkt niet** opgelost
   - Conflict tussen inline #dy-install-banner en #dy-a2hs-prompt opgelost
   - Event-handler binding direct i.p.v. DOMContentLoaded race
   - `touchend` listener naast click voor directe iOS-respons
   - `touch-action: manipulation` + `-webkit-tap-highlight-color` + z-index op alle install/nav-knoppen

✅ **Bug 3 — Samsung PWA install banner toont terwijl al geïnstalleerd** opgelost
   - Nieuwe `window.DY.isAppInstalled()` met comprehensive detection:
     - `display-mode`: standalone, minimal-ui, fullscreen, window-controls-overlay
     - `navigator.standalone` (iOS)
     - `document.referrer === 'android-app://...'` (TWA)
     - Persistent flag `localStorage.dy_pwa_geinstalleerd`
   - Live `matchMedia('change')` listener
   - Persistent flag voorkomt opnieuw tonen na false-negative detection

✅ **Service Worker cache invalidatie**
   - `sw.js` VERSION → `v60.1-20260214-stability-onboarding-ios-pwa`
   - Cache-bust query strings op modified JS/CSS

## Niet-functionele wijzigingen (uitsluitend stabiliteit)
- Geen UI redesign
- Geen verwijderde features
- Geen wijziging in user flows
- Firestore rules ongewijzigd (v10 rules dekken alle paden correct)

## Gewijzigde bestanden
- `index.html` (PWA install script + cache-bust versies)
- `app.css` (iOS touch-action fixes)
- `js/pwa-v463-1780765770.js` (SW dedup + auth/render guards)
- `js/a2hs-prompt-v1.js` (gedeelde isStandalone + conflict prevention)
- `js/sw-auto-update-v1.js` (idempotente registratie)
- `sw.js` (VERSION bump)
- `CHANGELOG-v60.1.md` (nieuw bestand met volledige documentatie)

## Test status
- ✅ Statische JS-syntax validatie geslaagd (alle 4 JS-bestanden + inline scripts)
- ✅ Lokale HTTP serve test geslaagd (alle bestanden 200 OK)
- ⚠️ End-to-end testen op echt Samsung Android-toestel uit te voeren door eindgebruiker (zoals afgesproken — gebruiker heeft alleen Samsung Android beschikbaar)

## Test instructies (Samsung Android)
Zie `CHANGELOG-v60.1.md` paragraaf "Test instructies voor Samsung Android".

## Next action items
- Eindgebruiker deployt v60.1 naar productie (Cloudflare Pages)
- Eindgebruiker test op Samsung Internet + Chrome Android (install flow + reeds-geïnstalleerd detectie)
- Indien Bug 2 (iOS) toch nog optreedt: opname/screenshots delen voor verdere diagnose

## Future / Backlog (niet in scope v60.1)
- iOS volledige cross-device test (iPhone SE / 13 / 14 / 15 / 16) — niet getest vanwege gebrek aan Apple-hardware
- Performance audit van dubbele Firestore listeners (vermeld in problem statement maar geen actieve bug)
- Mogelijke optimalisatie: SW VERSION constant koppelen aan deployment hash
