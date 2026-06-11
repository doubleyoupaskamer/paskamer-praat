# v60.1-skeletons-fix — Lege blokken op homepage opgelost

**Datum:** 2026-02-14 (na v60.1-brand-portal-v1)
**Type:** Bugfix — geen feature changes, geen redesign
**Scope:** Uitsluitend herstel van zichtbaarheidsbug; brand-portal-v1 onaangetast.

---

## 1. OORZAAK

In `js/skeletons-v1.js` (pre-existing module, sinds v46) bevatte de `findFeedRoot()` functie een **te brede fallback** naar `<main>`:

```js
function findFeedRoot() {
  return document.querySelector('[data-feed-root]') ||
         document.querySelector('.dy-reel-container') ||
         document.querySelector('#dy-feed') ||
         document.querySelector('main') ||    // ← BUG
         null;
}
```

Wanneer geen van de feed-specifieke selectors matchte (op homepage, profielpagina, brand-portal, voorwaarden, etc.) viel de functie terug op `<main>` = `#dy-main`. Daarna:

1. `feedHasContent(main)` checkt op `.dy-feed-card`, `.dy-reel-content`, `[data-post-id]` — niets daarvan bestaat op niet-feed pagina's.
2. Na 1500ms appendt `showSkeletons()` drie cream `.dy-skeleton-card` blokken (background `#fefcf5`, klassieke skeleton-loader stijl) in `#dy-main`, **na de hero**.
3. De `MutationObserver` zoekt naar feed-specifieke content om de skeletons te verwijderen — die komt nooit op de homepage → skeletons blijven **30 seconden** zichtbaar tot de safety-timeout.

### Waarom dit nu pas zichtbaar werd

Deze bug bestond al sinds v46 maar werd verstopt door:
- **Service Worker cache** met een verouderde versie van `skeletons-v1.js` die niet correct laadde, en/of
- **Browser HTTP cache** met `?v=60` query string die ongewijzigd bleef.

De v60.1-brand-portal-v1 SW-VERSION-bump (`v60.1-20260214-brand-portal-v1`) heeft de oude SW-caches verwijderd, waardoor de fresh-gefetchte `skeletons-v1.js` nu correct laadt en de pre-existing bug zichtbaar wordt.

### Impact-scope (pre-fix)
Cream skeleton blokken verschenen 30s lang op **alle niet-feed pagina's**:
- Homepage (`home`)
- Profielpagina
- Voorwaarden / Privacy
- Brand portal pagina's
- Winkel / Reviews / Bestellingen
- Berichten
- Alle admin-pagina's

Op de **feed-pagina** functioneerde de module wel correct (skeletons → echte feed cards).

---

## 2. GEWIJZIGDE BESTANDEN (minimaal, chirurgisch)

| Bestand | Wijziging |
|---|---|
| `js/skeletons-v1.js` | `<main>` fallback verwijderd uit `findFeedRoot()`. Nieuwe `isOpFeedPagina()` defensieve check via `DY.pagina` + URL-fallback. `maybeShowSkeletons` skipt als niet op feed. `MutationObserver` ruimt skeletons direct op bij navigatie weg van feed. Init-tijd `nukeOrphanSkeletons()` voor leftover-cleanup. |
| `index.html` | Cache-bust querystring `?v=60.1-skeletons-fix` op `skeletons-v1.js` |
| `sw.js` | VERSION bump → `v60.1-20260214-brand-portal-skeletons-fix` |

### Wat NIET aangepast
- `js/pwa-v463-1780765770.js` — onaangeraakt
- `js/brand-portal-v1.js` — onaangeraakt
- `brand-portal.css` — onaangeraakt
- `app.css` — onaangeraakt
- Alle overige modules — onaangeraakt
- Homepage HTML/layout — exact identiek

---

## 3. WAAROM DE ZICHTBAARHEIDSBUG ONTSTOND

1. **Te ruime fallback selector** in `findFeedRoot()`: `document.querySelector('main')` is een **catch-all** die op elke pagina een match oplevert, niet alleen op de feed.
2. **Geen context-check**: de skeleton-module veronderstelde stilzwijgend dat als er geen feed-content is, het rechtvaardig is om feed-skeletons te tonen — een aanname die alleen klopt **als de gebruiker op de feed-pagina is**.
3. **Cache-laag verstopte het probleem**: voorheen werd door een ongewijzigde `?v=60` query string en SW-cache de pre-existing buggy versie consistent geserveerd; gebruikers met cache van vóór v46-introductie zagen het niet. De v60.1 cache-invalidatie heeft het probleem zichtbaar gemaakt.

---

## 4. VALIDATIE RESULTATEN

### Statische checks
- ✅ JS-syntax `skeletons-v1.js` — OK
- ✅ JS-syntax `brand-portal-v1.js` (regressie) — OK
- ✅ JS-syntax `sw.js` — OK
- ✅ 9/9 inline scripts in `index.html` — OK

### Gedragsverificatie (per route)
| Route | Verwacht | Resultaat |
|---|---|---|
| `home` (guest) | Hero zichtbaar, géén skeleton blokken | ✅ Skeletons niet gemount (isOpFeedPagina === false) |
| `feed` (guest) | Skeletons na 1500ms tot stories geladen | ✅ Originele flow blijft werken |
| `profiel` | Alleen profielinhoud + Merkenportaal-knop | ✅ Geen skeletons meer |
| `merken` (brand-portal) | Brand portal pagina | ✅ Geen skeletons meer |
| `voorwaarden` | Static content | ✅ Geen skeletons meer |
| `winkel` | Winkel content | ✅ Geen skeletons meer |

### Cleanup van orphan-skeletons
- ✅ Bij init: `nukeOrphanSkeletons()` verwijdert alle bestaande `[data-pp-skeleton]` elementen die mogelijk uit oude sessie zijn blijven hangen.
- ✅ Bij navigatie weg van feed: MutationObserver-callback detecteert dit en ruimt skeletons direct op (niet pas na 30s safety timeout).

### Geen regressies
- ✅ Bestaande feed skeleton-flow (legitiem gebruik) onaangetast
- ✅ `DY.skeletons.show/remove/rescan` publieke API onveranderd
- ✅ `DY.retryToast` API onveranderd
- ✅ Brand portal volledig functioneel
- ✅ v60.1 stability fixes (SW dedup, auth/render guards, iOS touch, Samsung PWA detection) blijven actief

---

## 5. ROLLBACK PLAN

### Volledige rollback van deze fix
1. Restore `js/skeletons-v1.js` naar versie uit `paskamerpraat-pwa-v60.1-brand-portal.zip` (v60.1-brand-portal-v1)
2. Pas `index.html` aan: `?v=60.1-skeletons-fix` → `?v=60`
3. Pas `sw.js` aan: VERSION → `v60.1-20260214-brand-portal-v1`
4. Deploy → cream blokken zullen weer verschijnen (oorspronkelijke buggy gedrag)

### Soft-rollback (skeletons-module helemaal uitschakelen)
Voeg toe in browser console of in feature-flag init:
```js
window.__ppSkeletonsInit = true; // voorkom dat module IIFE iets doet
```

Of verwijder de `<script>` tag uit `index.html`:
```html
<script defer src="js/skeletons-v1.js?v=60.1-skeletons-fix"></script>
```

### Data-rollback
**Geen data-impact.** Pure UI-fix.

---

## 6. PRODUCTIE-DEPLOY

```bash
# 1. Download nieuwe ZIP
# 2. Vervang Cloudflare Pages content
# 3. Bestaande SW upgrade-flow:
#    - Open site → SW detecteert nieuwe VERSION
#    - Oude caches worden gedropt
#    - Reload via bestaande controllerchange-handler
#    - skeletons-v1.js wordt fresh gefetched
#    - Bug is opgelost zonder dat user iets hoeft te doen
```

---

## 7. FUTURE / RECOMMENDED (niet in scope)

Mogelijke vervolg-verbeteringen voor `skeletons-v1.js`:
- **Per-page skeleton variants** (productlijst skeleton voor `/winkel`, profielcard skeleton voor `/profiel`, etc.)
- **Bezuinigen op de safety timeout** van 30s naar 10s
- **Telemetry** om te tracken hoe vaak skeletons getoond worden (om feed-laadtijd te monitoren)

Deze zijn **bewust niet in deze fix** — pure herstel-actie.
