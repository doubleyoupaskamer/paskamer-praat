# PaskamerPraat.nl — Brand Portal v1 + Stability v60.1

## Problem statement (huidige sessie)
Bouw een volledig werkend self-service merkportaal als pure uitbreiding, zonder inbreuk op bestaande code, functionaliteiten, UX, routing, styling of dataflows. Met RBAC (USER/BRAND/ADMIN), feature flags, productiegeschikte implementatie en hamburgermenu-entry.

## User choices (vastgelegd)
- **1A** Fase 1 MVP: registratie + approval + product-CMS + campagne CRUD + basis analytics
- **2A** Geen echte betalingen — budget als getal, admin verwerkt facturen handmatig
- **3B** Alleen apart "Merken"-tabblad, geen menging met organische feed
- **4A** Brand-producten volledig gescheiden van Shopify-flow (`brand_products` collectie)
- **5A** Firebase Storage voor image uploads
- **Plus:** menu-entry in profielmenu (= hamburger-equivalent in deze app)

## Tech stack
- **Static PWA** (HTML/CSS/JS) op Cloudflare Pages
- **Firebase** (Firestore + Auth + Storage)
- **Service Worker** (caching + offline)
- Geen build step, geen SSR

## Codebase locatie
- Werk-folder: `/app/pwa/`
- Originele back-up: `/app/paskamerpraat-v60-original.zip`
- Fixed + brand portal output: `/app/paskamerpraat-pwa-v60.1-brand-portal.zip`

## Architectuur — Brand Portal
- **Geïsoleerde module**: `js/brand-portal-v1.js` + `brand-portal.css` met `bp-` prefix → géén overrides
- **Router wrapper**: hookt op `DY.toonPagina` zonder bestaande tabel te muteren
- **Profielmenu injectie**: `MutationObserver` injecteert "Merkenportaal"-knop in bestaande `.dy-profiel-acties`
- **RBAC**: `users.role='brand'` + `brands.status` + bestaande `DY._isAdmin()`
- **Feature flag**: `localStorage.dy_brand_portal='0'` schakelt module uit + script-tag verwijderbaar

## Nieuwe routes
| Route | Toegang |
|---|---|
| `/merken` | publiek |
| `/brand_register` | publiek |
| `/brand_pending` | brand (pending/rejected/suspended) |
| `/brand_dashboard` | brand approved |
| `/brand_producten` + `/brand_product_nieuw` | brand approved |
| `/brand_campagnes` + `/brand_campagne_nieuw` | brand approved |
| `/brand_analytics` | brand approved |
| `/admin_brands` + `/admin_campagnes` + `/admin_inkomsten` | admin only |

## Nieuwe Firestore collections
- `brands/{uid}` — brand profile + status
- `brand_products/{id}` — products (soft-delete)
- `campaigns/{id}` — campaigns met live aggregaten
- `campaign_events/{id}` — append-only impressie/click log
- `brand_admin_log/{id}` — audit log

## Wat is geleverd
✅ Brand registratie met validaties (e-mail uniqueness, URL/BTW/wachtwoord checks, rate limiting)
✅ Logo-upload naar Firebase Storage
✅ Admin approval flow (approve/reject met reden/suspend)
✅ Brand dashboard met live stats (producten/campagnes/impressies/clicks/CTR)
✅ Product CMS (CRUD met max 4 afbeeldingen, soft-delete)
✅ Campagne CRUD met plaatsing-checklist + budget caps + biedstrategie + doel
✅ Analytics dashboard met CSV-export
✅ Publieke /merken discovery + merk-detail + product-click tracking
✅ Admin: brand management, campaign control (pause/resume/end/budget), revenue dashboard
✅ Audit log (`brand_admin_log`) voor alle admin acties
✅ Hamburger-/profielmenu entry via DOM-injection (geen wijziging in pwa-v463-js)
✅ Firestore Rules document `BRAND_PORTAL_FIRESTORE_RULES.md` (additief, geen bestaande regels gewijzigd)

## Stability fixes (v60.1, vorige sessie — blijven actief)
✅ Bug 1 — Dubbele onboarding/route renders opgelost (SW dedup + auth/render guards)
✅ Bug 2 — iOS "Voeg toe" knop opgelost (touch-action + z-index + sync binding)
✅ Bug 3 — Samsung PWA install banner detection opgelost (comprehensive `isAppInstalled()`)

## Test status
- ✅ Statische JS-syntax: alle bestanden OK
- ✅ CSS balans: 126/126 braces
- ✅ Inline scripts: 9/9 OK
- ✅ ESLint: alleen pre-existing patterns (consistent met codebase)
- ⚠️ **MOCKED testing**: E2E browser tests in sandbox kunnen niet bij productie-Firebase. Functionele acceptance test door eindgebruiker op productie-deployment.

## Nieuwe bestanden in ZIP
- `js/brand-portal-v1.js` (~80 KB)
- `brand-portal.css` (~19 KB)
- `BRAND_PORTAL_FIRESTORE_RULES.md` (deployment instructies)
- `CHANGELOG-v60.1-brand-portal-v1.md` (volledige documentatie)

## Gewijzigde bestanden
- `index.html` — 2 regels toegevoegd (`<link>` + `<script>`)
- `sw.js` — VERSION bump naar `v60.1-20260214-brand-portal-v1`

## Volgende stappen (eindgebruiker)
1. **Download** ZIP: `https://paskamer-stability.preview.emergentagent.com/paskamerpraat-pwa-v60.1-brand-portal.zip`
2. **Deploy codebase** naar Cloudflare Pages
3. **CRITICAL**: Deploy Firestore + Storage rules volgens `BRAND_PORTAL_FIRESTORE_RULES.md`
4. **Test** op productie: registreer test-merk, keur goed via admin, upload product, maak campagne
5. **Optioneel**: maak composite indexes (Firebase Console toont auto-prompts)

## Future / Backlog (niet in scope MVP)
- Stripe Connect billing (keuze 2B)
- E-mail notificaties (SendGrid/Resend)
- Real-time analytics aggregatie (Cloud Functions)
- Audience segment builder
- reCAPTCHA
- Sponsored placements in feed (keuze 3A/3C)
- Drag-and-drop bulk import
- Push notificaties bij status-changes
