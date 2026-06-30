/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou — Reviews Relocate (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Verplaatst de visuele locatie van de
 * "Reviews" knop:
 *
 *  - Mobile bottom-nav (`.dy-nav .dy-nav-item[data-pagina="reviews"]`): VERBERGEN
 *    Reden: 8+ items in de bottom-nav vallen niet meer netjes uit te lijnen
 *    op kleine smartphones. Reviews verhuist naar het 3-puntjes card-hub
 *    popover (`#dy-card-hub-pop`) dat al op iedere feed-kaart staat.
 *
 *  - Desktop sidebar (`.dy-sb-nav .dy-sb-item[data-pagina="reviews"]`): BLIJFT
 *    Reden: desktop heeft genoeg ruimte, Reviews is daar een primaire
 *    navigatie-target.
 *
 *  - Card-hub popover: voegt "Reviews bekijken" toe als eerste item.
 *    Hetzelfde route-target: `DY.navigeer('reviews')` (geen functionele
 *    of route-wijziging).
 *
 * Strict additief — raakt geen legacy code, geen routing, geen permissies.
 *
 * Public API:
 *   PP_Reviews.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppReviewsRelocateInit) return;
  window.__ppReviewsRelocateInit = true;

  var TAG = '[reviews-relocate]';
  var VERSION = '1.0.0';
  window.PP_Reviews = { VERSION: VERSION };

  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  // ─── 1. Card-hub popover: injecteer "Reviews" item ───
  function buildReviewsItemHtml() {
    return '' +
      '<button type="button" class="dy-card-hub-item" data-actie="pp_reviews" role="menuitem" data-testid="card-hub-reviews">' +
        '<span class="dy-card-hub-item-icon">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
          '</svg>' +
        '</span>' +
        '<span class="dy-card-hub-item-label">Reviews bekijken</span>' +
      '</button>';
  }

  function injectReviewsIntoPopover(pop) {
    if (!pop || pop.hasAttribute('data-pp-reviews-injected')) return;
    pop.setAttribute('data-pp-reviews-injected', '1');
    // Eerste item: Reviews
    var firstChild = pop.firstChild;
    var wrap = document.createElement('div');
    wrap.innerHTML = buildReviewsItemHtml();
    var btn = wrap.firstChild;
    if (firstChild) pop.insertBefore(btn, firstChild);
    else pop.appendChild(btn);

    // Klik-handler op popover bestaat al (delegated via #dy-card-hub-pop).
    // We registreren onze actie via window.DY.cardActions zodat de bestaande
    // delegated click handler in extra-menu-v3.js het oppakt.
    try {
      window.DY = window.DY || {};
      window.DY.cardActions = window.DY.cardActions || {};
      window.DY.cardActions.pp_reviews = function () {
        if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('reviews');
      };
    } catch (e) { log('actie register failed', e); }
  }

  // MutationObserver: wacht tot extra-menu-v3.js het popover bouwt
  function observePopover() {
    // Direct check (mogelijk al aanwezig)
    var existing = document.getElementById('dy-card-hub-pop');
    if (existing) {
      injectReviewsIntoPopover(existing);
      // Door blijven kijken: extra-menu kan popover vernieuwen
    }
    try {
      var obs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.id === 'dy-card-hub-pop') {
              injectReviewsIntoPopover(n);
            } else if (n.querySelector) {
              var inner = n.querySelector('#dy-card-hub-pop');
              if (inner) injectReviewsIntoPopover(inner);
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: false });
    } catch (e) { log('observer failed', e); }
  }

  // ─── 2. Verwijder Reviews uit mobile bottom-nav via additive CSS ───
  //    + verplaats Outfit vergelijker (kleuren_ai) naar de plek waar Reviews zat
  //      (rechts van de centrale ⊕ Deel knop) zodat hij niet meer verstopt
  //      achter de ronde Deel-knop verdwijnt.
  function injectHideStyles() {
    if (document.getElementById('pp-reviews-relocate-style')) return;
    var s = document.createElement('style');
    s.id = 'pp-reviews-relocate-style';
    s.textContent = '' +
      /* Mobile: verberg Reviews uit bottom-nav (was: 8 items, nu 7) */
      '@media (max-width: 720px) {' +
      '  .dy-nav .dy-nav-item[data-pagina="reviews"] { display: none !important; }' +
      /* Mobile: zet Outfit vergelijker (kleuren_ai) NA Winkel zodat hij rechts
         van de centrale Deel-knop staat (op de oude Reviews-positie).
         Profiel blijft helemaal rechts. */
      '  .dy-nav .dy-nav-item[data-pagina="kleuren_ai"] { order: 5 !important; }' +
      '  .dy-nav .dy-nav-item[data-pagina="profiel"]    { order: 6 !important; }' +
      '}' +
      /* Desktop sidebar: Reviews + originele volgorde blijft staan — niets te doen */
      '';
    document.head.appendChild(s);
  }

  // ─── Bootstrap ───
  function registerCardAction() {
    // Register de actie EARLY zodat de delegated click-handler van
    // extra-menu-v3.js direct kan dispatchen, ook als popover later wordt gebouwd.
    // Retry-loop voor het geval window.DY pas later beschikbaar wordt.
    var tries = 0;
    function attempt() {
      try {
        if (!window.DY) window.DY = {};
        if (!window.DY.cardActions) window.DY.cardActions = {};
        if (typeof window.DY.cardActions.pp_reviews !== 'function') {
          window.DY.cardActions.pp_reviews = function () {
            try { if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('reviews'); } catch (_) {}
          };
          log('cardAction pp_reviews geregistreerd (try ' + tries + ')');
        }
      } catch (e) { log('register card action error', e && e.message); }
      tries++;
      if (tries < 20) setTimeout(attempt, 300);
    }
    attempt();
  }

  function init() {
    injectHideStyles();
    registerCardAction();
    observePopover();
    log('init', VERSION);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
