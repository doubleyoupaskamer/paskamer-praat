/* PASKAMER PRAAT. Webshop Reviews CTA (v1.0.0)
 * Injecteert additief een CTA-knop bovenaan de "De Winkel" (renderWinkel)
 * pagina met een link naar #webshop-reviews. Raakt geen legacy code aan.
 * MutationObserver detecteert wanneer .dy-wk-wrap in de DOM verschijnt.
 */
(function () {
  'use strict';
  var CTA_ID = 'pp-wsr-cta-strip';

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
      if (t && t.getAttribute && t.getAttribute('data-role') === 'pp-wsr-open') {
        try { location.hash = '#webshop-reviews'; }
        catch (_) { location.href = '/?pagina=webshop_reviews'; }
      }
    });
    return wrap;
  }

  function tryInject() {
    if (alreadyInjected()) return;
    var host = document.querySelector('.dy-wk-wrap');
    if (!host) return;
    // Positioneer als eerste kind zodat het bovenaan verschijnt (na de header).
    var header = host.querySelector('.dy-vr-header');
    var cta = buildCTA();
    if (header && header.parentNode === host) {
      header.parentNode.insertBefore(cta, header.nextSibling);
    } else {
      host.insertBefore(cta, host.firstChild);
    }
  }

  // MutationObserver: kijkt naar #dy-main childList/subtree changes en
  // triggert re-injection na elke re-render van de winkel pagina.
  function startObserver() {
    var main = document.getElementById('dy-main') || document.body;
    if (!main) return;
    var mo = new MutationObserver(function () {
      // Debounce: als winkel opnieuw rendert wordt strip weggegooid door
      // legacy innerHTML=. We plaatsen hem gewoon terug.
      tryInject();
    });
    mo.observe(main, { childList: true, subtree: true });
    // Initial poging
    tryInject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  window.PP_WebshopReviewsCTA = { VERSION: '1.0.0', inject: tryInject };
})();
