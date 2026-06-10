# Paskamer Praat — v55 Changelog
**Datum:** 13 februari 2026
**Type:** P0 bugfix + P1 webhook

## 🔴 P0 — Fixed: "Netwerkfout" bij Start Premium

**Probleem:** Gebruikers kregen direct "Netwerkfout. Probeer opnieuw." te zien
zodra ze hun e-mail invulden en op "Start Premium →" klikten, ook bij een werkende backend.

**Root cause analyse:**
- `apiBase()` viel terug op een lege string als `window.DY.aiHealth` nog niet
  ge-`defer`-laad was (race condition op iOS PWA's met cold start).
- Met een lege base werd `fetch('/api/checkout/session')` relatief naar
  `paskamerpraat.nl` gestuurd, wat een 404 HTML pagina opleverde.
- `await r.json()` gooide dan een SyntaxError die door de overly-aggressive
  `catch`-block werd opgevangen → generieke "Netwerkfout" message.
- Eventuele Stripe-fouten (bv. live mode rejecting test e-mail adressen)
  werden ook overschreven door de generieke message.

**Oplossingen in `js/premium-v1.js`:**
1. ✅ `apiBase()` heeft nu een **harde fallback** (`LIVE_BACKEND_FALLBACK`)
   die host-detection doet wanneer `aiHealth` nog niet beschikbaar is.
2. ✅ Aparte `try/catch` rond de `fetch()` zelf (netwerkfout) en rond
   `r.json()` (parse-fout) — elk met een **eigen, duidelijke message**.
3. ✅ Backend `detail` veld wordt **getoond** als de checkout faalt
   (i.p.v. weggegooid).
4. ✅ Speciale rebrand voor Stripe "invalid email" naar Nederlandse user-vriendelijke
   tekst: *"Dit e-mailadres wordt door Stripe niet geaccepteerd. Gebruik je
   échte e-mailadres (geen test-adressen)."*
5. ✅ `console.info/warn/error` logging bij élke stap → debuggen via DevTools
   Console wordt nu triviaal.
6. ✅ Customer Portal-flow (`openCustomerPortal`) idem fix gekregen.

## 🟠 P1 — New: Stripe Webhook met handtekening-verificatie

**Endpoint:** `POST /api/webhook/stripe`

**Wat is nieuw:**
- Volledig herschreven met **directe `stripe.Webhook.construct_event()`**
  i.p.v. emergentintegrations wrapper, voor maximale betrouwbaarheid.
- **Signature verification** met `STRIPE_WEBHOOK_SECRET` env var (`whsec_...`).
  Zonder secret loggen we waarschuwing maar accepteren we events (dev mode).
- **Idempotency** via `stripe_webhook_events` collectie — duplicate event-IDs
  worden geskipt (Stripe stuurt soms hetzelfde event meerdere keren).
- **3 events** worden afgehandeld:
  - `checkout.session.completed` → eerste activatie van premium
  - `invoice.paid` → maandelijkse hernieuwing (verleng `expires_ts`)
  - `customer.subscription.deleted` → opzegging (markeer expired)

**Voor jou om af te ronden:**
1. Ga naar https://dashboard.stripe.com/webhooks
2. Klik **+ Add endpoint**
3. URL: `https://fitting-chat-app.preview.emergentagent.com/api/webhook/stripe`
   (of je eigen backend-URL als je later migreert)
4. Selecteer events: `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.deleted`
5. Kopieer de **Signing secret** (`whsec_...`) en stuur die naar mij om in
   `.env` te zetten. Tot die tijd draait de webhook in DEV-mode (logt waarschuwing).

## 🟢 Build artifacts
- `index.html` cache-busters: alle `?v=54` → `?v=55` (25 stuks)
- `sw.js` VERSION: `v55-20260213-stripe-webhook-checkout-fix`
- Geen wijzigingen aan core bundle `pwa-v463-1780765770.js`

## 🧪 Backend testing (curl)
Alle 4 webhook-flows getest en groen:
- ✅ Eerste activatie via `checkout.session.completed`
- ✅ Idempotency: duplicate event-id wordt geskipt
- ✅ Renewal via `invoice.paid` verlengt `expires_ts`
- ✅ Cancel via `customer.subscription.deleted` zet `expires_ts = now`

## 📦 Installatie
1. Pak `paskamerpraat-pwa-v55-COMPLETE.zip` uit in de root van je hosting
   (alle bestanden komen direct in `/`, geen `pwa/` submap).
2. Wacht 1–2 minuten — service worker upgrade gaat automatisch dankzij
   `sw-auto-update-v1.js`.
3. Test de Premium-flow opnieuw via het hub-menu → "Upgrade naar Premium".
