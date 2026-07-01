# PaskamerPraat Extensions README

Production-ready uitbreidingen voor de PaskamerPraat PWA, modulair en
backward compatible.

## Quick start
Zie [SETUP_GUIDE.md](./SETUP_GUIDE.md) voor stap-voor-stap deployment.

## Inhoud

| Folder | Systeem | Status |
|--------|---------|--------|
| `firestore/` | Data contracten + indexes voor 6 collections (18 JSONs) | ✅ Documentatie compleet |
| `analytics/` | Cloudflare Worker event aggregator (cron */15 min) | ✅ Productie-ready code |
| `placements/` | Global helper `window.PP_Placements` | ✅ Drop-in ready |
| `hooks/` | AI engine hooks frontend + backend router | ⚠️ Backend stubs (501) vereist integration_playbook |
| `payments/` | Wallet + Shopify FastAPI router | ⚠️ Firestore helpers stubs (501) vereist firebase-admin init |
| `admin/` | 3 nieuwe admin routes (wallet/payments/placements) | ✅ Frontend volledig werkend |

## Hard constraints (verifieerbaar via `git diff`)
- ✅ Geen bestaande JS/CSS/HTML file gewijzigd
- ✅ Geen bestaande backend file gewijzigd
- ✅ Alle nieuwe code in `/app/pwa/extensions/`
- ✅ Routes via wrapper pattern, niet via BP_PAGES mutatie
- ✅ Backend routers worden geïncludeerd via 2 regels in server.py server.py niet herschreven

## Architectuur principes
1. **Additive only** feature-flag gestuurd via `admin_settings/global.feature_flags`
2. **Idempotent backend** webhook + aggregator zijn safe voor retries
3. **Server-only writes** wallet_balance/impressies/clicks niet door clients beschrijfbaar
4. **Audit trail** alle financial + state changes loggen naar audit collections
5. **Schaalbaar** Cloudflare Worker + batched Firestore writes (500/run)
6. **Backward compatible** alle defaults bevatten bestaand gedrag

## Versie
1.0.0 14 februari 2026
