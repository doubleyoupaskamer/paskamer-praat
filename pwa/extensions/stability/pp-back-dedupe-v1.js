/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Back Button Deduplicator (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Detecteert pagina's met MEERDERE terugknoppen (parent + child component
 * renderen beide een terugknop). Behoudt de EERSTE in DOM-volgorde,
 * verbergt de rest via data-attribute (CSS verbergt deze).
 *
 * Werkwijze:
 *   - MutationObserver op #dy-main (= main render target)
 *   - Bij iedere pagina-render: scan alle .dy-back-btn / .dy-sd-back /
 *     .dy-chat-terug binnen #dy-main
 *   - Bij >1 terugknop: keep first, mark rest met data-pp-back-dedup="1"
 *   - CSS verbergt gemarkeerde knoppen via display:none
 *
 * Non-breaking: gebruikt alleen DOM-attribuut, geen HTML/JS modificatie.
 * Bij heropening van pagina worden markeringen automatisch ge-refreshed.
 *
 * Debug:
 *   window.PP_BackDedup.report()  → laatste run-stats
 *   window.PP_BackDedup.setVerbose(true)  → console logs
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBackDedupInit) return;
  window.__ppBackDedupInit = true;

  var TAG = '[back-dedup]';
  var VERBOSE = false;
  try {
    if (new URLSearchParams(location.search).get('debug') === 'back') VERBOSE = true;
    if (localStorage.getItem('pp_debug_back') === '1') VERBOSE = true;
  } catch (_) {}

  var SELECTORS = '.dy-back-btn, .dy-sd-back, .dy-chat-terug';
  var lastStats = { runs: 0, totalSeen: 0, totalHidden: 0, lastAt: null };

  function isVisible(el) {
    try {
      if (!el || el.hidden) return false;
      var st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      if (parseFloat(st.opacity) === 0) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch (e) { return true; }
  }

  function dedupe(root) {
    try {
      var scope = root || document.getElementById('dy-main') || document.body;
      if (!scope) return;
      // Reset eerdere markeringen binnen scope (DOM is mogelijk opnieuw gerenderd)
      var marked = scope.querySelectorAll('[data-pp-back-dedup="1"]');
      Array.prototype.forEach.call(marked, function (el) {
        el.removeAttribute('data-pp-back-dedup');
      });

      // Verzamel alle terugknoppen in volgorde
      var buttons = scope.querySelectorAll(SELECTORS);
      if (buttons.length <= 1) return;

      // Behoud eerste zichtbare terugknop, markeer rest
      var firstKept = null;
      var hidden = 0;
      Array.prototype.forEach.call(buttons, function (btn) {
        // Sla knoppen in modals/popups over - die zijn vaak legitiem
        if (btn.closest('.dy-modal, .dy-popup, .dy-meld-backdrop, [data-pp-keep-back="1"]')) return;
        // Header-buttons hebben prioriteit (eerste zichtbare in DOM-volgorde)
        if (!firstKept && isVisible(btn)) {
          firstKept = btn;
          return;
        }
        // Tweede en verdere terugknop op dezelfde pagina → verbergen
        if (firstKept && btn !== firstKept) {
          btn.setAttribute('data-pp-back-dedup', '1');
          hidden++;
        }
      });

      lastStats.runs++;
      lastStats.totalSeen += buttons.length;
      lastStats.totalHidden += hidden;
      lastStats.lastAt = new Date().toISOString();

      if (VERBOSE && hidden > 0) {
        try { console.log(TAG, 'page', (window.DY && DY.pagina) || '?', 'kept 1, hidden', hidden, 'of', buttons.length); } catch (_) {}
      }
    } catch (e) {
      if (VERBOSE) { try { console.warn(TAG, 'dedupe error', e); } catch (_) {} }
    }
  }

  // Debounced runner zodat we niet bij elke kleine mutation triggeren
  var pending = null;
  function scheduleDedupe() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      dedupe();
    }, 100);
  }

  function startObserver() {
    var target = document.getElementById('dy-main') || document.body;
    if (!target) return false;

    try {
      var observer = new MutationObserver(function (mutations) {
        // Trigger alleen als er nieuwe children zijn toegevoegd
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].type === 'childList' && mutations[i].addedNodes.length > 0) {
            scheduleDedupe();
            return;
          }
        }
      });
      observer.observe(target, { childList: true, subtree: true });
      window.__ppBackDedupObserver = observer;
    } catch (e) {
      if (VERBOSE) { try { console.warn(TAG, 'observer start failed', e); } catch (_) {} }
      return false;
    }

    // Direct ook eenmaal uitvoeren
    dedupe();
    return true;
  }

  function init() {
    if (!startObserver()) {
      // Retry tot dy-main bestaat
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (startObserver() || tries > 40) clearInterval(iv);
      }, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BackDedup = {
    VERSION: '1.0.0',
    report: function () {
      return Object.assign({}, lastStats, {
        currentPage: (window.DY && DY.pagina) || null,
        active: !!window.__ppBackDedupObserver
      });
    },
    runNow: dedupe,
    setVerbose: function (on) {
      VERBOSE = !!on;
      try { localStorage.setItem('pp_debug_back', on ? '1' : '0'); } catch (_) {}
      return VERBOSE;
    }
  };
})();
