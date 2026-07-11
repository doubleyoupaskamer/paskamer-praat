/* PASKAMER PRAAT. Webshop Reviews CTA (v1.1.0)
 * Injecteert additief een CTA-knop bovenaan de "De Winkel" (renderWinkel)
 * pagina met een link naar de Webshop Reviews pagina.
 *
 * v1.1.0 ROUTING RCA FIX:
 * - Gebruikt query-param routing (?pagina=webshop_reviews) i.p.v. hash,
 *   want de legacy router draait op ?pagina=. Voorkomt stale hash + dubbele
 *   pagina's + silent no-ops als de hash al gelijk was.
 * - Preventive stopPropagation + preventDefault op click.
 * - Idempotente CTA-injectie via MutationObserver blijft ongewijzigd.
 */
(function () {
  'use strict';
  var CTA_ID = 'pp-wsr-cta-strip';
  var TARGET_PAGE = 'webshop_reviews';

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
   * Deterministische navigatie naar de Webshop Reviews pagina.
   * Elke klik bouwt een schone URL vanuit `location.origin + location.pathname`
   * met alleen ?pagina=webshop_reviews. Geen hergebruik van oude query-params,
   * slugs, hash-fragmenten of state-objects.
   */
  function navigateToReviews() {
    var origin = location.origin || '';
    var path = location.pathname || '/';
    var cleanUrl;
    try {
      // URL-object garandeert consistente encoding, GEEN hash carry-over.
      var u = new URL(origin + path);
      u.searchParams.set('pagina', TARGET_PAGE);
      u.hash = '';
      cleanUrl = u.toString();
    } catch (_) {
      cleanUrl = path + '?pagina=' + TARGET_PAGE;
    }

    // Wis eerst eventueel achtergebleven Webshop-Reviews root DOM node
    // zodat mount() straks een verse render bouwt (geen stale state).
    try {
      var stale = document.getElementById('pp-wsr-root');
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    } catch (_) {}

    // Update URL via History API (verse state, geen state-object hergebruik).
    var pushed = false;
    try {
      if (history && typeof history.pushState === 'function') {
        history.pushState({ pp: TARGET_PAGE, ts: Date.now() }, '', cleanUrl);
        pushed = true;
      }
    } catch (_) {}

    if (!pushed) {
      // Geen History API. Val terug op een schone volledige navigatie.
      location.href = cleanUrl;
      return;
    }

    // Directe mount zonder popstate-dispatch. popstate-dispatch zou de
    // legacy router óók triggeren en race-conditions veroorzaken doordat
    // hij `webshop_reviews` als onbekende route zou proberen te renderen.
    try {
      if (window.PP_WebshopReviews && typeof window.PP_WebshopReviews.mount === 'function') {
        window.PP_WebshopReviews.mount();
        return;
      }
    } catch (_) {}
    // Extensie nog niet geladen? Val terug op harde navigatie.
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
    VERSION: '1.1.0',
    inject: tryInject,
    navigate: navigateToReviews
  };
})();
