/* PASKAMER PRAAT - Giveaway Popup (v2.0.0)
 *
 * Toont bij ELKE pageload een popup met de winactie: "De eerste 50
 * aanmeldingen worden verloot. Winnaar mag t.w.v. EUR 119 kiezen op
 * doubleyoufashion.nl".
 *
 * Flow:
 * - Verschijnt na de aanmeld/onboarding-overlay (wacht max 3s tot die weg is)
 * - Bij geen aanmeld-overlay: verschijnt binnen 1.5s na page-load
 * - Wordt getoond bij ELKE pageload (geen localStorage persistence)
 * - Sluiten via kruisje, backdrop-klik of "Later"-knop
 * - CTA opent doubleyoufashion.nl in nieuw tabblad
 *
 * 100% additief. Raakt geen bestaande code aan.
 */
(function () {
  'use strict';

  var OVERLAY_ID = 'pp-giveaway-overlay';
  var WEBSHOP_URL = 'https://www.doubleyoufashion.nl';
  var SIGNUP_URL = 'https://www.paskamerpraat.nl';
  // TIP: pas EBOOK_URL aan naar de directe download-link van je ebook.
  // Voor nu wijst hij naar de webshop (waar het ebook straks te downloaden is).
  var EBOOK_URL = 'https://www.doubleyoufashion.nl';
  var SHOWN_THIS_LOAD = false;

  var BLOCKING_SELECTORS = [
    '#dy-onboarding-overlay',
    '#dy-bpos-overlay',
    '.dy-auth-modal',
    '.dy-login-modal',
    '#dy-auth-backdrop',
    '.dy-signup-modal'
  ];

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0;
    } catch (_) { return true; }
  }

  function isBlocked() {
    for (var i = 0; i < BLOCKING_SELECTORS.length; i++) {
      var el = document.querySelector(BLOCKING_SELECTORS[i]);
      if (el && isVisible(el)) return true;
    }
    return false;
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.className = 'pp-giveaway-backdrop pp-modal-top';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'pp-giveaway-titel');
    wrap.setAttribute('data-testid', 'pp-giveaway-overlay');
    wrap.innerHTML =
      '<div class="pp-giveaway-card" role="document">' +
        '<button type="button" class="pp-giveaway-close" data-role="close" aria-label="Sluiten" data-testid="pp-giveaway-close">&times;</button>' +
        '<div class="pp-giveaway-badge">Ledenactie</div>' +
        '<h2 class="pp-giveaway-titel" id="pp-giveaway-titel">EUR 119 shoptegoed te winnen</h2>' +
        '<p class="pp-giveaway-tekst">' +
          'De webshop <a href="' + WEBSHOP_URL + '" target="_blank" rel="noopener">doubleyoufashion.nl</a> ' +
          'is op dit moment <strong>nog niet geopend</strong>. Je kunt alvast een ' +
          '<strong>gratis ebook</strong> downloaden om je voor te bereiden. ' +
          'Ondanks dat de webshop nog gesloten is, worden de <strong>eerste 50 aanmeldingen op ' +
          '<a href="https://www.paskamerpraat.nl" target="_blank" rel="noopener">www.paskamerpraat.nl</a></strong> ' +
          'alvast verloot. De winnaar mag zodra de webshop opent iets uitzoeken t.w.v. <strong>EUR 119</strong>.' +
        '</p>' +
        '<div class="pp-giveaway-acties">' +
          '<button type="button" class="pp-giveaway-btn pp-giveaway-btn-primair" data-role="cta" data-testid="pp-giveaway-cta">Ga naar doubleyoufashion.nl en download je E-book</button>' +
          '<button type="button" class="pp-giveaway-btn pp-giveaway-btn-ghost" data-role="signup" data-testid="pp-giveaway-signup">Meld je direct aan op paskamerpraat.nl</button>' +
        '</div>' +
        '<p class="pp-giveaway-kv">Actievoorwaarden: aanmelden en profiel voltooien. Winnaar wordt persoonlijk benaderd zodra de webshop opent.</p>' +
      '</div>';

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var role = t && t.getAttribute && t.getAttribute('data-role');
      if (!role && t === wrap) role = 'close';
      if (role === 'cta') {
        try { window.open(EBOOK_URL, '_blank', 'noopener'); }
        catch (_) { location.href = EBOOK_URL; }
        remove();
      } else if (role === 'signup') {
        try { window.open(SIGNUP_URL, '_blank', 'noopener'); }
        catch (_) { location.href = SIGNUP_URL; }
        remove();
      } else if (role === 'close') {
        remove();
      }
    });
    return wrap;
  }

  function remove() {
    var el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.classList.add('pp-giveaway-uit');
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 250);
  }

  function show() {
    if (SHOWN_THIS_LOAD) return;
    if (document.getElementById(OVERLAY_ID)) return;
    SHOWN_THIS_LOAD = true;
    var overlay = build();
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('pp-giveaway-in'); });
    });
    try { console.log('[pp-giveaway] popup shown'); } catch (_) {}
  }

  function scheduleShow() {
    if (SHOWN_THIS_LOAD) return;
    if (!isBlocked()) {
      // Geen blokkerende overlay: kort delay + toon.
      setTimeout(show, 1200);
      return;
    }
    // Blokkerende overlay: wacht met MutationObserver, max 15s.
    var mo = new MutationObserver(function () {
      if (SHOWN_THIS_LOAD) { mo.disconnect(); return; }
      if (!isBlocked()) {
        mo.disconnect();
        setTimeout(show, 500);
      }
    });
    mo.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden']
    });
    // Absolute fallback: dwing na 15s af, ook al is er iets zichtbaar.
    setTimeout(function () {
      if (SHOWN_THIS_LOAD) return;
      try { mo.disconnect(); } catch (_) {}
      show();
    }, 15000);
  }

  function start() {
    // Klein window zodat de aanmeld-overlay zich kan tonen als hij komt,
    // maar niet zo lang dat de gebruiker moet wachten.
    setTimeout(scheduleShow, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PP_Giveaway = {
    VERSION: '2.0.0',
    show: show,
    forceShow: function () { SHOWN_THIS_LOAD = false; remove(); show(); }
  };
})();
