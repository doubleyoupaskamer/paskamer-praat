# PaskamerPraat — Product Requirements (PRD)

## Origineel probleem
PaskamerPraat.nl is een vanilla JS PWA op Firebase + Cloudflare Workers, met recente uitbreidingen:
- Onboarding, routing, PWA & stability recovery audit
- Phase 2: Self-service Brand Portal (`/brands` / `/merken`) voor externe merken
- Python FastAPI backend voor Admin Image Generator (Nano Banana via Emergent LLM Key)

## Implementatiestatus (chronologisch)

### v60.1.x — Brand Portal MVP
- Merken-discovery (publiek), registratie, brand login, pending state, dashboard
- Product CMS, campagne builder, audience selectie, analytics
- Admin: brand moderation, campagne controle, inkomsten dashboard
- RBAC: USER / BRAND (users.role='brand' + brands.status='approved') / ADMIN (email-based)
- Self-approval security fix (v60.1.10): brands kunnen niet hun eigen status wijzigen via UI/JS/Firestore rules
- Multi-user auth race condition fix (v60.1.11): guest-auth-v1.js + dy-presence.js geen conflicten meer

### v60.1.14 — Admin Image Generator
- Python FastAPI `/api/admin/generate-image` met `X-Admin-Secret` header
- Gemini Nano Banana via Emergent LLM Key (`gemini-3.1-flash-image-preview`)
- PaskamerPraat brand style prompt-prefix
- Admin UI: `admin-imggen-v1.js`

### v60.1.34 — Homepage Hero Overlay Fix (2026-02-14)
- Desktop hero layout hersteld (was: gebroken magazine-layout door CSS-cascade volgorde)
- Mobile tekst-contrast verbeterd (sterkere gradient + text-shadow)
- Duplicate `.dy-hm-hero-text-desktop` verborgen (text-overlay is enige bron)
- 16:10 aspect ratio binnen `.dy-main` app-frame (680-1000px max-width)

### v60.1.35 — Full Stability & Performance Audit (2026-02-14)
- Crash recovery loop-guard (max 3 attempts → statische fallback UI)
- Safety timer voor render hangs werkt nu correct (8s na render-start)
- Push notificatie auteur-lookup bug gefixt (was silent fail via invalid `yield` syntax)
- Service Worker networkFirst: cache.put nu altijd na fresh fetch
- Backend CORS spec-compliant (geen credentials+wildcard conflict)
- Alle 26 helper-JS scripts geüniformeerd naar `?v=60.1.35-stability-audit`
- Logger init verplaatst naar top of file (forward-reference fix)
- Full audit report: `/app/memory/AUDIT_v60.1.35.md`
- ZIP artifact: `/app/pwa/paskamerpraat-pwa-v60.1.35-stability-audit.zip`
- Backend tests: 100% pass (8/8) via testing_agent_v3_fork

## Backlog / Toekomstige tasks

### P0 — Verificatie nog open
- Brand Product Upload: drag/drop, compressie, limieten verifiëren
- Campaign Builder: live budget berekening, objective settings verifiëren
- Brand registratie e2e flow op productie testen

### P1 — Verificatie nog open
- Results Dashboard / Analytics: impressies, reach, CTR, CSV export
- Admin Campaign Control: pause/resume, budget overrides, revenue dashboard
- Browser back-button gedrag (popstate hook ontbreekt; werkt nu via URL-reset)

### P2 — Refactoring (niet kritiek)
- `app.css` opschonen rond `.dy-hm-hero` block (~15 iteraties gerelateerde regels)
- `pwa-v463-*.js` is 1.2MB monolith → opsplitsen in modules
- Duplicate object-key `'plus-size'` in DY._normBouw map (line 232) cleanup
- Deprecated `@app.on_event('shutdown')` → lifespan context manager
- CORS middleware order in `server.py` (na router toegevoegd; werkt maar fragiel)

### P3 — Optimalisaties
- Image preload hints voor hero variants
- Bundle splitting voor lazy-load helper modules
- Web Vitals dashboard koppelen aan admin panel

## Architectuur (huidige stack)

```
/app/pwa/                          # Vanilla JS PWA (deploy via Cloudflare Workers extern)
├── index.html                     # SPA shell + inline routing/recovery scripts
├── app.css                        # Monolitische stylesheet
├── sw.js                          # Service worker (networkFirst HTML, cacheFirst JS)
├── firestore.rules                # Firebase security rules
├── js/
│   ├── pwa-v463-*.js              # 25K-line legacy core (renderHome, renderFeed, etc.)
│   ├── brand-portal-v1.js         # Brand Portal SPA module (1.7K lines)
│   ├── guest-auth-v1.js           # Anonymous auth voor gasten
│   ├── dy-presence.js             # Realtime presence engine
│   ├── admin-imggen-v1.js         # Admin UI voor Nano Banana
│   ├── error-boundary-v1.js       # Global error capture
│   └── ...                        # 30+ helper modules

/app/backend/                      # Python FastAPI (lokale dev / Emergent platform)
├── server.py                      # POST /api/admin/generate-image + /api/status
└── .env                           # MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, ADMIN_GEN_SECRET, CORS_ORIGINS

/app/memory/
├── PRD.md                         # Dit bestand
├── AUDIT_v60.1.35.md              # Volledige audit + fix log
└── test_credentials.md            # Test accounts (leeg of niet aanwezig)
```

## Belangrijke conventies (NIET BREKEN)
1. **GEEN em-dashes (—)**: gebruik komma, punt of haakjes
2. **Inclusief taalgebruik**: geen "afslank-mode", geen gewicht-georiënteerde copy
3. **Cache busting**: bij elke JS/CSS edit `?v=` in `index.html` EN `VERSION` in `sw.js` bumpen
4. **Antwoord altijd in NL** (user voorkeur)
5. **Brand Portal route hijack**: BP_PAGES whitelist controleert welke routes door brand-portal overgenomen worden
6. **Auth identity dedup**: `_laatsteAuthUid` voorkomt onnodige re-renders bij token refresh
