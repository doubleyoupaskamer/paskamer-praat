# v60.1.44 Brand Portal Firestore rules fix (publieke brand-detail)

## Probleem (gevonden tijdens E2E productie-validatie)
Klik op een merk-kaart op `/merken` toonde:
> "Fout bij laden Missing or insufficient permissions"

## Root cause
De v60.1.42 refactor verwijderde `.where('status','==','actief')` uit de
brand-products query op de publieke brand-detail page (regel 458). Doel was
om de composite index `brand_products: brandId+status` te vermijden.

**MAAR**: de Firestore rule staat lezen alleen toe voor:
```
match /brand_products/{productId} {
  allow read: if (resource.data.status == 'actief') ...
}
```

Firestore vereist dat de query SERVER-SIDE garandeert dat alleen rule-compliant
docs worden teruggegeven. Een query zonder `where('status')` filter kan
docs met status='concept' of 'verwijderd' ophalen die de rule blokkeert.
Resultaat: hele query failt met `permission-denied`.

## Fix
Herstel de `.where('status','==','actief')` clause. Vereist composite index
`brand_products: (brandId ASC, status ASC)` toegevoegd aan
`firestore.indexes.json` voor 1-commando deploy via Firebase CLI.

```js
// regel 455-462
var pSnap = await DY.db.collection('brand_products')
  .where('brandId','==', brandId)
  .where('status','==','actief')   // ← terug
  .limit(24).get();
```

## Waarom de rest van de v60.1.42 fix WEL goed blijft
De andere 2 queries (`renderProducten` regel 919, `renderCampagnes` regel 1098)
zijn voor de **eigen** brand van de ingelogde owner. Rule staat de owner toe
om ALLE statussen te lezen (zie regels 580 en 607 in firestore.rules):
```
allow read: if ... || (isIngelogd() && resource.data.brandId == request.auth.uid) ...
```
Dus daar werkt de client-side sort ZONDER status-filter prima.

## Index deploy
Twee opties voor de user:

### Optie A Firebase CLI (aanbevolen)
```bash
firebase deploy --only firestore:indexes
```

### Optie B Handmatig in Firebase Console
1. Open Firebase Console → Firestore → Indexes
2. Klik "Create index"
3. Collection: `brand_products`
4. Fields: `brandId` (Ascending), `status` (Ascending)
5. Query scope: Collection
6. Wacht ~2-5 min op index-build

Als deze index er **al was** (van de "7 indexes" die de user toevoegde),
dan werkt de page direct na deploy.

## Files
- `js/brand-portal-v1.js` regel 458 query restored
- `firestore.indexes.json` nieuw, voor `firebase deploy --only firestore:indexes`
- `index.html` cache version bump `?v=60.1.44-rules-fix`
- `sw.js` `VERSION = 'v60.1.44-20260214-rules-fix'`

## E2E test resultaten (v60.1.43 productie)
- ✅ `/merken` route → 2 approved brands gerendered (Hqjwjh, williamn)
- ✅ JS version correct: `brand-portal-v1.js?v=60.1.43-merkprofiel`
- ✅ `renderProfiel` function bestaat in DY.brandPortal
- ✅ Geen JS console errors
- 🔴 Klik op brand-card → "Missing or insufficient permissions" → FIXED in v60.1.44
- ⏳ Brand-user flow (login → dashboard → profiel) → kan niet testen zonder brand-credentials
- ⏳ Admin moderation flow → kan niet testen zonder admin-password
