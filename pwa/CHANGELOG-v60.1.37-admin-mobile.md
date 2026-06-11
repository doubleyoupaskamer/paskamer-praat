# v60.1.37 — Admin Mobile Optimization + Usernames

## Problemen
1. **UID-codes i.p.v. namen**: admin toonde `doc.id.slice(0,8)` als displayName ontbrak → leek op codes
2. **Niet responsive op mobiel**: rijen gebruikten vaste pixels (`10px 1fr 80px 60px 50px`) → tekst werd afgesneden bij <400px
3. **Gebruikers-tabel**: 6 kolommen, geen scroll-wrapper → tabel brak op smal scherm

## Fixes

### JS (`pwa-v463-*.js`)
- **Online users**: fallback chain `displayName → "Gast" (anoniem) → users-cache lookup → "Onbekend"`. Async fetch + DOM patch via `data-admin-naam-uid` attribuut.
- **PWA events**: zelfde cache, label "Laden…" tijdens lookup → echte naam.
- **Gebruikers-tabel**: fallback `displayName → email-prefix → naam → "Onbekend"`. Wrapped in `.dy-admin-tabel-wrap` (scroll container).
- Shared cache `DY._adminUserCache` voorkomt N+1 fetches.

### CSS (`app.css`)
- `.dy-admin-online-rij`: grid switched van vaste px naar `10px 1fr auto auto auto` (desktop). Op `<600px`: 2-rij grid-areas met naam+tijd boven, route+device onder.
- `.dy-admin-pwa-rij`: zelfde 2-laags herstructurering op mobiel.
- `.dy-admin-tabel-wrap`: nieuwe wrapper met `overflow-x: auto`. Tabel heeft `min-width: 540px` zodat hij niet kapot gaat.
- `.dy-admin-content`/`.dy-admin-tabs`/`.dy-admin-kpi`: kleinere paddings op mobiel.

## Verificatie
Visuele test gedaan op 3 viewports:
- 320×800 (kleinste mobile)
- 375×800 (iPhone)
- 1280×800 (desktop)

Alles past, niets afgesneden, namen zijn leesbaar.

## Files
- `/app/pwa/js/pwa-v463-1780765770.js` (3 edits)
- `/app/pwa/app.css` (admin block herschreven)
- `/app/pwa/index.html` (`?v=60.1.37-admin-mobile`)
- `/app/pwa/sw.js` (VERSION)
