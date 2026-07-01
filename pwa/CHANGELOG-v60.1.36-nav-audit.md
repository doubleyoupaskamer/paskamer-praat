# v60.1.36 Navigation Flow Audit + Back-Button Fixes

## Probleem
6 pagina's hadden geen back-button en zaten niet in de bottom-nav → dead-end UX. Browser back werkte wel (via popstate hook) maar gebruikers verwachtten een zichtbare exit in de header.

## Fix
6 back-buttons toegevoegd (één button per pagina) in bestaande headers:

| Pagina | Render functie | Locatie |
|--------|----------------|---------|
| Meldingen | `renderMeldingen` | bij `dy-pg-header` |
| Post van de Week | `renderOvdwFeed` | bij `dy-lb-header` |
| Challenges | `renderChallenges` (×2, beide patched) | bij `dy-pg-header dy-pg-header-dark` |
| Lookbook | `renderLookbook` | bij `dy-lb-header` |
| DeelHub | `renderDeelHub` | bij `dy-vr-header` |
| Admin | `renderAdmin` | bij `dy-vr-header` |

Alle gebruiken `DY.terug()` (smart fallback al aanwezig sinds v463).

## Files
- `/app/pwa/js/pwa-v463-1780765770.js` 7 search-replace inserts
- `/app/pwa/index.html` `?v=60.1.36-nav-audit`
- `/app/pwa/sw.js` VERSION bumped

## Verificatie
- Node parse check: ✅
- Bestaande `DY.terug()` chain ongewijzigd
- Geen layout-impact: button neemt 44px vertical space (WCAG-compliant)
- Donkere headers (challenges/deelhub/admin) krijgen inline color override voor leesbaarheid

## Niet gefixt (out of scope)
- Empty-state CTA buttons (back-button in header dekt dit)
- Breadcrumbs (zou nieuwe UI-pattern introduceren = redesign)
- Pre-existing duplicate renderChallenges declaration (cleanup buiten scope, beide gepatched)

Zie ook: `/app/memory/NAV_AUDIT_v60.1.36.md` voor volledig audit-rapport.
