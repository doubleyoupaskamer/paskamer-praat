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
    // v60.1.100: CORRECTE IDs voor hamburger popover + backdrop + button
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
  ];

  // v60.1.100: overlay GROEPEN - bij-elkaar-horende elementen.
  // Wanneer een element uit groep X opent, blijven ALLE andere elementen
  // van groep X open (button + backdrop + popover gaan samen).
  // Anderen groepen worden gesloten.
  var OVERLAY_GROUPS = [
    // Hamburger menu groep
    ['#dy-card-hub-pop', '#dy-card-hub-backdrop', '.dy-card-hub-btn.open'],
    // Outfit-score popup groep
    ['.dy-score-detail.is-sheet', '.dy-score-backdrop'],
    // Premium modal groep
    ['#dy-prem-overlay', '#dy-prem-manage-overlay'],
    // TOS banner
    ['#pp-legal-banner'],
  ];

  function groupOfElement(el) {
    if (!el) return null;
    for (var g = 0; g < OVERLAY_GROUPS.length; g++) {
      var grp = OVERLAY_GROUPS[g];
      for (var s = 0; s < grp.length; s++) {
        try {
          if (el.matches && el.matches(grp[s])) return grp;
          if (el.id && el.id === grp[s].replace(/^#/, '')) return grp;
        } catch (e) { /* noop */ }
      }
    }
    return null;
  }

  function isInGroup(el, group) {
    if (!group) return false;
    for (var s = 0; s < group.length; s++) {
      try {
        if (el.matches && el.matches(group[s])) return true;
      } catch (e) { /* noop */ }
    }
    return false;
  }

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

    // v60.1.101: MutationObservers voor single-active-surface UITGESCHAKELD.
    // Reden: ze conflicteerden met extra-menu-v3.js eigen lifecycle en
    // braken het hamburger menu. Single-active-surface wordt nu alleen
    // afgedwongen op route-change events (hashchange/popstate/logout).
    // Premium modal + hamburger samen open is visueel niet ideaal, maar
    // werkbaar - en de hamburger werkt nu weer correct, wat belangrijker is.

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
