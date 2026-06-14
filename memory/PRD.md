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

## Backlog / Volgende stappen
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
