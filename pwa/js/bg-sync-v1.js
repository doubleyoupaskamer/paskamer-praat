// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Background Sync v1 (non-invasief opt-in)
//
// Doel: failed POST-acties (likes, comments, AI requests) niet verloren
// laten gaan wanneer de gebruiker even offline is. We slaan ze op in
// IndexedDB en laten de Service Worker ze afspelen zodra de browser
// een 'sync' event vuurt. Als Background Sync API niet beschikbaar is
// (Safari/iOS), vallen we terug op een 'online' listener die de queue
// alsnog probeert te draineren via fetch op de page-thread.
//
// • GEEN globale fetch monkey-patch — Firebase/Anthropic SDK blijven
//   ongemoeid. Andere scripts gebruiken expliciet `DY.bgSync.queue()`.
// • Companion bij sw.js (v44+): de SW handelt het 'sync' event af met
//   tag 'pp-bg-sync' en stuurt PP_BG_SYNC_REPLAYED messages terug.
// • Veilig bij meerdere tabs (IDB is shared).
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppBgSyncInit) return;
  window.__ppBgSyncInit = true;

  var DB_NAME = 'pp-bg-sync';
  var STORE   = 'queue';
  var TAG     = 'pp-bg-sync';

  function openDB() {
    return new Promise(function(resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function() {
          try {
            if (!req.result.objectStoreNames.contains(STORE)) {
              req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            }
          } catch (e) { /* noop */ }
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror   = function() { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }

  function addToQueue(item) {
    return openDB().then(function(db) {
      return new Promise(function(resolve, reject) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          var store = tx.objectStore(STORE);
          var req = store.add(item);
          req.onsuccess = function() { resolve(req.result); };
          req.onerror   = function() { reject(req.error); };
        } catch (e) { reject(e); }
      });
    });
  }

  function readAll() {
    return openDB().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(STORE, 'readonly');
          var store = tx.objectStore(STORE);
          var out = [];
          var cur = store.openCursor();
          cur.onsuccess = function(ev) {
            var c = ev.target.result;
            if (c) { out.push(c.value); c.continue(); } else resolve(out);
          };
          cur.onerror = function() { resolve([]); };
        } catch (e) { resolve([]); }
      });
    });
  }

  function deleteOne(id) {
    return openDB().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(id);
          tx.oncomplete = function() { resolve(); };
          tx.onerror    = function() { resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }

  // Probeer Background Sync te registreren; bij ondersteuning is dat
  // veruit het robuustst (werkt ook na tab-close in Chromium).
  function registerSync() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function(reg) {
      if (!reg || !('sync' in reg)) return false;
      return reg.sync.register(TAG).then(function() { return true; }).catch(function() { return false; });
    }).catch(function() { return false; });
  }

  // Fallback: probeer zelf de queue te draineren wanneer we online zijn.
  function drainOnPage() {
    return readAll().then(function(items) {
      var chain = Promise.resolve();
      items.forEach(function(it) {
        chain = chain.then(function() {
          return fetch(it.url, {
            method:  it.method  || 'POST',
            headers: it.headers || { 'Content-Type': 'application/json' },
            body:    it.body    || null,
            credentials: it.credentials || 'same-origin',
            mode: it.mode || 'cors'
          }).then(function(r) {
            if (r && (r.ok || r.status < 500)) return deleteOne(it.id);
          }).catch(function() { /* laat staan */ });
        });
      });
      return chain;
    });
  }

  // Publieke API
  // Gebruik: DY.bgSync.queue({ url, method, headers, body }).then(...)
  // body moet een string zijn (JSON.stringify(...)).
  function queue(req) {
    if (!req || !req.url) return Promise.reject(new Error('bgSync.queue: url ontbreekt'));
    var item = {
      url:     req.url,
      method:  req.method  || 'POST',
      headers: req.headers || { 'Content-Type': 'application/json' },
      body:    typeof req.body === 'string' ? req.body
             : (req.body == null ? null : JSON.stringify(req.body)),
      credentials: req.credentials || 'same-origin',
      mode:    req.mode || 'cors',
      ts:      Date.now()
    };
    return addToQueue(item).then(function(id) {
      registerSync(); // best-effort
      return id;
    });
  }

  // Try-fetch met automatische queueing bij netwerk-fout
  function fetchOrQueue(url, opts) {
    opts = opts || {};
    return fetch(url, opts).then(function(r) {
      if (!r || (!r.ok && r.status >= 500)) {
        // server down → queue
        return queue({
          url: url, method: opts.method, headers: opts.headers,
          body: opts.body, credentials: opts.credentials, mode: opts.mode
        }).then(function() { return r; });
      }
      return r;
    }).catch(function(err) {
      // netwerk fout → queue + propageer
      return queue({
        url: url, method: opts.method, headers: opts.headers,
        body: opts.body, credentials: opts.credentials, mode: opts.mode
      }).then(function() { throw err; });
    });
  }

  // Bij online: probeer queue te draineren (helpt Safari + alle browsers
  // die geen sync event ondersteunen voor deze tab).
  window.addEventListener('online', function() {
    setTimeout(function() {
      registerSync().then(function(ok) {
        if (!ok) drainOnPage();
      });
    }, 800);
  });

  // SW laat ons weten welke items zijn verstuurd → emit custom event
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'PP_BG_SYNC_REPLAYED') {
        try {
          window.dispatchEvent(new CustomEvent('dy:bg-sync-replayed', { detail: e.data }));
        } catch (er) { /* noop */ }
      }
    });
  }

  // Expose
  window.DY = window.DY || {};
  window.DY.bgSync = {
    queue:        queue,
    fetchOrQueue: fetchOrQueue,
    drain:        drainOnPage,
    pending:      function() { return readAll().then(function(a) { return a.length; }); }
  };
})();
