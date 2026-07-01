# Paskamer Praat v52 Release Notes (Premium + Wardrobe Recommender)

**Release date:** 2026-02-13
**Cache-buster:** `?v=52` · **SW VERSION:** `v52-20260213-premium-wardrobe-recommender`

---

## 1. Wardrobe Recommender "Wat te dragen deze week"

Een persoonlijke AI-flow die de **bewaarde items** (Mijn Garderobe) combineert
met **recente Style Scores** + een licht weersdetectie tot **3 outfit-picks**
per week. Non-invasief: gebruikt bestaande LocalStorage `dy_saved_posts`.

### Triggers
- **Auto:** Zondag-avond na 17:00 verschijnt een banner (één keer per ISO-week)
  als er ≥3 opgeslagen looks zijn.
- **Manueel:** Knop "✨ Wat draag ik deze week?" in de Mijn Garderobe overlay.
- **Programmatic:** `window.DY.wardrobeRecommend.open()`

### Limieten
- Gratis: **1 aanrader per week** (server-side rate-limit `429`).
- Premium: **onbeperkt**.

### Backend
- `POST /api/wardrobe/recommend` combineert saved_items + recent_scores +
  weather + occasion. Gebruikt Claude Sonnet 4.5 via Emergent LLM Key.
- Output: `{ week, intro, picks[3], based_on_saved, based_on_scores,
  is_premium, remaining_free_uses }`.

### Score capture
Lichte hook in `outfit-score-v1.js`: dispatcht
`window.dispatchEvent('dy-outfit-score-result')` na elke score.
`wardrobe-recommend-v1.js` luistert en bewaart de laatste 10 scores in
`localStorage.dy_recent_scores` (gebruikt als context voor de recommender).

---

## 2. Premium Tier (Stripe Checkout)

### Wat krijgt Premium?
- Onbeperkt Virtual Try-on
- Onbeperkt Style Score
- Onbeperkt Vergelijkbaar zoeken
- Onbeperkt AI Fit Chat
- Onbeperkt Wardrobe Recommender
- Premium badge op je profiel (frontend toggle)

**Prijs:** €6,99 / maand (one-shot in test-modus; recurring sub kan later via
Stripe Price ID worden uitgebreid).

### Architectuur
- Server-side fixed package `premium_monthly` (security: prijs nooit van frontend).
- Email-only checkout toegestaan geen Firebase login vereist.
- `user_key` = Firebase uid OF email OF anoniem device-session.
- Premium-status TTL: 31 dagen vanaf activatie.

### Backend endpoints
- `POST /api/checkout/session` maakt Stripe checkout
- `GET  /api/checkout/status/{sid}` pollt en activeert idempotent
- `POST /api/webhook/stripe` Stripe webhook (idempotent, dual-source met polling)
- `GET  /api/premium/status?user_key=...` check live status
- `GET  /api/premium/packages` lijst beschikbare pakketten

### Database collections (MongoDB)
- `payment_transactions` Stripe sessies (idempotency)
- `premium_users` `{ user_key, package, expires_ts, activated_ts }`
- `rate_limits` gratis tier rate-limit tracking

### Frontend
- **Floating Premium pill** (rechtsonder) verbergt naar "Premium ✓" badge na
  upgrade.
- **Upgrade modal** met perks-lijst + email input + Stripe redirect.
- **Garderobe CTA** banner bovenin Mijn Garderobe voor non-premium users.
- **Return polling** Stripe `?session_id=...` redirect wordt opgevangen,
  status wordt 6× gepolld (1.8s interval) en cleanup van URL params.

### Stripe config
- API key: `sk_test_emergent` (system pod env, auto-loaded).
- Currency: EUR.
- Payment method: card.
- Webhook URL: auto-generated `{host}/api/webhook/stripe`.

---

## 3. Bestanden gewijzigd

```
Backend (new):
  + /app/backend/premium_router.py       (10 KB)
  ~ /app/backend/server.py               (router include)

Backend env:
  + STRIPE_API_KEY=sk_test_emergent      (.env)

Frontend (new):
  + js/premium-v1.js                     (~14 KB)
  + js/wardrobe-recommend-v1.js          (~13 KB)

Frontend (changed):
  ~ js/outfit-score-v1.js                (event dispatch op resultaat)
  ~ index.html                           (cache-buster ?v=52 + 2 nieuwe scripts)
  ~ sw.js                                (VERSION = v52)
```

---

## 4. Test instructies

1. Upload `paskamerpraat-pwa-v52-COMPLETE.zip` naar je hosting.
2. Wacht 5-10s service worker detecteert v52 en herlaadt.
3. **Premium pill** verschijnt rechtsonder (👑 Premium €6,99).
4. **Test checkout flow:**
   - Klik op pill → upgrade modal opent.
   - Vul email in → klik "Start Premium →"
   - Stripe-checkout opent. Gebruik testkaart `4242 4242 4242 4242`, future date, any CVC.
   - Na betaling: redirect terug + success-toast verschijnt.
   - Pill verandert in groene "Premium ✓".
5. **Test wardrobe recommender:**
   - Bewaar ≥1 outfit via card-hub menu → Bewaar.
   - Open hub → Mijn Garderobe → "✨ Wat draag ik deze week?" → AI-picks.
6. **Test rate-limit (gratis):**
   - Vraag 2× recommend in dezelfde week → 2e geeft "Upgrade naar Premium" CTA.

---

## 5. Bekend & niet-gefixt (intentioneel)

- Sub-cancel-flow zit nog niet in UI; premium loopt automatisch af na 31 dagen.
  Toevoegen via `/api/premium/cancel` endpoint kan later.
- Anti-fraud: 1 email kan meerdere keren betalen geen duplicate-check.
- Webhook werkt alleen als Stripe je publieke URL kan bereiken. Polling is de
  primaire activation path (idempotent, race-condition-veilig).
