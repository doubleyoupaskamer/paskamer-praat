/* PASKAMER PRAAT. Giveaway Popup (v1.0.0)
 *
 * Toont eenmalig een popup met de winactie: "De eerste 50 aanmeldingen
 * worden verloot. Winnaar mag t.w.v. EUR 119 kiezen op doubleyoufashion.nl".
 *
 * Flow:
 * - Toont NA de aanmeld/onboarding-overlay (wacht tot die weg is)
 * - Ook los van aanmeld-flow: valt terug op timer als geen aanmeld-popup
 *   verschijnt (voor bestaande users of guests die niets doen)
 * - Wordt maximaal 1x getoond per browser (localStorage vlag)
 * - CTA opent doubleyoufashion.nl in nieuw tabblad
 *
 * 100% additief. Raakt geen bestaande code aan.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pp_giveaway_shown_v1';
  var OVERLAY_ID = 'pp-giveaway-overlay';
  var WEBSHOP_URL = 'https://www.doubleyoufashion.nl';

  // Selectors van bekende aanmeld/onboarding overlays die eerst weg moeten.
  var BLOCKING_SELECTORS = [
    '#dy-onboarding-overlay',
    '#dy-bpos-overlay',
    '.dy-auth-modal',
    '.dy-login-modal',
    '#dy-auth-backdrop',
    '.dy-signup-modal'
  ];

  function alreadyShown() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch (_) { return false; }
  }
  function markShown() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
  }
  function isBlocked() {
    for (var i = 0; i < BLOCKING_SELECTORS.length; i++) {
      var el = document.querySelector(BLOCKING_SELECTORS[i]);
      if (el && isVisible(el)) return true;
    }
    return false;
  }
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0;
    } catch (_) { return true; }
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
      '<div class="pp-giveaway-card">' +
        '<button type="button" class="pp-giveaway-close" data-role="close" aria-label="Sluiten" data-testid="pp-giveaway-close">&times;</button>' +
        '<div class="pp-giveaway-badge">Winactie</div>' +
        '<h2 class="pp-giveaway-titel" id="pp-giveaway-titel">EUR 119 shoptegoed te winnen</h2>' +
        '<p class="pp-giveaway-tekst">' +
          'De eerste <strong>50 aanmeldingen</strong> worden verloot. ' +
          'De winnaar mag t.w.v. <strong>EUR 119</strong> iets uitzoeken in ' +
          'de webshop <a href="' + WEBSHOP_URL + '" target="_blank" rel="noopener">doubleyoufashion.nl</a>.' +
        '</p>' +
        '<div class="pp-giveaway-acties">' +
          '<button type="button" class="pp-giveaway-btn pp-giveaway-btn-primair" data-role="cta" data-testid="pp-giveaway-cta">Naar de webshop</button>' +
          '<button type="button" class="pp-giveaway-btn pp-giveaway-btn-ghost" data-role="close" data-testid="pp-giveaway-later">Later</button>' +
        '</div>' +
        '<p class="pp-giveaway-kv">Actievoorwaarden: aanmelden en profiel voltooien. Winnaar wordt persoonlijk benaderd.</p>' +
      '</div>';

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var role = t && t.getAttribute && t.getAttribute('data-role');
      if (!role && t === wrap) role = 'close'; // klik op backdrop
      if (role === 'cta') {
        markShown();
        try { window.open(WEBSHOP_URL, '_blank', 'noopener'); } catch (_) { location.href = WEBSHOP_URL; }
        remove();
      } else if (role === 'close') {
        markShown();
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
    if (alreadyShown() || document.getElementById(OVERLAY_ID)) return;
    var overlay = build();
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { overlay.classList.add('pp-giveaway-in'); });
    });
  }

  function trySchedule() {
    if (alreadyShown()) return;
    if (!isBlocked()) {
      // Geen blokkerende popup zichtbaar: kleine delay + toon.
      setTimeout(function () {
        if (!isBlocked() && !alreadyShown()) show();
      }, 1500);
      return;
    }
    // Blokkerende popup zichtbaar: wacht tot die weg is via MutationObserver.
    var mo = new MutationObserver(function () {
      if (alreadyShown()) { mo.disconnect(); return; }
      if (!isBlocked()) {
        mo.disconnect();
        setTimeout(function () { if (!alreadyShown()) show(); }, 700);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });

    // Fallback: als er om welke reden dan ook nooit een unblock volgt,
    // dwing na 60 seconden een toon af (mensen zonder aanmeld-actie).
    setTimeout(function () {
      if (alreadyShown()) return;
      mo.disconnect();
      show();
    }, 60000);
  }

  function start() {
    // Wacht op eventuele boot-splash en initialize-flow.
    if (alreadyShown()) return;
    // Initial poging pas na 4s zodat aanmeld-overlay zich kan tonen als hij komt.
    setTimeout(trySchedule, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PP_Giveaway = {
    VERSION: '1.0.0',
    show: show,
    reset: function () { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  };
})();
