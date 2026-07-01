/**
 * PASKAMER PRAAT — Sidebar Home Button (v1.0.0)
 * -----------------------------------------------------------------
 * Voegt een kleine subtiele home-icoon knop toe in de sidebar naast de
 * "DoubleYou BETA" logo-regel. De onderliggende .dy-sb-logo block heeft
 * al een onclick naar DY.navigeer('home'), maar zonder visuele affordance.
 * Deze knop maakt de home-navigatie ontdekbaar en tapbaar (mobile).
 *
 * Non-breaking: injecteert alleen een <button> element + inline styles;
 * bestaande DOM, onclick handlers en routes blijven ongewijzigd.
 */
(function () {
  'use strict';
  if (window.PP_SidebarHomeBtn) return;

  var TAG = '[sb-home-btn]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  function injectStyles() {
    if (document.getElementById('pp-sb-home-btn-styles')) return;
    var css = ''
      + '.pp-sb-home-btn {'
      +   'display: inline-flex;'
      +   'align-items: center;'
      +   'justify-content: center;'
      +   'width: 28px;'
      +   'height: 28px;'
      +   'min-width: 28px;'
      +   'padding: 0;'
      +   'margin-left: auto;'
      +   'border: 1px solid rgba(198,125,6,0.28);'
      +   'background: rgba(198,125,6,0.06);'
      +   'color: rgba(254,252,245,0.72);'
      +   'border-radius: 8px;'
      +   'cursor: pointer;'
      +   'transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.1s ease;'
      +   '-webkit-tap-highlight-color: transparent;'
      + '}'
      + '.pp-sb-home-btn:hover {'
      +   'background: rgba(198,125,6,0.22);'
      +   'color: #fff;'
      +   'border-color: rgba(198,125,6,0.55);'
      + '}'
      + '.pp-sb-home-btn:active { transform: scale(0.94); }'
      + '.pp-sb-home-btn:focus-visible {'
      +   'outline: 2px solid var(--clay, #c67d06);'
      +   'outline-offset: 2px;'
      + '}'
      + '.pp-sb-home-btn svg { width: 15px; height: 15px; display: block; }'
      /* Zorg dat de logo-rij ruimte heeft voor de knop */
      + '.dy-sb-logo-rij { align-items: center !important; }';
    var s = document.createElement('style');
    s.id = 'pp-sb-home-btn-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function makeBtn() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-sb-home-btn';
    btn.setAttribute('aria-label', 'Ga naar homepage');
    btn.setAttribute('title', 'Homepage');
    btn.setAttribute('data-testid', 'sb-home-btn');
    btn.innerHTML = ''
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +   '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'
      + '</svg>';
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // voorkom dat de parent .dy-sb-logo onclick óók vuurt
      e.preventDefault();
      try {
        if (window.DY && typeof DY.navigeer === 'function') {
          DY.navigeer('home');
        } else {
          window.location.href = '/';
        }
      } catch (err) { log('nav failed', err && err.message); }
    });
    return btn;
  }

  function ensureButton() {
    // Zoek de logo-rij (containeetje met "DoubleYou" + BETA badge)
    var rij = document.querySelector('.dy-sb-logo .dy-sb-logo-rij');
    if (!rij) return;
    // Als 'ie er al staat: klaar
    if (rij.querySelector('.pp-sb-home-btn')) return;
    injectStyles();
    rij.appendChild(makeBtn());
    log('home-btn geïnjecteerd');
  }

  function init() {
    ensureButton();
    // De sidebar wordt lazy gerenderd (media query >= md). MutationObserver
    // vangt latere renders op.
    try {
      var mo = new MutationObserver(function () { ensureButton(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    // Extra safety net
    setTimeout(ensureButton, 500);
    setTimeout(ensureButton, 2000);
  }

  window.PP_SidebarHomeBtn = { VERSION: '1.0.0', _rehook: ensureButton };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('init v1.0.0');
})();
