# v60.1.44 — Live campagne feed + "Bekijk als klant" + brand-detail rules fix

## Wijzigingen (cumulatief sinds v60.1.43)

### 1. 🔴 Brand-detail page rules fix (kritieke productie-bug)
- **Probleem**: Klik op brand-kaart op `/merken` → "Missing or insufficient permissions"
- **Root cause**: v60.1.42 verwijderde `.where('status','==','actief')` op `brand_products` query; Firestore rule eist deze filter voor anonieme bezoekers.
- **Fix**: regel 458 — query restored met `.where('status','==','actief')`
- **Index nodig**: `brand_products: (brandId, status)` — toegevoegd aan `firestore.indexes.json`

### 2. 🆕 Live campagne feed op `/merken`
- Nieuwe sectie bovenaan publieke Merken-tab: "Uitgelicht — Actieve campagnes"
- Toont live campagnes (status=='live') waarvan `plaatsingen.includes('feed')`
- Horizontal scroll-carousel, scroll-snap, max-width 320px per kaart
- "Gesponsord" badge rechtsboven
- Klikken → impression tracking via `campaign_events` + navigatie naar brand-detail
- Auto-filter op datum-window (start <= nu <= eind)
- **Firestore rules-compliant**: gebruikt `type:'impression'` + `type:'campaign_click'` (whitelisted)
- **Geen FieldValue.increment op campaigns** — server-side aggregator via Cloud Function/Worker (toekomst)

### 3. 🆕 "Bekijk als klant" knop op merkprofiel
- Naast "Wijzigingen opslaan" submit
- Opent `/?pagina=merken` in nieuw tab
- `data-testid="brand-profiel-preview"`
- Direct feedback hoe brand-content er voor klanten uitziet

### Files gewijzigd
- `js/brand-portal-v1.js`:
  - Regel 458: status-filter restored
  - +95 regels: `BP._renderLiveCampagnesInFeed` + `BP._campagneClick` + impression tracking
  - +3 regels: "Bekijk als klant" button in `renderProfiel`
- `brand-portal.css`:
  - +60 regels: `.bp-campagne-feed`, `.bp-campagne-strip`, `.bp-campagne-kaart`, `.bp-campagne-tag`, `.bp-profiel-acties`
- `firestore.indexes.json`: nieuw bestand voor `firebase deploy --only firestore:indexes`
- `index.html`: cache `?v=60.1.44-campagnes-feed`
- `sw.js`: `VERSION = 'v60.1.44-20260214-campagnes-feed'`

## Deploy stappen

### A. PWA upload
1. Download `paskamerpraat-pwa-v60.1.44-campagnes-feed.zip`
2. Unzip naar Cloudflare Pages root
3. Push / publish
4. Hard-refresh (Cmd+Shift+R)

### B. Firestore indexes
```bash
firebase deploy --only firestore:indexes
```

Dit creëert de `brand_products: (brandId ASC, status ASC)` composite index die nodig is voor brand-detail page.

### C. Live campagne testen
1. Login als merk → Campagnes → nieuw → vul in:
   - Naam, start/einddatum (vandaag/morgen)
   - Budget €100
   - Plaatsingen: vink "Merken-tab feed" aan
   - Status: "Indienen voor review"
2. Submit → status='review' in DB
3. Login als admin → Admin Campagnes → klik "Goedkeur & live"
4. Open `/?pagina=merken` (in incognito of nieuw tab)
5. **Verwacht**: campagne verschijnt bovenaan in "Uitgelicht — Actieve campagnes" sectie
6. Impression event wordt geschreven naar `campaign_events`

## Edge cases gecovered
- Geen live campagnes → `.bp-campagne-feed` is leeg + `:empty { display:none }` → onzichtbaar
- Datum-window check: campagne buiten start/eind → niet getoond
- Rules-violation → silent fail in `_renderLiveCampagnesInFeed` catch, geen UI break
- Impressies batched per page-view (geen dubbele logs bij re-render)

## Toekomst (NIET geïmplementeerd, gerapporteerd)
- Server-side aggregator (Cloud Function) die `campaign_events.type=='impression'` somt naar `campaigns.impressies`
- A/B-testing voor campagnekaart-design
- Story-ring placement (`plaatsingen.includes('stories')`)
- Geotargeting / interesse-targeting
