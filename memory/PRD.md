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

### v60.1.62 — Auto-Refresh User Data + Owner-Aware Cache (huidige sessie)
- **🔴 Root cause "oude gegevens"**: 
  1. Premium cache TTL was **5 minuten** → user-switch toonde 5 min lang oude status.
  2. Cache had geen owner-tag → cache van user A bleef bestaan voor user B.
  3. Hub-menu render gebruikte `fetchStatus(false)` (cached) → toonde stale "Upgrade naar Premium" voor admin-override users.
  4. Geen auto-refresh op page-navigation of window-focus.
- **🆕 Owner-aware cache** in `premium-v1.js`:
  - TTL verlaagd van 300s → **30s**
  - Cache wordt getagged met `_owner_email` + `_owner_key`
  - `getCached()` verifieert dat cache bij huidige user hoort → anders return null (forceer fresh)
- **🆕 Hub-menu altijd fresh**: `injectIntoCardHub` gebruikt nu `fetchStatus(true)` ipv `false`
- **🆕 Nieuwe module** `/extensions/auth/pp-auto-refresh-v1.js` (190 lines):
  - **Triggers**: `pp:login`, `pp:userchange`, window focus, visibility change, DY.navigeer/toonPagina wrapper, 60s heartbeat
  - **Wat wordt vernieuwd**:
    - `DY.profile` ← Firestore `users/{uid}` met `source:'server'` (bypass IndexedDB cache)
    - Premium status ← force-fresh API call
    - Avatar/initialen DOM ← `DY.updateTopbarAvatar()` + `DY.updateNav()`
    - Campagnes ← `PP_CampaignRenderer.refresh()`
  - **Throttle**: 800ms burst-protectie + 60s heartbeat
  - Fires `pp:refreshed` event voor andere modules
- Cache: ext `?v=1.0.13`, `?v=60.1.62-owner-aware-cache`, sw `v60.1.62`

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
  - "Opzeggen via e-mail" knop (mailto: info@doubleyousmallandtall.nl, auto-fill email + onderwerp)
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
- `williamdevriesis@gmail.com` - secret header `wivri` voor backend API

## v60.1.79 (2026-02-14) - Footer hersteld + kleur-fix
### Misverstand vorige sessie
v60.1.78 verwijderde de footer per ongeluk; gebruiker wilde alleen de
KLEUREN aanpassen. De vorige CSS had `background:transparent` waardoor
op brand-portal pagina's (cream `var(--cream)` body sections) de
lichte tekst onleesbaar werd tegen lichte achtergrond.

### Fix
- `injectFooter()` weer geactiveerd in `init()`.
- Cleanup van eventuele dubbele cached injecties bij init.
- CSS volledig herwerkt voor consistente dark look ongeacht pagina:
  - `background: #0a0806` (solid donker, geen doorlek meer)
  - `color: rgba(252,248,239,.78)` (helderdere tekst voor leesbaarheid)
  - `border-top: 1px solid rgba(212,145,10,.18)` (subtiele goud-accent)
  - Separator `·` in goud-tint (`rgba(212,145,10,.45)`)
  - Links iets prominenter (`#fcf8ef` ipv 70% opacity)
  - Copyright op aparte regel als `.pp-legal-copy` met eigen styling
  - Wrapper `.pp-legal-row` voor flex-wrap op smalle schermen
  - Media query <=520px: links wrappen netjes, geen overlap
  - `padding-bottom: calc(110px + env(safe-area-inset-bottom))` voor
    iPhone notch-respect onder de bottom-nav
- HTML structuur: separator van inline naar gestructureerd
  `<div class="pp-legal-row">` + `<div class="pp-legal-copy">`

### Cache discipline
- SW VERSION → `v60.1.79-20260214-footer-colors`
- `pp-legal-footer-v1.js?v=60.1.79-footer-colors`
- `pp-brand-config-v1.js?v=60.1.79-footer-colors`
- `PP_BRAND.version` → `v60.1.79`

### Niet gewijzigd
- TOS-banner functionaliteit
- Voorwaarden-pagina
- Brand portal mid-page footer
- Alle bestaande flows en routes

## v60.1.78 (2026-02-14) - Footer cleanup + leaked JS-code fix
### Root cause: zichtbare JS-code leak op mobiel
Op mobiele schermen was er ruwe JavaScript zichtbaar als tekst onder
de pagina-content: `_check', Date.now().toString()); } catch(e) {} })();`
Oorzaak: in `index.html` stond na regel 1175 (`</html>`) een dubbel-gekopieerd
fragment van het PWA-removal IIFE block, ZONDER omsluitend `<script>` tag.
De browser rendert dit als tekst.
Fix: het dangling fragment (regels 1176-1181) verwijderd.

### Legal footer-blok onderin verwijderd
Op verzoek van gebruiker is het zichtbare blok onderaan iedere pagina
weggehaald (Gebruikersreglement, Acceptable Use, Privacy & Cookies,
Algemene Voorwaarden, Campagnevoorwaarden + copyright + versienummer).
- `injectFooter()` call in `pp-legal-footer-v1.js init()` uitgecommentarieerd
- Bij init wordt elk reeds geinjecteerde `#pp-legal-footer` element
  uit de DOM verwijderd (cleanup voor gebruikers met oude cache)
- **Belangrijk**: de TOS-acceptatie banner voor merken (`checkTosAcceptance`)
  blijft volledig actief. Alleen het zichtbare footer-blok is uit; de
  legale verplichting voor merken om voorwaarden te accepteren is intact.
- De voorwaarden-pagina `/voorwaarden/` blijft bereikbaar en zichtbaar.

### Cache discipline
- SW VERSION → `v60.1.78-20260214-footer-cleanup`
- `pp-legal-footer-v1.js?v=60.1.78-footer-cleanup`
- `pp-brand-config-v1.js?v=60.1.78-footer-cleanup`
- `PP_BRAND.version` → `v60.1.78`

### Niet gewijzigd
- Bestaande functionaliteit, routes, flows
- TOS-acceptatie banner voor merken
- Voorwaarden-pagina inhoud
- Brand portal mid-page footer ("Algemene voorwaarden · Privacybeleid · Contact")
  blijft staan (dat is een andere footer, niet de legal-extension)

## v60.1.77 (2026-02-14) - SW stabilisatie + Promise rejection cleanup
### Root cause analyse
De gerapporteerde "Promise rejection x13/x15 - Failed to update a
ServiceWorker" was de combinatie van:
1. **Dubbele SW registratie**: `index.html` (inline `<script>` op `load`)
   en `js/sw-auto-update-v1.js` registreerden beide `/sw.js`. Race
   condition + de inline registratie miste `updateViaCache: 'none'`,
   waardoor `sw.js` zelf browser-cached werd.
2. **Unhandled async rejection**: `setInterval(() => reg.update())` in
   `sw-auto-update-v1.js` had alleen `try/catch`, maar `reg.update()`
   retourneert een Promise - synchroon try/catch vangt async rejection
   niet. Elke minuut polling op stale registratie = nieuwe rejection.
   13/15 = polling-cycles bij user.
3. **Geen vangnet**: er was geen globale `unhandledrejection` listener
   die benigne SW-ruis filterde.

### Fixes (alleen technisch, geen UI/flow changes)
- **`index.html`**: dubbele inline SW-registratie verwijderd.
  `sw-auto-update-v1.js` is nu single source of truth voor SW lifecycle.
- **`js/sw-auto-update-v1.js`**: `reg.update()` calls in setInterval +
  visibilitychange handler nu omhuld met `.catch()` om unhandled
  rejections te voorkomen. 6 lege `catch (e) {}` blokken vervangen
  door `catch (e) { /* noop */ }` voor lint-conformiteit.
- **`extensions/stability/pp-promise-guard-v1.js`** (NIEUW):
  globale `unhandledrejection` + `error` listener. Filtert benigne
  patterns (SW update failures, fetch aborts, manifest load fails)
  en voorkomt console-spam. Echte business-logic errors blijven
  zichtbaar en gaan naar `DY.logError` indien beschikbaar.
  Ring buffer 50 events via `window.PP_PROMISE_GUARD.recent()`
  voor diagnose. Geladen als EERSTE script (zelfs voor brand-config).
- **`sw.js`** VERSION naar `v60.1.77-20260214-sw-stability` - forceert
  schone cache namespace voor alle clients en deactiveert oude
  registraties bij activate-event.

### Audit resultaten
- JS syntax: 54/54 files pass `node -c`
- ESLint: nieuwe files clean, sw-auto-update clean (was 6 violations)
- Backend pytest: 10/10 pass (inclusief outfit-score Gemini + fallback)
- Backend health: 200 OK
- Geen UI of flow wijzigingen
- Geen route changes
- Geen database structuur changes
- Geen functionaliteiten verwijderd
- Bestaande caching strategie behouden (network-first HTML, cache-first
  versioned JS, stale-while-revalidate CSS/fonts, etc.)

## v60.1.76 (2026-02-14) - Theme config + Echte Gemini Vision Outfit Score
- **PP_THEME config** (`extensions/config/pp-theme-config-v1.js`):
  `window.PP_THEME = { current, presets, apply, switch, get }`.
  4 presets: `default` (donker goud), `light`, `kerst` (rood), `lente`
  (groen). Bij init: injecteert CSS custom properties op `:root`
  (`--pp-primary`, `--pp-accent`, `--pp-ink`, `--pp-bg`, etc.).
  Voorkeur in localStorage `dy_theme`. Reset bij `pp:logout`.
  CustomEvent `pp:theme-change` voor luisteraars. Bestaande CSS blijft
  werken; nieuwe code kan `var(--pp-primary)` gebruiken.
- **Echte Gemini Vision Outfit Score** (`backend/server.py POST /api/outfit-score`):
  Vervangt deterministic stub. Gebruikt Emergent LLM Key + emergentintegrations
  library met model `gemini-3.1-pro-preview` (vision-capable).
  Request: `photo_b64`, `photo_mime`, `request_id`, `image_hash`.
  Response: `score (0-100)`, `label`, `summary`, `tips[]`, `color_palette[]`,
  `breakdown {kleur, fit, styling, occasion}`, `source`.
  Markdown-fence stripping + sanitisatie + clamp 0-100.
  Fallback bij key/parse fout → deterministic placeholder (geen 500).
  Tests: `/app/backend/tests/test_outfit_score.py` (2 pass).
  Live test op localhost: score 68, Gemini analyseerde kleuren correct
  (rood/blauw/zand palette), response ~10s.
- **Lint cleanup**: 2 ruff blockers opgelost (E401 import on one line +
  F811 duplicate ai_health route).
- **Cache discipline**: SW VERSION naar `v60.1.76-20260214-theme-vision`,
  brand config + theme config script tags geregistreerd met `?v=60.1.76`.

## v60.1.75 (2026-02-14) - Full Doubleyou rebrand + centralized config
- **Branding**: alle 195 occurrences van "Paskamer Praat" in productie
  bestanden vervangen door "Doubleyou". CHANGELOG-*.md en workers/*
  bleven intact (historische docs / aparte deploys).
- **Tagline**: "Tailored for Tall & Plus Size" toegevoegd aan
  page title, og:title, twitter:title, manifest.name + description.
- **Manifest.json**: name "Doubleyou - Tailored for Tall & Plus Size",
  short_name "Doubleyou", description bijgewerkt.
- **Centrale config** (`extensions/config/pp-brand-config-v1.js`):
  `window.PP_BRAND = { appName, tagline, fullName, organisation,
  domain, version, contactEmail, formatDate }`. Frozen object.
  Legal footer en andere extensies lezen versie/naam hieruit i.p.v.
  hardcoded strings. Laadt als EERSTE script (`defer`) zodat alle
  legacy code window.PP_BRAND kan gebruiken.
- **Legal footer** (`pp-legal-footer-v1.js`): hardcoded "v60.1.72"
  verwijderd, leest nu PP_BRAND.version. Jaar via `new Date().getFullYear()`
  i.p.v. hardcoded "2026". Marker attr `data-pp-copy` voor live update.
- **Voorwaarden**: dubbele "h.o.d.n. Doubleyou" naam-redundantie weggehaald.
- **Cache discipline**: alle index.html + admin.html script/css tags
  uniform `?v=60.1.75-doubleyou-rebrand`, SW VERSION naar
  `v60.1.75-20260214-doubleyou-rebrand`.
- **Stability**: 0 syntax errors (`node -c` pass op alle JS), JSON valid.

## v60.1.74 (2026-02-14) - Emails uniform + 3 P2 features
- **Emails**: Alle `@paskamerpraat.nl` adressen (support/privacy/partners/no-reply/legal/security)
  vervangen door `info@doubleyousmallandtall.nl`. Scope: HTML, JS, MD, JSON
  in `/app/pwa/`, `/app/backend/` en `/app/memory/legal/`. Login-emails
  (test users williamdevriesis@gmail.com en mozenlow2023@gmail.com) bleven
  ongewijzigd; SMTP-template placeholders ook.
- **P2 Brand A-Z sticky index bar** (`/extensions/placements/pp-brand-az-index-v1.js`):
  additieve extensie, plakt sticky letterbalk boven `#bp-merken-lijst`,
  letters zonder merk worden gedimd, scroll-naar-eerste-merk per letter,
  diakrieten genormaliseerd. data-testids: `brand-az-index-bar`,
  `brand-az-letter-{LETTER}`.
- **P2 Recente activiteit in profiel** (`/extensions/profile/pp-recente-activiteit-v1.js`):
  laadt laatste 5 stories van de ingelogde gebruiker via Firestore,
  toont icon (categorie-based) + titel + relatieve tijd. Geinjecteerd
  na `#dy-profiel-badges`. Fallback bij ontbrekende index. data-testids:
  `pp-recente-activiteit`, `pp-act-list`, `pp-act-row-{id}`, `pp-act-leeg`.
- **P2 Volgende factuur in premium modal** (`js/premium-v1.js`):
  voor `plan === 'premium_monthly'` toont nu "Volgende factuur: [datum]
  (€4,99 via Stripe)" gebaseerd op `expires_at` (= einde huidige periode
  = eerstvolgende incasso). data-testid: `prem-volgende-factuur`.
- Service Worker VERSION naar `v60.1.74-20260214-az-recente-factuur`,
  index.html script tags geregistreerd met v60.1.74-az-recente-factuur.

## v60.1.73 (2026-02-14) - Em-dash cleanup definitief + cache bump
- Volledige sweep: alle em-dashes (-) verwijderd uit ALLE productie bestanden
  (HTML, JS, CSS). Vorige claim was foutief; er stonden er nog ~1.500.
- Alle `?v=` querystrings in index.html en admin.html uniform gebumpt naar
  `60.1.73-cleanup-emdash` (47 script/css tags).
- Service Worker VERSION naar `v60.1.73-20260214-cleanup-emdash`.
- ZIP herbouwd: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB, 156 files).
- Syntax check: alle JS bestanden valid (`node -c` pass).
