# Shopify Wallet Top-up — Setup Guide

**Versie:** 1.0  •  **Datum:** 14 feb 2026  •  **Voor:** Doubleyou Merkenportaal

Deze gids leidt je in 3 stappen door de Shopify-integratie voor automatische
Wallet-top-ups. Eenmaal ingesteld werkt het volledig automatisch.

---

## 1. Variant-IDs ophalen in Shopify

Je hebt 4 producten aangemaakt (€25, €50, €100, €250). Voor elk product heeft
Shopify een unieke **Variant-ID** die we in de PWA invullen.

### 1A. Eenvoudigste manier (via URL)
1. Log in op je Shopify Admin: `https://admin.shopify.com/store/[jouw-store]`
2. Ga naar **Products** → klik op het top-up product (bv. "Wallet top-up €25")
3. Scroll naar het kopje **Variants**. Als er geen variants getoond worden
   (omdat er maar 1 is), staat de Variant-ID aan het einde van de browser-URL.

   Open de Developer Tools (F12) → Console → plak dit en druk Enter:

   ```javascript
   document.querySelector('[data-product-id]').dataset.productId
   ```

   Of, gemakkelijker: hover boven de "More actions" knop rechtsboven, klik en
   kies **"Preview"**. De preview-URL bevat dan `variants=NUMBERS` — dat is je ID.

### 1B. Via de admin-tabel (aanbevolen)
1. Ga naar **Products** → **All products**
2. Klik op het product "Wallet top-up €25"
3. Scroll naar **Pricing & inventory** → onder "Variants" zie je: SKU + een
   ID-getal in lichtgrijs (bv. `45623891234567`).
4. **Kopieer dat getal** — dat is de Variant-ID.

### 1C. Via de Shopify API (voor power-users)
```bash
curl -X GET "https://[STORE].myshopify.com/admin/api/2024-10/products.json" \
  -H "X-Shopify-Access-Token: shpat_..."
```

---

## 2. Variant-IDs invullen in de PWA

Open `/app/pwa/extensions/payments/pp-wallet-v1.js` en zoek de config-block
bovenaan (rond regel 35):

```javascript
var PP_SHOPIFY_TOPUPS = {
  shop_domain: 'doubleyousmallandtall.nl',
  variants: {
    '25':  '',   // <-- Variant-ID voor €25 top-up
    '50':  '',   // <-- Variant-ID voor €50 top-up
    '100': '',   // <-- Variant-ID voor €100 top-up
    '250': ''    // <-- Variant-ID voor €250 top-up
  },
  return_path: '/?pagina=wallet&topup=success'
};
```

Vul de 4 Variant-IDs in (alleen het getal, géén `gid://shopify/...` prefix):

```javascript
variants: {
  '25':  '45623891234567',
  '50':  '45623891234568',
  '100': '45623891234569',
  '250': '45623891234570'
}
```

Sla op, bump `?v=...` in `index.html` voor `pp-wallet-v1.js` (bv.
`?v=60.1.103-variants-set`), her-zip en upload naar Cloudflare Pages.

### Alternatief: configureren via Firestore (zonder redeploy)
In de Firestore console → collectie `admin_settings` → document `global`:
```json
{
  "shopify_config": {
    "shop_domain": "doubleyousmallandtall.nl",
    "variants": {
      "25":  "45623891234567",
      "50":  "45623891234568",
      "100": "45623891234569",
      "250": "45623891234570"
    }
  }
}
```
De PWA leest dit overzicht bij elke load — geen redeploy nodig.

---

## 3. Shopify Webhook instellen

Hierdoor wordt de Wallet automatisch bijgeschreven na een betaling.

1. Shopify Admin → **Settings** → **Notifications** → scroll naar **Webhooks**
2. Klik **Create webhook**
3. Vul in:
   * **Event**: `Order payment` (of `Order paid` — beide werken)
   * **Format**: `JSON`
   * **URL**: `https://<JOUW_BACKEND>/api/wallet/webhook/shopify`
     * Bijv: `https://api.doubleyou.app/api/wallet/webhook/shopify`
   * **API version**: `2024-10` (latest stable)
4. Klik **Save**
5. Shopify toont eenmalig een **"Signing secret"** (begint met `whsec_...`).
   Kopieer dit direct! Je krijgt het maar 1 keer te zien.

### 3A. Signing-secret in backend `.env` zetten
```bash
SHOPIFY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_SHOP_DOMAIN=doubleyousmallandtall.nl
```

Restart de backend:
```bash
sudo supervisorctl restart backend
```

### 3B. Webhook testen
In Shopify webhook-config klik **Send test notification**. Check daarna:
```bash
curl https://<JOUW_BACKEND>/api/wallet/health
```
Antwoord moet zijn:
```json
{ "shopify_webhook_secret_set": true, ... }
```

---

## 4. Firebase Service Account (voor automatische credit)

Zonder Firebase Admin credentials wordt elke betaling in een **MongoDB
wachtrij** geplaatst die je handmatig kunt uitlezen. Voor volledige automatie:

1. Ga naar **Firebase Console** → jouw project → **Project Settings** (tandwiel)
2. Tab **Service accounts** → **Generate new private key** → download JSON
3. Base64-encodeer het bestand:
   ```bash
   base64 -w0 service-account.json
   ```
   (op macOS: `base64 -i service-account.json`)
4. Voeg toe aan backend `.env`:
   ```bash
   FIREBASE_PROJECT_ID=jouw-project-id
   FIREBASE_SERVICE_ACCOUNT_JSON_B64=eyJhbGc...zeer-lange-string
   ```
5. Restart backend.

Check `/api/wallet/health`:
```json
{ "firebase_admin_ready": true }
```

---

## 5. End-to-end flow (na setup)

1. Brand-user opent **Merkenportaal → Wallet → Opwaarderen** tab
2. Klikt **€50**
3. Redirect naar `https://doubleyousmallandtall.nl/cart/[VARIANT_ID]:1?attributes[wallet_topup_uid]=ABC&...`
4. Shopify checkout flow (betaalmethode kiezen, betalen)
5. Shopify post `orders/paid` webhook → `/api/wallet/webhook/shopify`
6. Backend valideert HMAC, leest `note_attributes` met `wallet_topup_uid`,
   credit `users/ABC.wallet_balance += 50.00` atomically in Firestore
7. Klant keert terug naar `https://[pwa]/?pagina=wallet&topup=success`
8. PWA toont toast "Bedankt! Saldo wordt binnen 1 minuut bijgewerkt"
9. Wallet pagina ververst automatisch → nieuw saldo zichtbaar

---

## 6. Troubleshooting

### Webhook returns 401 "Invalid HMAC"
* `SHOPIFY_WEBHOOK_SECRET` matcht niet met wat Shopify gebruikt → check stap 3A
* Backend is herstart na het zetten van de env-var?

### Saldo wordt niet bijgewerkt
* Check `/api/wallet/health` → `firebase_admin_ready: true`?
* Check `/api/wallet/admin/queue` (met header `X-Admin-Secret: wivri`) →
  pending items met error?
* Re-credit handmatig: `POST /api/wallet/admin/replay/{order_id}` met
  header `X-Admin-Secret: wivri`

### Geen redirect na klik
* Variant-ID is leeg → vul in via stap 2
* Browser blokkeert popup → de nieuwe code redirect op mobiel in same-tab,
  op desktop in nieuw tabblad
