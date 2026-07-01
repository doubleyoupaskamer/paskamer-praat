# Paskamer Praat v54 Release Notes
## Premium LIVE met Stripe Subscription + Customer Portal

**Release date:** 2026-02-13
**Cache-buster:** `?v=54` · **SW VERSION:** `v54-20260213-stripe-live-subscription-portal`

---

## 1. Premium is nu LIVE €4,99/maand recurring

### Backend wijzigingen (`premium_router.py`)
- Stripe key vervangen door `sk_live_...` (in `.env`)
- Stripe Price ID toegevoegd: `STRIPE_PRICE_PREMIUM_MONTHLY=price_1TghZsHCk5jZkAJeCYs8f4yG`
- Checkout flow herschreven naar Stripe SDK direct (i.p.v. emergentintegrations) zodat subscription mode correct werkt:
  - Mode: `subscription`
  - Line items: `[{price: price_1Tgh..., quantity: 1}]`
  - Subscription metadata: `user_key`, `email`, `source` voor webhook-koppeling
  - Customer email + reference id worden meegestuurd
- Status endpoint slaat nu ook `stripe_customer_id` en `stripe_subscription_id` op in `payment_transactions`
- Fallback amount in code: `4.99` (consistent met dashboard prijs)

### Frontend (premium-v1.js)
- Email-veld in upgrade modal is optioneel Stripe vraagt zelf op de hosted checkout pagina
- Geen wijzigingen aan UX-flow, alleen backend nu live

### Live checkout-URL voorbeeld
`https://checkout.stripe.com/c/pay/cs_live_a1b2mt16OFeVWdkRl...`

---

## 2. Customer Portal (cancel/manage abonnement)

### Endpoint
`POST /api/billing/portal?user_key={key}`
- Haalt laatste paid transactie op
- Haalt Stripe `customer_id` op uit de checkout session
- Maakt een Stripe Customer Portal sessie aan
- Returnt portal URL voor redirect

### Frontend
- Voor premium users verandert het hub-menu item van "Upgrade naar Premium" naar **"Beheer Premium abonnement"** met "Actief" pill
- Click → opent Stripe Customer Portal (jouw eigen branded pagina)
- Users kunnen: opzeggen, betaalmethode wijzigen, facturen downloaden

### Public API
- `window.DY.premium.openPortal()` open portal direct
- `window.DY.premium.openUpgrade()` open upgrade modal (zoals voorheen)

---

## 3. ⚠️ Stripe Dashboard configuratie vereist

Voordat alles werkt moet je **TWEE** dingen in je Stripe Dashboard doen (eenmalig):

### A) Customer Portal activeren
1. Ga naar https://dashboard.stripe.com/settings/billing/portal
2. Zorg dat je in **live mode** zit (toggle rechtsbovenin)
3. Configureer minimaal:
   - **Headline:** "Beheer je Paskamer Praat Premium"
   - **Allow customers to:** ✅ Cancel subscriptions · ✅ Update payment methods · ✅ View invoices
   - **Cancellation:** "Cancel at end of billing period" (zachte cancel meer retention dan instant)
4. Klik **Save**

### B) Anonymous Auth in Firebase (was al genoemd)
- Firebase Console → Authentication → Sign-in method → Anonymous → Enable

---

## 4. Test instructies LIVE

⚠️ **Echte betalingen!** Eerste test = jouw kaart wordt belast €4,99 (kun je direct refunden in Stripe Dashboard).

1. Upload `paskamerpraat-pwa-v54-COMPLETE.zip` naar je hosting
2. Wacht 5-10s voor service worker update
3. Open een feed-kaart → 3-puntjes menu → "👑 Upgrade naar Premium"
4. Vul je email in (optioneel kan ook op Stripe pagina)
5. Klik "Start Premium →"
6. Op Stripe-pagina: vul email + echte betaalkaart in
7. Bevestig betaling → redirect terug naar PWA met success-toast
8. Check Stripe Dashboard → Payments → zou €4,99 paid moeten zien
9. Refund via Stripe Dashboard → Refund → kies bedrag → refund (vermeld "test refund")
10. **Test cancel:** open hub-menu → "Beheer Premium abonnement" → Stripe Portal opent → cancel → check `/api/premium/status` → na 31 dagen vervalt premium

---

## 5. Bestanden gewijzigd

```
Backend:
  ~ premium_router.py           (~430 regels Stripe SDK direct, subscription + portal)
  ~ .env                        (STRIPE_API_KEY = sk_live_, STRIPE_PRICE_PREMIUM_MONTHLY = price_)

Frontend (changed):
  ~ js/premium-v1.js            (+ openCustomerPortal, hub-menu label switch)
  ~ index.html                  (cache-buster ?v=54)
  ~ sw.js                       (VERSION = v54)
```

**Geen wijzigingen aan:** core PWA bundle, andere companion scripts, auth-flow, AI endpoints, contrast palette uit v53.

---

## 6. Bekend gedrag / belangrijk om te weten

- **Email validatie:** Stripe LIVE rejecteert fake/example domains (`@example.com`, `@test.com`). Echte users hebben hier geen last van.
- **Test in LIVE mode:** geen `4242 4242 4242 4242` mogelijk alleen echte kaarten.
- **Customer Portal config:** als nog niet geconfigureerd, geeft endpoint een duidelijke error.
- **31-dagen TTL:** premium verloopt na 31 dagen tenzij webhook een nieuwe paid sessie binnenkrijgt. Voor robuustere subscription-tracking (auto-renewal) raden we aan om in een volgende update Stripe webhook `customer.subscription.updated` te wiren naar `expires_ts` update voor nu is polling + 31-dagen TTL prima werkbaar.
- **Webhook secret nog niet geconfigureerd** (jouw keuze 4b). Activation gebeurt via polling werkt prima, alleen een fractie minder failsafe als de browser direct na betaling crasht.
