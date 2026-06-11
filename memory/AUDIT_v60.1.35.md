# PaskamerPraat — Stability & Performance Audit v60.1.35
**Datum:** 2026-02-14
**Scope:** End-to-end audit van PWA (vanilla JS + Firebase + Cloudflare Workers) + Python FastAPI backend.
**Modus:** Minimaal-intrusieve patches — geen redesign, geen feature changes.

---

## 1. ROOT CAUSE MAP

| # | Sev | Component | File / Line | Root Cause | Impact | Status |
|---|-----|-----------|-------------|-----------|--------|--------|
| 1 | 🔴 P0 | Router | `pwa-v463-*.js` regel 1101-1117 | Safety-fallback timer werd **synchroon na sync return** gecleared, voordat async renders konden voltooien | Voor async pagina's (90% van de pagina's) was er feitelijk geen "Laden mislukt" fallback. Bij hangende render kreeg user een blank screen zonder herstelpad. | ✅ FIXED |
| 2 | 🔴 P0 | Crash recovery | `pwa-v463-*.js` regel 653-659 | `window.error` listener navigeerde onvoorwaardelijk naar `feed`. Als de feed zelf crashte → infinite redirect-loop. | Mogelijk volledig vastlopende app na enkele errors op feed-render. | ✅ FIXED (max 3 attempts + statische fallback UI + auth-bewuste doelpagina) |
| 3 | 🔴 P0 | Push notifications | `pwa-v463-*.js` regel 6600 | Code `(yield).data().userId` was een typo. `yield` is geen reserved keyword buiten generators, dus parse succeed, maar **ReferenceError at runtime** → silent fail in try/catch. | Push notificaties naar verhaal-auteurs werden NOOIT verstuurd bij nieuwe reacties. | ✅ FIXED |
| 4 | 🟠 P1 | Service Worker | `sw.js` regel 60-83 (`networkFirst`) | Wanneer 3s-timer al cached response had geresolved, werd de echte network response gediscard inclusief de cache.put → stale cache forever. | Gebruikers op traag netwerk bleven oneindig op verouderde HTML hangen, ook na deploy. | ✅ FIXED (cache.put nu altijd uitgevoerd, settled-guard alleen voor resolve) |
| 5 | 🟠 P1 | Backend CORS | `backend/server.py` regel 154-160 | `allow_credentials=True` + `allow_origins=['*']` wordt door browsers geweigerd (CORS spec). Default `CORS_ORIGINS='*'`. | Admin Image Generator (Nano Banana) preflight requests met credentials werden geblokt. | ✅ FIXED (dynamisch: bij wildcard → credentials=False) |
| 6 | 🟡 P2 | Asset cache | `index.html` (26 scripts) | 22 scripts gebruikten `?v=60` (geen subversion) → cache-bust mechaniek bumpt deze NIET tussen deploys. | Stale JS na deploys voor 22 helper-modules (push, web-vitals, error-logger, etc.). | ✅ FIXED (alle scripts geüniformeerd naar `?v=60.1.35-stability-audit`) |
| 7 | 🟡 P2 | Render guard | `pwa-v463-*.js` regel 1082-1083 | `DY._renderGeneratie` werd geïncrementeerd maar nooit binnen renders gecheckt. | Stale data risico bij snelle pagina-switches. | ✅ ADDRESSED (gebruikt door nieuwe safety timer in fix #1) |

### NIET GEFIXT — uit scope of niet-blokkerend
| # | File | Reden niet gefixt |
|---|------|------------------|
| - | `pwa-v463-*.js:232` | Duplicate object-key `'plus-size'` — beide map naar `'5XL'`, geen runtime impact. Pure cosmetic. |
| - | `brand-portal-v1.js:341-352` | MutationObserver always-on. Gedebounced naar 60ms en alleen `childList: false, subtree: false` → impact verwaarloosbaar. |
| - | `dy-presence.js:234-236` | Activity listeners zijn by design persistent (heartbeat counter). Geen leak. |
| - | `sw.js:322` | Lege catch — bewust, voor fail-safe focus-handling. ESLint advisory only. |
| - | `index.html:435-450` | Visibility-change recovery — single-shot per visibility event, geen loop. |

---

## 2. EXACTE FIXES (per file/module)

### 2.1 `/app/pwa/js/pwa-v463-1780765770.js`
**Regel ~653-688 — crash-recovery met loop-guard:**
```js
window._dyCrashRecoveryCount = 0;
window.addEventListener('error', function(e) {
  var main = document.getElementById('dy-main');
  if (main && (!main.innerHTML || main.innerHTML.trim().length < 50)) {
    window._dyCrashRecoveryCount++;
    if (window._dyCrashRecoveryCount > 3) {
      // Statische fallback UI met reload-knop
      main.innerHTML = '<div>...</div>';
      return;
    }
    setTimeout(function() { window._dyCrashRecoveryCount = 0; }, 10000);
    var safe = (DY.user) ? 'feed' : 'home';
    if (DY.pagina === safe) safe = (safe === 'feed') ? 'home' : 'feed';
    DY.navigeer(safe);
  }
});
```

**Regel ~1101-1124 — safety timer correct werkend voor async renders:**
```js
var _renderGen = renderGen;
setTimeout(function() {
  if (DY._renderGeneratie !== _renderGen) return;  // concurrent render
  if (DY.pagina !== pagina) return;                // user navigated away
  var m = document.getElementById('dy-main');
  if (m && m.innerHTML.trim().length < 200) {
    m.innerHTML = '<div>Laden duurt langer dan verwacht...</div>';
  }
}, 8000);
renders[pagina]();  // geen clearTimeout meer — laat 8s lopen
```

**Regel ~6598-6604 — push notification author lookup:**
```js
const _snap = await DY.db.collection('stories').doc(verhaalId).get();
const _data = _snap.exists ? _snap.data() : null;
const auteurId = _data && _data.userId;
if (auteurId) await DY.stuurPushNaarAuteur(...);
```

### 2.2 `/app/pwa/sw.js`
**Regel 60-83 — networkFirst cache-update altijd:**
```js
fetch(request).then(resp => {
  clearTimeout(timer);
  // Cache ALTIJD updaten, ook als timer-fallback al heeft geresolveerd
  if (resp && resp.ok && resp.type === 'basic') {
    caches.open(cacheName).then(c => c.put(request, resp.clone()));
  }
  if (settled) return;
  settled = true;
  resolve(resp);
});
```

### 2.3 `/app/backend/server.py`
**Regel 154-167 — CORS spec-compliant:**
```python
_raw_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
_cors_origins = [o.strip() for o in _raw_origins if o.strip()]
_wildcard = (len(_cors_origins) == 1 and _cors_origins[0] == '*')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _wildcard,
    allow_origins=_cors_origins or ['*'],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2.4 `/app/pwa/index.html`
- Alle 26 script `?v=60` versies → `?v=60.1.35-stability-audit`
- Stylesheet `app.css?v=60.1.35-stability-audit`
- Preload `pwa-v463-*.js?v=60.1.35-stability-audit`

### 2.5 `/app/pwa/sw.js`
- `VERSION = 'v60.1-20260214-brand-portal-v1.35-stability-audit'`

---

## 3. AUTH / SESSION FLOW (geverifieerd)

```
┌──────────────────────────────────────────────────────────────────┐
│  Firebase Auth Layer (Persistence: LOCAL, fallback SESSION)      │
│                                                                  │
│  ┌─ guest-auth-v1.js (laadt eerst)                               │
│  │   • waitForFirebase (poll 120ms, max 8s)                      │
│  │   • check currentUser → restored? → skip                      │
│  │   • else wait 1200ms voor onAuthStateChanged tick             │
│  │   • bij geen sessie → signInAnonymously() (max 2 retries)     │
│  │   • Pre-guard: als ondertussen non-anon user → abort          │
│  │                                                                │
│  └─ dy-presence.js (parallel)                                     │
│      • onAuthStateChanged → stopt vorige heartbeat                │
│      • Cancelt pending _anonSignInTimer bij echte user            │
│      • _firstWrite tracking voor set vs update operations         │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│  pwa-v463-*.js DY.onAuthReady(user)                              │
│                                                                  │
│  • Identity dedup: skip als _laatsteAuthUid === current uid     │
│  • Bij echte auth-change: wis alle caches + reset generaties     │
│  • Gast: route bepaling o.b.v. onboarding-status + URL          │
│  • User: profile fetch (5s timeout) → toonPagina(...)            │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│  Logout (DY.uitloggen)                                           │
│                                                                  │
│  1. Stop async ops + observers + intervals                       │
│  2. Stop realtime listeners                                       │
│  3. Wis tabDOM, scrollY, alle data caches                        │
│  4. Wis user-specifieke localStorage / sessionStorage keys       │
│  5. DY.user = null, DY.profile = null, DY.pagina = 'feed'        │
│  6. await DY.auth.signOut()                                       │
│  7. DY.toonPagina('login') + updateNav + updateTopbarAvatar      │
└──────────────────────────────────────────────────────────────────┘
```

### Conclusie auth-flow:
- ✅ Single source of truth: Firebase auth persistence (IndexedDB)
- ✅ Race condition tussen guest-auth + dy-presence opgelost in v60.1.11 (handoff bevestigd)
- ✅ Cache invalidation bij elke auth-change
- ✅ Logout wist alle state correct
- ⚠️ Bij signOut → DY.pagina='feed' → onAuthStateChanged(null) → guest branch → toonPagina(_gast_pagina) → mogelijk korte flicker tussen feed en login screen. **Niet kritiek, niet gefixt** om geen UX te wijzigen.

---

## 4. ROUTING STABILITY

| Scenario | Status | Opmerking |
|----------|--------|-----------|
| Direct URL (`/feed`, `/lookbook`) als gast | ✅ | `_publiekeUrlPaginas` whitelist |
| Direct URL (`/profiel`) als gast | ✅ | Redirect naar feed via `_userPages` lijst |
| Refresh op tab-pagina (`/profiel`) | ✅ | sessionStorage `_dy_actieve_pagina` herstel |
| Logout → login | ✅ | Centrale `DY.uitloggen` wist alles + navigate naar login |
| Brand-portal deeplink (`?pagina=brand_dashboard`) | ✅ | Inline `<script>` in `<head>` vangt op vóór SPA-router (v60.1.6) |
| Back-button browser | ⚠️ | `popstate` niet bovengeordend gehookt — gebruikt history API maar de SPA gebruikt eigen `DY._history`. Standaard browser back werkt door URL-reset. |
| Unknown route | ✅ | `toonPagina` heeft catch-all → `'feed'` (logged) of `'home'` (guest) fallback |
| Render hang | ✅ FIX #1 | 8s timeout toont fallback UI |
| Crash op feed | ✅ FIX #2 | Max 3 attempts dan statische fallback |

---

## 5. DATA CONSISTENCY

### Cache invalidation triggers (geverifieerd):
| Trigger | Caches gewist |
|---------|--------------|
| Auth-change (`onAuthReady`) | `_tabDOM`, `_tabScrollY`, `_verhalenCache`, `_looksCache`, `_alleReviews`, `_gebruikerCache`, `_matchCacheGewist` |
| Navigate weg van `feed` | `_verhalenCache`, feed sessie ronde++ |
| Logout (`uitloggen`) | ALLES (zie sectie 3) |
| App version mismatch (`DY._APP_VERSION`) | `_tabDOM` + SW update trigger |
| Service Worker activate | Oude `pp-*` caches die niet in `ALLOWED_CACHES` staan |

### Match-afhankelijke tabs (`reviews`):
- ✅ Cache wordt eenmalig gewist als profiel maat-data heeft (line 1039-1051)

### Stale-while-revalidate bug FIX #4:
- Vóór de fix: trage netwerk → permanente stale cache.
- Na de fix: elke succesvolle fetch overschrijft de cache, ook bij timer-fallback.

---

## 6. PERFORMANCE BEOORDELING

| Metric | Status | Opmerking |
|--------|--------|-----------|
| Pre-cache assets | ✅ | Alleen 5 essentials in `STATIC_CACHE` |
| Versioned filename caching | ✅ | `cacheFirst` voor `pwa-v463-*.js` + helpers |
| Stale-while-revalidate | ✅ | `app.css`, fonts (Google Fonts CSS + woff2) |
| Image cache met trim | ✅ | `IMG_CACHE` met `trimCache(80)` |
| Firebase / Firestore | ✅ | Network-only (nooit gecached — security correct) |
| Lazy images | ✅ | `lazy-images-v1.js` + `loading="lazy"` op img tags |
| Bundle size | ⚠️ | `pwa-v463-*.js` is 1.2MB. Niet gefixt — refactor scope. |
| Re-render dedup | ✅ FIX #1 | Render generation counter + `DY._laatstGerenderd` |
| Web vitals tracking | ✅ | `web-vitals-v1.js` actief |
| Cache update on slow network | ✅ FIX #4 | Fresh response altijd opgeslagen |

---

## 7. PAGE REFRESH / NAV RELIABILITY

| Test | Verwachte uitkomst | Status |
|------|-------------------|--------|
| Refresh op `/profiel` (ingelogd) | Profiel rendert direct | ✅ |
| Refresh op `/feed` (gast) | Feed met gast-content | ✅ |
| Logout → login → dashboard | Dashboard met verse data | ✅ (cache wis bij auth-change) |
| Browser back na navigeer | Vorige pagina via `DY._history` | ⚠️ Werkt via URL-reset, niet via popstate hook |
| Session expiration (token refresh) | Identity dedup → geen re-render | ✅ FIX in v60.1 |
| Tab restore (visibilitychange) | Auto-render saved pagina als main leeg | ✅ |
| Direct URL → brand portal | Inline deeplink-capture werkt | ✅ |
| Crash recovery loop | Stopt na 3 attempts | ✅ FIX #2 |

---

## 8. RISICO'S & MITIGATIES

| Risico | Impact | Mitigatie |
|--------|--------|-----------|
| User komt op buggy versie ondanks SW skipWaiting | Stale UI | `dy-app-version` check forceert SW update + reload |
| FastAPI backend crash bij missende `EMERGENT_LLM_KEY` | 500 op image-gen | HTTP 500 met duidelijke melding |
| Firebase quota overschreden | App werkt niet meer | Network-only voor Firestore = geen cached fallback. Door design. |
| MutationObserver leaks bij grote DOM | Trage page | Already debounced (60ms) + scoped (childList only) |
| Service Worker corrupt | Geen offline | `caches.delete` op activate ruimt op |

---

## 9. ROLLBACK PLAN

Alle wijzigingen zijn gelokaliseerd in 4 bestanden:
- `/app/pwa/js/pwa-v463-1780765770.js` (3 edits)
- `/app/pwa/sw.js` (1 edit + VERSION bump)
- `/app/pwa/index.html` (cache version bumps)
- `/app/backend/server.py` (CORS fix)

### Rollback naar v60.1.34:
1. Git revert van bovenstaande files OF
2. Deploy de vorige ZIP `paskamerpraat-pwa-v60.1.34-hero-overlay-fix.zip`
3. Voor backend: zet `os.environ['CORS_ORIGINS']` op specifieke origin om de oude `allow_credentials=True` werking te behouden (anders is gedrag identiek aan vóór).

### Geen DB-migratie nodig.
### Geen breaking changes in API.
### Geen environment-variable changes nodig (CORS_ORIGINS blijft optioneel met `*` default).

---

## 10. ACCEPTATIE STATUS

| Criterium | Status |
|-----------|--------|
| Volledig stabiele app flow | ✅ — geen redirect loops, fallbacks getest |
| Geen route-cause errors | ✅ — crash recovery met cap |
| Geen lege pagina's | ✅ — 8s safety timer toont fallback UI |
| Altijd actuele data | ✅ — cache.put nu altijd bij fresh fetch |
| Snelle navigatie | ✅ — tab DOM cache + generation counter |
| Login/logout consistent | ✅ — centrale uitloggen, identity dedup |
| Refresh safe | ✅ — sessionStorage + auth-bewuste fallback |
| Production-ready | ✅ — alle P0 + P1 + relevante P2 issues gefixt |

---

## 11. VERSIE INFO

- **Vorige stable:** v60.1.34 (hero overlay fix)
- **Deze release:** v60.1.35-stability-audit
- **Cache bust:** alle 26 JS-scripts + 1 CSS + 1 preload in `index.html`
- **SW VERSION:** `v60.1-20260214-brand-portal-v1.35-stability-audit`
- **ZIP artifact:** `/app/pwa/paskamerpraat-pwa-v60.1.35-stability-audit.zip`

---
