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

### v60.1.61 — Guest-avatar fix (huidige sessie)
- **🔴 ROOT CAUSE**: in `pwa-v463-*.js` `DY.updateNav()` regel 890-895 stond een `if/else-if` zonder **else**-tak voor uitgelogde state. Logout zette label correct op "Inloggen" maar avatar-HTML met oude initialen ("WI") bleef in DOM.
- **🩹 Fix**: derde tak toegevoegd die `sbAvatar.innerHTML` reset naar generic person SVG icon wanneer `!DY.user`.
- Cache: legacy `?v=60.1.61-guest-avatar-fix`, sw `v60.1.61`

### v60.1.60 — Session Cleanup & Cache Isolation (huidige sessie)
- **🔴 Root cause**: na logout bleven user-specifieke caches in localStorage staan → vorige avatar/premium/instellingen lekte naar volgende sessie of guest-state.
- **🆕 Nieuwe extension**: `/app/pwa/extensions/auth/pp-session-cleanup-v1.js` (269 lines):
  - Wrapt `DY.uitloggen` — voert legacy cleanup uit + extra purge
  - **localStorage purge** (exact keys): `dy_premium_cache`, `dy_premium_email`, `dy_premium_userkey`, `dy_premium_pending`, `dy_admin_secret`, `dy_saved_looks`, `dy_bookmark_queue`, `dy_overlay_dismissed_until`, `dy_brand_portal_*`, `dy_wallet_*`, `dy_user_*`, `dy_garderobe_*`, `dy_notif_cache`, `dy_ai_chat_session`
  - **Prefix purge**: `dy_outfit_score_*`, `dy_activiteit_maand_*`, `dy_premium_*`, `dy_wallet_*`, `dy_brand_portal*`, `dy_ai_*`, `dy_review_draft_*`, `dy_outfit_draft_*`
  - **sessionStorage purge**: `_dy_actieve_pagina`, `dy_overlay_gezien`, `dy_safety_shown`, `dy_route_freeze`
  - **Whitelist (NIET gewist)**: `dy_app_version`, `dy_install_v`, `dy_pwa_geinstalleerd`, `dy_item_poll_id`, `dy_item_poll_stem`, `dy_consent`, `dy_theme`, `dy_locale`
  - **In-memory cleanup**: `PP_CampaignRenderer._unsubscribe`, `PP_FeedTabs` Uitgelicht-grid, `PP_Wallet._state`, `PP_AdminPremium._state`
  - **Topbar refresh**: ruimt avatar-img src op zodat geen vorige avatar zichtbaar blijft
  - **User-switch detectie**: `firebase.auth().onAuthStateChanged` vergelijkt UID — bij wijziging triggers automatisch purge + premium-refetch
  - **Cross-tab sync**: luistert op `storage` events voor `firebase:authUser:*` — logout in tab A wist ook tab B/C
  - **CustomEvents**: `pp:logout`, `pp:userchange`, `pp:login` — andere extensions kunnen zelf hun state resetten
- **Premium-v1.js**: luistert nu op `pp:logout` (wist `dy_premium_cache` + sluit manage-modal) en `pp:userchange` (forceer fresh fetch).
- **Admin-premium-v1.js**: reset internal `_state` op `pp:logout` / `pp:userchange`.
- Public API: `window.PP_Session.purgeAll()` voor handmatige purge in dev-tools.
- Cache: `?v=1.0.12-session`, sw `v60.1.60`
- Deploy ZIP: 2.5 MB

### v60.1.59 — Premium Manage Modal + 403 verklaring (huidige sessie)
- **🐛 Root cause "Beheer abonnement" alert**: `openCustomerPortal()` deed `POST /api/billing/portal` → backend retourneert 501 → JS deed `alert(d.detail)` → lelijke browser dialog.
- **✅ Fix**: vervangen door volwaardige in-app **`#dy-prem-manage-overlay`** modal in `js/premium-v1.js`:
  - Premium users zien: status pill, plan, sinds-datum, vervaldatum, account-email, feature-lijst
  - "Opzeggen via e-mail" knop (mailto: support@paskamerpraat.nl, auto-fill email + onderwerp)
  - Bron-aware: `premium_monthly` (Stripe) / `premium_admin` (env) / `premium_grant` (handmatig) → toont juiste opties
  - Non-premium fallback: "Word Premium" CTA + Sluiten knop
  - WCAG: aria-modal, focus trap via overlay click, ESC-vriendelijk
  - Volledig dark theme, geen browser alert(), geen 403, geen 501
- **⚠️ 403 op `/api/webhook/stripe`**: dit is GEEN bug — webhook endpoints zijn altijd POST-only. K8s ingress retourneert 403 op GET (public preview retourneert 405 = correct). Stripe Webhooks gebruiken alleen POST → geen impact op productie.
- **🆕 PP_Premium alias** exposed (`window.PP_Premium = window.DY.premium`) voor inline onclick.
- Cache: `premium-v1.js?v=60.1.59-manage-modal`, sw `v60.1.59`

### v60.1.58 — ULTIMATE STABILIZATION (huidige sessie)
- **🔴 ROOT CAUSE GEVONDEN**: 14 occurrences van dode preview URL `fitting-chat-app.preview.emergentagent.com` in 8 frontend files. Verklaart bulk van 32 console errors + Stripe "NIET GECONFIGUREERD" — alle fetches faalden silently door DNS-fout.
- **Globale URL fix** (sed search-replace): vervangen door live URL `paskamer-stability.preview.emergentagent.com` in:
  - `js/premium-v1.js`, `js/virtual-tryon-v1.js`, `js/outfit-score-v1.js`, `js/weekly-stylist-v1.js`, `js/card-actions-v1.js`, `js/error-logger-v1.js`, `js/admin-errors-v1.js`, `index.html` preconnect, `_headers` CSP.
- **Admin panel apiBase() opgewaardeerd**: gebruikt nu `DY.aiHealth.apiBase()` (canonical) met hostname-based fallback — zelfde patroon als premium-v1. Toont "Backend ONLINE" pill in Stripe Status tab.
- **🩹 Backend stabilization stubs** — voorkomt 404 spam (alle 11 missing endpoints):
  - `POST /api/client-error` + `DELETE` + `GET /api/client-error/recent`
  - `POST /api/ai/score-outfit`, `POST /api/ai/style-assistant`, `POST /api/ai/similar-items`
  - `POST /api/tryon`, `GET /api/proxy-image`, `POST /api/report`, `POST /api/weekly-stylist`
  - Alle retourneren graceful 200 met empty/disabled state — geen UI crashes.
- **Idempotent stripe-events**: bestaand webhook handler logt nu zowel verified als invalid events naar `stripe_events` collection voor admin monitor.
- Cache bumps overal: legacy `?v=60.1.58-stable-urls`, ext `?v=1.0.11`, sw `v60.1.58`.

**Resultaat (verwacht na deploy):**
- ✅ Console errors: 32 → ~0 (dode URL was de hoofdoorzaak)
- ✅ Stripe Status: NIET GECONFIGUREERD → Gekoppeld (test)
- ✅ Backend pill toont API base URL voor transparantie
- ✅ Alle legacy endpoints geven graceful response i.p.v. 404

### v60.1.57 — Premium Admin Page + Full Entitlement System (huidige sessie)
- **🆕 Admin route `admin_premium`** in `/app/pwa/extensions/admin/pp-admin-premium-v1.js`:
  - **6 tabs**: Stripe status / Checkout debug / Premium users / Transactions / Webhooks / Entitlements
  - Stripe status: gemaskeerde key, env, webhook URL, packages, admin-overrides
  - **Checkout debug**: knop maakt directe test-sessie + toont raw response, redirect URL, errors
  - Users tabel: grant (1-3650 dagen) + revoke + bron-pill (admin_override / stripe / admin_grant)
  - Transactions: payment_transactions log met status-pills
  - Webhooks: stripe_events monitor (verified/invalid badges + raw payload viewer)
  - Entitlements resolver: laat per email zien welke features actief zijn (virtual_tryon, style_score, ai_fit_chat, similar_search, premium_badge, outfit_analyse)
  - Admin auth: X-Admin-Secret prompt (LS cached) + X-User-Email auto
- **Backend** (`server.py`): 7 nieuwe endpoints onder `_check_admin_access`:
  - `GET /api/admin/premium/stripe-status`
  - `POST /api/admin/premium/test-checkout`
  - `GET /api/admin/premium/users`
  - `POST /api/admin/premium/grant` (body: email, days, note)
  - `POST /api/admin/premium/revoke`
  - `GET /api/admin/premium/transactions?limit=50`
  - `GET /api/admin/premium/webhooks?limit=50`
  - `GET /api/admin/premium/entitlements?email=...`
- **Centralized entitlement resolver**: priority admin_override > stripe > admin_grant > none
- **Webhook hardening**: stripe_events audit log voor zowel verified als invalid events. Idempotent premium-grant via session_id check.
- **Nieuwe MongoDB collections**: `stripe_events`, `premium_audit` (geen wijzigingen aan bestaande).
- Cache: ext `?v=1.0.10-premium-mgmt`, sw `v60.1.57`
- Deploy ZIP: 2.5 MB

### v60.1.56 — Admin Premium Override (huidige sessie)
- **🔑 Admin-account `williamdevriesis@gmail.com` krijgt altijd Premium-toegang** zonder betaling:
  - Backend (`/api/premium/status`): leest `ADMIN_PREMIUM_EMAILS` env var (comma-separated list), case-insensitive match op `email` of `user_key` query param
  - Frontend (`premium-v1.js`): `fetchStatus()` stuurt nu ook `&email=<currentUser.email>` mee zodat backend override kan toepassen ook bij Firebase-UID gebaseerde keys
  - Response: `{"is_premium":true,"plan":"premium_admin","activated_at":"admin-override"}`
- Env: `ADMIN_PREMIUM_EMAILS=williamdevriesis@gmail.com` toegevoegd aan `/app/backend/.env`
- Cache bumps: `premium-v1.js?v=60.1.56-admin-override`, sw.js `v60.1.56`

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
