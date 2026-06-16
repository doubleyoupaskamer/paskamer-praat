/* Doubleyou - Overlay Discipline v1
 * v60.1.97: System-wide overlay/route hygiene.
 *
 * Doelen (minimaal-invasief, additief):
 *   1. Forceer een consistent z-index-scale via CSS variabelen op :root
 *      zodat alle overlay-lagen deterministisch boven op elkaar stapelen.
 *   2. Sluit automatisch open drawers/popovers/bottom-sheets bij elke
 *      route-wissel (hashchange + popstate + pp:refreshed).
 *   3. Ruim "stuck" overlays op die achterblijven na navigation races.
 *   4. Reset scroll-locks (body.dy-score-modal-open en consorten) wanneer
 *      geen overlay meer actief is.
 *
 * Niet-invasief: raakt geen functionaliteit, design of business logica
 * aan. Voegt alleen lifecycle-correctheid toe.
 */
(function () {
  'use strict';
  if (window.__PP_OVERLAY_DISCIPLINE_V1__) return;
  window.__PP_OVERLAY_DISCIPLINE_V1__ = true;

  // ── 1. Z-index scale via CSS variabelen ───────────────────────────────
  // Single source of truth. Bestaande inline z-index waarden blijven
  // werken, maar nieuwe code kan via var(--pp-z-modal) refereren.
  function injectZScale() {
    if (document.getElementById('pp-overlay-z-scale')) return;
    var s = document.createElement('style');
    s.id = 'pp-overlay-z-scale';
    s.textContent =
      ':root{' +
        '--pp-z-shell:1;' +              // app shell baseline
        '--pp-z-page:10;' +              // page content
        '--pp-z-sticky:50;' +            // sticky headers/footers
        '--pp-z-drawer:1000;' +          // hamburger / side drawers
        '--pp-z-popover:5000;' +         // small popovers/dropdowns
        '--pp-z-modal-backdrop:9990;' +  // modal backdrops
        '--pp-z-modal:9999;' +           // modals / dialogs
        '--pp-z-toast:10500;' +          // toasts (boven modals)
        '--pp-z-critical:99999' +        // critical alerts/banners
      '}';
    document.head.appendChild(s);
  }

  // ── 2. Selectors die "overlays" representeren ─────────────────────────
  // Bij route-change moeten al deze opgeruimd worden om stuck UI te
  // voorkomen. Lijst is conservatief: alleen bekende overlay-elementen.
  var OVERLAY_SELECTORS = [
    // Outfit-score popups en backdrop
    '.dy-score-detail.is-sheet',
    '.dy-score-backdrop',
    // v60.1.99: CORRECTE IDs voor hamburger popover (waren fout in v60.1.97)
    '#dy-card-hub-pop',
    '#dy-card-hub-backdrop',
    '.dy-card-hub-btn.open',
    // Premium modal
    '#dy-prem-overlay',
    '#dy-prem-manage-overlay',
    // Legal TOS banner
    '#pp-legal-banner',
    // Generic dy-modal patterns
    '.dy-modal.dy-modal-open',
    '.dy-modal-overlay',
    '.dy-overlay',
    // Toasts kunnen blijven; geen targeting
  ];

  function closeAllOverlays(reason, exceptEl) {
    var removed = 0;
    OVERLAY_SELECTORS.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          if (exceptEl && (el === exceptEl || el.contains(exceptEl))) return;
          // .open class wordt aria-state, alleen toggle terug;
          // popovers/backdrop worden verwijderd uit DOM.
          if (el.classList.contains('open') && !el.matches('.dy-modal-open')) {
            el.classList.remove('open');
            el.setAttribute('aria-expanded', 'false');
          } else if (el.parentNode) {
            el.remove();
            removed++;
          }
        });
      } catch (e) { /* noop */ }
    });
    // Scroll-locks op body resetten
    try {
      document.body.classList.remove('dy-score-modal-open');
      document.body.classList.remove('dy-modal-open');
      document.body.classList.remove('dy-drawer-open');
      // overflow inline style die soms wordt gezet
      if (document.body.style.overflow === 'hidden' && !exceptEl) {
        document.body.style.overflow = '';
      }
    } catch (e) { /* noop */ }
    if (removed && window.console && console.debug) {
      console.debug('[overlay-discipline] cleaned', removed, 'overlays (' + reason + ')');
    }
  }

  // ── Single-Active-Surface enforcement ────────────────────────────────
  // v60.1.98: zodra een nieuwe overlay verschijnt, sluit alle anderen.
  // Detecteert via MutationObserver op document.body en sluit ALLE
  // bestaande overlays behalve degene die zojuist verscheen.
  function isOverlayNode(node) {
    if (!node || node.nodeType !== 1) return false;
    for (var i = 0; i < OVERLAY_SELECTORS.length; i++) {
      try {
        if (node.matches && node.matches(OVERLAY_SELECTORS[i])) return true;
        if (node.querySelector && node.querySelector(OVERLAY_SELECTORS[i])) {
          // Het is een wrapper met een overlay erin
          return true;
        }
      } catch (e) { /* noop */ }
    }
    return false;
  }

  function enforceSingleActive(newOverlayEl) {
    // Sluit alle BESTAANDE overlays behalve degene die nu is toegevoegd
    closeAllOverlays('single-active', newOverlayEl);
  }

  // ── 3. Route-change detectie ─────────────────────────────────────────
  // DY router dispatcht geen eigen event; we hangen aan native events
  // plus DY.pagina-mutatie via polling als veiligheidsnet.
  var lastPagina = null;
  function checkRouteChange() {
    try {
      var current = (window.DY && window.DY.pagina) || null;
      if (current !== lastPagina) {
        if (lastPagina !== null) {
          // Echte route-wissel (niet de eerste check)
          closeAllOverlays('route-change');
        }
        lastPagina = current;
      }
    } catch (e) { /* noop */ }
  }

  // ── 4. Init hooks ────────────────────────────────────────────────────
  function init() {
    injectZScale();
    // Init lastPagina zonder cleanup te triggeren
    try { lastPagina = (window.DY && window.DY.pagina) || null; } catch (e) { /* noop */ }

    window.addEventListener('hashchange', function () {
      closeAllOverlays('hashchange');
      checkRouteChange();
    });
    window.addEventListener('popstate', function () {
      closeAllOverlays('popstate');
      checkRouteChange();
    });
    document.addEventListener('pp:refreshed', function () {
      checkRouteChange();
    });
    document.addEventListener('pp:logout', function () {
      closeAllOverlays('logout');
    });
    document.addEventListener('pp:userchange', function () {
      closeAllOverlays('userchange');
    });

    // Veiligheidsnet: poll elke 2s voor stille route changes via DY.pagina
    setInterval(checkRouteChange, 2000);

    // SINGLE ACTIVE SURFACE enforcement via MutationObserver.
    // Zodra een nieuwe overlay verschijnt in de DOM tree, sluit alle
    // bestaande overlays behalve de nieuwe. Voorkomt dat hamburger
    // popover + Premium modal samen open kunnen staan.
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (!m.addedNodes || !m.addedNodes.length) continue;
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (isOverlayNode(n)) {
              // Wacht 1 animation frame zodat het nieuwe element zeker
              // gerenderd is voor we de oude opruimen.
              (function (newEl) {
                requestAnimationFrame(function () {
                  enforceSingleActive(newEl);
                });
              })(n);
              return;
            }
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: false });

      // Ook 'class change' op .dy-card-hub-btn detecteren (hamburger
      // gebruikt class toggle, niet element-add). Zelfde principe.
      var moCls = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
          var target = m.target;
          if (target && target.classList && target.classList.contains('open') &&
              target.classList.contains('dy-card-hub-btn')) {
            // Hamburger zojuist geopend - sluit alle andere overlays
            (function (newEl) {
              requestAnimationFrame(function () {
                enforceSingleActive(newEl);
              });
            })(target);
          }
        }
      });
      moCls.observe(document.body, {
        attributes: true, attributeFilter: ['class'], subtree: true
      });
    } catch (e) { /* noop */ }

    // Escape-toets als globale "sluit-alle-overlays" handler
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      // Alleen sluiten als er overlays open zijn (anders niet storen)
      var hasOpen = false;
      for (var i = 0; i < OVERLAY_SELECTORS.length; i++) {
        if (document.querySelector(OVERLAY_SELECTORS[i])) { hasOpen = true; break; }
      }
      if (hasOpen) closeAllOverlays('escape');
    });
  }

  // Public API voor diagnose / debugging
  window.PP_OVERLAY_DISCIPLINE = Object.freeze({
    closeAll: function () { closeAllOverlays('manual'); },
    selectors: OVERLAY_SELECTORS.slice(),
    version: 'v1'
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
