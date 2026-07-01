/**
 * PASKAMER PRAAT Merken pakketten "Naar merkenportaal" → Coming soon popup
 * -----------------------------------------------------------------
 * Non-breaking, additief. Op de /?pagina=merken_pakketten pagina intercepten
 * we de "Naar merkenportaal" CTA op elk pakket-card (€25/€50/€100/€250) en
 * tonen de bestaande PP_TopupComingSoon popup ipv navigeren naar 'merken'
 * (welke fallbackt naar feed).
 *
 * We LATEN de bestaande hooks (pp-brand-pkg-activate-v1.js +
 * pp-route-safety-v1.js) ongemoeid die bewaren nog steeds de pakket-keuze
 * in Firestore in capture-phase, VOOR onze intercept. Dus geen data-verlies.
 */
(function () {
  'use strict';
  if (window.PP_MerkenComingSoon) return;

  var VERSION = 'v1.0.0';
  var TAG = '[merken-cs]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  function hookCTAs() {
    try {
      if (!window.DY || DY.pagina !== 'merken_pakketten') return;
      var cards = document.querySelectorAll('article.pp-b2c-pkg-card');
      if (!cards.length) return;
      cards.forEach(function (card) {
        if (card.dataset._pp_cs_hooked) return;
        var cta = card.querySelector('button.pp-b2c-pkg-cta, [data-testid^="merk-pkg-cta-"]');
        if (!cta) return;

        // 1. Verwijder inline onclick (die navigeert naar 'merken' → feed fallback)
        if (cta.hasAttribute('onclick')) cta.removeAttribute('onclick');

        // 2. Attach onze listener capture-phase zodat we altijd winnen
        cta.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            var titel  = card.querySelector('.pp-b2c-pkg-naam');
            var prijs  = card.querySelector('.pp-b2c-pkg-prijs');
            var naam   = titel ? titel.textContent.trim() : '';
            var amount = prijs ? Number((prijs.textContent || '').replace(/[^0-9.]/g, '')) || 0 : 0;

            if (window.PP_TopupComingSoon && typeof PP_TopupComingSoon.show === 'function') {
              PP_TopupComingSoon.show({
                naam: naam,
                prijs: amount,
                source: 'b2b'    // triggert de merken-portaal eyebrow variant
              });
            } else {
              // Fallback als coming-soon module (nog) niet geladen is
              try {
                if (window.DY && DY.toast) DY.toast('Binnenkort beschikbaar', false);
                else alert('Binnenkort beschikbaar het merkenportaal is momenteel in ontwikkeling.');
              } catch (_) {}
            }
          } catch (err) { log('show cs failed', err && err.message); }
        }, true); // capture

        card.dataset._pp_cs_hooked = '1';
      });
    } catch (e) { log('hookCTAs threw', e); }
  }

  function init() {
    // Initial + observer voor SPA re-renders
    hookCTAs();
    try {
      var obs = new MutationObserver(function () { hookCTAs(); });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    // Ook na navigatie proberen (DY.navigeer schrijft nieuwe DOM)
    setTimeout(hookCTAs, 300);
    setTimeout(hookCTAs, 1000);
  }

  window.PP_MerkenComingSoon = { VERSION: VERSION, _rehook: hookCTAs };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('init', VERSION);
})();
