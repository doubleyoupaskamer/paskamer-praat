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

### v60.1.55 — Stripe Premium Checkout + Outfit Score stub (huidige sessie)
- **💳 Stripe Premium Checkout** (via `emergentintegrations.payments.stripe.checkout`):
  - `POST /api/checkout/session` — body `{package_id, origin_url, user_key, email}` → `{url, session_id}`
  - `GET /api/checkout/status/{session_id}` — Stripe-status + idempotent premium-activatie
  - `GET /api/premium/status?user_key=...` — `{is_premium, plan, activated_at, email}`
  - `POST /api/billing/portal?user_key=...` — placeholder 501 (test-key heeft geen customer portal)
  - `POST /api/webhook/stripe` — webhook handler met signature-verificatie + idempotent activatie
- **🔒 Security**: Server-side `PREMIUM_PACKAGES = {premium_monthly: 4.99 EUR}`. Frontend kan amount NIET manipuleren.
- **🧾 MongoDB collections**:
  - `payment_transactions`: `{session_id, user_key, email, package_id, amount, currency, payment_status, status, premium_activated, metadata, created_at, completed_at}`
  - `premium_users`: `{user_key, email, plan, is_premium, activated_at, last_session_id}`
- **🎯 Idempotency**: premium wordt MAXIMAAL 1× toegekend per session_id (zowel via status-poll als webhook).
- **🛠️ Outfit Score stub** (`POST /api/outfit-score`): deterministic placeholder 70-95 op basis van `image_hash`. Stopt 404-spam in console; volledige Gemini Vision implementatie kan later.
- Env: `STRIPE_API_KEY=sk_test_emergent` toegevoegd aan `/app/backend/.env`.

### v60.1.54 — UI cleanup + dark cards + Trending herstel + Merken clipping (huidige sessie)
- **🗑️ Duplicate header strip verwijderd** (`pp-campaign-renderer-v1.js`):
  - `tryInject()` skipt nu volledig het `'feed'` placement
  - Geen "Voor jou geselecteerd" duplicate meer bovenaan /feed en /merken
  - Campagnes verschijnen UITSLUITEND in: (a) Uitgelicht-tab, (b) bestaande /merken `bp-campagne-feed` sectie, (c) andere placements (stories/ai_assist/outfit_review/similar)
- **🔄 Trending tab hersteld** (`pp-feedtabs-v1.js`):
  - Alleen "Mijn posts" wordt nog verborgen
  - Tab-volgorde: Ontdek ⭐ → Mijn postuur → Trending → Uitgelicht
  - Herstel-logica voor oude clients die Trending eerder verborgen hadden
- **🎨 Dark theme cards in Uitgelicht** (huisstijl-normalisatie):
  - Verwijderd: hardcoded cream/beige (`#fdf8f0`, `#1e1a0f` op licht)
  - Gebruik nu dark tokens matching `.bp-campagne-kaart`:
    - background `linear-gradient(135deg, rgba(212,145,10,.10), rgba(255,255,255,.04))`
    - border `rgba(212,145,10,.28)`, text `#fcf8ef`, accent `#d4910a`
  - WCAG AA contrast: white text op solid dark backing
  - Responsive grid: 1-col mobile / 2-col 600px+ / 3-col 1024px+
- **📐 Merken pagina clipping fix** (`brand-portal.css`):
  - `.bp-page` krijgt `min-height: 100vh` + `padding-bottom: calc(120px + env(safe-area-inset-bottom))`
  - Geen content cut-off meer onderaan op mobile/desktop
- Cache bumps: ext `?v=1.0.10`, css `?v=60.1.54-merken-clipping`, sw `v60.1.54`
- Deploy ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB)

### v60.1.52 — Feed Tabs Restructure + null-uid guard
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
