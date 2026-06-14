# PRD — Paskamer Praat (PWA)

## Origineel probleem (huidige sessie)
"Het merkenportaal werkt momenteel niet correct na het toevoegen van database-indexen.
Verschillende foutmeldingen, merklogo wordt niet geladen, merkinformatie niet correct weergegeven."

## Architectuur
- **Frontend**: Vanilla JS PWA + HTML/CSS, gehost op paskamerpraat.nl (Cloudflare)
- **DB/Auth/Storage**: Firebase (Firestore, Auth, Storage)
- **AI Backend**: Python FastAPI (`/app/backend/server.py`) — Gemini Nano Banana + Sora 2 via Emergent LLM Key
- **Cloudflare Workers**: `pvdw-worker` voor Post-van-de-Week pipeline

## Wat is gedaan in deze sessie
- ✅ **v60.1.42** Brand Portal Firestore-index regressie opgelost:
  - 3 queries refactored om composite indexes te vermijden (client-side sort/filter)
  - `BP.renderProducten`, `BP.renderCampagnes`, `BP.toonMerkDetail`
  - Cache version bumped (index.html + sw.js)
  - Deploy ZIP: `/app/paskamerpraat-pwa-v60.1.42-brand-portal-index-fix.zip`

## Backlog / Volgende stappen
**P1 — Brand Portal verificatie (na deploy van v60.1.42):**
- Product upload flow (drag/drop, compressie, 2MB limiet)
- Campaign Builder (live budget berekening, objective settings)
- Results Dashboard / Analytics (impressies, reach, CTR, CSV export)
- Admin Campaign Control (pause/resume, budget overrides, revenue dashboard)

**P2 — Backlog:**
- CSP review (4 CSP page errors in console - mogelijk legacy resources)
- Refactor monolithische `pwa-v463-*.js` (door user uitgesloten — alleen op verzoek)

## Strikt forbidden
- Geen refactoring zonder expliciete user-toestemming
- Geen wijzigingen aan `_headers` CSP zonder reden
- Cache-bumping ALTIJD bij JS/CSS wijzigingen (index.html `?v=` + sw.js `VERSION`)

## Admin credentials
- `williamdevriesis@gmail.com` — secret header `wivri` voor backend API
