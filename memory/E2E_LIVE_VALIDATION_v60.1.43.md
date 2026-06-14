# E2E Productie-Validatie Rapport — v60.1.43

**Datum**: 14 juni 2026  
**Tester**: Geautomatiseerd via Playwright tegen live productie  
**URL**: https://paskamerpraat.nl  
**Deployed versie**: brand-portal-v1.js?v=60.1.43-merkprofiel

═══════════════════════════════════════════════════════════════════════
1. BRAND USER FLOW
═══════════════════════════════════════════════════════════════════════

| # | Stap | Verwacht | Werkelijk | Status |
|---|------|----------|-----------|--------|
| 1 | Firebase Auth login (william) | Login succesvol | uid `vpEOxNajQ1Mu3iPiGZnkPg1asGc2` ingelogd | ✅ |
| 2 | Brand-doc bestaat voor uid | brand record gevonden | naam=williamn, status=approved, categorie=Tall fashion | ✅ |
| 3 | Navigate `brand_dashboard` | dashboard rendert | h1=williamn, 6 stat-kaarten, 4 quick-buttons | ✅ |
| 4 | Klik **Merkprofiel** | nieuwe v60.1.43 pagina | `pagina=brand_profiel`, h1=Merkprofiel | ✅ |
| 5 | Pre-fill velden | bestaande data laadt | 11 velden gevuld (naam, contact, email, website, instagram, tiktok, categorie, btw, omschr) | ✅ |
| 6 | Logo preview | toont initialen want logo='' | "WI" badge zichtbaar | ✅ |
| 7 | Telefoon-veld bewerken + submit | toast + DB update + redirect | telefoon `[TEST] 0612345678` opgeslagen, laatsteUpdate ISO timestamp, redirect → brand_dashboard | ✅ |
| 8 | Producten lijst | empty state + CTA | h1=Producten, "Nog geen producten" + `brand-product-nieuw` btn | ✅ |
| 9 | Producten form | 12 testid-velden | titel, cat, omschr, prijs, stock, maten, kleuren, url, tracking, imgs, status, submit | ✅ |
| 10 | Campagnes lijst | empty state + CTA | h1=Campagnes, "Nog geen campagnes" + `brand-camp-nieuw` btn | ✅ |
| 11 | Campagne form | 15 testid-velden | naam, start, eind, budget, dagbudget, bied, doel, 5x plaats-*, msg, status, submit | ✅ |
| 12 | Analytics | 4 stat-kaarten + CSV export | h1=Analytics, 4 kaarten, `brand-analytics-export` button | ✅ |
| 13 | Test-data cleanup | telefoon='' gereset | Bevestigd via Firestore set merge | ✅ |

═══════════════════════════════════════════════════════════════════════
2. ADMIN MODERATION FLOW
═══════════════════════════════════════════════════════════════════════

| # | Stap | Verwacht | Werkelijk | Status |
|---|------|----------|-----------|--------|
| 1 | `isAdmin()` check | true voor william | DY._isAdmin() === true | ✅ |
| 2 | `admin_brands` page | brands lijst | 3 brand-rows: Testacci, Hqjwjh, williamn | ✅ |
| 3 | Status-secties | gegroepeerd | "Goedgekeurd (3)" sectie | ✅ |
| 4 | Approve buttons | alleen op pending | 0 approve btns (geen pending brands) | ✅ |
| 5 | Reject/Suspend buttons | op approved/!eigen | 2 reject + 2 suspend (op Testacci+Hqjwjh, NIET op williamn) | ✅ |
| 6 | **Separation of duties UI** | eigen brand → warning badge | ⚠ "Eigen aanvraag — vereist tweede admin" badge op williamn | ✅ |
| 7 | `admin_campagnes` page | campagne lijst | 2 campagne rijen | ✅ |
| 8 | `admin_inkomsten` page | revenue dashboard | 4 stat-kaarten (Vandaag, Maand, Totaal, Actieve), tabel met Hqjwjh+Testacci spend | ✅ |

═══════════════════════════════════════════════════════════════════════
3. PERFORMANCE CHECK
═══════════════════════════════════════════════════════════════════════

### Gemeten responsetijden (subjectief, via Playwright wait)
| Page | Cold load | Warm load |
|------|-----------|-----------|
| brand_dashboard | ~3s (incl auth state propagation) | <1s |
| brand_profiel | <1s | <500ms |
| brand_producten | <1s | <500ms |
| admin_brands | ~2s (200 docs scan + render) | <1s |
| admin_inkomsten | ~2s (full campaigns collection scan) | ~1.5s |

### Analyse (uit /app/memory/PERFORMANCE_AUDIT_v60.1.43.md)
- ✅ Alle queries 20-400ms warm (binnen Firestore best-practices)
- ✅ Client-side sort/filter overhead <5ms (verwaarloosbaar)
- ⚠️ `admin_inkomsten` leest hele campaigns collection — bij >10k campagnes traag (huidige: <10 docs, OK)
- ⚠️ Dashboard count queries hebben geen LIMIT — bij brand met >1000 producten/campagnes traag

### Aanbevelingen (NIET nu nodig)
1. Voeg `.limit(1000)` toe op dashboard count queries
2. Implementeer Firestore `count()` aggregation API i.p.v. `.get().size`
3. Refactor admin_inkomsten naar cached/aggregated documents bij schaal

═══════════════════════════════════════════════════════════════════════
4. CONSOLE / JS ERRORS
═══════════════════════════════════════════════════════════════════════

- ✅ Geen JavaScript runtime errors tijdens enige flow
- ✅ `window.__bpErrors` is leeg
- ✅ Geen 404s op JS/CSS resources
- ✅ JS versie: `brand-portal-v1.js?v=60.1.43-merkprofiel` correct

═══════════════════════════════════════════════════════════════════════
5. PRODUCTIE BUG — DEEL VAN v60.1.43 (gefixt in lokale v60.1.44)
═══════════════════════════════════════════════════════════════════════

**Reproduceer**: Niet-ingelogd bezoeker → /merken → klik brand-kaart → "Missing or insufficient permissions"

**Root cause**: v60.1.42 verwijderde `.where('status','==','actief')` uit `brand_products` query op publieke brand-detail. Firestore rule eist deze filter (rule allow read alleen voor `status=='actief'`). Zonder filter weigert Firestore de hele query.

**Fix in v60.1.44** (lokaal, gereed voor deploy):
- `js/brand-portal-v1.js` regel 458: where('status','==','actief') terug
- `firestore.indexes.json`: composite index `brand_products: brandId + status`

**Deploy actie nodig**:
```bash
firebase deploy --only firestore:indexes
# + upload paskamerpraat-pwa-v60.1.44-rules-fix.zip naar Cloudflare
```

═══════════════════════════════════════════════════════════════════════
6. MOBILE RESPONSIVE — TOOL LIMITATION
═══════════════════════════════════════════════════════════════════════

⚠️ **Tool-beperking gevonden**: De Playwright-screenshot tool overschrijft viewport
naar 1920px ondanks `page.set_viewport_size({width:375, height:667})`. Visuele
mobile verificatie was niet mogelijk via tool.

**Statische CSS validatie** (uit code-audit /app/memory/E2E_STATIC_AUDIT_v60.1.43.md):
- ✅ `@media (max-width: 600px)`: dash-header + merk-hero flex-wrap correct
- ✅ `@media (max-width: 380px)`: grids minmax(130px) + stat-grid 2-col correct
- ✅ Global `word-break: break-word` op h1/h2 correct
- ✅ `.bp-list-rij` flex-wrap op mobiel correct (regel 309 css)

**Aanbevolen handmatige test**:
1. Open paskamerpraat.nl op telefoon of Chrome DevTools (F12 → Toggle device toolbar)
2. Selecteer iPhone SE (375x667)
3. Verifieer: brand_dashboard, brand_profiel, /merken — geen horizontal scroll, geen clipping

═══════════════════════════════════════════════════════════════════════
EINDOORDEEL
═══════════════════════════════════════════════════════════════════════

| Categorie | Score | Status |
|-----------|-------|--------|
| Brand user flow | 13/13 | ✅ Volledig werkend |
| Admin moderation | 8/8 | ✅ Volledig werkend |
| Separation-of-duties | ✅ | UI guard actief op eigen brand |
| Merkprofiel (nieuw v60.1.43) | ✅ | Pre-fill + save + redirect bevestigd |
| Performance | ✅ | Binnen verwachte latency |
| Console errors | ✅ | Geen |
| Mobile (statisch) | ✅ | CSS correct |
| Mobile (visueel) | ⚠️ | Tool-beperking — handmatig nodig |
| Publieke brand-detail | 🔴 | Gefixt in v60.1.44, niet deployed |

**🎯 Brand portal v60.1.43 is production-ready voor brand-users en admins.**
**🚨 v60.1.44 deploy aanbevolen voor publieke brand-detail page fix.**
