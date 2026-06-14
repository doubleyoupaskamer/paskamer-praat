// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat - Web Share Target client v1
// Vangt content op die naar de PWA gedeeld is en vult de composer in.
// Werkt non-invasief: leest IndexedDB die door sw.js gevuld is.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var params = new URLSearchParams(window.location.search || '');
  var isShared      = params.get('shared') === '1';
  var isSharedError = params.get('shared_error') === '1';
  if (!isShared && !isSharedError) return;

  // Strip de share-flags uit de URL zodat refresh niet opnieuw triggert
  try {
    var clean = window.location.pathname;
    var keep  = [];
    params.forEach(function(v, k) {
      if (k !== 'shared' && k !== 'shared_error') keep.push(k + '=' + encodeURIComponent(v));
    });
    if (keep.length) clean += '?' + keep.join('&');
    if (history && history.replaceState) history.replaceState(null, '', clean);
  } catch (e) {}

  if (isSharedError) {
    waitForDY(function() {
      try { DY.navigeer('nieuw'); } catch (e) {}
      setTimeout(function() {
        showToast('Delen mislukt. Probeer het opnieuw.');
      }, 400);
    });
    return;
  }

  // ─── Wachten tot DY klaar is ─────────────────────────────────────
  function waitForDY(cb) {
    var start = Date.now();
    (function loop() {
      if (window.DY && typeof DY.navigeer === 'function') {
        cb();
      } else if (Date.now() - start < 15000) {
        setTimeout(loop, 100);
      }
    })();
  }

  // ─── IndexedDB ophalen ───────────────────────────────────────────
  function openShareDB() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open('pp-share-target', 1);
      req.onupgradeneeded = function() {
        try { req.result.createObjectStore('shared', { keyPath: 'id' }); } catch (e) {}
      };
      req.onsuccess = function() { resolve(req.result); };
      req.onerror   = function() { reject(req.error); };
    });
  }

  function loadAndClearShared() {
    return openShareDB().then(function(db) {
      return new Promise(function(resolve) {
        try {
          var tx = db.transaction('shared', 'readwrite');
          var store = tx.objectStore('shared');
          var getReq = store.get('pending');
          getReq.onsuccess = function() {
            var data = getReq.result || null;
            try { store.delete('pending'); } catch (e) {}
            resolve(data);
          };
          getReq.onerror = function() { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function() { return null; });
  }

  // ─── Composer prefillen ──────────────────────────────────────────
  function waitForComposer(cb) {
    var attempts = 0;
    var int = setInterval(function() {
      attempts++;
      var ta = document.getElementById('verhaal-tekst');
      var mediaInput = document.getElementById('verhaal-media');
      if (ta && mediaInput) {
        clearInterval(int);
        cb(ta, mediaInput);
      } else if (attempts > 60) { // 6s max
        clearInterval(int);
      }
    }, 100);
  }

  function applyShare(data) {
    if (!data) return;

    waitForComposer(function(ta, mediaInput) {
      // 1. Tekstveld vullen
      var parts = [];
      if (data.title && data.title.trim()) parts.push(data.title.trim());
      if (data.text  && data.text.trim())  parts.push(data.text.trim());
      if (data.url   && data.url.trim())   parts.push(data.url.trim());
      var combined = parts.join('\n\n').trim();

      if (combined) {
        ta.value = combined;
        try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      }

      // 2. Foto invoegen (indien aanwezig)
      var blob = data.file;
      if (blob && data.fileType && data.fileType.indexOf('image/') === 0) {
        try {
          // Bouw een File en injecteer in input via DataTransfer
          var name = data.fileName || 'gedeeld.jpg';
          var file = (blob instanceof File)
            ? blob
            : new File([blob], name, { type: data.fileType });

          if (typeof DataTransfer !== 'undefined') {
            var dt = new DataTransfer();
            dt.items.add(file);
            mediaInput.files = dt.files;
            mediaInput.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            // Fallback: handmatige preview (geen upload mogelijk)
            renderManualPreview(file);
          }
        } catch (e) {
          renderManualPreview(blob);
        }
      }

      // 3. Focus + toast
      try { ta.focus(); } catch (e) {}
      showToast('Gedeelde content geladen - klaar om te plaatsen');

      // 4. Tracking (als beschikbaar)
      try {
        if (window.DY && typeof DY.trackPWAEvent === 'function') {
          DY.trackPWAEvent('share_target_received', {
            heeft_foto: !!blob,
            heeft_url:  !!data.url,
            heeft_tekst: !!(data.text || data.title)
          });
        }
      } catch (e) {}
    });
  }

  function renderManualPreview(blob) {
    try {
      var preview = document.getElementById('foto-preview');
      var zone    = document.getElementById('media-zone');
      if (preview && zone) {
        preview.src = URL.createObjectURL(blob);
        preview.style.display = 'block';
        zone.style.display = 'block';
      }
    } catch (e) {}
  }

  function showToast(msg) {
    try {
      var t = document.createElement('div');
      t.setAttribute('role', 'status');
      t.style.cssText = [
        'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
        'background:#1e1a0f','color:#fefcf5','padding:11px 18px',
        'border-radius:10px','z-index:99999','font-size:13px',
        'font-family:inherit','box-shadow:0 6px 20px rgba(0,0,0,0.35)',
        'max-width:88vw','text-align:center','line-height:1.4',
        'transition:opacity .35s ease'
      ].join(';');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function() {
        t.style.opacity = '0';
        setTimeout(function() { try { t.remove(); } catch (e) {} }, 400);
      }, 2800);
    } catch (e) {}
  }

  // ─── Start flow ──────────────────────────────────────────────────
  waitForDY(function() {
    // Ga naar composer (renderNieuwVerhaal). Als gebruiker niet ingelogd is
    // toont de bestaande flow gewoon de login prompt - non-invasief.
    try { DY.navigeer('nieuw'); } catch (e) {}

    // Lees gedeelde payload uit IDB (na korte vertraging zodat composer rendert)
    setTimeout(function() {
      loadAndClearShared().then(applyShare);
    }, 250);
  });
})();
