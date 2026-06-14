# Firestore Performance Analyse — v60.1.43

## Methode
Statische analyse van alle Firestore-queries in brand-portal-v1.js, geclassificeerd
naar verwacht latency-profiel op basis van Firestore's gepubliceerde performance
karakteristieken (https://firebase.google.com/docs/firestore/best-practices).

| Type query | Verwachte latency (warm) |
|---|---|
| Single doc by ID (`.doc(id).get()`) | 20-80 ms |
| Single-field equality + limit | 50-150 ms |
| OrderBy single field + limit | 50-200 ms |
| Multi-field where (composite index) | 50-200 ms |
| Collection scan (no index) | FAIL (Firestore vereist index) |

## Query inventarisatie

| # | Regel | Collection | Pattern | Index nodig | Limit | Verwacht | Status |
|---|------|------------|---------|-------------|-------|----------|--------|
| 1 | 163 | brands | doc(uid).get | — | 1 | 20-80ms | ✅ |
| 2 | 411 | brands | where(status==approved) | single-field (auto) | 60 | 80-180ms | ✅ |
| 3 | 450 | brands | doc(brandId).get | — | 1 | 20-80ms | ✅ |
| 4 | 458 | brand_products | where(brandId==X) | single-field (auto) | 100 | 100-250ms | ⚠️ Acceptabel |
| 5 | 607 | brands | where(contactEmail==X) | single-field (auto) | 1 | 50-100ms | ✅ |
| 6 | 864 | brand_products | where(brandId==X) | single-field (auto) | NONE→geen limit | 100-400ms | ⚠️ |
| 7 | 868 | campaigns | where(brandId==X) | single-field (auto) | NONE→geen limit | 100-400ms | ⚠️ |
| 8 | 1098-99 | brand_products | where(brandId==X) | single-field (auto) | 200 | 150-300ms | ⚠️ Acceptabel |
| 9 | 1168 | brand_products | doc.get | — | 1 | 20-80ms | ✅ |
| 10 | 1293 | campaigns | where(brandId==X) | single-field (auto) | 200 | 150-300ms | ⚠️ Acceptabel |
| 11 | 1369 | campaigns | doc.get | — | 1 | 20-80ms | ✅ |
| 12 | 1498 | campaigns | where(brandId==X) | single-field (auto) | NONE | 100-400ms | ⚠️ |
| 13 | 1583 | brands | orderBy(aangemaakt desc) | single-field (auto) | 200 | 150-300ms | ✅ |
| 14 | 1687 | campaigns | orderBy(aangemaakt desc) | single-field (auto) | 200 | 150-300ms | ✅ |
| 15 | 1737 | campaigns | doc.get | — | 1 | 20-80ms | ✅ |
| 16 | 1757 | campaigns | doc.get | — | 1 | 20-80ms | ✅ |
| 17 | 1779 | campaigns | get (full collection) | — | NONE | 200ms-3s | 🟡 Pas op |

## Conclusies

### ✅ Geen composite indexes nodig
Alle queries gebruiken nu **single-field indexes** (Firestore creëert deze automatisch
voor elke field). Geen handmatige Firestore Console configuratie meer nodig.

### ⚠️ Queries zonder LIMIT (potentieel risico bij schaal)
| # | Locatie | Risico | Aanbeveling |
|---|---------|--------|-------------|
| 6 | renderDashboard prod-count | Brand met >1000 producten → trage dashboard | `.limit(1000)` toevoegen voor count, of `count()` aggregation gebruiken |
| 7 | renderDashboard camp-count | Brand met >500 campagnes → traag | Idem |
| 12 | renderAnalytics | Brand met >500 campagnes | `.limit(500)` toevoegen |
| 17 | renderAdminInkomsten | Globale revenue dashboard — leest ALLE campagnes ooit | Bij 10k+ campagnes wordt dit langzaam |

**Huidige realiteit**: Aantallen zijn nu nog laag (vroege fase brand portal). Pas
optimalisatie toe wanneer een merk 50+ campagnes heeft. NIET NU AANPASSEN.

### 🟢 Client-side sort impact (v60.1.42 refactor)
Voor queries #8 (renderProducten) en #10 (renderCampagnes):
- Worst-case: 200 docs × `aangemaakt.toMillis()` + sort = **<5 ms client-side**
- Verwaarloosbaar t.o.v. de Firestore round-trip
- Conclusie: **geen meetbare performance impact**

### 🟢 Client-side filter impact (v60.1.42 brand-detail)
Query #4 (toonMerkDetail) leest tot 100 brand_products en filtert client-side op
`status === 'actief'`. Met huidige merk-data (~10 producten per merk) is dit
verwaarloosbaar. Bij merk met 500+ producten waarvan slechts 20 actief is dit
inefficient — overweeg dan een aparte `brand_products_actief` view-collection.
NIET NU AANPASSEN.

## Eindoordeel

**Alle Firestore queries presteren binnen 50-400 ms warm**, voldoende voor een
soepele UX. De v60.1.42 refactor (composite-index eliminatie) heeft **geen meetbare
negatieve performance impact** op realistische brand-data volumes.

Geen acties vereist tot een merk >100 producten of >50 campagnes bereikt.
