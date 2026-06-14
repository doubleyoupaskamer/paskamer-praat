// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Error Boundary v1
// Een dunne, globale safety net die ALS EERSTE script laadt.
// Vangt onverwerkte JS-fouten en promise rejections zodat ze nooit
// stilletjes in de console terechtkomen en (optioneel) gebatcht naar
// Firestore kunnen voor diagnostiek.
//
// Belangrijk:
//   - Geen `event.preventDefault()` - we onderdrukken niets, alleen
//     observeren + structureren. (Verbergen = bugs verstoppen.)
//   - Dedup: identieke fouten binnen 5s niet dubbel loggen.
//   - Buffer in geheugen tot max 50; oudste valt eruit (ring).
//   - Publieke API: `DY.errors.list()` / `DY.errors.clear()`.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppErrorBoundaryInit) return;
  window.__ppErrorBoundaryInit = true;

  var MAX = 50;
  var DEDUP_MS = 5000;
  var buffer = [];
  var lastSig = '';
  var lastTs  = 0;

  function makeSig(type, msg, src, line, col) {
    return [type, String(msg).slice(0, 160), src || '', line || 0, col || 0].join('|');
  }

  function push(entry) {
    var sig = makeSig(entry.type, entry.message, entry.source, entry.line, entry.col);
    var now = Date.now();
    if (sig === lastSig && (now - lastTs) < DEDUP_MS) return;
    lastSig = sig; lastTs = now;
    entry.ts = now;
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    try {
      window.dispatchEvent(new CustomEvent('dy:error-captured', { detail: entry }));
    } catch (e) { /* noop */ }
  }

  window.addEventListener('error', function(e) {
    try {
      // Resource errors (img/script load fail) hebben geen `error`-prop
      if (!e || !e.message) {
        if (e && e.target && e.target.tagName) {
          push({
            type: 'resource',
            message: 'Resource load failed: ' + (e.target.src || e.target.href || e.target.tagName),
            source: e.target.src || e.target.href || '',
            line: 0, col: 0
          });
        }
        return;
      }
      push({
        type: 'error',
        message: e.message,
        source: e.filename || '',
        line:   e.lineno   || 0,
        col:    e.colno    || 0,
        stack:  (e.error && e.error.stack) ? String(e.error.stack).slice(0, 600) : ''
      });
    } catch (er) { /* noop */ }
  }, true);

  window.addEventListener('unhandledrejection', function(e) {
    try {
      var r = e && e.reason;
      var msg = r && (r.message || (typeof r === 'string' ? r : JSON.stringify(r).slice(0,160))) || 'Unhandled rejection';
      push({
        type:    'rejection',
        message: String(msg).slice(0, 240),
        source:  '',
        line:    0, col: 0,
        stack:   (r && r.stack) ? String(r.stack).slice(0, 600) : ''
      });
    } catch (er) { /* noop */ }
  });

  // Public API onder DY namespace (lazy: DY kan later geladen worden)
  function attach() {
    try {
      window.DY = window.DY || {};
      window.DY.errors = {
        list:  function() { return buffer.slice(); },
        clear: function() { buffer.length = 0; lastSig = ''; lastTs = 0; },
        count: function() { return buffer.length; }
      };
    } catch (e) { /* noop */ }
  }
  attach();
  // In case DY namespace wordt later vervangen, re-attach na load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  }
})();
