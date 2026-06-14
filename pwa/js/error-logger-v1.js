// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Error Logger v1 (v57)
//
// Non-invasieve productie logging. Vangt alle frontend-fouten af en
// stuurt ze geclassificeerd naar /api/client-error.
//
// Vangt af:
//   • window.onerror      → JS runtime errors
//   • unhandledrejection  → niet-geafhandelde Promise rejections
//   • console.error       → expliciete error calls (incl. v55 [premium] logs)
//
// Rate limit:
//   • Max 1 event per 3 sec per error-signature
//   • Max 20 events per pagina-load (anti-spam bij infinite loop)
//   • Locale ring buffer in localStorage (laatste 20) voor debug
//
// Privacy:
//   • Géén user-input, géén PII, géén tokens
//   • Alleen: error message, stack trace, URL, lineno, colno, UA
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var ENDPOINT_PATH = '/api/client-error';
  var MAX_PER_PAGE = 20;
  var THROTTLE_MS = 3000;
  var BUFFER_KEY = 'dy_err_buffer';
  var SESSION_KEY = 'dy_err_session';

  var sent = 0;
  var lastSentBySig = {};

  function apiBase() {
    try {
      if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
        return window.DY.aiHealth.apiBase();
      }
    } catch (e) { /* ignore */ }
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('emergentagent.com') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    if (host.indexOf('paskamerpraat.nl') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    return '';
  }

  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch (e) { return 'sess_anon'; }
  }

  function pushBuffer(rec) {
    try {
      var raw = localStorage.getItem(BUFFER_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      arr.push(rec);
      if (arr.length > 20) arr = arr.slice(-20);
      localStorage.setItem(BUFFER_KEY, JSON.stringify(arr));
    } catch (e) { /* ignore quota errors */ }
  }

  function signature(rec) {
    return [rec.kind, rec.message || '', rec.lineno || 0, rec.colno || 0].join('|').slice(0, 200);
  }

  function shouldThrottle(sig) {
    var now = Date.now();
    var last = lastSentBySig[sig] || 0;
    if (now - last < THROTTLE_MS) return true;
    lastSentBySig[sig] = now;
    return false;
  }

  function send(rec) {
    if (sent >= MAX_PER_PAGE) return;
    var sig = signature(rec);
    if (shouldThrottle(sig)) return;
    sent++;

    pushBuffer(rec);

    var base = apiBase();
    if (!base) return;

    var payload = {
      kind: rec.kind,
      message: String(rec.message || '').slice(0, 1000),
      stack: String(rec.stack || '').slice(0, 4000),
      url: String(rec.url || location.href).slice(0, 500),
      lineno: rec.lineno || 0,
      colno: rec.colno || 0,
      ua: navigator.userAgent.slice(0, 300),
      session_id: getSessionId(),
      ts: new Date().toISOString(),
    };

    try {
      var data = JSON.stringify(payload);
      // sendBeacon is fire-and-forget en werkt zelfs tijdens page unload
      if (navigator.sendBeacon) {
        var blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon(base + ENDPOINT_PATH, blob);
      } else {
        fetch(base + ENDPOINT_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true,
        }).catch(function () { /* ignore */ });
      }
    } catch (e) { /* never let the logger crash itself */ }
  }

  // ── 1) window.onerror ─────────────────────────────────────────────
  window.addEventListener('error', function (ev) {
    // Resource load errors (img/script): ev.target is HTMLElement
    if (ev && ev.target && ev.target !== window && ev.target.tagName) {
      var t = ev.target.tagName.toLowerCase();
      if (t === 'img' || t === 'script' || t === 'link') {
        send({
          kind: 'resource-error',
          message: t + ' failed to load: ' + (ev.target.src || ev.target.href || '?'),
          url: location.href,
        });
        return;
      }
    }
    send({
      kind: 'runtime-error',
      message: ev.message || 'unknown error',
      stack: ev.error && ev.error.stack ? ev.error.stack : '',
      url: ev.filename || location.href,
      lineno: ev.lineno || 0,
      colno: ev.colno || 0,
    });
  }, true);

  // ── 2) Unhandled Promise Rejection ───────────────────────────────
  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    var msg = '';
    var stack = '';
    if (reason instanceof Error) {
      msg = reason.message || String(reason);
      stack = reason.stack || '';
    } else if (typeof reason === 'object') {
      try { msg = JSON.stringify(reason).slice(0, 500); } catch (e) { msg = String(reason); }
    } else {
      msg = String(reason);
    }
    send({
      kind: 'unhandled-rejection',
      message: msg,
      stack: stack,
      url: location.href,
    });
  });

  // ── 3) console.error wrap (capture [premium], [tryon], etc.) ─────
  try {
    var origErr = console.error.bind(console);
    console.error = function () {
      try {
        var parts = Array.prototype.slice.call(arguments).map(function (a) {
          if (a instanceof Error) return a.message + '\n' + (a.stack || '');
          if (typeof a === 'object') {
            try { return JSON.stringify(a).slice(0, 500); } catch (e) { return String(a); }
          }
          return String(a);
        });
        send({
          kind: 'console-error',
          message: parts.join(' ').slice(0, 1000),
          url: location.href,
        });
      } catch (e) { /* ignore */ }
      return origErr.apply(console, arguments);
    };
  } catch (e) { /* console.error wrap kan falen in oude browsers */ }

  // ── 4) Expose debug API ──────────────────────────────────────────
  try {
    window.DY = window.DY || {};
    window.DY.errorLogger = {
      version: 'v1-v57',
      getBuffer: function () {
        try {
          var raw = localStorage.getItem(BUFFER_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
      },
      clearBuffer: function () {
        try { localStorage.removeItem(BUFFER_KEY); } catch (e) { /* ignore */ }
      },
      sentCount: function () { return sent; },
      send: send, // voor handmatige logs via window.DY.errorLogger.send({kind:'manual', message:'…'})
    };
  } catch (e) { /* ignore */ }
})();
