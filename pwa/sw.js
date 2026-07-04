// Doubleyou - Service Worker v21
// Veilige runtime caching:
//   - HTML/navigaties: NETWORK-FIRST met snelle fallback (max 3s) → altijd verse content na deploy
//   - Versioned JS (/js/*-v*.js + /js/pwa-v*.js): CACHE-FIRST, immutable
//   - app.css: STALE-WHILE-REVALIDATE
//   - Fonts (Google Fonts CSS + .woff2): STALE-WHILE-REVALIDATE
//   - Icons / hero / webp / avif / png: CACHE-FIRST met max-age
//   - Firebase/Firestore/Storage: NETWORK-ONLY (nooit cachen)
//
// Strategie is bewust simpel + bestand-naam-gebaseerd zodat een nieuwe deploy
// (nieuwe versioned filename) automatisch niet uit cache komt.

const VERSION       = 'v60.1.245-20260704-ai-access-guard';
const STATIC_CACHE  = 'pp-static-' + VERSION;
const RUNTIME_CACHE = 'pp-runtime-' + VERSION;
const IMG_CACHE     = 'pp-images-' + VERSION;
const FONT_CACHE    = 'pp-fonts-' + VERSION;

const ALLOWED_CACHES = [STATIC_CACHE, RUNTIME_CACHE, IMG_CACHE, FONT_CACHE];

// Pre-cache "app shell": alleen kleine, niet-versioned essentials
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALLOWED_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function networkFirst(request, cacheName, timeoutMs = 3000, isNavigation = false) {
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      caches.match(request).then(cached => { if (cached) { settled = true; resolve(cached); } });
    }, timeoutMs);

    fetch(request).then(resp => {
      clearTimeout(timer);
      // v60.1.35 STABILITY: update cache ALTIJD bij geslaagde fetch,
      // ook als de timer al een cached response heeft gereturned. Anders
      // blijven gebruikers met traag netwerk eeuwig op stale cache hangen.
      if (resp && resp.ok && resp.type === 'basic') {
        const copy = resp.clone();
        caches.open(cacheName).then(c => c.put(request, copy)).catch(() => {});
      }
      if (settled) return;
      settled = true;
      resolve(resp);
    }).catch(() => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      caches.match(request).then(cached => {
        if (cached) return resolve(cached);
        // Geen cache + geen netwerk → voor navigaties: offline fallback pagina
        if (isNavigation) {
          caches.match(OFFLINE_URL).then(off => resolve(off || Response.error()));
        } else {
          resolve(Response.error());
        }
      });
    });
  });
}

function cacheFirst(request, cacheName, maxEntries) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(resp => {
      if (resp && resp.ok) {
        const copy = resp.clone();
        caches.open(cacheName).then(c => {
          c.put(request, copy);
          if (maxEntries) trimCache(c, maxEntries);
        }).catch(() => {});
      }
      return resp;
    }).catch(() => cached || Response.error());
  });
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(cache => {
    return cache.match(request).then(cached => {
      const fetchPromise = fetch(request).then(resp => {
        if (resp && resp.ok) cache.put(request, resp.clone());
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    });
  });
}

function trimCache(cache, maxEntries) {
  cache.keys().then(keys => {
    if (keys.length > maxEntries) {
      cache.delete(keys[0]).then(() => trimCache(cache, maxEntries));
    }
  });
}

// ─── Web Share Target helpers ────────────────────────────────────

function openShareDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('pp-share-target', 1);
    req.onupgradeneeded = function() {
      try { req.result.createObjectStore('shared', { keyPath: 'id' }); } catch (e) { /* noop */ }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror   = function() { reject(req.error); };
  });
}

function saveSharedPayload(payload) {
  return openShareDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      try {
        var tx = db.transaction('shared', 'readwrite');
        tx.objectStore('shared').put(payload);
        tx.oncomplete = function() { resolve(); };
        tx.onerror    = function() { reject(tx.error); };
      } catch (e) { reject(e); }
    });
  });
}

async function handleShareTarget(req) {
  try {
    var formData = await req.formData();
    var title = (formData.get('title') || '').toString();
    var text  = (formData.get('text')  || '').toString();
    var url   = (formData.get('url')   || '').toString();

    // Files: probeer alle gangbare param namen ("foto", "files", "image")
    var files = [];
    ['foto','files','image','photos'].forEach(function(name) {
      var arr = formData.getAll(name);
      if (arr && arr.length) {
        arr.forEach(function(f) {
          if (f && typeof f === 'object' && f.size > 0 && f.type) files.push(f);
        });
      }
    });

    var first = files.length > 0 ? files[0] : null;

    await saveSharedPayload({
      id: 'pending',
      title: title,
      text:  text,
      url:   url,
      file:  first,                                 // Blob (browser slaat hem op in IDB)
      fileName: first ? (first.name || 'gedeeld.jpg') : null,
      fileType: first ? (first.type || '') : null,
      timestamp: Date.now()
    });

    return Response.redirect('/?pagina=nieuw&shared=1', 303);
  } catch (e) {
    return Response.redirect('/?pagina=nieuw&shared_error=1', 303);
  }
}

// ─── Fetch router ────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // ═══════════════════════════════════════════════════════════════
  // WEB SHARE TARGET - vang POST /share-target op (Android/Chromium)
  // Slaat gedeelde content op in IndexedDB en redirect naar composer
  // ═══════════════════════════════════════════════════════════════
  if (req.method === 'POST' && url.pathname === '/share-target' && url.origin === self.location.origin) {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== 'GET') return;

  // Skip Chrome extensions / non-http
  if (!url.protocol.startsWith('http')) return;

  // ─── Vernieuw-tool: NOOIT cachen, altijd vers van netwerk ──
  if (url.pathname === '/vernieuw.html' || url.pathname === '/vernieuw') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).catch(function() {
        return new Response('Geen internet', { status: 503 });
      })
    );
    return;
  }

  // 1. Firebase / Firestore / Storage / Auth / Anthropic → NETWORK-ONLY
  if (/(?:firestore|firebaseio|googleapis\.com\/identitytoolkit|securetoken|firebasestorage|api\.anthropic|workers\.dev|render\.com|ipapi\.co)/.test(url.host + url.pathname)) {
    return; // laat browser default afhandelen
  }

  // 2. Service worker zelf - nooit cachen
  if (url.pathname.endsWith('/sw.js')) return;

  // 3. Admin / debug → network-only
  if (/\/(admin|debug)/i.test(url.pathname)) return;

  // 4. Versioned static JS (pwa-v###-####.js, *-v###.js, *-####.js)
  if (url.origin === self.location.origin && /\/js\/.+\.js$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE, 30));
    return;
  }

  // 5. CSS
  if (url.origin === self.location.origin && /\.css(\?|$)/.test(url.pathname + url.search)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // 6. Eigen images + icons
  if (url.origin === self.location.origin && /\.(png|jpg|jpeg|webp|avif|svg|gif|ico)(\?|$)/i.test(url.pathname + url.search)) {
    event.respondWith(cacheFirst(req, IMG_CACHE, 60));
    return;
  }

  // 7. Google Fonts (CSS + woff2)
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.host)) {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // 8. Gebruiker avatars op lh3.googleusercontent.com
  if (url.host === 'lh3.googleusercontent.com') {
    event.respondWith(cacheFirst(req, IMG_CACHE, 40));
    return;
  }

  // 9. Manifest
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // 10. HTML / navigaties / root → NETWORK-FIRST (3s timeout) + offline fallback
  if (req.mode === 'navigate' || (req.headers.get('Accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, 3000, true));
    return;
  }

  // Default: passthrough
});

// ─── Push notifications ──────────────────────────────────────────────────

self.addEventListener('push', e => {
  let data = {
    title: 'Doubleyou',
    body: 'Je hebt een nieuwe melding.',
    icon: '/icons/apple-touch-icon-180.png'
  };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (err) { /* noop */ }

  // Brand-aligned native notification (Android toont kleur als accent;
  // iOS gebruikt het app-icoon - beide tonen ons premium logo)
  const opts = {
    body: data.body,
    icon: data.icon || '/icons/apple-touch-icon-180.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'dy-push',
    renotify: !!data.renotify,
    requireInteraction: data.requireInteraction !== false,
    silent: false,
    dir: 'ltr',
    lang: 'nl-NL',
    vibrate: data.vibrate || [60, 40, 60],
    timestamp: Date.now(),
    data: { url: data.url || '/', category: data.category || 'algemeen' }
  };
  // Rich image (alleen Android) - bv. preview van outfit/match
  if (data.image) opts.image = data.image;
  // Action buttons (alleen Android desktop)
  if (Array.isArray(data.actions) && data.actions.length) {
    opts.actions = data.actions.slice(0, 2);
  } else {
    opts.actions = [
      { action: 'open',    title: 'Bekijk' },
      { action: 'dismiss', title: 'Later'  }
    ];
  }
  e.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Hergebruik bestaand venster indien beschikbaar (geen tweede tab)
      for (const c of clients) {
        if ('focus' in c) { try { c.navigate(target); } catch (_) {} return c.focus(); }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'CLEAR_CACHES') {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});

// ─── Background Sync - drain queued requests (non-invasief opt-in) ───────
// Companion script `bg-sync-v1.js` op de pagina stopt mislukte POST's in
// IndexedDB ('pp-bg-sync' / store 'queue') en registreert een sync tag
// 'pp-bg-sync'. Bij netwerk-terug speelt de SW ze één voor één af.
// Als Background Sync API niet beschikbaar is, doet de SW niets (de
// companion script vangt dat zelf op met retry-on-online).

function openBgSyncDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('pp-bg-sync', 1);
    req.onupgradeneeded = function() {
      try {
        if (!req.result.objectStoreNames.contains('queue')) {
          req.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        }
      } catch (e) { /* noop */ }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror   = function() { reject(req.error); };
  });
}

function readAllQueued(db) {
  return new Promise(function(resolve, reject) {
    try {
      var tx = db.transaction('queue', 'readonly');
      var store = tx.objectStore('queue');
      var out = [];
      var cursorReq = store.openCursor();
      cursorReq.onsuccess = function(ev) {
        var cur = ev.target.result;
        if (cur) { out.push(cur.value); cur.continue(); }
        else resolve(out);
      };
      cursorReq.onerror = function() { reject(cursorReq.error); };
    } catch (e) { reject(e); }
  });
}

function deleteQueued(db, id) {
  return new Promise(function(resolve) {
    try {
      var tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror    = function() { resolve(); };
    } catch (e) { resolve(); }
  });
}

async function drainBgSyncQueue() {
  let db;
  try { db = await openBgSyncDB(); } catch (e) { return; }
  let items;
  try { items = await readAllQueued(db); } catch (e) { return; }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    try {
      var resp = await fetch(it.url, {
        method:  it.method  || 'POST',
        headers: it.headers || { 'Content-Type': 'application/json' },
        body:    it.body    || null,
        credentials: it.credentials || 'same-origin',
        mode: it.mode || 'cors'
      });
      if (resp && (resp.ok || resp.status < 500)) {
        await deleteQueued(db, it.id);
        // Notify pages
        try {
          var clientsArr = await self.clients.matchAll({ includeUncontrolled: true });
          clientsArr.forEach(function(c) {
            c.postMessage({ type: 'PP_BG_SYNC_REPLAYED', id: it.id, url: it.url, status: resp.status });
          });
        } catch (e) { /* noop */ }
      } else {
        // 5xx → laat staan, volgende sync probeert opnieuw
      }
    } catch (e) {
      // netwerk faalde alsnog → laat staan
    }
  }
}

self.addEventListener('sync', function(event) {
  if (event.tag === 'pp-bg-sync') {
    event.waitUntil(drainBgSyncQueue());
  }
});
