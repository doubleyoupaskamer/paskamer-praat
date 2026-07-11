/* PASKAMER PRAAT . Modal Foreground Enforcer (v1.0.0)
 *
 * Zorgt dat nieuw geopende modals/popups ALTIJD direct op de voorgrond
 * komen (nooit achter een oudere modal blijven staan). Watch de DOM,
 * detecteer bekende modal-selectors bij hun eerste render en pas
 * automatisch de klasse `pp-modal-top` toe die z-index boost.
 *
 * 100% additief. Raakt geen bestaande modal-code aan.
 */
(function () {
  'use strict';

  // Bekende modal wrapper-selectors in de codebase.
  var MODAL_SELECTORS = [
    '#dy-wardrobe-rec-modal',
    '#dy-tryon-modal',
    '#dy-premium-modal',
    '#dy-weekly-modal',
    '#pp-webshop-review-modal',
    '#pp-br-modal',
    '.dy-score-detail',
    '.dy-modal[role="dialog"]',
    '.dy-drawer',
    '.dy-dialog',
    '.dy-popup',
    '.pp-modal',
    '.pp-br-modal'
  ];
  var SELECTOR = MODAL_SELECTORS.join(',');
  var TOP_CLASS = 'pp-modal-top';

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity || '1') === 0) return false;
      return true;
    } catch (_) { return true; }
  }

  function bringToFront(el) {
    if (!el || el.classList.contains(TOP_CLASS)) return;
    // Verwijder klasse van eerdere top-modal(s) zodat deze de nieuwe
    // stapel-top wordt.
    var prev = document.querySelectorAll('.' + TOP_CLASS);
    for (var i = 0; i < prev.length; i++) {
      if (prev[i] !== el) prev[i].classList.remove(TOP_CLASS);
    }
    el.classList.add(TOP_CLASS);
  }

  function scan() {
    var nodes = document.querySelectorAll(SELECTOR);
    var visibles = [];
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) visibles.push(nodes[i]);
    }
    if (!visibles.length) return;
    // De LAATSTE zichtbare in DOM order wordt naar voren gebracht.
    bringToFront(visibles[visibles.length - 1]);
  }

  function start() {
    scan();
    var mo = new MutationObserver(function (mutations) {
      var relevant = false;
      for (var i = 0; i < mutations.length && !relevant; i++) {
        var m = mutations[i];
        // Nieuwe modal aan DOM toegevoegd
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n && n.nodeType === 1) {
              try {
                if (n.matches && n.matches(SELECTOR)) { relevant = true; break; }
                if (n.querySelector && n.querySelector(SELECTOR)) { relevant = true; break; }
              } catch (_) {}
            }
          }
        }
        // hidden/style-attribuut wijzigingen die zichtbaarheid beïnvloeden
        if (!relevant && m.type === 'attributes' && m.target && m.target.nodeType === 1) {
          try {
            if (m.target.matches && m.target.matches(SELECTOR)) relevant = true;
          } catch (_) {}
        }
      }
      if (relevant) scan();
    });
    mo.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['hidden', 'style', 'class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PP_ModalStacking = { VERSION: '1.0.0', scan: scan, bringToFront: bringToFront };
})();
