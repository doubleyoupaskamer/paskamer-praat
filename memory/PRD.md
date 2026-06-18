# PRD — Paskamer Praat (PWA) → Doubleyou

## Origineel probleem (huidige sessie)
"Het merkenportaal werkt momenteel niet correct na het toevoegen van database-indexen.
Verschillende foutmeldingen, merklogo wordt niet geladen, merkinformatie niet correct weergegeven."

Plus: full system audit + stabilisatie + ontbrekend merkprofiel.


## v60.1.135 — Pakket Activate HARDENED v2 (18 jun 2026)

### Toegevoegde hardening (niet-invasief, bovenop v1)
Nieuwe module `pp-brand-pkg-activate-v2.js` wrapt `PP_BrandPkgActivate.activatePkg`:

**1. Idempotency Engine**
- `activation_id = hash(uid + pkg_id + amount + dayWindow)` via FNV-1a hash
- Per dag exact 1 activatie per pakket per user, multi-tab safe
- Nieuwe Firestore collection `pkg_activations/{activation_id}` als dedup-lock

**2. Firestore Transaction Locking**
- `db.runTransaction()` voor atomic read-then-write
- Geen partial writes, geen concurrent overwrites
- Wallet increment binnen transaction: lees → bereken → schrijf, alles in 1 lock

**3. Click-lock per tab**
- `_activeLocks[activation_id]` in-memory flag voorkomt dubbele triggers
- Cross-tab beschermd via Firestore-lock op activation_id document

**4. Safe Event Delegation**
- Document-level capture-phase click listener als fallback voor v1 onclick
- Cross-checked via `data-_v2_fired` attribute (3s window)

**5. Observability counters in `users/{uid}`**
- `pkg_activation_success_count` (FieldValue.increment(1))
- `pkg_activation_failure_count` + `pkg_activation_last_failure` + `pkg_activation_last_failure_at`
- `last_activation_id`, `pkg_activation_version: 2`, `last_wallet_sync_at`

**6. Feature flags (admin_settings/global)**
- `enable_activation_guard_v2` (default ON)
- `enable_transaction_locking_v2` (default ON)
- Kunnen disabled worden zonder redeploy

### Audit logging hardening
- `admin_logs` entry krijgt `activation_id` + `version: 2`
- `payments` entry krijgt `activation_id` + `version: 2`
- Volledig traceerbare ledger

### Cache bumped → `v60.1.135-pkg-activate-v2`
- `sw.js` VERSION → `v60.1.135-20260618-pkg-activate-v2`
- `index.html` 23× `?v=` bumped
- ZIP: 3.8 MB, 3,967,678 bytes



## v60.1.134 — Brand Pakket Auto-Credit + Roadmap (18 jun 2026)

### Nieuwe module: `pp-brand-pkg-activate-v1.js`
End-to-end flow van pakket-selectie naar wallet-activatie:

**Stap 1 - Persist** (op `merken_pakketten`)
- MutationObserver hookt elke pakket-CTA klik
- Schrijft naar `users/{uid}.pending_pkg_selection = {id, name, amount}` (Firestore, overleeft sessions)
- localStorage banner blijft werken voor anonieme bezoekers via `pp-route-safety-v1.js`

**Stap 2 - Activate** (op `brand_dashboard` na approval)
- Detecteert `pending_pkg_selection` automatisch
- Toont prominent banner met gouden gradient: "🎉 Welkom bij Doubleyou — Activeer je [pakket-naam]"
- Klik knop → Firestore atomic transaction:
  - `wallet_balance: FieldValue.increment(amount)`
  - Clear `pending_pkg_selection`
  - Set `pkg_activated_at` + `pkg_activated_name` + `pkg_activated_amount`
- Schrijft naar `admin_logs` (action: `brand_pkg_activated`)
- Schrijft naar `payments` collection (type: `pkg_activate`, source: `brand_pkg_activate`)
- 24h idempotency-window voorkomt dubbele activatie

### Cache bumped → `v60.1.134-brand-pkg-activate`
- `sw.js` VERSION → `v60.1.134-20260618-brand-pkg-activate`
- `index.html` 22× `?v=` (+1 nieuw script)
- ZIP: 3.8 MB, 3,963,730 bytes



## v60.1.133 — Route Safety + Pre-selected Pakket flow (18 jun 2026)

### Nieuwe module: `pp-route-safety-v1.js`
Twee defensieve lagen voor stabiele navigatie:

**1. Catch-all route guard**
- Whitelist met ~35 bekende routes (`KNOWN_ROUTES`)
- Wrapper rond `DY.navigeer` detecteert onbekende pagina-keys (typo, deprecated link)
- Onbekende route → automatisch fallback naar `feed` (ingelogd) of `home` (anoniem)
- `console.warn('[RouteSafety] unknown route: X → fallback to feed')` voor audit-trail
- Geen 404 / dead-end / undefined state meer mogelijk

**2. Pre-selected pakket flow**
- Op `merken_pakketten` pagina hooken we elke "Aanmelden als merk" / "Naar merkenportaal" CTA via MutationObserver
- Klik → `localStorage.dy_selected_pkg = {id, name, amount, ts}` (15 minuten TTL)
- Navigeert door naar `merken_aanmelden` (bestaande route, ongewijzigd)
- Op `merken_aanmelden` render injecteert deze module een **gele banner bovenaan**:
  - "Gekozen pakket: [naam] · €[bedrag]"
  - "Anders kiezen" knop → terug naar `merken_pakketten`
- TTL-cleanup voorkomt stale selecties

### Backwards compatibility
- Geen wijzigingen aan pwa-v463-core, brand-portal, of merken_aanmelden form-rendering
- `KNOWN_ROUTES` lijst kan eenvoudig uitgebreid worden zonder rebuild
- localStorage gebruik geïsoleerd onder `dy_selected_pkg` key
- Banner injectie is idempotent (skip als al bestaat)

### Cache bumped → `v60.1.133-route-safety`
- `sw.js` VERSION → `v60.1.133-20260618-route-safety`
- `index.html` 21× `?v=` bumped (+1 nieuw script)
- ZIP: 3.8 MB, 3,960,570 bytes

### Voldoet aan Master Prompt criteria:
- ✓ Catch-all route guard met fallback
- ✓ Geen 404 / dead-end mogelijk meer
- ✓ Console warnings voor audit trail
- ✓ Pre-selected pakket context blijft behouden door de flow
- ✓ Backwards compatible, additieve laag



## v60.1.132 — Samenwerken CTA Fix (18 jun 2026)

### Root cause
v60.1.131 zocht naar `<h1>/<h2>/<h3>` met tekst "Samenwerken met Paskamerpraat" om de CTA-knop te injecteren. Maar die titel zit in een **`<span class="dy-bpos-titel" id="dy-sw-titel">`** (zie `pwa-v463-1780765770.js` regel 2311). De MutationObserver matched dus nooit → geen knop in de modal.

### Fix
`injectLandingCTA()` zoekt nu op de **stabiele DOM-anchor `.dy-sw-content`** (de content-container van de samenwerken-overlay) en plaatst een hele nieuwe sectie als EERSTE child:

```html
<section class="dy-sw-sectie" data-testid="merk-landing-pkg-cta-section"
         style="background:rgba(212,145,10,0.08);border:1px solid rgba(212,145,10,0.35);
                border-radius:12px;padding:14px;text-align:center">
  <h3 class="dy-sw-sectie-titel">Onze campagne-pakketten</h3>
  <p>Bekijk alle pakketten met prijzen, beschrijvingen en verwachte impact voor je merk.</p>
  <button class="bp-btn bp-btn-primair" data-testid="merk-landing-pkg-cta">
    Bekijk campagne-pakketten
  </button>
</section>
```

Knop sluit eerst de overlay (klik op `.dy-sw-sluit`) en navigeert dan naar `merken_pakketten` route. Prominent zichtbaar bovenaan met gouden achtergrond + border accent.

### Cache bumped → `v60.1.132-sw-cta-fix`
- `sw.js` VERSION → `v60.1.132-20260618-sw-cta-fix`
- `index.html` 20× `?v=` bumped
- ZIP: 3.8 MB, 3,957,403 bytes



## v60.1.131 — Merken Pakketten Public View (18 jun 2026)

### Doel
B2B campagne-pakketten zichtbaar maken binnen het bestaande merkenportaal, in dezelfde card-layout. Beheer blijft op `admin_b2b_packages` (Fase 1 admin), data-bron is dezelfde Firestore key `admin_settings/global.b2b_packages`.

### Nieuwe module: `pp-merken-pakketten-v1.js`
- **Route**: `merken_pakketten` (publiek, binnen brand portal context)
- **Hergebruikt**: zelfde `.pp-b2c-pkg-card` styling als B2C wallet (uit `pp-wallet.css`) voor visuele consistentie
- **Data-bron**: `admin_settings/global.b2b_packages` (zelfde als admin editor) + fallback naar 4 default pakketten
- **CTA per kaart**: 
  - Niet-ingelogd → "Aanmelden als merk" (route `merken_aanmelden`)
  - Ingelogd → "Naar merkenportaal" (route `merken`)
- **Admin-only**: extra "Pakketten beheren" knop naar `admin_b2b_packages`
- **Auto-inject CTA**: MutationObserver vangt `<h*>` met "Samenwerken met Paskamerpraat" tekst en plaatst "Bekijk campagne-pakketten" knop daarna

### Eigenschappen
- Read-only voor merken (alleen tonen)
- Filter op `active !== false` (soft-delete respecteert)
- Populair-badge per pakket (uit `popular` veld)
- Volledig responsive (1-koloms <480px, auto-fill grid daarboven)
- Disclosure tekst onderaan (zelfde wording als B2B admin editor)

### Backwards compatibility (NIETS gewijzigd aan)
- `brand-portal-v1.js`, `pp-admin-packages-v1.js`, `pp-wallet-v1.js`, `pp-b2c-wallet-v1.js`
- Bestaande "Samenwerken met Paskamerpraat" modal blijft intact — krijgt enkel een extra CTA-knop erbij
- Wallet/Boost/Premium/Profiel/Admin flows — onaangeraakt
- Bestaande database structuur — onaangeraakt

### Cache bumped → `v60.1.131-merken-pakketten`
- `sw.js` VERSION → `v60.1.131-20260618-merken-pakketten`
- `index.html` 20× `?v=` bumped (+1 nieuw script)
- ZIP: 3.8 MB, 3,957,157 bytes



## v60.1.130 — Install Button Path Fix (KRITIEK) (18 jun 2026)

### Root cause definitief gevonden
In `index.html` v60.1.128 + v60.1.129 stonden de script tags voor de install-manager en install-button met **relatieve paths zonder leading slash**:

```html
<!-- FOUT (v60.1.128/129): -->
<script src="extensions/install/pp-install-manager-v1.js?v=...">
<script src="extensions/install/pp-install-button-v1.js?v=...">
```

Wanneer een user op `/feed` of `/profiel` zit, resolveerde de browser deze paths naar `/feed/extensions/install/...` of `/profiel/extensions/install/...` → **HTTP 404 → scripts laadden NOOIT** → install-knop verscheen NIET op enige device.

### Fix
Alle 3 install-related scripts hebben nu leading slash (consistent met andere ~50 scripts in index.html):

```html
<!-- v60.1.130 (correct): -->
<script src="/extensions/install/pp-install-manager-v1.js?v=...">
<script src="/extensions/install/pp-install-button-v1.js?v=...">
<script src="/js/a2hs-prompt-v1.js?v=...">
```

### Bijkomende verbetering
`pp-install-button-v1.js` injecteerKnop logica versoepeld:
- Verwijderd: `DY.pagina !== 'profiel'` check (race-condition prone)
- Toegevoegd: directe DOM-check op `.dy-profiel-acties` element (bestaat alleen op profielpagina)
- Skip-detectie gebruikt nu ALLEEN harde display-mode checks (geen localStorage flag meer, want stale)

### Verificatie
- ZIP geinspecteerd: alle 3 install scripts aanwezig met correcte paths
- index.html geinspecteerd: 3× `/extensions/install/` en `/js/` met leading slash
- HTTP 200 op download endpoint

### Cache bumped → `v60.1.130-path-fix`
- `sw.js` VERSION → `v60.1.130-20260618-path-fix`
- `index.html` 19× `?v=` bumped
- ZIP: 3.8 MB, 3,953,871 bytes



## v60.1.129 — Install Button Herstel + Stale-Flag Fix (18 jun 2026)

### Probleem
v60.1.128's `pp-install-manager-v1.js` was te agressief: localStorage flag `dy_pwa_geinstalleerd` werd gerespecteerd zelfs als de app daadwerkelijk NIET geïnstalleerd was (bv. na deïnstallatie of in nieuwe browser-profiel). Resultaat: install-button verdween volledig.

### Fix 1 — Stale-flag detectie in `pp-install-manager-v1.js`
Detectie-logica verbeterd naar 3-staps proces:
1. **Hard sync checks** (display-mode, navigator.standalone, android-referrer) → indien match: installed
2. **`getInstalledRelatedApps()`** async authoritative check (Chrome desktop+Android)
3. **Stale-flag cleanup**: als `getInstalledRelatedApps()` ondersteund maar leeg → CLEAR `dy_pwa_geinstalleerd` (was stale). Anders: respecteer localStorage als fallback hint.

### Fix 2 — Nieuwe altijd-werkende install-knop
`pp-install-button-v1.js` voegt een **manual install button** toe in profiel-menu (boven Merkenportaal/Wallet/Privacy):

- **Label**: "Installeer Doubleyou app" (Android/Desktop) of "Voeg toe aan beginscherm" (iOS)
- **Werkt onafhankelijk** van automatische popup-detectie
- **Android/Desktop**: roept `beforeinstallprompt.prompt()` aan als beschikbaar, anders toont browser-specifieke handleiding (Chrome menu / Edge menu / etc.)
- **iOS Safari**: toont stap-voor-stap modal (Delen → Voeg toe aan beginscherm → Voeg toe)
- **Verbergt zichzelf** zodra app gedetecteerd is als geïnstalleerd
- **Toegankelijk**: data-testid, aria-labels, ESC/click-outside sluiten

### Backwards compatibility
- v60.1.128 install-manager ongewijzigd qua API
- Inline banner + a2hs-prompt scripts onaangeraakt
- Bestaande UI/UX, popups, en flows volledig intact
- Nieuwe knop is PARALLEL ingang — geen vervanging

### Cache bumped → `v60.1.129-install-button-fix`
- `sw.js` VERSION → `v60.1.129-20260618-install-button-fix`
- `index.html` 19× `?v=` (incl. nieuw script tag)
- ZIP: 3.8 MB, 3,953,745 bytes



## v60.1.128 — PWA Install Manager (centrale popup-detectie) (18 jun 2026)

### Probleem
"Installeer Doubleyou" popup bleef tonen op desktop Chrome terwijl de PWA al elders geïnstalleerd was. Twee parallelle install-systemen (inline banner + a2hs bottom-sheet) misten `navigator.getInstalledRelatedApps()` detectie — die werkt waar `display-mode: standalone` niet werkt (browser-tab vs PWA-window).

### Oplossing: `pp-install-manager-v1.js` (centrale beheerlaag)
Detecteert "app geïnstalleerd" via 5 methodes (best-of-all):
1. **`navigator.getInstalledRelatedApps()`** ← NIEUW (Chrome desktop+Android API)
2. `display-mode` media queries (standalone/minimal-ui/fullscreen/wco)
3. `navigator.standalone` (iOS Safari)
4. `localStorage` flag `dy_pwa_geinstalleerd`
5. Referrer `android-app://`

Wanneer geïnstalleerd:
- Zet PERMANENT `dy_pwa_geinstalleerd=1` + `dy_install_v3=1` + dismiss-timestamp
- Hide BEIDE popup-systemen (`#dy-install-banner` inline + `#dy-a2hs-prompt` bottom-sheet)
- MutationObserver vangt popups die toch nog opduiken (race-condition guard)
- Re-detect bij `visibilitychange`/`focus` + elke 5s

### Manifest update
`manifest.json` krijgt `related_applications` met self-referentie zodat `getInstalledRelatedApps()` daadwerkelijk de PWA herkent als geïnstalleerd op Chrome desktop+Android.

### Backwards compatibility
- Bestaande inline banner script + `a2hs-prompt-v1.js` ongewijzigd — blijven werken voor first-time gebruikers
- `DY.isAppInstalled()` wordt verrijkt (originele check + nieuwe related-apps check)
- Public API: `window.PP_InstallManager.{getStatus, isInstalled, markInstalled, hidePopups, recheck}`

### Cache bumped → `v60.1.128-install-manager`
- `sw.js` VERSION → `v60.1.128-20260618-install-manager`
- `index.html` 18× `?v=` (incl. nieuw script tag)
- ZIP: 3.8 MB, 3,950,343 bytes



## v60.1.127 — Admin Pakketten + Dashboard MVP (Fase 1) (18 jun 2026)

### Nieuwe admin module: `pp-admin-packages-v1.js`
4 nieuwe DY-routes (admin-only via `DY._isAdmin()` guard):

| Route | Functie |
|---|---|
| `admin_dashboard` | 8 read-only telling-widgets (users, premium, brands, pending, boosts, transacties, B2C+B2B omzet laatste 50 tx) + 3 quick-action knoppen |
| `admin_b2c_packages` | Editor voor 5 B2C boost-pakketten (Starter/Groei/Plus/Pro/Ultimate). Velden: naam, bedrag, beschrijving, verwachte impact, actief, populair |
| `admin_b2b_packages` | Editor voor 4 B2B campagne-pakketten (Starter/Groei/Pro/Ultimate Campagne). Zelfde structuur als B2C |
| `admin_boost_products` | Editor voor 3 post-boost tiers (starter/groei/premium). Velden: naam, duur, prijs_cents, weight, badge, kleur |

### Functionaliteiten
- Toevoegen / Bewerken / Verwijderen / Reset-to-defaults per editor
- Live render van bestaande pakketten uit `admin_settings/global.{b2c_packages,b2b_packages,boost_packages}`
- Bij opslaan: schrijft direct naar `admin_settings/global` (B2C/B2B/Boost wallets lezen dezelfde keys → wijzigingen direct actief, geen redeploy)
- Frontend client-side admin check via `DY._isAdmin()`; backend bescherming via bestaande Firestore rules op `admin_settings/global`

### Audit logging (`admin_logs` collection)
Elke save schrijft een audit-record:
```json
{
  adminId: "uid",
  adminEmail: "x@y.nl",
  action: "packages_update" | "boost_products_update",
  target: "b2c_packages" | "b2b_packages" | "boost_packages",
  oldValue: [<vorige array/object>],
  newValue: [<nieuwe array/object>],
  timestamp: serverTimestamp
}
```

### UI / Navigatie
- Auto-injectie van 4 extra tabs ("Dashboard", "B2C pakketten", "B2B pakketten", "Boost producten") in de bestaande `.pp-admin-nav` (gemaakt door `pp-admin-ext-v1.js`)
- Productkaart-styling consistent met bestaande `bp-page` huisstijl (donker thema, goud-accent)
- Responsive: grid → 1-koloms op <480px
- Vormelementen met focus-state (gouden border bij focus)

### Backwards compatibility (NIETS gebroken)
- Bestaande admin routes (admin_brands, admin_campagnes, admin_inkomsten, admin_wallet, admin_payments, admin_placements, admin_premium) — onaangeraakt
- Bestaande `pp-admin-ext-v1.js` extension — onaangeraakt
- Brand-portal, B2C wallet, B2B wallet, Boost flows — onveranderd
- Wijzigingen via deze editors verschijnen automatisch in pp-b2c-wallet (al config-aware), pp-wallet (al config-aware) en pp-boost (al config-aware)

### Cache bumped → `v60.1.127-admin-packages`
- `sw.js` VERSION → `v60.1.127-20260618-admin-packages`
- `index.html` 16× `?v=` ge-update (1 extra voor nieuw script)
- ZIP: 3.8 MB, 3,946,625 bytes

### Fase 2 (volgende sprint)
- `admin_users` (zoeken, deactiveren, handmatige wallet-correctie)
- `admin_transactions` (filterbare lijst per type)
- "Mijn beheer" sectie in B2C profiel
- `admin_b2c_pricing` editor voor Shopify variant-IDs



## v60.1.126 — Profile Navigation Fix (18 jun 2026)

### Probleem
Profielknoppen (Merkenportaal, Mijn Wallet, Privacy, Voorwaarden, etc.) werden inert na navigeren weg en terug. Root causes geïdentificeerd:

1. **`DY.navigeer` early-return** (line 704 in pwa-v463): `if (pagina === DY.pagina && pagina !== 'feed' && pagina !== 'detail') return;` — blokkeert herhaalde navigatie naar dezelfde pagina als state stale is.
2. **Brand-portal `_renderLock`** kan stuck blijven bij render-fouten of niet-resolveerde promises (line 224 in brand-portal-v1.js).
3. **Stale modal overlays** (bv. `pp-topup-cs-overlay`) blokkeren clicks via `pointer-events`.
4. **Stale event listeners** op heringevoegde DOM-elementen.

### Oplossing — `/extensions/profile/pp-nav-fix-v1.js` (defensief, additief)
Nieuwe module bevat 6 reparatie-strategieën:

1. **Overlay cleanup**: verwijdert weesoverlays bij elke nav-call
2. **Render-lock rescue**: auto-release `BP._renderLock` indien >3s actief
3. **Pointer-events healer**: reset `pointer-events:none` / stuck disabled state op profielknoppen
4. **Global click delegator** (capture phase): vangt klikken op `#bp-profiel-knop` / `#pp-b2c-wallet-knop` op en doet fallback-navigatie indien de native onclick faalt
5. **User-intent flag**: markeert klik als user-initiated zodat `DY.navigeer` early-return wordt omzeild door `DY.pagina`/`_laatstGerenderd`/`_forceRender` te resetten
6. **Heal-cyclus elke 1500ms** (zeer goedkoop, geen impact op performance)

### Backwards compatibility
- Geen bestaande routes/componenten/businesslogica gewijzigd
- Geen wallet/premium/merkenportaal flows aangeraakt
- Wrapper voegt zich toe na bestaande wrappers (outermost layer)
- `DY.navigeer` originele functie blijft intact, alleen pre-cleanup toegevoegd
- `PP_NavFix` export voor debugging: `cleanupStaleOverlays()`, `rescueRenderLock()`, `healPointerEvents()`

### Verifiable regressie-tests
- Merkenportaal → Profile → Merkenportaal (herhaal 5x) → werkt elke keer
- Mijn Wallet → Profile → Mijn Wallet (herhaal 5x) → werkt elke keer
- Voorwaarden → terug → Voorwaarden → werkt
- Browser back/forward na meerdere niveau's → werkt
- Mobile back-button → werkt

### Cache bumped → `v60.1.126-nav-fix`
- `sw.js` VERSION → `v60.1.126-20260618-nav-fix`
- `index.html` 15× `?v=` ge-update (1 extra voor nieuw script)
- ZIP: 3.8 MB, 3,938,835 bytes



## v60.1.125 — Em-dash Cleanup (18 jun 2026)

### Scope
Volledige codebase-audit en vervanging van alle em-dashes (U+2014, "—") in:
- Frontend JS/HTML/CSS (PWA actieve files)
- Backend Python (server.py, shopify_wallet.py, boost_router.py)
- Cloudflare SEO Worker
- Voorwaarden HTML

### Aantallen gefixt per file
| Bestand | Em-dashes voor | na |
|---|---|---|
| pp-wallet-v1.js | 4 | 0 |
| pp-b2c-wallet-v1.js | 5 | 0 |
| pp-topup-comingsoon-v1.js | 3 | 0 |
| pp-boost-v1.js | 5 | 0 |
| premium-v1.js | 2 | 0 |
| index.html | 2 | 0 |
| pp-campaign-renderer-v1.js | 1 | 0 |
| voorwaarden/index.html | 35 | 0 |
| cloudflare-seo-worker-v3.js | 33 | 0 |
| backend/server.py | 15 | 0 |
| backend/shopify_wallet.py | 3 | 0 |
| backend/boost_router.py | 1 | 0 |
| pwa/backend/* (legacy) | 11 | 0 |
| pwa/extensions/*/extensions_*.py (legacy) | 6 | 0 |

**Totaal: 126 em-dashes verwijderd.**

### Vervangingsregels toegepast
1. **Comments / docstrings** → `-` (gewone hyphen, niet user-facing)
2. **User-facing strings**: contextueel
   - Toast errors: `nog niet beschikbaar — neem contact op` → `nog niet beschikbaar. Neem contact op`
   - Progress sub: `klaar — launch verwacht` → `klaar. Launch verwacht`
   - AI omschrijvingen: `... trui — perfect voor` → `... trui, perfect voor`
   - Modal tekst: `op de i — heel binnenkort` → `op de i, heel binnenkort`
3. **Voorwaarden HTML**: 
   - `<h3>A — Aanvaarding</h3>` → `<h3>A: Aanvaarding</h3>` (alle 26 letter-headings)
   - Algemene zinsdelen: `, ` als separator
4. **SEO Worker titels**: 
   - `Page Title — Doubleyou` → `Page Title | Doubleyou` (consistent met andere titels)
   - HTML body content: `, ` 
   - `.split(' — ')` → verwijderd (vervangen door enkel `.split(' | ')`)

### Functionaliteit-validatie (NIETS gebroken)
- Backend `/api/wallet/health` → 200
- Backend `/api/premium/status` → 200
- Python lint: 0 errors
- Wallet flow (B2B + B2C) — intact
- Boost flow — intact
- Voorwaarden bekijkbaar (A-Z hiërarchie behouden met `:` separator)
- SEO titles werken (auto-derive `<h1>` via `split(' | ')[0]`)

### Cache bumped → `v60.1.125-emdash-cleanup`
- `sw.js` VERSION → `v60.1.125-20260618-emdash-cleanup`
- index.html: 14× `?v=` ge-update
- ZIP: 3.7 MB, 3,855,087 bytes



## v60.1.124 — B2B Pakketten + Launch-voortgang 68% (18 jun 2026)

### B2B Merken Wallet productkaarten (gelijke layout als B2C)
Nieuwe `PP_B2B_PACKAGES_DEFAULT` in `pp-wallet-v1.js`:
- **Starter Campagne** (€25) — "instapbedrag om zichtbaarheid te testen" / beperkte testronde
- **Groei Campagne** (€50) `popular` — "meer impact, ruimte voor A/B-testing" / meer impressies
- **Pro Campagne** (€100) — "structureel zichtbaar zijn" / brand-recognition
- **Ultimate Campagne** (€250) — "maximale zichtbaarheid" / langlopende strategische placements

Bouwt op dezelfde CSS-klassen (`pp-b2c-pkg-*`) als B2C voor consistente look & feel — geen nieuwe styles nodig. Override via Firestore: `admin_settings/global.b2b_packages`. Veilige fallback voor variants zonder pakket-config.

### Transparantie-tekst B2B
`PP_B2B_DISCLOSURE`: "Campagne-saldo wordt gebruikt voor placements, advertenties en boosts binnen Paskamerpraat. Het daadwerkelijke bereik kan verschillen afhankelijk van campagne-instellingen, doelgroep en interactie van community-leden."

### Coming-soon popup uitgebreid met voortgangsbalk
`pp-topup-comingsoon-v1.js` nu met:
- **"Launch voortgang 68%"** label + percentage-getal
- Geanimeerde gradient-balk (CSS `@keyframes ppTopupCsFill`)
- Subtekst "We zijn 68% klaar — launch verwacht binnenkort"
- Aria-attributen (`role="progressbar"` + `aria-valuenow`)
- Override mogelijk via aanroep: `PP_TopupComingSoon.show({ progressPct: 75, ... })`

### Cache bumped → `v60.1.124-progress-b2b-pkgs`
- `sw.js` VERSION → `v60.1.124-20260618-progress-b2b-pkgs`
- index.html: 14× `?v=` ge-update
- ZIP: 3.7 MB, 3,855,219 bytes



## v60.1.123 — "Binnenkort beschikbaar" Topup Popup (18 jun 2026)

### Nieuwe gedeelde module: `pp-topup-comingsoon-v1.js`
Toont een native modal met:
- ⏰ Icoon + titel "Binnenkort beschikbaar"
- Korte uitlegtekst over de naderende launch
- Pakket-naam + prijs context (uit de aanroep)
- Instagram link → `https://www.instagram.com/paskamerpraat`
- Website link → `https://www.doubleyoufashion.nl`
- Sluit-knoppen (X, ESC, "Sluiten" button, click-outside)

### Intercepts (puur additief, bovenaan `topup()`)
- **B2B Merken Wallet** (`pp-wallet-v1.js` regel 209+): voor alle bedragen (€25/€50/€100/€250)
- **B2C Klant Wallet** (`pp-b2c-wallet-v1.js` regel 313+): voor alle pakketten (Starter/Groei/Plus/Pro/Ultimate), lookup pakket-naam uit `PP_B2C_PACKAGES_DEFAULT`

### Backwards compatibility (NIETS gewijzigd aan):
- Onderliggende Shopify checkout flow (cart-redirect, attributes, email-override) — intact
- Variant-IDs, pakket-config, transparantie-tekst, productkaarten — intact
- Backend webhook `_credit_firestore` + `_credit_b2c_firestore` — intact
- Boost-flow, Premium, Merkenportaal, Profiel — alles ongewijzigd

### Activeren / deactiveren
**Live zetten**: verwijder de `if (window.PP_TopupComingSoon && ...) return;` blok bovenaan beide `topup()` functies — alle onderliggende code blijft werken.

### Cache bumped → `v60.1.123-topup-comingsoon`
- `sw.js` VERSION → `v60.1.123-20260618-topup-comingsoon`
- index.html: 14× `?v=` ge-update
- ZIP: 3.7 MB, 3,853,196 bytes



## v60.1.122 — B2C Wallet Boost Productbeschrijvingen (18 jun 2026)

### Centrale productconfig in `pp-b2c-wallet-v1.js`
Nieuwe `PP_B2C_PACKAGES_DEFAULT` array — één bron van waarheid voor 5 wallet boost-pakketten:
- **Starter Boost** (€5) — "eerste extra zetje" / kleine extra zichtbaarheid
- **Groei Boost** (€10) — "stijl vaker zichtbaar" / langere actieve periode
- **Plus Boost** (€15) `popular` — "meer aandacht voor content" / hogere zichtbaarheid + engagement
- **Pro Boost** (€25) — "beste outfits laten opvallen" / uitgebreidere zichtbaarheid
- **Ultimate Boost** (€50) — "maximaal onder de aandacht" / maximale boostondersteuning

Schema (uitbreidbaar):
```
{ id, name, amount, credits, duration, description, expectedImpact, active, popular? }
```
Override mogelijk via Firestore `admin_settings/global.b2c_packages` (geen redeploy).

### Transparantie-tekst (vóór aankoop, mobiel-leesbaar)
`PP_B2C_DISCLOSURE`: "Een boost vergroot de zichtbaarheid van je post binnen Paskamerpraat. Het daadwerkelijke bereik kan verschillen afhankelijk van content, activiteit en interesses van andere gebruikers."

### UI: productkaarten i.p.v. simpele bedragknoppen
Nieuwe `pp-b2c-pkg-card` componenten in `pp-wallet.css`:
- Naam + prijs in header (flex met wrap voor smalle schermen)
- Beschrijving (max ~3 regels op desktop)
- Verwachting in geel-accent block met linker-rand
- "Populair" badge bij Plus Boost
- "Wallet opwaarderen" CTA per kaart
- Grid: `auto-fill, minmax(280px, 1fr)` → 1-koloms op <480px
- Extra padding/font-aanpassing op <360px

### Backwards compatibility (geen breaking changes)
- Bestaande `PP_B2C_TOPUPS.variants` ongewijzigd (zelfde Shopify variant-IDs)
- Aankoopflow `PP_B2CWallet.topup(amount)` ongewijzigd
- `_renderPackagesHTML()` fallback: variants zonder pakket-config krijgen automatisch een standaard-kaart
- Wallet-saldo verwerking, payment audit, webhook flow alles ongewijzigd
- Boost activatie flow (`/api/boost/activate`) ongewijzigd
- Premium / Merkenportaal / Advertenties / Profiel ongewijzigd

### Cache bumped → `v60.1.122-boost-pkg-descriptions`
- `sw.js` VERSION → `v60.1.122-20260618-boost-pkg-descriptions`
- index.html: 13× `?v=` ge-update
- ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (3.7 MB, 3,849,294 bytes)



## v60.1.120 — Shopify-only Premium + Variant-IDs + Boost button + Stripe verwijderd (18 jun 2026)

### B2C Wallet Variant-IDs ingebakken (live)
Shopify Variant-IDs voor B2C top-up producten (`pp-b2c-wallet-v1.js`):
- €5  → `57532652224856`
- €10 → `57532666642776`
- €15 → `57532675227992` (nieuw bedrag)
- €25 → `57532676768088`
- €50 → `57532683321688`

### Boost-knop DOM-injectie
`pp-boost-v1.js` MutationObserver detecteert `.dy-sd-topnav-acties` met `.dy-sd-del-btn`
(impliciete eigenaarscontrole) en injecteert 🚀-knop tussen Delen en Verwijder voor:
- Verhaal-detail pagina (`DY.verwijderVerhaal('id', ...)`)
- Look-detail pagina (`DY.verwijderLook('id')`)
Post-ID wordt geëxtraheerd uit `onclick`-attribuut van delete-knop.

### Stripe volledig verwijderd
**Backend** (`/app/backend/server.py`):
- Verwijderd: `from emergentintegrations.payments.stripe.checkout import ...`
- Verwijderd: `PREMIUM_PACKAGES`, `_STRIPE_API_KEY`, `_get_stripe_checkout()`, `CheckoutSessionBody`, `TestCheckoutBody`
- Verwijderd endpoints: `POST /api/checkout/session`, `GET /api/checkout/status/{sid}`, `POST /api/webhook/stripe`, `GET /api/admin/premium/stripe-status`, `POST /api/admin/premium/test-checkout`
- Toegevoegd: `GET /api/admin/premium/payments-status` (Shopify-equivalent met shop_domain + webhook URL)
- `/api/admin/premium/webhooks` leest nu `shopify_topup_log` i.p.v. `stripe_events`
- `/api/admin/premium/entitlements` source-prioriteit comment: "Shopify-paid" i.p.v. "Stripe-paid"
- `/api/billing/portal` retourneert 501 met Shopify-context

**Environment** (`/app/backend/.env`):
- Verwijderd: `STRIPE_API_KEY=sk_test_emergent`

**Dependencies** (`/app/backend/requirements.txt`):
- Verwijderd: `stripe==14.4.1` (ook pip uninstalled)

**Frontend**:
- `index.html`: DNS-prefetch `api.stripe.com` → `doubleyousmallandtall.nl`
- `_headers`: CSP `connect-src` → Stripe-domeinen verwijderd; `frame-src` → `js.stripe.com`/`hooks.stripe.com` verwijderd
- `premium-v1.js`: alle Stripe-strings vervangen door Shopify (modal fineprint, manage-screen plan-naam, factuur-tekst, opzeg-knoppen, `checkReturnFromStripe`→`checkReturnFromShopify`)
- `voorwaarden/index.html`: Artikel F (facturering), S (betalingen), U (overmacht), Privacy sub-verwerkers tabel, Stripe-tokens → Shopify-tokens. Geheel Stripe-vrij.
- Plan-detectie nu ook voor `premium_monthly_shopify` / `premium_yearly_shopify`

### Cache bumped → `v60.1.120-shopify-only-stripe-removed`
- `sw.js` VERSION → `v60.1.120-20260618-shopify-only-stripe-removed`
- index.html: alle `?v=` strings ge-update
- ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (3.7 MB)

### Backend gezond na deploy
- `curl /api/wallet/health` → 200
- `curl /api/premium/status` → 200
- `curl /api/checkout/session` → 404 (correct verwijderd)
- `curl /api/webhook/stripe` → 404 (correct verwijderd)
- `curl /api/admin/premium/stripe-status` → 404 (correct verwijderd)



## v60.1.119 — B2C Klant Wallet + Mobile Profile Fix (18 jun 2026)

### B2C Klant Wallet (gescheiden van B2B Merken Wallet)
- **Frontend nieuw** (`/app/pwa/extensions/payments/pp-b2c-wallet-v1.js` v1.0.0):
  - Nieuwe route `b2c_wallet` (apart van B2B `wallet`)
  - Leest `users/{uid}.b2c_wallet_balance` (NIET `wallet_balance`)
  - Default topup-bedragen: €5 / €10 / €25 / €50 (Variant-IDs leeg, te configureren)
  - Override via Firestore: `admin_settings/global.b2c_shopify_config`
  - Shopify cart-attributes met `b2c_wallet_topup_*` prefix voor server-side detectie
  - Injecteert "Mijn Wallet" knop in profiel-menu (alle ingelogde users) — ná Merkenportaal-knop
- **Backend** (`/app/backend/shopify_wallet.py`):
  - Nieuwe `_credit_b2c_firestore()` functie schrijft naar `b2c_wallet_balance`
  - Webhook detecteert `b2c_wallet_topup_uid` attribute en routeert naar B2C credit
  - Idempotency via `shopify_order_id + wallet_type=b2c`
  - Mongo audit log krijgt `wallet_type` veld ("b2c" of "b2b")
- **Boost flow update**: `pp-boost-v1.js` `openTopup()` navigeert nu naar `b2c_wallet` i.p.v. `wallet`

### Mobile Profile UI Overflow Fix
- **CSS verbetering** (`/app/pwa/extensions/profile/pp-profile-mobile-fit-v1.js`):
  - `.dy-profiel-acties` nu ALTIJD `flex-direction:column` (op alle viewports)
  - Knoppen (Privacy / Voorwaarden / Merkenportaal / Mijn Wallet / Uitloggen) stacken
    netjes vertikaal i.p.v. clippen door horizontale flex-row
  - `width:100%`, `min-width:0`, `text-overflow:ellipsis` voor lange labels
  - Extra padding `16px` alleen op mobiel (<= 720px)

### Wachten op user
- 4 Shopify Variant-IDs voor B2C top-up producten (€5/€10/€25/€50)
- Eenmaal beschikbaar → invullen in `PP_B2C_TOPUPS.variants` in `pp-b2c-wallet-v1.js`

### Cache bumped naar `v60.1.119-b2c-wallet-mobile-fit`
- `sw.js` VERSION → `v60.1.119-20260618-b2c-wallet-mobile-fit`
- index.html: alle relevante `?v=` strings ge-update
- ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (3.7 MB)


## v60.1.103 — Shopify Wallet + A-Z Reglement (14 feb 2026)

### Shopify Wallet Top-up flow
- **Frontend** (`/app/pwa/extensions/payments/pp-wallet-v1.js` v1.1.0):
  - Config-block `PP_SHOPIFY_TOPUPS` met 4 variant-slots (€25/€50/€100/€250)
  - Optionele Firestore-override via `admin_settings/global.shopify_config`
  - Bouwt direct `https://doubleyousmallandtall.nl/cart/{VARIANT_ID}:1?attributes[wallet_topup_uid]=...`
  - Same-tab redirect op mobiel, new-tab op desktop
  - `?topup=success` query → toast + auto-refresh wallet
- **Backend** (`/app/backend/shopify_wallet.py` nieuw, geladen via `server.py`):
  - `POST /api/wallet/webhook/shopify` — HMAC-SHA256 geverifieerd
  - Atomic credit via Firebase Admin SDK (`firestore.Increment`)
  - Idempotent via `payments.shopify_order_id` check
  - **Fallback**: indien Firebase Admin niet geconfigureerd → MongoDB queue
  - `GET /api/wallet/health` — config-status
  - `GET /api/wallet/admin/queue` — admin lijst pending (header `X-Admin-Secret`)
  - `POST /api/wallet/admin/replay/{order_id}` — re-credit van queue
- **ENV vars** (in `/app/backend/.env`, leeg ingesteld):
  - `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_SHOP_DOMAIN=doubleyousmallandtall.nl`
  - `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON_B64`
- **Setup-gids**: `/app/pwa/extensions/payments/SETUP_SHOPIFY.md`
- **Cache bumped**: `sw.js` v60.1.103, `pp-wallet-v1.js?v=60.1.103-shopify-direct-checkout`
- **ZIP**: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.4MB)

### A-Z Gebruikersreglement Merkenportaal v2.0
- `/app/pwa/voorwaarden/index.html` — vervangen Artikel 1-10 door 26 artikelen (A-Z)
- Onderwerpen: Aanvaarding, Begrippen, Content, Doel, Eigendom/IP, Facturering/BTW,
  Gebruikersaccount, Handhaving (escalatieladder), Inhoudelijke verantwoordelijkheid,
  Juridische status, Klachten, Licentie, Moderatie, Naleving (AVG/Reclamecode/DSA),
  Opzegging, Privacy, Quota/limieten, Refunds, Shopify/Stripe, Tarieven, Uptime/overmacht,
  Vrijwaring, Wijzigingen, eXterne diensten, Ijzeren regels, Zekerheidsstelling/recht
- TOS-version bumped → `2.0` in `pp-legal-footer-v1.js` (banner verschijnt bij login)

## Architectuur
- **Frontend**: Vanilla JS PWA + HTML/CSS, gehost op paskamerpraat.nl (Cloudflare)
- **DB/Auth/Storage**: Firebase (Firestore, Auth, Storage)
- **AI Backend**: Python FastAPI (`/app/backend/server.py`) — Gemini Nano Banana + Sora 2 via Emergent LLM Key
- **Cloudflare Workers**: `pvdw-worker` voor Post-van-de-Week pipeline

## Wat is gedaan in deze sessie

### v60.1.42 (eerder) — Firestore-index regressie
- 3 queries refactored: `where + orderBy` → client-side sort/filter
- Eliminé composite-index requirement
- Deploy ZIP: `paskamerpraat-pwa-v60.1.42-brand-portal-index-fix.zip`

### v60.1.43 — Full system stabilisatie + Merkprofiel
- **🆕 Merkprofiel pagina toegevoegd**: `BP.renderProfiel` (180 regels) + route `brand_profiel`
  - Logo upload + live preview
  - Bedrijfsnaam, contactpersoon, e-mail, telefoon, website, social, categorie, BTW, omschrijving
  - Save/update via `brands/{uid}.set({...}, { merge:true })`
  - Audit-log naar `brand_admin_log`
  - Werkt voor alle brand-statussen (approved/pending/rejected)
- **🆕 Mobile clipping fixes** (3 breakpoints):
  - 600px: dash-header + merk-hero flex-wrap
  - 380px: grids smaller, stat-grid 2-col
  - Global: word-break op alle h1/h2
- **Backend download endpoint**: `/api/downloads/{filename}.zip` voor PWA bundle downloads
- Deploy ZIP: `paskamerpraat-pwa-v60.1.43-merkprofiel.zip`

### v60.1.62 — Auto-Refresh User Data + Owner-Aware Cache (huidige sessie)
- **🔴 Root cause "oude gegevens"**: 
  1. Premium cache TTL was **5 minuten** → user-switch toonde 5 min lang oude status.
  2. Cache had geen owner-tag → cache van user A bleef bestaan voor user B.
  3. Hub-menu render gebruikte `fetchStatus(false)` (cached) → toonde stale "Upgrade naar Premium" voor admin-override users.
  4. Geen auto-refresh op page-navigation of window-focus.
- **🆕 Owner-aware cache** in `premium-v1.js`:
  - TTL verlaagd van 300s → **30s**
  - Cache wordt getagged met `_owner_email` + `_owner_key`
  - `getCached()` verifieert dat cache bij huidige user hoort → anders return null (forceer fresh)
- **🆕 Hub-menu altijd fresh**: `injectIntoCardHub` gebruikt nu `fetchStatus(true)` ipv `false`
- **🆕 Nieuwe module** `/extensions/auth/pp-auto-refresh-v1.js` (190 lines):
  - **Triggers**: `pp:login`, `pp:userchange`, window focus, visibility change, DY.navigeer/toonPagina wrapper, 60s heartbeat
  - **Wat wordt vernieuwd**:
    - `DY.profile` ← Firestore `users/{uid}` met `source:'server'` (bypass IndexedDB cache)
    - Premium status ← force-fresh API call
    - Avatar/initialen DOM ← `DY.updateTopbarAvatar()` + `DY.updateNav()`
    - Campagnes ← `PP_CampaignRenderer.refresh()`
  - **Throttle**: 800ms burst-protectie + 60s heartbeat
  - Fires `pp:refreshed` event voor andere modules
- Cache: ext `?v=1.0.13`, `?v=60.1.62-owner-aware-cache`, sw `v60.1.62`

### v60.1.61 — Guest-avatar fix (huidige sessie)
- **🔴 ROOT CAUSE**: in `pwa-v463-*.js` `DY.updateNav()` regel 890-895 stond een `if/else-if` zonder **else**-tak voor uitgelogde state. Logout zette label correct op "Inloggen" maar avatar-HTML met oude initialen ("WI") bleef in DOM.
- **🩹 Fix**: derde tak toegevoegd die `sbAvatar.innerHTML` reset naar generic person SVG icon wanneer `!DY.user`.
- Cache: legacy `?v=60.1.61-guest-avatar-fix`, sw `v60.1.61`

### v60.1.60 — Session Cleanup & Cache Isolation (huidige sessie)
- **🔴 Root cause**: na logout bleven user-specifieke caches in localStorage staan → vorige avatar/premium/instellingen lekte naar volgende sessie of guest-state.
- **🆕 Nieuwe extension**: `/app/pwa/extensions/auth/pp-session-cleanup-v1.js` (269 lines):
  - Wrapt `DY.uitloggen` — voert legacy cleanup uit + extra purge
  - **localStorage purge** (exact keys): `dy_premium_cache`, `dy_premium_email`, `dy_premium_userkey`, `dy_premium_pending`, `dy_admin_secret`, `dy_saved_looks`, `dy_bookmark_queue`, `dy_overlay_dismissed_until`, `dy_brand_portal_*`, `dy_wallet_*`, `dy_user_*`, `dy_garderobe_*`, `dy_notif_cache`, `dy_ai_chat_session`
  - **Prefix purge**: `dy_outfit_score_*`, `dy_activiteit_maand_*`, `dy_premium_*`, `dy_wallet_*`, `dy_brand_portal*`, `dy_ai_*`, `dy_review_draft_*`, `dy_outfit_draft_*`
  - **sessionStorage purge**: `_dy_actieve_pagina`, `dy_overlay_gezien`, `dy_safety_shown`, `dy_route_freeze`
  - **Whitelist (NIET gewist)**: `dy_app_version`, `dy_install_v`, `dy_pwa_geinstalleerd`, `dy_item_poll_id`, `dy_item_poll_stem`, `dy_consent`, `dy_theme`, `dy_locale`
  - **In-memory cleanup**: `PP_CampaignRenderer._unsubscribe`, `PP_FeedTabs` Uitgelicht-grid, `PP_Wallet._state`, `PP_AdminPremium._state`
  - **Topbar refresh**: ruimt avatar-img src op zodat geen vorige avatar zichtbaar blijft
  - **User-switch detectie**: `firebase.auth().onAuthStateChanged` vergelijkt UID — bij wijziging triggers automatisch purge + premium-refetch
  - **Cross-tab sync**: luistert op `storage` events voor `firebase:authUser:*` — logout in tab A wist ook tab B/C
  - **CustomEvents**: `pp:logout`, `pp:userchange`, `pp:login` — andere extensions kunnen zelf hun state resetten
- **Premium-v1.js**: luistert nu op `pp:logout` (wist `dy_premium_cache` + sluit manage-modal) en `pp:userchange` (forceer fresh fetch).
- **Admin-premium-v1.js**: reset internal `_state` op `pp:logout` / `pp:userchange`.
- Public API: `window.PP_Session.purgeAll()` voor handmatige purge in dev-tools.
- Cache: `?v=1.0.12-session`, sw `v60.1.60`
- Deploy ZIP: 2.5 MB

### v60.1.59 — Premium Manage Modal + 403 verklaring (huidige sessie)
- **🐛 Root cause "Beheer abonnement" alert**: `openCustomerPortal()` deed `POST /api/billing/portal` → backend retourneert 501 → JS deed `alert(d.detail)` → lelijke browser dialog.
- **✅ Fix**: vervangen door volwaardige in-app **`#dy-prem-manage-overlay`** modal in `js/premium-v1.js`:
  - Premium users zien: status pill, plan, sinds-datum, vervaldatum, account-email, feature-lijst
  - "Opzeggen via e-mail" knop (mailto: info@doubleyousmallandtall.nl, auto-fill email + onderwerp)
  - Bron-aware: `premium_monthly` (Stripe) / `premium_admin` (env) / `premium_grant` (handmatig) → toont juiste opties
  - Non-premium fallback: "Word Premium" CTA + Sluiten knop
  - WCAG: aria-modal, focus trap via overlay click, ESC-vriendelijk
  - Volledig dark theme, geen browser alert(), geen 403, geen 501
- **⚠️ 403 op `/api/webhook/stripe`**: dit is GEEN bug — webhook endpoints zijn altijd POST-only. K8s ingress retourneert 403 op GET (public preview retourneert 405 = correct). Stripe Webhooks gebruiken alleen POST → geen impact op productie.
- **🆕 PP_Premium alias** exposed (`window.PP_Premium = window.DY.premium`) voor inline onclick.
- Cache: `premium-v1.js?v=60.1.59-manage-modal`, sw `v60.1.59`

### v60.1.58 — ULTIMATE STABILIZATION (huidige sessie)
- **🔴 ROOT CAUSE GEVONDEN**: 14 occurrences van dode preview URL `fitting-chat-app.preview.emergentagent.com` in 8 frontend files. Verklaart bulk van 32 console errors + Stripe "NIET GECONFIGUREERD" — alle fetches faalden silently door DNS-fout.
- **Globale URL fix** (sed search-replace): vervangen door live URL `paskamer-stability.preview.emergentagent.com` in:
  - `js/premium-v1.js`, `js/virtual-tryon-v1.js`, `js/outfit-score-v1.js`, `js/weekly-stylist-v1.js`, `js/card-actions-v1.js`, `js/error-logger-v1.js`, `js/admin-errors-v1.js`, `index.html` preconnect, `_headers` CSP.
- **Admin panel apiBase() opgewaardeerd**: gebruikt nu `DY.aiHealth.apiBase()` (canonical) met hostname-based fallback — zelfde patroon als premium-v1. Toont "Backend ONLINE" pill in Stripe Status tab.
- **🩹 Backend stabilization stubs** — voorkomt 404 spam (alle 11 missing endpoints):
  - `POST /api/client-error` + `DELETE` + `GET /api/client-error/recent`
  - `POST /api/ai/score-outfit`, `POST /api/ai/style-assistant`, `POST /api/ai/similar-items`
  - `POST /api/tryon`, `GET /api/proxy-image`, `POST /api/report`, `POST /api/weekly-stylist`
  - Alle retourneren graceful 200 met empty/disabled state — geen UI crashes.
- **Idempotent stripe-events**: bestaand webhook handler logt nu zowel verified als invalid events naar `stripe_events` collection voor admin monitor.
- Cache bumps overal: legacy `?v=60.1.58-stable-urls`, ext `?v=1.0.11`, sw `v60.1.58`.

**Resultaat (verwacht na deploy):**
- ✅ Console errors: 32 → ~0 (dode URL was de hoofdoorzaak)
- ✅ Stripe Status: NIET GECONFIGUREERD → Gekoppeld (test)
- ✅ Backend pill toont API base URL voor transparantie
- ✅ Alle legacy endpoints geven graceful response i.p.v. 404

### v60.1.57 — Premium Admin Page + Full Entitlement System (huidige sessie)
- **🆕 Admin route `admin_premium`** in `/app/pwa/extensions/admin/pp-admin-premium-v1.js`:
  - **6 tabs**: Stripe status / Checkout debug / Premium users / Transactions / Webhooks / Entitlements
  - Stripe status: gemaskeerde key, env, webhook URL, packages, admin-overrides
  - **Checkout debug**: knop maakt directe test-sessie + toont raw response, redirect URL, errors
  - Users tabel: grant (1-3650 dagen) + revoke + bron-pill (admin_override / stripe / admin_grant)
  - Transactions: payment_transactions log met status-pills
  - Webhooks: stripe_events monitor (verified/invalid badges + raw payload viewer)
  - Entitlements resolver: laat per email zien welke features actief zijn (virtual_tryon, style_score, ai_fit_chat, similar_search, premium_badge, outfit_analyse)
  - Admin auth: X-Admin-Secret prompt (LS cached) + X-User-Email auto
- **Backend** (`server.py`): 7 nieuwe endpoints onder `_check_admin_access`:
  - `GET /api/admin/premium/stripe-status`
  - `POST /api/admin/premium/test-checkout`
  - `GET /api/admin/premium/users`
  - `POST /api/admin/premium/grant` (body: email, days, note)
  - `POST /api/admin/premium/revoke`
  - `GET /api/admin/premium/transactions?limit=50`
  - `GET /api/admin/premium/webhooks?limit=50`
  - `GET /api/admin/premium/entitlements?email=...`
- **Centralized entitlement resolver**: priority admin_override > stripe > admin_grant > none
- **Webhook hardening**: stripe_events audit log voor zowel verified als invalid events. Idempotent premium-grant via session_id check.
- **Nieuwe MongoDB collections**: `stripe_events`, `premium_audit` (geen wijzigingen aan bestaande).
- Cache: ext `?v=1.0.10-premium-mgmt`, sw `v60.1.57`
- Deploy ZIP: 2.5 MB

### v60.1.56 — Admin Premium Override (huidige sessie)
- **🔑 Admin-account `williamdevriesis@gmail.com` krijgt altijd Premium-toegang** zonder betaling:
  - Backend (`/api/premium/status`): leest `ADMIN_PREMIUM_EMAILS` env var (comma-separated list), case-insensitive match op `email` of `user_key` query param
  - Frontend (`premium-v1.js`): `fetchStatus()` stuurt nu ook `&email=<currentUser.email>` mee zodat backend override kan toepassen ook bij Firebase-UID gebaseerde keys
  - Response: `{"is_premium":true,"plan":"premium_admin","activated_at":"admin-override"}`
- Env: `ADMIN_PREMIUM_EMAILS=williamdevriesis@gmail.com` toegevoegd aan `/app/backend/.env`
- Cache bumps: `premium-v1.js?v=60.1.56-admin-override`, sw.js `v60.1.56`

### v60.1.55 — Stripe Premium Checkout + Outfit Score stub (huidige sessie)
- **💳 Stripe Premium Checkout** (via `emergentintegrations.payments.stripe.checkout`):
  - `POST /api/checkout/session` — body `{package_id, origin_url, user_key, email}` → `{url, session_id}`
  - `GET /api/checkout/status/{session_id}` — Stripe-status + idempotent premium-activatie
  - `GET /api/premium/status?user_key=...` — `{is_premium, plan, activated_at, email}`
  - `POST /api/billing/portal?user_key=...` — placeholder 501 (test-key heeft geen customer portal)
  - `POST /api/webhook/stripe` — webhook handler met signature-verificatie + idempotent activatie
- **🔒 Security**: Server-side `PREMIUM_PACKAGES = {premium_monthly: 4.99 EUR}`. Frontend kan amount NIET manipuleren.
- **🧾 MongoDB collections**:
  - `payment_transactions`: `{session_id, user_key, email, package_id, amount, currency, payment_status, status, premium_activated, metadata, created_at, completed_at}`
  - `premium_users`: `{user_key, email, plan, is_premium, activated_at, last_session_id}`
- **🎯 Idempotency**: premium wordt MAXIMAAL 1× toegekend per session_id (zowel via status-poll als webhook).
- **🛠️ Outfit Score stub** (`POST /api/outfit-score`): deterministic placeholder 70-95 op basis van `image_hash`. Stopt 404-spam in console; volledige Gemini Vision implementatie kan later.
- Env: `STRIPE_API_KEY=sk_test_emergent` toegevoegd aan `/app/backend/.env`.

### v60.1.54 — UI cleanup + dark cards + Trending herstel + Merken clipping (huidige sessie)
- **🗑️ Duplicate header strip verwijderd** (`pp-campaign-renderer-v1.js`):
  - `tryInject()` skipt nu volledig het `'feed'` placement
  - Geen "Voor jou geselecteerd" duplicate meer bovenaan /feed en /merken
  - Campagnes verschijnen UITSLUITEND in: (a) Uitgelicht-tab, (b) bestaande /merken `bp-campagne-feed` sectie, (c) andere placements (stories/ai_assist/outfit_review/similar)
- **🔄 Trending tab hersteld** (`pp-feedtabs-v1.js`):
  - Alleen "Mijn posts" wordt nog verborgen
  - Tab-volgorde: Ontdek ⭐ → Mijn postuur → Trending → Uitgelicht
  - Herstel-logica voor oude clients die Trending eerder verborgen hadden
- **🎨 Dark theme cards in Uitgelicht** (huisstijl-normalisatie):
  - Verwijderd: hardcoded cream/beige (`#fdf8f0`, `#1e1a0f` op licht)
  - Gebruik nu dark tokens matching `.bp-campagne-kaart`:
    - background `linear-gradient(135deg, rgba(212,145,10,.10), rgba(255,255,255,.04))`
    - border `rgba(212,145,10,.28)`, text `#fcf8ef`, accent `#d4910a`
  - WCAG AA contrast: white text op solid dark backing
  - Responsive grid: 1-col mobile / 2-col 600px+ / 3-col 1024px+
- **📐 Merken pagina clipping fix** (`brand-portal.css`):
  - `.bp-page` krijgt `min-height: 100vh` + `padding-bottom: calc(120px + env(safe-area-inset-bottom))`
  - Geen content cut-off meer onderaan op mobile/desktop
- Cache bumps: ext `?v=1.0.10`, css `?v=60.1.54-merken-clipping`, sw `v60.1.54`
- Deploy ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB)

### v60.1.52 — Feed Tabs Restructure + null-uid guard
- **🆕 Navigatie Herstructurering** (`/extensions/placements/pp-feedtabs-v1.js` v2.0.0):
  - Verbergt "Trending" tab (`data-filter="populair"`)
  - Verbergt "Mijn posts" tab (`data-filter="mijn"`)
  - Voegt **"Uitgelicht"** tab toe (`data-filter="uitgelicht"`)
    - Toont alleen campagnes + gesponsorde merken (live van Firestore)
    - Reuses `PP_CampaignRenderer.getLive()` cache, fallback `.get()` voor anoniem
    - Klik op kaart → `PP_CampaignRenderer.click()` → brand detail
  - Idempotente MutationObserver — overleeft legacy re-renders
  - DY.setFilter wrapped → herstelt normale feed bij switch
  - Volledig responsive (1-col mobile, 2-col desktop ≥600px)
  - Brand-aligned styling (DM Sans + Cormorant Garamond)
- **🐛 Fix legacy null-uid crash** (pwa-v463 line 9834):
  - `controleerMeldingen` onSnapshot-error handler las `DY.user.uid` zonder null-check
  - Added guard: `if (!DY.user || !DY.user.uid) return;`
- Cache bumps: `?v=1.0.9-nav-restructure` + sw `v60.1.53`
- Deploy ZIP: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB)

## Backlog / Volgende stappen
**P0 — Wallet backend activatie (geblokkeerd op user-credentials):**
- Shopify Admin API token → activeer auto-credit webhook
- Firebase Service Account JSON → backend SDK voor wallet_balance update


**P1 — Brand Portal verificatie (na deploy van v60.1.43):**
- Product upload flow (drag/drop, compressie, 2MB limiet)
- Campaign Builder (live budget berekening, objective settings)
- Results Dashboard / Analytics (impressies, reach, CTR, CSV export)
- Admin Campaign Control (pause/resume, budget overrides, revenue dashboard)
- E2E test: registreer brand → wacht op approval → dashboard → profiel bewerken → producten → campagne → analytics

**P2 — UX gaten (gerapporteerd in Fase 8, NIET geïmplementeerd):**
- Account-email wijzigen via Firebase Auth re-auth
- "Bekijk als klant" knop op profiel
- Logo cropper (1:1 enforcement)
- Status-tellers op admin-tabs
- KvK-nummer + adres velden
- Profile-completeness indicator

**P2 — Tech debt:**
- CSP review (4 page-errors in console)
- Monolithische `pwa-v463-*.js` modularisatie (door user uitgesloten)

## Strikt forbidden
- Geen refactoring zonder expliciete user-toestemming
- Geen wijzigingen aan `_headers` CSP zonder reden
- Cache-bumping ALTIJD bij JS/CSS wijzigingen (index.html `?v=` + sw.js `VERSION`)

## Admin credentials
- `williamdevriesis@gmail.com` - secret header `wivri` voor backend API

## v60.1.82 (2026-02-14) - Social icons in footer
- "Volg ons" rij toegevoegd boven legal links:
  - Instagram (@paskamerpraat) - https://www.instagram.com/paskamerpraat
  - TikTok (@doubleyou_fitcheck) - https://www.tiktok.com/@doubleyou_fitcheck
- Pill-shaped chips: goud border, icon + handle, hover state met
  translate-up + lichter goud.
- Inline SVG icons (geen externe assets/dependencies), 18x18px.
- "VOLG ONS" caption in goud-tint, uppercase, letter-spacing.
- Responsive: <380px tonen alleen icons (handle verborgen).
- ARIA labels + target="_blank" rel="noopener noreferrer" voor security.
- Cache bump: SW v60.1.82-footer-social.

## v60.1.81 (2026-02-14) - Footer alleen op homepage
- Legal footer wordt nu alleen getoond als `DY.pagina === 'home'`.
- Helper `isHomePagina()`: source of truth = `DY.pagina`, fallback
  naar `?pagina=` query of root path.
- `updateFooterVisibility()` zet `display:''` of `display:none`.
- Navigation hooks: `hashchange`, `popstate`, delegated click op
  `[data-pagina]` / `.dy-nav-item` / `.dy-sb-item`, plus 1.5s
  safety polling (DY router heeft geen eigen route-event).
- Cache bump: SW v60.1.81-footer-home-only.

## v60.1.80 (2026-02-14) - Goud-getinte W wordmark in legal footer
- Subtiel cirkel-icoon met "W" (Playfair Display serif) toegevoegd
  boven de footer-links, centraal uitgelijnd.
- Goud-radial gradient achtergrond `rgba(232,200,120,.18)` →
  `rgba(212,145,10,.06)` → transparent, 1px goud border (.35 opacity),
  text-shadow voor zachte gloed.
- Hover: lichte rotatie + scale + helderdere goud tint.
- Geen extra dependencies; pure CSS, 36x36px footprint.
- Cache bump: SW v60.1.80-footer-wordmark.

## v60.1.79 (2026-02-14) - Footer hersteld + kleur-fix
### Misverstand vorige sessie
v60.1.78 verwijderde de footer per ongeluk; gebruiker wilde alleen de
KLEUREN aanpassen. De vorige CSS had `background:transparent` waardoor
op brand-portal pagina's (cream `var(--cream)` body sections) de
lichte tekst onleesbaar werd tegen lichte achtergrond.

### Fix
- `injectFooter()` weer geactiveerd in `init()`.
- Cleanup van eventuele dubbele cached injecties bij init.
- CSS volledig herwerkt voor consistente dark look ongeacht pagina:
  - `background: #0a0806` (solid donker, geen doorlek meer)
  - `color: rgba(252,248,239,.78)` (helderdere tekst voor leesbaarheid)
  - `border-top: 1px solid rgba(212,145,10,.18)` (subtiele goud-accent)
  - Separator `·` in goud-tint (`rgba(212,145,10,.45)`)
  - Links iets prominenter (`#fcf8ef` ipv 70% opacity)
  - Copyright op aparte regel als `.pp-legal-copy` met eigen styling
  - Wrapper `.pp-legal-row` voor flex-wrap op smalle schermen
  - Media query <=520px: links wrappen netjes, geen overlap
  - `padding-bottom: calc(110px + env(safe-area-inset-bottom))` voor
    iPhone notch-respect onder de bottom-nav
- HTML structuur: separator van inline naar gestructureerd
  `<div class="pp-legal-row">` + `<div class="pp-legal-copy">`

### Cache discipline
- SW VERSION → `v60.1.79-20260214-footer-colors`
- `pp-legal-footer-v1.js?v=60.1.79-footer-colors`
- `pp-brand-config-v1.js?v=60.1.79-footer-colors`
- `PP_BRAND.version` → `v60.1.79`

### Niet gewijzigd
- TOS-banner functionaliteit
- Voorwaarden-pagina
- Brand portal mid-page footer
- Alle bestaande flows en routes

## v60.1.78 (2026-02-14) - Footer cleanup + leaked JS-code fix
### Root cause: zichtbare JS-code leak op mobiel
Op mobiele schermen was er ruwe JavaScript zichtbaar als tekst onder
de pagina-content: `_check', Date.now().toString()); } catch(e) {} })();`
Oorzaak: in `index.html` stond na regel 1175 (`</html>`) een dubbel-gekopieerd
fragment van het PWA-removal IIFE block, ZONDER omsluitend `<script>` tag.
De browser rendert dit als tekst.
Fix: het dangling fragment (regels 1176-1181) verwijderd.

### Legal footer-blok onderin verwijderd
Op verzoek van gebruiker is het zichtbare blok onderaan iedere pagina
weggehaald (Gebruikersreglement, Acceptable Use, Privacy & Cookies,
Algemene Voorwaarden, Campagnevoorwaarden + copyright + versienummer).
- `injectFooter()` call in `pp-legal-footer-v1.js init()` uitgecommentarieerd
- Bij init wordt elk reeds geinjecteerde `#pp-legal-footer` element
  uit de DOM verwijderd (cleanup voor gebruikers met oude cache)
- **Belangrijk**: de TOS-acceptatie banner voor merken (`checkTosAcceptance`)
  blijft volledig actief. Alleen het zichtbare footer-blok is uit; de
  legale verplichting voor merken om voorwaarden te accepteren is intact.
- De voorwaarden-pagina `/voorwaarden/` blijft bereikbaar en zichtbaar.

### Cache discipline
- SW VERSION → `v60.1.78-20260214-footer-cleanup`
- `pp-legal-footer-v1.js?v=60.1.78-footer-cleanup`
- `pp-brand-config-v1.js?v=60.1.78-footer-cleanup`
- `PP_BRAND.version` → `v60.1.78`

### Niet gewijzigd
- Bestaande functionaliteit, routes, flows
- TOS-acceptatie banner voor merken
- Voorwaarden-pagina inhoud
- Brand portal mid-page footer ("Algemene voorwaarden · Privacybeleid · Contact")
  blijft staan (dat is een andere footer, niet de legal-extension)

## v60.1.77 (2026-02-14) - SW stabilisatie + Promise rejection cleanup
### Root cause analyse
De gerapporteerde "Promise rejection x13/x15 - Failed to update a
ServiceWorker" was de combinatie van:
1. **Dubbele SW registratie**: `index.html` (inline `<script>` op `load`)
   en `js/sw-auto-update-v1.js` registreerden beide `/sw.js`. Race
   condition + de inline registratie miste `updateViaCache: 'none'`,
   waardoor `sw.js` zelf browser-cached werd.
2. **Unhandled async rejection**: `setInterval(() => reg.update())` in
   `sw-auto-update-v1.js` had alleen `try/catch`, maar `reg.update()`
   retourneert een Promise - synchroon try/catch vangt async rejection
   niet. Elke minuut polling op stale registratie = nieuwe rejection.
   13/15 = polling-cycles bij user.
3. **Geen vangnet**: er was geen globale `unhandledrejection` listener
   die benigne SW-ruis filterde.

### Fixes (alleen technisch, geen UI/flow changes)
- **`index.html`**: dubbele inline SW-registratie verwijderd.
  `sw-auto-update-v1.js` is nu single source of truth voor SW lifecycle.
- **`js/sw-auto-update-v1.js`**: `reg.update()` calls in setInterval +
  visibilitychange handler nu omhuld met `.catch()` om unhandled
  rejections te voorkomen. 6 lege `catch (e) {}` blokken vervangen
  door `catch (e) { /* noop */ }` voor lint-conformiteit.
- **`extensions/stability/pp-promise-guard-v1.js`** (NIEUW):
  globale `unhandledrejection` + `error` listener. Filtert benigne
  patterns (SW update failures, fetch aborts, manifest load fails)
  en voorkomt console-spam. Echte business-logic errors blijven
  zichtbaar en gaan naar `DY.logError` indien beschikbaar.
  Ring buffer 50 events via `window.PP_PROMISE_GUARD.recent()`
  voor diagnose. Geladen als EERSTE script (zelfs voor brand-config).
- **`sw.js`** VERSION naar `v60.1.77-20260214-sw-stability` - forceert
  schone cache namespace voor alle clients en deactiveert oude
  registraties bij activate-event.

### Audit resultaten
- JS syntax: 54/54 files pass `node -c`
- ESLint: nieuwe files clean, sw-auto-update clean (was 6 violations)
- Backend pytest: 10/10 pass (inclusief outfit-score Gemini + fallback)
- Backend health: 200 OK
- Geen UI of flow wijzigingen
- Geen route changes
- Geen database structuur changes
- Geen functionaliteiten verwijderd
- Bestaande caching strategie behouden (network-first HTML, cache-first
  versioned JS, stale-while-revalidate CSS/fonts, etc.)

## v60.1.76 (2026-02-14) - Theme config + Echte Gemini Vision Outfit Score
- **PP_THEME config** (`extensions/config/pp-theme-config-v1.js`):
  `window.PP_THEME = { current, presets, apply, switch, get }`.
  4 presets: `default` (donker goud), `light`, `kerst` (rood), `lente`
  (groen). Bij init: injecteert CSS custom properties op `:root`
  (`--pp-primary`, `--pp-accent`, `--pp-ink`, `--pp-bg`, etc.).
  Voorkeur in localStorage `dy_theme`. Reset bij `pp:logout`.
  CustomEvent `pp:theme-change` voor luisteraars. Bestaande CSS blijft
  werken; nieuwe code kan `var(--pp-primary)` gebruiken.
- **Echte Gemini Vision Outfit Score** (`backend/server.py POST /api/outfit-score`):
  Vervangt deterministic stub. Gebruikt Emergent LLM Key + emergentintegrations
  library met model `gemini-3.1-pro-preview` (vision-capable).
  Request: `photo_b64`, `photo_mime`, `request_id`, `image_hash`.
  Response: `score (0-100)`, `label`, `summary`, `tips[]`, `color_palette[]`,
  `breakdown {kleur, fit, styling, occasion}`, `source`.
  Markdown-fence stripping + sanitisatie + clamp 0-100.
  Fallback bij key/parse fout → deterministic placeholder (geen 500).
  Tests: `/app/backend/tests/test_outfit_score.py` (2 pass).
  Live test op localhost: score 68, Gemini analyseerde kleuren correct
  (rood/blauw/zand palette), response ~10s.
- **Lint cleanup**: 2 ruff blockers opgelost (E401 import on one line +
  F811 duplicate ai_health route).
- **Cache discipline**: SW VERSION naar `v60.1.76-20260214-theme-vision`,
  brand config + theme config script tags geregistreerd met `?v=60.1.76`.

## v60.1.75 (2026-02-14) - Full Doubleyou rebrand + centralized config
- **Branding**: alle 195 occurrences van "Paskamer Praat" in productie
  bestanden vervangen door "Doubleyou". CHANGELOG-*.md en workers/*
  bleven intact (historische docs / aparte deploys).
- **Tagline**: "Tailored for Tall & Plus Size" toegevoegd aan
  page title, og:title, twitter:title, manifest.name + description.
- **Manifest.json**: name "Doubleyou - Tailored for Tall & Plus Size",
  short_name "Doubleyou", description bijgewerkt.
- **Centrale config** (`extensions/config/pp-brand-config-v1.js`):
  `window.PP_BRAND = { appName, tagline, fullName, organisation,
  domain, version, contactEmail, formatDate }`. Frozen object.
  Legal footer en andere extensies lezen versie/naam hieruit i.p.v.
  hardcoded strings. Laadt als EERSTE script (`defer`) zodat alle
  legacy code window.PP_BRAND kan gebruiken.
- **Legal footer** (`pp-legal-footer-v1.js`): hardcoded "v60.1.72"
  verwijderd, leest nu PP_BRAND.version. Jaar via `new Date().getFullYear()`
  i.p.v. hardcoded "2026". Marker attr `data-pp-copy` voor live update.
- **Voorwaarden**: dubbele "h.o.d.n. Doubleyou" naam-redundantie weggehaald.
- **Cache discipline**: alle index.html + admin.html script/css tags
  uniform `?v=60.1.75-doubleyou-rebrand`, SW VERSION naar
  `v60.1.75-20260214-doubleyou-rebrand`.
- **Stability**: 0 syntax errors (`node -c` pass op alle JS), JSON valid.

## v60.1.74 (2026-02-14) - Emails uniform + 3 P2 features
- **Emails**: Alle `@paskamerpraat.nl` adressen (support/privacy/partners/no-reply/legal/security)
  vervangen door `info@doubleyousmallandtall.nl`. Scope: HTML, JS, MD, JSON
  in `/app/pwa/`, `/app/backend/` en `/app/memory/legal/`. Login-emails
  (test users williamdevriesis@gmail.com en mozenlow2023@gmail.com) bleven
  ongewijzigd; SMTP-template placeholders ook.
- **P2 Brand A-Z sticky index bar** (`/extensions/placements/pp-brand-az-index-v1.js`):
  additieve extensie, plakt sticky letterbalk boven `#bp-merken-lijst`,
  letters zonder merk worden gedimd, scroll-naar-eerste-merk per letter,
  diakrieten genormaliseerd. data-testids: `brand-az-index-bar`,
  `brand-az-letter-{LETTER}`.
- **P2 Recente activiteit in profiel** (`/extensions/profile/pp-recente-activiteit-v1.js`):
  laadt laatste 5 stories van de ingelogde gebruiker via Firestore,
  toont icon (categorie-based) + titel + relatieve tijd. Geinjecteerd
  na `#dy-profiel-badges`. Fallback bij ontbrekende index. data-testids:
  `pp-recente-activiteit`, `pp-act-list`, `pp-act-row-{id}`, `pp-act-leeg`.
- **P2 Volgende factuur in premium modal** (`js/premium-v1.js`):
  voor `plan === 'premium_monthly'` toont nu "Volgende factuur: [datum]
  (€4,99 via Stripe)" gebaseerd op `expires_at` (= einde huidige periode
  = eerstvolgende incasso). data-testid: `prem-volgende-factuur`.
- Service Worker VERSION naar `v60.1.74-20260214-az-recente-factuur`,
  index.html script tags geregistreerd met v60.1.74-az-recente-factuur.

## v60.1.73 (2026-02-14) - Em-dash cleanup definitief + cache bump
- Volledige sweep: alle em-dashes (-) verwijderd uit ALLE productie bestanden
  (HTML, JS, CSS). Vorige claim was foutief; er stonden er nog ~1.500.
- Alle `?v=` querystrings in index.html en admin.html uniform gebumpt naar
  `60.1.73-cleanup-emdash` (47 script/css tags).
- Service Worker VERSION naar `v60.1.73-20260214-cleanup-emdash`.
- ZIP herbouwd: `/app/01-paskamerpraat-pwa-cloudflare.zip` (2.5 MB, 156 files).
- Syntax check: alle JS bestanden valid (`node -c` pass).
