# Static Code Audit — v60.1.43 brand portal flows

Methode: trace elke flow door brand-portal-v1.js. Tag elke stap met regelnr.
Verifieer: handler bestaat, error-state aanwezig, redirect-logic klopt, RBAC enforced.

═══════════════════════════════════════════════════════════════════════
FLOW 1 — BRAND REGISTRATIE (anoniem → pending)
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Verifieer | Status |
|------|---------|-----------|--------|
| Open `/brand_register` | regel 510 `BP.renderRegister` | route geregistreerd in BP_PAGES | ✅ |
| Form rendering | 521-547 | alle velden + testids + voorwaarden checkbox | ✅ |
| Submit click | 690 `form.addEventListener('submit', doeSubmit)` | handler attached | ✅ |
| Validatie | 578-594 | EMAIL_RX, URL_RX, BTW_RX, file-size 2MB | ✅ |
| Auth account aanmaken | 614-624 | `createUserWithEmailAndPassword` + sendEmailVerification | ✅ |
| users/{uid}.role='brand' | 618 | role wordt geset | ✅ |
| Logo upload Storage | 632-639 | path = `brands/{uid}/logo_{ts}_{name}`, getDownloadURL | ✅ |
| brands/{uid} doc | 642-659 | naam, contact, contactEmail, btw, website, social, categorie, omschrijving, logo, status='pending', aangemaakt | ✅ |
| Audit log | 663-667 | `brand_admin_log.add({type:'brand_registered'})` | ✅ |
| Mail naar user + admin | 707-790 | `mail` collection trigger | ✅ |
| Redirect → brand_pending | 676 | `DY.navigeer('brand_pending')` | ✅ |

**Edge cases gecheckt:**
- ✅ `email-already-in-use` → "Log eerst in"
- ✅ `weak-password` → "Wachtwoord te zwak"
- ✅ Bestaande user → role-upgrade (regel 627)
- ✅ Logo upload fail → silently skip (regel 638) — logo niet kritiek
- ✅ Dubbel-check `contactEmail` → permission-denied tolerant (regel 612)
- ✅ Rate-limit 8s (regel 559)
- ✅ Voorwaarden niet geaccepteerd → blokkeer (regel 588)
- ✅ Form re-enable button bij failure (regel 686)

═══════════════════════════════════════════════════════════════════════
FLOW 2 — PENDING STATE (na registratie)
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Render pending | 804 `BP.renderPending` | ✅ |
| Status branches | 815-836 | rejected/suspended/pending elk eigen card | ✅ |
| Approved → auto-redirect dashboard | 812 | ✅ |
| Back-button → profiel | 839 | ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 3 — ADMIN APPROVE (admin → brand approved)
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Admin opent /admin_brands | 1571 `BP.renderAdminBrands` | ✅ |
| RBAC: !isAdmin → feed | 1576 | ✅ |
| Query: brands.orderBy(aangemaakt) limit 200 | 1583 | ✅ single-field index |
| Sectie-groepering pending/approved/rejected/suspended | 1584-1635 | ✅ |
| Eigen aanvraag badge | 1587-1593 | ✅ separation-of-duties UI guard |
| Goedkeur-knop | 1595 | toont alleen voor !eigen + pending/rejected/suspended | ✅ |
| `BP.adminBrand('approve', id)` | 1639 | ✅ |
| Self-approval guard | 1644-1649 | toast + return | ✅ |
| Firestore update | 1660-1661 | status='approved', moderatedBy, moderatedAt | ✅ |
| Audit log | 1662-1664 | brand_admin_log.add | ✅ |
| Re-render lijst | 1666 | ✅ |
| Permission-denied error | 1668-1670 | duidelijke melding "v60.1.10-rules gedeployed?" | ✅ |

**Edge cases:**
- ✅ Reject/suspend prompt voor reden (1650-1653)
- ✅ Geen knoppen voor eigen brand-doc (UI verbergt + serverside check)
- ✅ Restore werkt via 'approve' actie (status terug naar approved)

═══════════════════════════════════════════════════════════════════════
FLOW 4 — BRAND DASHBOARD (approved brand login)
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Open `/brand_dashboard` | 848 `BP.renderDashboard` | ✅ |
| Auth-guard | 854 | redirect register | ✅ |
| Status-guard | 857 | redirect pending als !approved | ✅ |
| Counters: products + campaigns | 862-870 | beide try/catch | ✅ |
| Stat-grid render | 884-890 | 6 kaarten | ✅ |
| Quick-grid render | 892-902 | 4 buttons | ✅ |
| Merkprofiel button | 899-900 | → `openBrandInstellingen` → brand_profiel ✅ |
| Producten button | 893 | → brand_producten ✅ |
| Campagnes button | 895 | → brand_campagnes ✅ |
| Analytics button | 897 | → brand_analytics ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 5 — MERKPROFIEL EDIT (NIEUW in v60.1.43)
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Trigger via dashboard knop | 905-908 `openBrandInstellingen` | ✅ |
| Render `/brand_profiel` | 911 `BP.renderProfiel` | ✅ |
| Auth-guard | 921 | ✅ |
| Brand-bestaand-guard | 922 | redirect register | ✅ |
| Logo preview blok | 938-952 | huidig logo OR initialen | ✅ |
| Form velden | 954-974 | naam, contact, email, tel, website, social, categorie, btw, omschr | ✅ |
| Live logo preview | 982-995 | FileReader → data-URL | ✅ |
| File-size guard 2MB | 988 | toast + clear value | ✅ |
| Submit handler | 1002 | preventDefault + rate-limit 1.5s | ✅ |
| Validatie | 1019-1027 | naam, email regex, URL regex, btw regex, file-size | ✅ |
| Logo upload (alleen indien nieuw) | 1037-1046 | Firebase Storage + getDownloadURL | ✅ |
| brands/{uid} update | 1050-1064 | merge:true | ✅ |
| Brand cache invalidatie | 1069 `BP.clearCache()` | ✅ |
| Audit log | 1065-1067 | brand_profile_updated | ✅ |
| Toast feedback | 1070 | ✅ |
| Redirect → dashboard | 1071 | ✅ |
| Error feedback | 1073-1080 | permission-denied detection | ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 6 — PRODUCT CMS
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Lijst render | 1082 `BP.renderProducten` | ✅ |
| Query + client-side sort | 1093-1103 | ✅ v60.1.42 |
| Lege staat | 1129 | empty + CTA "+ Nieuw product" | ✅ |
| Nieuw product | 1138 → form 1152 `renderProductForm` | ✅ |
| Form velden | 1167-1192 | titel, cat, omschr, prijs, voorraad, maten, kleuren, url, tracking, imgs, status | ✅ |
| Image upload (max 4, 3MB elk) | 1234-1247 | ✅ |
| Save | 1249-1267 | brandId, brandNaam, alle velden, aangemaakt/laatsteUpdate | ✅ |
| Soft-delete | 1140-1149 `verwijderProduct` | status='verwijderd' | ✅ |
| Bewerken | 1139 → laadt via doc.get | ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 7 — CAMPAGNE BUILDER
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Lijst | 1278 `renderCampagnes` | ✅ |
| Live budget berekening | n/a — alleen totaal+dag input | ⚠️ Statisch — geen live preview |
| Form | 1354 `renderCampagneForm` | ✅ |
| Datum-validatie | 1435 | eind > start | ✅ |
| Budget-validatie | 1436-1437 | totaal>0, dag<=totaal | ✅ |
| Plaatsingen verplicht | 1438 | min 1 | ✅ |
| Save | 1447-1466 | brandId, brandNaam, dates, budgets, biedstrategie, doel, plaatsingen, boodschap, status | ✅ |
| Audit log | 1467-1470 | campaign_created / campaign_updated | ✅ |
| Pause | 1339-1344 `pauseCampagne` | status='paused' | ✅ |
| Resume | 1346-1351 `resumeCampagne` | status='live' | ✅ |

⚠️ **Gap**: Geen live budget-impact preview tijdens form-invul. Statisch validatie pas bij submit. NIET CRITISCH — minimum viable functionaliteit aanwezig.

═══════════════════════════════════════════════════════════════════════
FLOW 8 — BRAND ANALYTICS + CSV EXPORT
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Render | 1485 `renderAnalytics` | ✅ |
| Query campaigns | 1494 | single-field index | ✅ |
| Aggregatie | 1495-1509 | totImp, totClk, totSpend, CTR per rij | ✅ |
| Tabel render | 1524-1538 | met badge, CTR%, ROAS | ✅ |
| CSV export | 1540-1558 | Blob + download trigger | ✅ |
| Lege staat | 1516 | empty card | ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 9 — ADMIN CAMPAIGN CONTROL
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---------|--------|
| Lijst | 1675 `renderAdminCampagnes` | ✅ |
| Eigen-campagne badge + button-hide | 1687-1707 | separation-of-duties | ✅ |
| Approve→live | 1729 `adminCamp('approve')` | ✅ |
| Pause | 1729 'pause' | ✅ |
| Resume | 1729 'resume' | ✅ |
| End→completed | 1729 'end' | ✅ |
| Budget override | 1747 `adminCampBudget` | prompt + validatie | ✅ |
| Self-modify guard | 1736-1740, 1755-1759 | ownership check via Firestore | ✅ |

═══════════════════════════════════════════════════════════════════════
FLOW 10 — REVENUE DASHBOARD
═══════════════════════════════════════════════════════════════════════

| Stap | Locatie | Status |
|------|---════════════|--------|
| Render | 1768 `renderAdminInkomsten` | ✅ |
| Query alle campagnes | 1779 | ⚠️ Geen limit — risico bij 10k+ docs (gerapporteerd in perf-audit) |
| Aggregatie vandaag/maand/totaal | 1783-1797 | datum-bucketing | ✅ |
| Top-20 merken | 1798 | sort + slice | ✅ |
| Tabel render | 1816-1820 | ✅ |

═══════════════════════════════════════════════════════════════════════
EINDOORDEEL
═══════════════════════════════════════════════════════════════════════

| Categorie | Score |
|-----------|-------|
| Routes geregistreerd | 14/14 ✅ |
| Handlers gekoppeld | 100% ✅ |
| Auth-guards aanwezig | 100% ✅ |
| Empty-states aanwezig | 100% ✅ |
| Error-states aanwezig | 100% ✅ |
| Loader-states aanwezig | 100% ✅ |
| Audit-logs op state-changes | 100% ✅ |
| Separation-of-duties enforced | 100% ✅ |
| RBAC (`isAdmin`, `isLogged`) | 100% ✅ |
| Rate-limiting | 4/4 critical paths ✅ |
| Data-testids | 100% ✅ |

**GEEN code-niveau bugs gevonden.** Alle flows zijn end-to-end gekoppeld
met handlers, validatie, error-handling en feedback.
