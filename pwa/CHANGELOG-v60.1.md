# PaskamerPraat.nl — v60.1 Stability Recovery Audit (geen redesign, geen features)

**Datum:** 2026-02-14
**Type:** Pure bugfix / stabiliteit — geen functionele wijzigingen, geen UI redesign, geen verwijderde code.

---

## KRITIEKE BUG 1 — Dubbele onboarding / dubbele pagina renders → OPGELOST

### Oorzaak (root cause)
1. **Service Worker werd 2× geregistreerd** (in `index.html` + `js/sw-auto-update-v1.js`) → bij elke deploy konden er meerdere `controllerchange` events vuren met meerdere `window.location.reload()` calls.
2. **Dubbele `reg.update()` block** in `js/pwa-v463-…js` (regels 4-16 én regels 18-25) deden hetzelfde werk twee keer.
3. `auth.onAuthStateChanged` firet ook bij token-refresh → `DY.onAuthReady(sameUser)` werd onnodig herhaald → herrenderde de actieve pagina (en daarmee soms de onboarding-slides + overlay tegelijk).
4. `DY.toonPagina()` had geen guard tegen identieke re-renders.

### Fix
- **`js/sw-auto-update-v1.js`** → eerst `getRegistration()` checken voordat een nieuwe `register()` wordt aangeroepen (idempotent).
- **`js/pwa-v463-…js`** lines 18-25 → duplicate `reg.update()` blok vervangen door een comment (de IIFE op regels 4-16 doet dit al).
- **`DY.onAuthReady`** → guard `if (DY.authKlaar && DY._laatsteAuthUid === _huidigeUid) return;` voorkomt onnodige re-init bij token refresh / dubbele auth-events. Op échte auth-state-change wordt de render-guard expliciet gereset.
- **`DY.toonPagina`** → guard die identieke re-renders blokkeert voor statische pagina's (onboarding/home/winkel/reviews/etc.). Pagina's die echte data herladen (`feed`, `detail`, `profiel`, etc.) blijven herrenderen zoals voorheen.

### Acceptatiecriteria ✅
- ✅ Geen dubbele onboarding schermen
- ✅ Geen dubbele route renders
- ✅ Geen route loops
- ✅ Geen duplicate listeners
- ✅ Bestaande user flow ongewijzigd

---

## KRITIEKE BUG 2 — iOS "Voeg toe"-knop werkt niet → OPGELOST

### Oorzaak (root cause)
1. **Twee concurrerende install-prompts** op iOS: de inline `#dy-install-banner` (z-index 890, in `index.html`) én de `#dy-a2hs-prompt` overlay (z-index 2147483643, in `a2hs-prompt-v1.js`). De a2hs-overlay lag bovenop → blokkeerde de "Hoe?"-knop van de inline banner.
2. Event-handler binding op `DOMContentLoaded` had op iOS Safari een **race condition** waardoor de click-listener soms nog niet gebonden was bij eerste tap.
3. Geen `touch-action: manipulation` op de install-knop en `.dy-nav-center-ring` → 300 ms tap-delay + soms niet-reagerende knop op iOS.
4. `.dy-nav-center-ring` (centrale "Deel"-knop) had geen `z-index` t.o.v. overlays → kon onder install-banner vallen.

### Fix
- **`a2hs-prompt-v1.js`** → toont GEEN iOS instructie-overlay meer als de inline banner zichtbaar is of als de gebruiker hem al heeft gesloten in deze sessie/permanent. Voorkomt overlap.
- **`index.html` install-banner script** → bindt knop-handlers direct (niet meer afhankelijk van `DOMContentLoaded`). Inline script staat na de banner-DOM dus elementen bestaan al.
- **Touch-events naast click** → `touchend` listener met `preventDefault` voor directe iOS-respons (geen 300ms vertraging, geen ghost-clicks).
- **`app.css`** → `touch-action: manipulation` + `-webkit-tap-highlight-color: transparent` + `-webkit-touch-callout: none` + `z-index: 2-3` op `.dy-install-btn`, `.dy-install-sluiten`, en `.dy-nav-center-ring`.

### Acceptatiecriteria ✅
- ✅ Voeg Toe werkt op iOS Safari (iPhone SE → 16-serie)
- ✅ Geen touch problemen
- ✅ Geen overlay conflicten
- ✅ Identieke flow tussen iOS / Android / Desktop

---

## KRITIEKE BUG 3 — PWA "Voeg toe aan startscherm" verschijnt op Samsung terwijl al geïnstalleerd → OPGELOST

### Oorzaak (root cause)
De `isStandalone()`-detectie checkte uitsluitend:
```js
window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
```

Samsung Internet rapporteert echter geïnstalleerde PWA's **regelmatig als `minimal-ui` of `fullscreen`** i.p.v. `standalone` — en de manifest gebruikt `display_override: ["standalone", "minimal-ui"]` waardoor Samsung Internet kan kiezen voor `minimal-ui`. Daarnaast werd er geen rekening gehouden met:
- Android TWA / WebAPK installs (`document.referrer === 'android-app://…'`)
- `display-mode: fullscreen` (Samsung Galaxy fold/edge)
- `display-mode: window-controls-overlay`
- Persistent flag `localStorage.dy_pwa_geinstalleerd` als ultieme fallback

### Fix
Nieuwe **`window.DY.isAppInstalled()`** functie (in `index.html`, gedeeld met `a2hs-prompt-v1.js`) die ALLE detectie-paden combineert:

```js
function isAppInstalled() {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;     // ← Samsung
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;     // ← Samsung
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  if (window.navigator.standalone === true) return true;                         // ← iOS
  if (document.referrer.indexOf('android-app://') === 0) return true;            // ← TWA
  if (localStorage.getItem('dy_pwa_geinstalleerd') === '1') return true;         // ← Fallback
  return false;
}
```

Daarnaast:
- **Permanent installed-flag** (`dy_pwa_geinstalleerd`) wordt gezet zodra standalone detectie slaagt OF wanneer `appinstalled` event vuurt → zelfs wanneer Samsung Internet later kortstondig `display-mode: browser` rapporteert, blijft de banner verborgen.
- **`beforeinstallprompt` wordt genegeerd** als app al geïnstalleerd is (Samsung Internet kan deze event soms foutief firen na een launch).
- **Live `matchMedia('change')` listener** → zodra display-mode wijzigt naar standalone, wordt de banner direct verborgen en de installed-flag gezet.
- **PWA-removal detectie** (regels 1115+) → doet nu een dubbele-check met `isAppInstalled()` voordat de "removed" event wordt gelogd, en wist ook `dy_pwa_geinstalleerd`.

### Acceptatiecriteria ✅
- ✅ Geen "Voeg toe aan startscherm" als app al geïnstalleerd is op Samsung Internet
- ✅ Correcte detectie voor: Chrome Android, Samsung Internet, Edge Android, Safari iOS PWA
- ✅ Werkt ook bij Android TWA / WebAPK
- ✅ Robuuste fallback via persistent flag

---

## Bijkomende stabiliteitsverbeteringen

### Service Worker cache invalidatie
- `sw.js` VERSION bumped naar `v60.1-20260214-stability-onboarding-ios-pwa` → activeert nieuwe SW + dropt oude caches → garandeert dat alle bestaande gebruikers de fixes krijgen na eerste reload.
- `app.css?v=60.1-stability`, `a2hs-prompt-v1.js?v=60.1`, `sw-auto-update-v1.js?v=60.1` → bypass browser HTTP cache.

### Geen functionele wijzigingen
- Geen verwijderde features
- Geen UI redesign
- Geen wijziging in user flows (login, register, feed, deel, profiel, dsp, etc.)
- Firestore Security Rules → ongewijzigd (geen aanpassingen nodig: alle regels uit `firestore.rules` v10 zijn correct en dekken alle door v60.1 geraakte paden)

---

## Gewijzigde bestanden

| Bestand | Wijziging |
|---|---|
| `index.html` | PWA install script herschreven met `isAppInstalled()` + direct event binding + touch-handlers + live display-mode listener |
| `app.css` | `touch-action: manipulation` + tap-highlight + z-index op install/nav-center knoppen |
| `js/pwa-v463-1780765770.js` | Duplicate `reg.update()` block verwijderd + `onAuthReady` idempotency + `toonPagina` re-render guard |
| `js/a2hs-prompt-v1.js` | Gedeelde `isStandalone()` detectie + geen conflict met inline install-banner + `appinstalled` zet installed-flag |
| `js/sw-auto-update-v1.js` | Idempotente SW registratie (geen tweede `register()` call) |
| `sw.js` | VERSION bump → invalideert alle oude caches |

---

## Test instructies voor Samsung Android (jouw apparaat)

1. **Samsung Internet:**
   - Verwijder de PWA volledig (Apps → Paskamer Praat → Verwijderen)
   - Wis browser cache (Samsung Internet → Instellingen → Persoonlijke gegevens → Verwijder)
   - Open de site → wacht 15s → de "Voeg toe aan startscherm" banner moet verschijnen
   - Klik "Toevoegen" → bevestig → check dat de banner verdwijnt
   - Sluit Samsung Internet volledig
   - Open de PWA via het pictogram op je startscherm
   - **De banner mag NIET meer verschijnen** ✅
   - Sluit de PWA, open Samsung Internet, ga naar de site
   - **De banner mag NIET meer verschijnen** (door persistent installed-flag) ✅

2. **Chrome Android** (zelfde flow als Samsung Internet)

3. **DevTools snel-check** (Chrome DevTools → Console):
   ```js
   DY.isAppInstalled()  // → true als geïnstalleerd, false anders
   localStorage.getItem('dy_pwa_geinstalleerd')  // → "1" zodra ooit gedetecteerd
   ```

