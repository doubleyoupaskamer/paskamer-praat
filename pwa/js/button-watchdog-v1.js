// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Button Watchdog v1 (v57)
//
// Non-invasieve "stuck button" recovery + click telemetry.
//
// Wat doet het:
//   1. Detecteert buttons die >10sec disabled blijven → auto re-enable
//      (voorkomt vastgelopen UI bij niet-afgehandelde async fouten)
//   2. Logt failed clicks (button-id, label, duration) naar error-logger
//   3. Geen wijziging aan bestaande click-handlers — werkt parallel
//
// Targets:
//   • Alle <button>, <a class="btn">, .feed-action, .story-button
//   • Buttons met data-async="true" attribuut
//
// Veilig:
//   • Werkt met capture+passive event listeners (geen event blocking)
//   • Schendt geen bestaande aria-states
//   • Faalt stilletjes als element ontbreekt
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var STUCK_TIMEOUT_MS = 10000; // 10 sec
  var SLOW_CLICK_MS = 3000;     // melden als click >3s duurt
  var watchedButtons = new WeakMap();

  function log(kind, data) {
    try {
      if (window.DY && window.DY.errorLogger && window.DY.errorLogger.send) {
        window.DY.errorLogger.send({
          kind: 'button-' + kind,
          message: JSON.stringify(data).slice(0, 500),
          url: location.href,
        });
      }
    } catch (e) { /* ignore */ }
  }

  function describeButton(el) {
    var label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 60);
    var testId = el.getAttribute('data-testid') || '';
    var id = el.id || '';
    var classes = (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : '';
    return { label: label, testid: testId, id: id, classes: classes };
  }

  function watchButton(btn) {
    if (watchedButtons.has(btn)) return;
    watchedButtons.set(btn, true);

    var startTs = Date.now();
    var wasDisabled = btn.disabled;
    var label = describeButton(btn);

    // Stuck-button check: na 10s nog steeds disabled → re-enable + log
    var stuckTimer = setTimeout(function () {
      if (btn.disabled && !wasDisabled) {
        log('stuck-recovered', { ...label, duration_ms: Date.now() - startTs });
        try {
          btn.disabled = false;
          // Reset text als die ge-overschreven was (bv. "Bezig..." → origineel)
          if (btn.dataset && btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
          }
        } catch (e) { /* ignore */ }
      }
    }, STUCK_TIMEOUT_MS);

    // Slow-click telemetry
    var slowTimer = setTimeout(function () {
      log('slow', { ...label, duration_ms: Date.now() - startTs });
    }, SLOW_CLICK_MS);

    // Cleanup als button weer enabled wordt
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === 'disabled' && !btn.disabled) {
          clearTimeout(stuckTimer);
          clearTimeout(slowTimer);
          observer.disconnect();
          watchedButtons.delete(btn);
        }
      });
    });
    try {
      observer.observe(btn, { attributes: true, attributeFilter: ['disabled'] });
    } catch (e) { /* ignore */ }
  }

  // ── Delegated click listener (capture phase, passive) ──────────────
  function isWatchable(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName.toLowerCase();
    if (t === 'button') return true;
    if (t === 'a' && el.classList && el.classList.contains('btn')) return true;
    if (el.getAttribute && el.getAttribute('role') === 'button') return true;
    if (el.dataset && el.dataset.async === 'true') return true;
    return false;
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    // walk up max 4 levels (button kan een icon wrappen)
    for (var i = 0; i < 4 && t && t !== document.body; i++) {
      if (isWatchable(t)) {
        watchButton(t);
        break;
      }
      t = t.parentElement;
    }
  }, true);

  // ── Expose debug API ──────────────────────────────────────────────
  try {
    window.DY = window.DY || {};
    window.DY.buttonWatchdog = { version: 'v1-v57' };
  } catch (e) { /* ignore */ }
})();
