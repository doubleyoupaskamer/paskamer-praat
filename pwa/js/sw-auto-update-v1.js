// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Service Worker Auto-Update v1
// Non-invasief: detecteert nieuwe SW versie en activeert deze meteen
// zodat gebruikers geen "oude versie cache" meer ervaren na een deploy.
//
// Werking:
//   1. Bij paginalaad: registreer SW (updateViaCache: 'none' → sw.js
//      nooit browser-cached, altijd vers opgehaald).
//   2. Detecteer `updatefound` → wanneer nieuwe SW state === 'installed'
//      én er is al een controller (= upgrade), stuur SKIP_WAITING.
//   3. Detecteer reeds wachtende SW (na page reload met cache) → idem.
//   4. Poll elke 60 seconden naar update zolang de tab open is.
//   5. Toon optioneel een kleine "Vernieuwen" toast voor de gebruiker
//      bij actieve update (graceful, niet opdringerig).
//
// Bestaande controllerchange-reload (in pwa-v463-…js) blijft werken.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  var SW_URL  = '/sw.js';
  var POLL_MS = 60 * 1000; // 1 min
  var _shownToast = false;
  var _registration = null;

  // ─── Helper: stuur SKIP_WAITING naar een SW worker ──────────────
  function activeerWachtendeSW(worker) {
    if (!worker) return;
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (e) { /* noop */ }
  }

  // ─── Toon kleine "update beschikbaar" toast (optioneel) ─────────
  function toonUpdateToast() {
    if (_shownToast) return;
    _shownToast = true;
    try {
      var t = document.createElement('div');
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.style.cssText = [
        'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
        'background:#1e1a0f','color:#fefcf5','padding:10px 14px 10px 16px',
        'border-radius:999px','z-index:99999','font-size:13px',
        'font-family:inherit','box-shadow:0 6px 20px rgba(0,0,0,0.35)',
        'max-width:88vw','line-height:1.4','display:flex','align-items:center',
        'gap:10px','border:1px solid rgba(254,252,245,0.15)'
      ].join(';');
      t.innerHTML =
        '<span style="opacity:.85">Nieuwe versie beschikbaar</span>' +
        '<button type="button" style="background:#fefcf5;color:#1e1a0f;' +
        'border:none;padding:5px 12px;border-radius:999px;font-size:12px;' +
        'font-weight:600;cursor:pointer;font-family:inherit">Vernieuwen</button>';
      var btn = t.querySelector('button');
      btn.onclick = function() {
        try { window.location.reload(); } catch (e) { /* noop */ }
      };
      document.body.appendChild(t);
      // Auto-hide na 8 sec (als gebruiker niet klikt - update gebeurt
      // automatisch bij volgende navigatie/reload)
      setTimeout(function() {
        try { t.style.opacity = '0'; t.style.transition='opacity .4s'; } catch (e) { /* noop */ }
        setTimeout(function() { try { t.remove(); } catch (e) { /* noop */ } }, 500);
      }, 8000);
    } catch (e) { /* noop */ }
  }

  // ─── Reageer op nieuwe SW die geïnstalleerd is ──────────────────
  function bewaakInstalling(installing) {
    if (!installing) return;
    installing.addEventListener('statechange', function() {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        // Er is een actieve SW + nieuwe is geïnstalleerd → upgrade flow
        activeerWachtendeSW(installing);
        toonUpdateToast();
      }
    });
  }

  // ─── Registreer + bewaak ────────────────────────────────────────
  function registreer() {
    // v60.1: voorkom dubbele SW-registratie. index.html registreert al
    // de SW bij 'load' event. Wacht eerst tot bestaande registration
    // beschikbaar is, en upgrade die i.p.v. een tweede register-call.
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.getRegistration(SW_URL).then(function(existing) {
      var regProm = existing
        ? Promise.resolve(existing)
        : navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' });
      return regProm;
    }).then(function(reg) {
        _registration = reg;
        // Forceer updateViaCache:none als bestaande registration die nog niet had
        try {
          if (reg && reg.updateViaCache !== 'none') {
            // navigator.serviceWorker.register met dezelfde URL is idempotent
            // en zal alleen de opties updaten (geen tweede SW installeren).
            navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' }).catch(function(){});
          }
        } catch (e) { /* noop */ }

        // A. Direct wachtende SW? (tab geladen met v23 al klaar maar v22 actief)
        if (reg.waiting && navigator.serviceWorker.controller) {
          activeerWachtendeSW(reg.waiting);
          toonUpdateToast();
        }

        // B. Nieuwe SW gevonden tijdens deze sessie
        reg.addEventListener('updatefound', function() {
          bewaakInstalling(reg.installing);
        });

        // C. Poll periodiek voor updates - reg.update() retourneert
        //    een Promise; try/catch vangt geen async rejection af.
        //    Daarom hier expliciet .catch() om unhandledrejection te
        //    voorkomen (was bron van Promise rejection x13/x15 errors).
        setInterval(function() {
          try {
            var p = reg.update();
            if (p && typeof p.catch === 'function') {
              p.catch(function() { /* stale of unreachable - SW blijft draaien */ });
            }
          } catch (e) { /* sync fout: negeer */ }
        }, POLL_MS);

        // D. Bij focus terug naar tab - check ook
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'visible') {
            try {
              var p2 = reg.update();
              if (p2 && typeof p2.catch === 'function') {
                p2.catch(function() { /* idem - silently swallow */ });
              }
            } catch (e) { /* noop */ }
          }
        });
      })
      .catch(function() { /* stille fail - bestaande SW blijft werken */ });
  }

  // Start zodra DOM klaar is (defer maakt dit feitelijk overbodig, maar veilig)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registreer);
  } else {
    registreer();
  }
})();
