# v60.1.42 — Brand Portal: Firestore composite-index fix

## Probleem
Na het toevoegen van Firestore composite indexes brak het merkenportaal volledig:
- **"Kon campagnes niet laden — The query requires an index"** op `brand_campagnes`
- **"Kon producten niet laden"** op `brand_producten`
- Merklogo's / merkdetails niet correct geladen op publieke `/merken` detail-pagina

## Oorzaak
Drie Firestore-queries combineerden meerdere `where`/`orderBy` clauses op verschillende velden,
wat composite indexes vereist. De handmatig toegevoegde indexen matchten waarschijnlijk niet
exact met de gebruikte veldnamen in de code (`aangemaakt` ≠ `createdAt`).

| # | Locatie | Query | Vereiste index |
|---|---|---|---|
| 1 | `BP.renderProducten` (regel 918) | `brand_products.where('brandId').orderBy('aangemaakt')` | `brandId ASC + aangemaakt DESC` |
| 2 | `BP.renderCampagnes` (regel 1104) | `campaigns.where('brandId').orderBy('aangemaakt')` | `brandId ASC + aangemaakt DESC` |
| 3 | `BP.toonMerkDetail` (regel 454) | `brand_products.where('brandId').where('status')` | `brandId ASC + status ASC` |

## Fix (minimale patch — geen DB-wijzigingen nodig)
Alle 3 queries gebruiken nu **alleen één `where()` clause** (alleen `brandId`), gevolgd door
**client-side sortering / filtering**. Aangezien resultaten al gelimiteerd zijn tot 24/50/100 items,
is dit performant en elimineert het de composite-index requirement volledig.

Geen extra Firebase Console acties nodig — de portal werkt direct na deploy.

## Files
- `js/brand-portal-v1.js` — 3 query refactors (client-side sort/filter)
- `index.html` — cache version bump: `?v=60.1.42-brand-portal-index-fix`
- `sw.js` — `VERSION = 'v60.1.42-20260214-brand-portal-index-fix'`

## Backwards compat
Alle bestaande Firestore indexen blijven werken (queries zijn een subset van wat ze ondersteunen).
Veilig om bestaande composite indexes te laten staan of te verwijderen — beide werken.
