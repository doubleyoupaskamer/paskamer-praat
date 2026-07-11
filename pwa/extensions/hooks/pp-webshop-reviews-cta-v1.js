/* PASKAMER PRAAT. Webshop Reviews CTA (v1.2.0)
 * Injecteert additief een CTA-knop bovenaan de "De Winkel" pagina
 * (renderWinkel) met een link naar de Reviews-tab (bottom nav).
 *
 * v1.2.0 CTA TARGET FIX:
 * - Target gewijzigd naar ?pagina=reviews (de Reviews-tab uit de bottom
 *   navigation, hernoemd tot "DoubleYou Tailored for Tall & Plus Size:
 *   Webshop Reviews"). Voorheen ging de CTA naar de aparte
 *   ?pagina=webshop_reviews pagina die niet gekoppeld was aan de tab.
 * - Gebruikt de bestaande legacy router DY.navigeer(...) als 1e keus,
 *   waardoor de CTA exact hetzelfde gedrag geeft als een tab-klik.
 * - Fallback via History API + PopStateEvent, en 3e keus location.href.
 *
 * v1.1.0 fixes blijven actief:
 * - Query-param routing (geen hash-conflicten)
 * - preventDefault + stopPropagation op click
 * - Idempotente MutationObserver-injectie
 * - Opruimen van stale pp-wsr-root bij navigatie
 */
(function () {
  'use strict';

  var CTA_ID = 'pp-wsr-cta-strip';
  var TARGET_PAGE = 'reviews';

  function alreadyInjected() {
    return !!document.getElementById(CTA_ID);
  }

  function buildCTA() {
    var wrap = document.createElement('div');
    wrap.id = CTA_ID;
    wrap.className = 'pp-wsr-cta-strip';
    wrap.setAttribute('data-testid', 'pp-wsr-cta-strip');
    wrap.innerHTML =
      '<div class="pp-wsr-cta-inner">' +
        '<div class="pp-wsr-cta-txt">' +
          '<span class="pp-wsr-cta-eyebrow">DoubleYou</span>' +
          '<span class="pp-wsr-cta-titel">Webshop Reviews</span>' +
          '<span class="pp-wsr-cta-sub">Ervaringen met bestellen, verzending, klantenservice en retour.</span>' +
        '</div>' +
        '<button type="button" class="pp-wsr-cta-btn" data-role="pp-wsr-open" data-testid="pp-wsr-cta-btn">Bekijk reviews</button>' +
      '</div>';
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || t.getAttribute('data-role') !== 'pp-wsr-open') return;
      e.preventDefault();
      e.stopPropagation();
      navigateToReviews();
    });
    return wrap;
  }

  /**
   * Deterministische navigatie naar de Reviews-tab. Elke klik bouwt een
   * verse URL zonder state carry-over. Prefereert DY.navigeer() zodat
   * de CTA exact hetzelfde gedrag geeft als de bottom-nav Reviews-knop.
   */
  function navigateToReviews() {
    // Ruim eventuele stale render-artefacten van de aparte webshop_reviews
    // pagina op, zodat de reviews-tab schoon gerenderd wordt.
    try {
      var stale = document.getElementById('pp-wsr-root');
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    } catch (_) { /* no-op */ }

    // 1e keus: legacy router. Exact hetzelfde gedrag als een tab-klik.
    try {
      if (window.DY && typeof window.DY.navigeer === 'function') {
        window.DY.navigeer(TARGET_PAGE);
        return;
      }
    } catch (_) { /* fallthrough */ }

    // 2e keus: History API + popstate-dispatch. De legacy popstate-listener
    // leest ?pagina=reviews uit de URL en rendert die pagina.
    var origin = location.origin || '';
    var path = location.pathname || '/';
    var cleanUrl;
    try {
      var u = new URL(origin + path);
      u.searchParams.set('pagina', TARGET_PAGE);
      u.hash = '';
      cleanUrl = u.toString();
    } catch (_) {
      cleanUrl = path + '?pagina=' + TARGET_PAGE;
    }
    try {
      if (history && typeof history.pushState === 'function') {
        history.pushState({ pp: TARGET_PAGE, ts: Date.now() }, '', cleanUrl);
        try {
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        } catch (_) {
          try { window.dispatchEvent(new Event('popstate')); } catch (__) { /* no-op */ }
        }
        return;
      }
    } catch (_) { /* fallthrough */ }

    // 3e keus: harde navigatie naar schone URL (geen state hergebruik).
    location.href = cleanUrl;
  }

  function tryInject() {
    if (alreadyInjected()) return;
    var host = document.querySelector('.dy-wk-wrap');
    if (!host) return;
    var header = host.querySelector('.dy-vr-header');
    var cta = buildCTA();
    if (header && header.parentNode === host) {
      header.parentNode.insertBefore(cta, header.nextSibling);
    } else {
      host.insertBefore(cta, host.firstChild);
    }
  }

  function startObserver() {
    var main = document.getElementById('dy-main') || document.body;
    if (!main) return;
    var mo = new MutationObserver(function () { tryInject(); });
    mo.observe(main, { childList: true, subtree: true });
    tryInject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  window.PP_WebshopReviewsCTA = {
    VERSION: '1.2.0',
    inject: tryInject,
    navigate: navigateToReviews
  };
})();
