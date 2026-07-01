# PaskamerPraat Extensions Pack v1.0.0
**Datum**: 14 februari 2026
**Doel**: Production-ready uitbreiding zonder bestaande code te wijzigen.

═══════════════════════════════════════════════════════════════════════
INHOUD VAN DE PACK
═══════════════════════════════════════════════════════════════════════

```
/app/pwa/extensions/
├── firestore/                      ← Systeem 1: Data audit
│   ├── users/                       (missing_fields, recommended_indexes, data_contract)
│   ├── campaigns/                   (idem)
│   ├── events/                      (idem)
│   ├── outfits/                     (idem)
│   ├── payments/                    (idem)
│   └── admin_settings/              (idem)
├── analytics/                       ← Systeem 2: Event aggregator
│   ├── aggregator-worker.js         (Cloudflare Worker, cron */15 min)
│   ├── wrangler.toml
│   └── package.json
├── placements/                      ← Systeem 3: Placements helper
│   ├── pp-placements-v1.js          (window.PP_Placements API)
│   └── README.md
├── hooks/                           ← Systeem 4: AI engine hooks
│   ├── pp-engine-hooks-v1.js        (frontend: scoreOutfit, askStyleAssistant, findSimilarItems)
│   └── extensions_ai.py             (backend FastAPI router; vereist integration_playbook)
├── payments/                        ← Systeem 5: Wallet + Shopify
│   └── extensions_wallet.py         (backend FastAPI router)
├── admin/                           ← Systeem 6: Admin panel modules
│   ├── pp-admin-ext-v1.js           (admin_wallet / admin_payments / admin_placements routes)
│   └── pp-admin-ext.css
└── SETUP_GUIDE.md                   ← Dit document
```

═══════════════════════════════════════════════════════════════════════
HARDE GARANTIES
═══════════════════════════════════════════════════════════════════════
- ❌ Geen enkele regel in bestaande code gewijzigd (verifieer met `git diff`)
- ❌ Geen breaking changes alles is additive
- ✅ Alle modules werken met `window.PP_*` namespaces
- ✅ Routes geregistreerd via wrapper, niet via BP_PAGES mutatie
- ✅ Backend routers worden geïncludeerd met 1 regel server.py niet herschreven
- ✅ Idempotent backend logic (aggregator + Shopify webhook)
- ✅ Schaalbaar (Cloud Worker + batched Firestore writes)

═══════════════════════════════════════════════════════════════════════
DEPLOY-STAPPEN (in volgorde)
═══════════════════════════════════════════════════════════════════════

## STAP 1 Firestore Schema Updates
Voeg de gerecommendeerde indexes toe via Firebase CLI:

```bash
# Combineer alle recommended_indexes.json bestanden in firestore.indexes.json
cd /app/pwa/extensions/firestore
node -e "
const fs = require('fs');
const collections = ['users','campaigns','events','outfits','payments','admin_settings'];
const all = [];
collections.forEach(c => {
  const j = JSON.parse(fs.readFileSync(c + '/recommended_indexes.json'));
  (j.recommended_indexes || []).forEach(idx => {
    all.push({
      collectionGroup: idx.collectionGroup,
      queryScope: idx.scope || 'COLLECTION',
      fields: idx.fields
    });
  });
});
fs.writeFileSync('/tmp/firestore.indexes.json', JSON.stringify({ indexes: all, fieldOverrides: [] }, null, 2));
"
firebase deploy --only firestore:indexes
```

## STAP 2 Firestore Rules update (handmatig)
Voor elke `data_contract.json`, kopieer de "rules_changes_required" naar je
`firestore.rules` file. Voorbeeld voor users:

```javascript
match /users/{userId} {
  allow read: if request.auth.uid == userId || isAdmin();
  allow update: if request.auth.uid == userId
                && !request.resource.data.diff(resource.data).affectedKeys()
                  .hasAny(['wallet_balance','transactions','shopify_customer_id','outfit_stats','role']);
  allow create: if request.auth.uid == userId;
}
match /payments/{id} { allow read: if isOwner(resource.data.uid) || isAdmin(); allow write: if false; }
match /events/{id} {
  allow create: if request.resource.data.type in ['impression','product_click','campaign_click','outfit_view','outfit_review','ai_query','similar_view','purchase'];
  allow read:   if isAdmin();
  allow update: if false;  // server-only via aggregator
}
match /admin_settings/{id} {
  allow read:  if true;     // public read placements_enabled + feature_flags
  allow write: if isAdmin();
}
match /outfits/{id} {
  allow read: if resource.data.visibility != 'private' || resource.data.uid == request.auth.uid;
  allow create: if request.auth.uid == request.resource.data.uid;
  allow update: if request.auth.uid == resource.data.uid
                && !request.resource.data.diff(resource.data).affectedKeys()
                  .hasAny(['ai_score','ai_score_breakdown','similar_items','color_palette','occasion_tags','reviews_aggregate']);
}
```

Daarna: `firebase deploy --only firestore:rules`

## STAP 3 Event Aggregator deployen
```bash
cd /app/pwa/extensions/analytics
yarn install
wrangler login
wrangler secret put FIRESTORE_PROJECT_ID            # bv. doubleyou-journal
wrangler secret put FIRESTORE_SERVICE_ACCOUNT_JSON_B64  # base64(service-account.json)
wrangler secret put ADMIN_TRIGGER_SECRET             # random uuid
wrangler deploy
# Cron is automatisch: */15 * * * *
```

**Service account aanmaken**:
1. Firebase Console → Project settings → Service accounts → "Generate new private key"
2. Download JSON
3. `base64 -i service-account.json | tr -d '\n' > sa.b64`
4. `wrangler secret put FIRESTORE_SERVICE_ACCOUNT_JSON_B64 < sa.b64`

**Trigger handmatig**:
```bash
curl -X POST https://pp-event-aggregator.<jouwsubdomain>.workers.dev/run-now \
  -H "X-Admin-Secret: <ADMIN_TRIGGER_SECRET>"
```

## STAP 4 Placements helper aanzetten
Voeg ÉÉN regel toe vóór `</body>` in je deployment van `index.html`:

```html
<script defer src="/extensions/placements/pp-placements-v1.js?v=1.0.0"></script>
```

API direct beschikbaar:
```js
PP_Placements.isPlacementEnabled(currentUser, 'stories');
PP_Placements.isPlacementActive('ai_assist');
```

## STAP 5 AI Engine hooks
Frontend:
```html
<script defer src="/extensions/hooks/pp-engine-hooks-v1.js?v=1.0.0"></script>
```

Backend voeg 2 regels toe aan `/app/backend/server.py`:
```python
from extensions.hooks.extensions_ai import ai_router
app.include_router(ai_router)
```

**Endpoints initieel 501 (Not Implemented)**. Volgende stap:
- Run `integration_playbook_expert_v2` voor "gemini-3-pro vision" → krijg
  emergentintegrations code → vervang de 501-stubs met echte Gemini calls.

## STAP 6 Wallet + Shopify Payments
Backend voeg toe aan `/app/backend/server.py`:
```python
from extensions.payments.extensions_wallet import wallet_router
app.include_router(wallet_router)
```

**Environment variables (NIET in code hard-coden)**:
Voeg toe aan `/app/backend/.env`:
```
SHOPIFY_SHOP_DOMAIN=jouwwinkel.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxxxxxxxxxxxxx
SHOPIFY_WEBHOOK_SECRET=jouw_webhook_signing_secret
SHOPIFY_TOPUP_VARIANT_DEFAULT_ID=gid://shopify/ProductVariant/123
WALLET_BACKEND_SECRET=lange_random_string_voor_admin_endpoints
FIREBASE_PROJECT_ID=doubleyou-journal
FIREBASE_SERVICE_ACCOUNT_JSON_B64=<base64-encoded service account>
```

**Shopify configuration**:
1. Shopify Admin → Apps → Develop apps → Create app
2. Configure Admin API scopes:
   - `read_orders`, `write_draft_orders`
   - `read_customers`, `write_customers`
3. Install app → kopieer Admin API access token (`shpat_...`)
4. Webhooks → Create webhook:
   - Event: `Order paid`
   - Format: JSON
   - URL: `https://jouw-domain.com/api/wallet/webhook/shopify`
   - Kopieer webhook secret
5. Create "Wallet Topup" product met variant van €0.01 (custom amount)

**Firebase Admin SDK** (in extensions_wallet.py):
De huidige `_firestore_*` helpers retourneren 501. Vervang met `firebase-admin`:
```bash
pip install firebase-admin
```
```python
import firebase_admin
from firebase_admin import credentials, firestore as fa_firestore
cred = credentials.Certificate(json.loads(base64.b64decode(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON_B64"])))
firebase_admin.initialize_app(cred)
fdb = fa_firestore.client()
```

## STAP 7 Admin Panel Modules
Voeg toe vóór `</body>` in `index.html`:
```html
<link rel="stylesheet" href="/extensions/admin/pp-admin-ext.css?v=1.0.0">
<script defer src="/extensions/admin/pp-admin-ext-v1.js?v=1.0.0"></script>
```

Daarna navigeer-bare routes:
- `?pagina=admin_wallet`     → User wallet management + manual adjust
- `?pagina=admin_payments`   → Shopify orders overview
- `?pagina=admin_placements` → Per-placement kill-switches

## STAP 8 Verifieer
```bash
# Frontend modules geladen
curl https://paskamerpraat.nl/ -s | grep -E "pp-placements|pp-engine-hooks|pp-admin-ext"

# Backend endpoints
curl https://jouw-backend/api/ai/health
curl https://jouw-backend/api/wallet/health
```

═══════════════════════════════════════════════════════════════════════
ENVIRONMENT VARIABLES OVERZICHT
═══════════════════════════════════════════════════════════════════════

### Cloudflare Worker (aggregator)
| Var | Type | Bron |
|-----|------|------|
| FIRESTORE_PROJECT_ID | string | Firebase project id |
| FIRESTORE_SERVICE_ACCOUNT_JSON_B64 | base64 | Service account JSON, base64-encoded |
| ADMIN_TRIGGER_SECRET | string | Random uuid voor /run-now endpoint |

### Backend (FastAPI .env)
| Var | Type | Bron |
|-----|------|------|
| EMERGENT_LLM_KEY | string | Reeds aanwezig voor AI hooks |
| SHOPIFY_SHOP_DOMAIN | string | Shopify admin → Domain |
| SHOPIFY_ADMIN_API_TOKEN | string | Custom app → Admin API token |
| SHOPIFY_WEBHOOK_SECRET | string | Shopify webhook signing secret |
| SHOPIFY_TOPUP_VARIANT_DEFAULT_ID | string | Shopify Topup product variant GID |
| WALLET_BACKEND_SECRET | string | Random voor admin endpoints |
| FIREBASE_PROJECT_ID | string | Firebase project id |
| FIREBASE_SERVICE_ACCOUNT_JSON_B64 | base64 | Service account JSON |

═══════════════════════════════════════════════════════════════════════
WAT NOG OPEN STAAT (handoff voor latere fases)
═══════════════════════════════════════════════════════════════════════

1. **AI Engine implementation** (501 stubs):
   Run `integration_playbook_expert_v2 query="Gemini 3 Pro Vision via Emergent LLM Key"` →
   krijg emergentintegrations code → vervang stubs in `extensions_ai.py`.

2. **Firebase Admin SDK init** in `extensions_wallet.py`:
   De `_firestore_*` helpers zijn nu 501-stubs. Voeg `firebase-admin` installatie +
   initialisatie toe (zie STAP 6).

3. **Brand_products embeddings** voor similar-items engine:
   Periodieke cron-job die nieuwe brand_products door Gemini Vision haalt en
   embedding-vector opslaat (in nieuwe `brand_products_embeddings` collection).

4. **Wallet topup frontend UI**:
   Voeg button "Saldo opwaarderen" toe in user-profiel die `/api/wallet/topup/checkout`
   aanroept en de `checkout_url` opent.

5. **Outfit Review UI** koppeling `PP_Engine.scoreOutfit()` is API-ready maar
   nog niet aangeroepen vanuit bestaande outfit-detail pagina.

═══════════════════════════════════════════════════════════════════════
TESTING CHECKLIST
═══════════════════════════════════════════════════════════════════════

- [ ] Firestore indexes deployed (`firebase firestore:indexes`)
- [ ] Aggregator worker draait (`wrangler tail` toont elke 15 min run)
- [ ] `PP_Placements` global aanwezig in browser console
- [ ] Admin routes navigeerbaar (`/admin_wallet`, `/admin_payments`, `/admin_placements`)
- [ ] Shopify webhook test: gebruik Shopify webhook test-knop → controleer `/payments` collection
- [ ] Manual wallet adjust werkt vanuit admin panel
- [ ] AI hooks endpoints retourneren 501 met heldere foutmelding (verwacht totdat geïmplementeerd)

═══════════════════════════════════════════════════════════════════════
END OF SETUP GUIDE
═══════════════════════════════════════════════════════════════════════
