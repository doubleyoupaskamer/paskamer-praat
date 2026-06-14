# PRD — Paskamer Praat (PWA)

## Origineel probleem (huidige sessie)
"Het merkenportaal werkt momenteel niet correct na het toevoegen van database-indexen.
Verschillende foutmeldingen, merklogo wordt niet geladen, merkinformatie niet correct weergegeven."

Plus: full system audit + stabilisatie + ontbrekend merkprofiel.

## Architectuur
- **Frontend**: Vanilla JS PWA + HTML/CSS, gehost op paskamerpraat.nl (Cloudflare)
- **DB/Auth/Storage**: Firebase (Firestore, Auth, Storage)
- **AI Backend**: Python FastAPI (`/app/backend/server.py`) — Gemini Nano Banana + Sora 2 via Emergent LLM Key
- **Cloudflare Workers**: `pvdw-worker` voor Post-van-de-Week pipeline

## Wat is gedaan in deze sessie

### v60.1.42 (eerder) — Firestore-index regressie
- 3 queries refactored: `where + orderBy` → client-side sort/filter
- Eliminé composite-index requirement
- Deploy ZIP: `paskamerpraat-pwa-v60.1.42-brand-portal-index-fix.zip`

### v60.1.43 — Full system stabilisatie + Merkprofiel
- **🆕 Merkprofiel pagina toegevoegd**: `BP.renderProfiel` (180 regels) + route `brand_profiel`
  - Logo upload + live preview
  - Bedrijfsnaam, contactpersoon, e-mail, telefoon, website, social, categorie, BTW, omschrijving
  - Save/update via `brands/{uid}.set({...}, { merge:true })`
  - Audit-log naar `brand_admin_log`
  - Werkt voor alle brand-statussen (approved/pending/rejected)
- **🆕 Mobile clipping fixes** (3 breakpoints):
  - 600px: dash-header + merk-hero flex-wrap
  - 380px: grids smaller, stat-grid 2-col
  - Global: word-break op alle h1/h2
- **Backend download endpoint**: `/api/downloads/{filename}.zip` voor PWA bundle downloads
- Deploy ZIP: `paskamerpraat-pwa-v60.1.43-merkprofiel.zip`

### v60.1.52 — Feed Tabs Restructure + null-uid guard (huidige sessie)
- **🆕 Navigatie Herstructurering** (`/extensions/placements/pp-feedtabs-v1.js` v2.0.0):
  - Verbergt "Trending" tab (`data-filter="populair"`)
  - Verbergt "Mijn posts" tab (`data-filter="mijn"`)
  - Voegt **"Uitgelicht"** tab toe (`data-filter="uitgelicht"`)
    - Toont alleen campagnes + gesponsorde merken (live van Firestore)
    - Reuses `PP_CampaignRenderer.getLive()` cache, fallback `.get()` voor anoniem
    - Klik op kaart → `PP_CampaignRenderer.click()` → brand detail
  - Idempotente MutationObserver — overleeft legacy re-renders
  - DY.setFilter wrapped → herstelt normale feed bij switch
  - Volledig responsive (1-col mobile, 2-col desktop ≥600px)
  - Brand-aligned styling (DM Sans + Cormorant Garamond)
- **🐛 Fix legacy null-uid crash** (pwa-v463 line 9834):
  - `controleerMeldingen` onSnapshot-error handler las `DY.user.uid` zonder null-check
  - Added guard: `if (!DY.user || !DY.user.uid) return;`
- Cache bumps: `?v=1.0.9-nav-restructure` + sw `v60.1.53`
- Deploy ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB)

## Backlog / Volgende stappen
**P0 — Wallet backend activatie (geblokkeerd op user-credentials):**
- Shopify Admin API token → activeer auto-credit webhook
- Firebase Service Account JSON → backend SDK voor wallet_balance update


**P1 — Brand Portal verificatie (na deploy van v60.1.43):**
- Product upload flow (drag/drop, compressie, 2MB limiet)
- Campaign Builder (live budget berekening, objective settings)
- Results Dashboard / Analytics (impressies, reach, CTR, CSV export)
- Admin Campaign Control (pause/resume, budget overrides, revenue dashboard)
- E2E test: registreer brand → wacht op approval → dashboard → profiel bewerken → producten → campagne → analytics

**P2 — UX gaten (gerapporteerd in Fase 8, NIET geïmplementeerd):**
- Account-email wijzigen via Firebase Auth re-auth
- "Bekijk als klant" knop op profiel
- Logo cropper (1:1 enforcement)
- Status-tellers op admin-tabs
- KvK-nummer + adres velden
- Profile-completeness indicator

**P2 — Tech debt:**
- CSP review (4 page-errors in console)
- Monolithische `pwa-v463-*.js` modularisatie (door user uitgesloten)

## Strikt forbidden
- Geen refactoring zonder expliciete user-toestemming
- Geen wijzigingen aan `_headers` CSP zonder reden
- Cache-bumping ALTIJD bij JS/CSS wijzigingen (index.html `?v=` + sw.js `VERSION`)

## Admin credentials
- `williamdevriesis@gmail.com` — secret header `wivri` voor backend API
