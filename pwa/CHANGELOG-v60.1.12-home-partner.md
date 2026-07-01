# v60.1.12 BrandPartnerCTA op Homepage + Lege-Ruimte Fix

## 🔴 Root cause lege ruimte op homepage
`.dy-hm-wrap` had `min-height: 100dvh` (en op desktop ook in een tweede media query) terwijl `.dy-hm-hero` zelf `height: calc(100dvh - topbar - nav)` is. Resultaat: de wrap reserveerde ALTIJD 100dvh, maar de hero vulde alleen viewport-min-topbar-nav → er bleef ~120px lege donkere ruimte onder waar je heen kon scrollen.

**Fix**: `min-height: 100dvh` regel verwijderd uit `.dy-hm-wrap`. De wrap volgt nu de natuurlijke flow van de content (hero + nieuwe partner-sectie).

## ✅ Nieuwe BrandPartnerCTA blok
Direct onder de hero (= "community" sectie):
- **Eyebrow**: "Voor merken"
- **Titel**: "Word partner van *Paskamerpraat*" (zelfde Cormorant Garamond + clay accent)
- **Subtitel**: "Laat jouw merk ontdekken door een betrokken modecommunity..."
- **Primaire CTA**: "Bekijk samenwerkingen" → opent overlay
- **Secundaire CTA**: "Aanmelden als merk" → `DY.brandPortal.openPortaal()` (bestaande routing)

CSS hergebruikt bestaande huisstijl tokens:
- Clay accent kleur (`var(--clay)`)
- DM Sans + Cormorant Garamond
- Pill-shaped knoppen (`border-radius: 100px`)
- Dezelfde donkere achtergrond (`#0a0806`)

## ✅ Samenwerkingen overlay
Hergebruikt het bestaande `dy-bpos-*` overlay-patroon (Body Positivity Reglement). Zelfde layouttaal, zelfde drag-bar, zelfde animatie.

6 secties:
1. **Introductie** community context
2. **Voor wie** tall, plus, schoenen, lingerie, accessoires, ontwerpers
3. **Hoe werkt het** 5-stappen flow (aanmelden → goedkeuring → producten → campagne → analytics)
4. **Campagne-mogelijkheden** grid met 4 plaatsingen (Merken-tab, Story-ring, Outfit Review, AI Stylist)
5. **Voorwaarden** KvK, BTW, body-positive copy, realistische foto's, manuele facturatie
6. **CTA** "Naar merkenportaal" → `DY.brandPortal.openPortaal()`

**Sluit-mechanismen**:
- × knop rechtsboven
- Klik op backdrop
- Escape-toets
- Scroll-lock op `body` tijdens overlay (geen achtergrondverschuiving op mobiel)

## Backlinks geaudit & route-cause clean
| Flow | Status |
|---|---|
| Homepage → "Bekijk samenwerkingen" → overlay | ✅ |
| Overlay → "Naar merkenportaal" | ✅ via `openPortaal()` |
| Overlay → "algemene voorwaarden" link | ✅ via `DY.navigeer('voorwaarden')` |
| Voorwaarden → terug | ✅ via `DY.terug()` |
| Merkenportaal → registratie → terug | ✅ `bp-back` knoppen |
| Browser back / refresh / deep links | ✅ bestaande router intact |

Geen route-cause errors. Geen 404. Geen login-loop.

## Geen wijziging in
- Bestaande routing-architectuur
- Bestaande componenten
- Bestaande navigatie
- Auth (v60.1.11 fix actief)
- Brand-portal logic
- Firestore rules

## Gewijzigde bestanden
- `js/pwa-v463-1780765770.js` `DY.renderHome` uitgebreid + `DY.toonSamenwerkingenOverlay` + `DY.sluitSamenwerkingenOverlay` toegevoegd (~140 regels)
- `app.css` `dy-hm-partner-*` + `dy-sw-*` styles toegevoegd, `dy-hm-wrap` `min-height:100dvh` verwijderd (~150 regels)
- `index.html` `?v=60.1.12-home-partner` cache bumps
- `sw.js` `VERSION` bump

## Rollback
Vervang alleen `DY.renderHome` met v60.1.11-versie en verwijder de twee nieuwe functies (`toonSamenwerkingenOverlay`, `sluitSamenwerkingenOverlay`). CSS-rollback: zet `min-height: 100dvh` terug op `.dy-hm-wrap`.

## Acceptatie
✅ BrandPartnerCTA zichtbaar onder hero
✅ Overlay opent + sluit (× / backdrop / Escape)
✅ Voorwaardenlink bereikbaar
✅ Merkenportaal bereikbaar via primaire + secundaire CTA + overlay-CTA
✅ Lege ruimte onder homepage verdwenen
✅ Zelfde huisstijl behouden
✅ Mobiel + desktop responsive (`@media min-width: 768px` voor desktop padding)
✅ Geen JS errors (`node --check` OK)
✅ Geen CSS imbalans (4462/4462 braces)
