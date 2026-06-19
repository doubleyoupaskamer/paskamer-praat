/* Doubleyou - Promise Guard v1.1.0 (2026-02-19)
 * Centrale unhandledrejection + error handler die benigne fouten opvangt
 * (Service Worker update failures, ophefbare fetch aborts, oude
 * registraties van vorige deploys, browser-geinjecteerde callbacks) en
 * de console-pollutie reduceert.
 *
 * Belangrijke principes:
 *   - Echte applicatiefouten (TypeError in business logic) MOETEN
 *     blijven loggen zodat we ze kunnen debuggen.
 *   - Alleen herkenbare technische ruis wordt onderdrukt.
 *   - Een ring buffer (laatste 50 errors) is beschikbaar via
 *     window.PP_PROMISE_GUARD.recent() voor diagnose.
 *
 * v1.1.0 STABILISATIE (geen functionele wijzigingen, alleen ruisreductie):
 *   + _AutofillCallbackHandler no-op stub (iOS Safari 16+ bug:
 *     browser roept callback aan die niet bestaat → ReferenceError).
 *   + Uitgebreide BENIGNE patronen voor browser-extensions, ad-blockers,
 *     Chrome safe-browsing, Firefox MutationObserver quirks etc.
 *   + report() / summary() API voor structured audit-rapport.
 *
 * Veroorzaak bij gebruikers:
 *   "Promise rejection x13/x15 - TypeError: Failed to update a
 *    ServiceWorker for scope (...)" en
 *   "ReferenceError: Can't find variable: _AutofillCallbackHandler"
 *   (iOS Safari autofill-injectie - geen onze code).
 */
(function () {
  'use strict';
  if (window.PP_PROMISE_GUARD) return;

  // ── iOS Safari Autofill no-op stub ──────────────────────────────
  // iOS Safari 16+ injecteert een autofill-callback die naar
  // `_AutofillCallbackHandler` wijst, maar definieert deze NIET in
  // bepaalde contexten (PWA standalone mode, iframe, third-party
  // cookie restrictions). Zonder stub crasht het form-blur event
  // met "Can't find variable: _AutofillCallbackHandler".
  // Bron: WebKit bug 256095. Veilige stub = no-op.
  try {
    if (typeof window._AutofillCallbackHandler === 'undefined') {
      window._AutofillCallbackHandler = function () { /* iOS Safari stub */ };
    }
    // Soms ook zonder underscore prefix (Safari TP)
    if (typeof window.AutofillCallbackHandler === 'undefined') {
      window.AutofillCallbackHandler = function () { /* iOS Safari stub */ };
    }
  } catch (_) {}

  var BUFFER_MAX = 50;
  var buffer = [];

  // Merge early-bootstrap buffer (zie inline script in index.html head)
  try {
    if (window.__dyEarlyBuffer && window.__dyEarlyBuffer.length) {
      for (var _i = 0; _i < window.__dyEarlyBuffer.length && buffer.length < BUFFER_MAX; _i++) {
        buffer.push(window.__dyEarlyBuffer[_i]);
      }
      window.__dyEarlyBuffer.length = 0;
    }
  } catch (e) { /* ignore */ }

  function bufferPush(entry) {
    buffer.push(entry);
    if (buffer.length > BUFFER_MAX) buffer.shift();
  }

  // Match patronen voor benigne ruis die we NIET willen loggen.
  // Echte business-logic errors slippen hier doorheen en blijven zichtbaar.
  // v1.1.0: lijst uitgebreid met browser-geinjecteerde quirks.
  var BENIGNE = [
    // Service worker ruis (vorige deploys, stale registraties)
    /Failed to update a ServiceWorker/i,
    /The script has an unsupported MIME type/i,
    /The script resource is behind a redirect/i,
    /ServiceWorker script evaluation failed/i,
    /NotFoundError.*ServiceWorker/i,
    /InvalidStateError.*ServiceWorker/i,

    // Fetch / network aborts (door navigatie, user cancellation)
    /AbortError.*fetch/i,
    /The user aborted a request/i,
    /Load failed.*manifest/i,
    /NetworkError when attempting to fetch resource/i,
    /Failed to fetch.*manifest/i,

    // Browser-geinjecteerde callbacks (autofill, password managers,
    // safe-browsing, ad-blockers, translation extensions)
    /_AutofillCallbackHandler/,
    /AutofillCallbackHandler/,
    /Can't find variable.*ScriptCompatibilityHandler/,
    /webkit-masked-url/,
    /chrome-extension:/,
    /moz-extension:/,
    /safari-extension:/,
    /\bgtag is not defined\b/,        // GA loaded async maar nog niet klaar
    /window\.fbq is not a function/,  // FB pixel loaded async

    // ResizeObserver loop quirk (Chrome + Edge - bekende false positive)
    /ResizeObserver loop limit exceeded/i,
    /ResizeObserver loop completed with undelivered notifications/i,

    // iOS Safari quirks
    /null is not an object \(evaluating 'window\.webkit/i,
    /Promise.allSettled is not a function/i  // alleen oude iOS < 13
  ];

  function isBenign(reason) {
    if (!reason) return false;
    var msg = '';
    try {
      msg = (reason && reason.message) ? reason.message
          : (typeof reason === 'string' ? reason : String(reason));
    } catch (e) { return false; }
    for (var i = 0; i < BENIGNE.length; i++) {
      if (BENIGNE[i].test(msg)) return true;
    }
    return false;
  }

  window.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    var msg = '';
    try { msg = reason && reason.message ? reason.message : String(reason); } catch (e) { /* noop */ }
    var benign = isBenign(reason);
    bufferPush({ t: Date.now(), kind: 'unhandledrejection', msg: msg, benign: benign });

    if (benign) {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      return;
    }
    try {
      if (window.DY && typeof window.DY.logError === 'function') {
        window.DY.logError('unhandledrejection', { msg: msg });
      }
    } catch (e) { /* ignore */ }
  });

  window.addEventListener('error', function (ev) {
    var msg = (ev && ev.message) ? ev.message : '';
    var src = ev && ev.filename;
    var benign = isBenign(msg) || isBenign(ev && ev.error);
    bufferPush({ t: Date.now(), kind: 'error', msg: msg, src: src, benign: benign });

    // v1.1.0: bekende benigne errors (zoals _AutofillCallbackHandler)
    // onderdrukken in console om gebruikers niet onnodig te alarmeren.
    if (benign) {
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      return false;
    }
  });

  // ── v1.1.0 Audit API ────────────────────────────────────────────
  function generateReport() {
    var events = buffer.slice();
    var byKind = {};
    var benignCount = 0;
    var realErrors = [];
    events.forEach(function (e) {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      if (e.benign) benignCount++;
      else realErrors.push(e);
    });
    return {
      version: '1.1.0',
      generatedAt: new Date().toISOString(),
      totalEvents: events.length,
      byKind: byKind,
      benignSuppressed: benignCount,
      realErrors: realErrors,
      autofillStubInstalled: typeof window._AutofillCallbackHandler === 'function',
      benignPatterns: BENIGNE.length
    };
  }
  function summary() {
    var r = generateReport();
    return {
      totalEvents: r.totalEvents,
      benignSuppressed: r.benignSuppressed,
      realErrors: r.realErrors.length,
      autofillStubInstalled: r.autofillStubInstalled
    };
  }

  window.PP_PROMISE_GUARD = Object.freeze({
    VERSION: '1.1.0',
    recent:  function () { return buffer.slice(); },
    clear:   function () { buffer.length = 0; },
    isBenign: isBenign,
    report:  generateReport,
    summary: summary
  });
})();
