/* Doubleyou - Promise Guard v1
 * Centrale unhandledrejection handler die benigne fouten opvangt
 * (Service Worker update failures, ophefbare fetch aborts, oude
 * registraties van vorige deploys) en de console-pollutie reduceert.
 *
 * Belangrijke principes:
 *   - Echte applicatiefouten (TypeError in business logic) MOETEN
 *     blijven loggen zodat we ze kunnen debuggen.
 *   - Alleen herkenbare technische ruis wordt onderdrukt.
 *   - Een ring buffer (laatste 50 errors) is beschikbaar via
 *     window.PP_PROMISE_GUARD.recent() voor diagnose.
 *
 * Veroorzaak bij gebruikers:
 *   "Promise rejection x13/x15 - TypeError: Failed to update a
 *    ServiceWorker for scope (...)" - na vorige deploy hadden
 *    devices een stale registratie die periodiek reg.update()
 *    deed; die failde silencieus maar werd door browsers gerapporteerd.
 */
(function () {
  'use strict';
  if (window.PP_PROMISE_GUARD) return;

  var BUFFER_MAX = 50;
  var buffer = [];

  function bufferPush(entry) {
    buffer.push(entry);
    if (buffer.length > BUFFER_MAX) buffer.shift();
  }

  // Match patronen voor benigne ruis die we NIET willen loggen.
  // Echte business-logic errors slippen hier doorheen en blijven zichtbaar.
  var BENIGNE = [
    /Failed to update a ServiceWorker/i,
    /The script has an unsupported MIME type/i,
    /The script resource is behind a redirect/i,
    /ServiceWorker script evaluation failed/i,
    /AbortError.*fetch/i,
    /The user aborted a request/i,
    /Load failed.*manifest/i,
    /NotFoundError.*ServiceWorker/i,
    /InvalidStateError.*ServiceWorker/i
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
    bufferPush({ t: Date.now(), kind: 'unhandledrejection', msg: msg });

    if (isBenign(reason)) {
      // Geen console-spam voor herkenbare ruis. App blijft draaien.
      try { ev.preventDefault(); } catch (e) { /* ignore */ }
      return;
    }
    // Niet-benigne: laat browser default afhandelen (console.error).
    // Wel naar onze interne errorlogger sturen als die beschikbaar is.
    try {
      if (window.DY && typeof window.DY.logError === 'function') {
        window.DY.logError('unhandledrejection', { msg: msg });
      }
    } catch (e) { /* ignore */ }
  });

  window.addEventListener('error', function (ev) {
    var msg = (ev && ev.message) ? ev.message : '';
    bufferPush({ t: Date.now(), kind: 'error', msg: msg, src: ev && ev.filename });
    // Echte JS errors blijven naar console + errorlogger; alleen bufferen.
  });

  window.PP_PROMISE_GUARD = Object.freeze({
    recent: function () { return buffer.slice(); },
    clear:  function () { buffer.length = 0; },
    isBenign: isBenign
  });
})();
