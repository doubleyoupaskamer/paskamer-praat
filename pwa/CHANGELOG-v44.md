# Paskamer Praat v44 PWA P0 Implementation

**Datum:** 2026-02-13
**Type:** Non-invasieve PWA upgrade `pwa-v463-*.js` NIET aangepast.

## Wat is nieuw (P0 audit items)

### 1. Offline fallback pagina
- **Bestand:** `offline.html` (nieuw)
- **SW update:** `sw.js` valt nu terug op `/offline.html` wanneer een navigatie offline mislukt.
- **UX:** Donker bruin/goud thema, automatische online-detectie, "Opnieuw proberen" knop.

### 2. Image lazy-loading observer
- **Bestand:** `js/lazy-images-v1.js` (nieuw)
- **Werking:** IntersectionObserver met 200px rootMargin upgrade `data-src`/`data-srcset` → `src`/`srcset`. Voegt `loading="lazy"` + `decoding="async"` toe aan elke `<img>` (behalve hero/`data-eager="1"`). Werkt ook op dynamisch toegevoegde feed-cards via MutationObserver.

### 3. Network status toast
- **Bestand:** `js/network-status-v1.js` (nieuw)
- **Werking:** Toont rode pill bij offline ("Geen verbinding wijzigingen worden later verstuurd"), groene pill 3 sec bij online. Verifieert connectiviteit via HEAD-ping op `/manifest.json` (lost iOS `navigator.onLine` false-positives op). Publieke API: `window.DY.netStatus.{isOnline,check,showOffline,showOnline,hide}`.

### 4. Background Sync queue
- **Bestand:** `js/bg-sync-v1.js` (nieuw)
- **SW update:** `sw.js` luistert nu naar `sync` event met tag `pp-bg-sync` en drain't de IndexedDB queue.
- **Werking:** Opt-in API `DY.bgSync.queue({url,method,body})` of `DY.bgSync.fetchOrQueue(url, opts)`. Geen globale fetch monkey-patch (Firebase/Anthropic SDK blijven ongemoeid). Fallback voor Safari (geen Background Sync API): drained automatisch op `online` event.

### 5. Hero image preload + fetchpriority
- **`index.html`:** `<link rel="preload" as="image" imagesrcset="..." fetchpriority="high">` voor hero (480/800/1024 webp varianten).

### 6. Preconnect upgrade voor Anthropic API + avatars
- **`index.html`:** `dns-prefetch` → `preconnect` voor `api.anthropic.com` en `lh3.googleusercontent.com` (sneller eerste AI-call + avatar render).

### 7. Cache-busters bumped naar v44
- **`index.html`:** alle `?v=43` → `?v=44`.
- **`sw.js`:** `VERSION = 'v44-20260213-pwa-p0-offline-lazy-netstatus-bgsync'` → forceert nieuwe cache buckets en oude worden bij `activate` verwijderd.

## Wat al bestond (NIET gewijzigd / niet gedupliceerd)
- ✅ PWA install banner (Android `beforeinstallprompt` + iOS instructie) staat al in `index.html` inline.
- ✅ SW auto-update toast staat al in `js/sw-auto-update-v1.js`.
- ✅ Share Target `js/share-target-v1.js`.
- ✅ Composer autosave, app badge, push notifications, hub menu allemaal ongewijzigd, alleen cache-buster gebumpt naar `?v=44`.

## Bestanden in deze ZIP (flat root)

```
index.html
sw.js
offline.html
js/lazy-images-v1.js          ← nieuw
js/network-status-v1.js       ← nieuw
js/bg-sync-v1.js              ← nieuw
```

## Upload instructie (Cloudflare Pages / static host)

1. Upload **alleen** de 6 bestanden hierboven (overschrijf de bestaande).
2. **Niet** `pwa-v463-*.js` aanraken die blijft hetzelfde bestand.
3. Na deploy: forceer eenmaal `/vernieuw.html` op een testtoestel om de oude SW te purgen. Daarna activeert v44 automatisch bij volgende app-open.
4. Verifieer in DevTools → Application → Service Workers: status moet `pp-static-v44-20260213-…` zijn.

## Verifieer

| Feature | Test |
|---|---|
| Offline pagina | DevTools → Network → Offline → reload → moet `/offline.html` tonen |
| Lazy load | DevTools → Network → filter Img → scroll feed → images laden incrementeel |
| Network toast | DevTools → Network → Offline → rode pill verschijnt onderin |
| Background Sync | Console: `await DY.bgSync.queue({url:'/api/test',body:'{}'}); DY.bgSync.pending()` |
| Hero preload | DevTools → Network → hero-model-800.webp staat in eerste batch |
| Update detect | Refresh tweemaal → "Vernieuwen" toast (uit `sw-auto-update-v1.js`) |

## Geen regressies verwacht
- Geen wijziging aan `pwa-v463-*.js`, Firebase-SDK calls, Anthropic-call flow.
- Alle nieuwe scripts zijn `defer` en initialiseren `if (!window.__pp…Init)` om dubbele init te voorkomen.
- Empty `catch` blocks bevatten `/* noop */` (eslint-clean).
- `node --check` clean op alle scripts.
