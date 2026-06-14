// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Network Status Toast v1 (non-invasief)
// Toont een subtiele banner bij offline/online overgangen.
//
// • Offline → roodbruine pill "Geen verbinding - wijzigingen worden later
//   verstuurd". Blijft staan tot online.
// • Online (na offline) → groene pill "Weer online" (3 sec, dan fade).
// • Respecteert `prefers-reduced-motion`.
// • Detecteert echte connectiviteit (niet alleen `navigator.onLine`) door
//   periodieke HEAD ping naar /manifest.json wanneer offline gerapporteerd.
// • Geen impact op bestaande UI; render in eigen container met hoogste
//   z-index onder de modale layers.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppNetworkStatusInit) return;
  window.__ppNetworkStatusInit = true;

  var HOST_ID = 'dy-net-status';
  var STYLE_ID = 'dy-net-status-style';
  var lastOnline = navigator.onLine;
  var hideTimer = null;
  var pingTimer = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + HOST_ID + '{',
      '  position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0) + 80px);',
      '  transform:translate(-50%,16px);opacity:0;pointer-events:none;',
      '  background:#1e1a0f;color:#fefcf5;padding:10px 16px;border-radius:999px;',
      '  font:600 13px/1.3 "DM Sans","Inter",-apple-system,system-ui,sans-serif;',
      '  box-shadow:0 8px 24px rgba(0,0,0,0.32);z-index:2147483645;',
      '  display:flex;align-items:center;gap:10px;max-width:88vw;',
      '  border:1px solid rgba(254,252,245,0.16);',
      '  transition:opacity .28s ease, transform .28s cubic-bezier(.23,1,.32,1);',
      '}',
      '#' + HOST_ID + '.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
      '#' + HOST_ID + '.offline{background:#3a1a1a;border-color:rgba(255,140,120,.28)}',
      '#' + HOST_ID + '.online{background:#1a3a22;border-color:rgba(120,220,150,.28)}',
      '#' + HOST_ID + ' .dot{width:8px;height:8px;border-radius:50%;background:#c0392b;flex:none}',
      '#' + HOST_ID + '.online .dot{background:#3ddc84;box-shadow:0 0 0 4px rgba(61,220,132,.18)}',
      '#' + HOST_ID + '.offline .dot{background:#ff6b5b;box-shadow:0 0 0 4px rgba(255,107,91,.18);',
      '  animation:dyNetPulse 1.6s ease-in-out infinite}',
      '@keyframes dyNetPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
      '@media (prefers-reduced-motion: reduce){',
      '  #' + HOST_ID + '{transition:none}',
      '  #' + HOST_ID + ' .offline .dot{animation:none}',
      '}',
      '#' + HOST_ID + ' button{background:transparent;color:inherit;border:1px solid rgba(254,252,245,.32);',
      '  padding:4px 10px;border-radius:999px;font:600 12px inherit;cursor:pointer;',
      '  -webkit-tap-highlight-color:transparent}',
      '#' + HOST_ID + ' button:hover{background:rgba(254,252,245,.12)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureHost() {
    var el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HOST_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    return el;
  }

  function setMessage(state, text, withRetry) {
    injectStyles();
    var host = ensureHost();
    host.classList.remove('offline', 'online');
    host.classList.add(state);
    host.innerHTML = '';
    var dot = document.createElement('span'); dot.className = 'dot';
    var span = document.createElement('span'); span.textContent = text;
    host.appendChild(dot);
    host.appendChild(span);
    if (withRetry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Opnieuw';
      btn.addEventListener('click', function() {
        checkRealConnectivity(true);
      });
      host.appendChild(btn);
    }
    requestAnimationFrame(function() { host.classList.add('show'); });
  }

  function hide() {
    var host = document.getElementById(HOST_ID);
    if (!host) return;
    host.classList.remove('show');
  }

  function showOffline() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    setMessage('offline', 'Geen verbinding - wijzigingen worden later verstuurd', true);
    startPing();
  }

  function showOnline() {
    setMessage('online', 'Weer online', false);
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 3000);
    stopPing();
  }

  // Echte connectiviteit: navigator.onLine kan onbetrouwbaar zijn op iOS.
  // We pingen periodiek een lichte resource met no-store.
  function realProbe() {
    return new Promise(function(resolve) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var t = setTimeout(function() { try { ctrl && ctrl.abort(); } catch (e) { /* noop */ } resolve(false); }, 4000);
      try {
        fetch('/manifest.json?_=' + Date.now(), {
          method: 'GET', cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined
        }).then(function(r) {
          clearTimeout(t);
          resolve(!!(r && (r.ok || r.status === 304)));
        }).catch(function() { clearTimeout(t); resolve(false); });
      } catch (e) { clearTimeout(t); resolve(false); }
    });
  }

  function checkRealConnectivity(manual) {
    realProbe().then(function(ok) {
      if (ok && !lastOnline) {
        lastOnline = true;
        showOnline();
      } else if (!ok && lastOnline) {
        lastOnline = false;
        showOffline();
      } else if (ok && manual) {
        // Was online, user tikte op Opnieuw → kleine bevestiging
        showOnline();
      } else if (!ok && manual) {
        // Nog steeds offline → herhaal banner met lichte shake hint
        var host = document.getElementById(HOST_ID);
        if (host) {
          host.style.transform = 'translate(-50%, 0) scale(1.03)';
          setTimeout(function() { if (host) host.style.transform = ''; }, 180);
        }
      }
    });
  }

  function startPing() {
    if (pingTimer) return;
    pingTimer = setInterval(function() { checkRealConnectivity(false); }, 6000);
  }

  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  window.addEventListener('online', function() {
    // Verifieer met echte ping voordat we "online" tonen
    setTimeout(function() { checkRealConnectivity(false); }, 200);
  });
  window.addEventListener('offline', function() {
    lastOnline = false;
    showOffline();
  });

  // Initial: alleen banner als offline bij load
  function init() {
    if (!navigator.onLine) {
      lastOnline = false;
      showOffline();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Publieke API voor andere scripts
  window.DY = window.DY || {};
  window.DY.netStatus = {
    isOnline: function() { return lastOnline; },
    showOffline: showOffline,
    showOnline:  showOnline,
    hide:        hide,
    check:       function() { return checkRealConnectivity(false); }
  };
})();
