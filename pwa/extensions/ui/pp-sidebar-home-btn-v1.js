/**
 * PASKAMER PRAAT — Sidebar + Topbar Home Button (v1.1.0)
 * -----------------------------------------------------------------
 * v1.0: Home-icoon in sidebar (desktop) naast BETA badge
 * v1.1: Home-icoon ook links in mobiele topbar + auto-scroll-to-top
 *        bij navigatie zodat gebruiker nooit meer denkt dat er "oude"
 *        content blijft hangen (bug-perceptie: user zit in oude scroll
 *        positie na route change → lijkt stale).
 *
 * Non-breaking: injecteert alleen extra <button> elementen + inline
 * styles; bestaande DOM, onclick handlers en routes blijven ongewijzigd.
 */
(function () {
  'use strict';
  if (window.PP_SidebarHomeBtn) return;

  var TAG = '[sb-home-btn]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  function injectStyles() {
    if (document.getElementById('pp-sb-home-btn-styles')) return;
    var css = ''
      /* ── Desktop sidebar home button ── */
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
      + '.dy-sb-logo-rij { align-items: center !important; }'
      /* ── Mobile topbar home button ── */
      + '.pp-tb-home-btn {'
      +   'display: inline-flex;'
      +   'align-items: center;'
      +   'justify-content: center;'
      +   'width: 34px;'
      +   'height: 34px;'
      +   'min-width: 34px;'
      +   'padding: 0;'
      +   'margin-right: 8px;'
      +   'border: 1px solid rgba(198,125,6,0.32);'
      +   'background: rgba(198,125,6,0.08);'
      +   'color: rgba(254,252,245,0.82);'
      +   'border-radius: 9px;'
      +   'cursor: pointer;'
      +   'transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.1s ease;'
      +   '-webkit-tap-highlight-color: transparent;'
      +   'flex-shrink: 0;'
      + '}'
      + '.pp-tb-home-btn:hover { background: rgba(198,125,6,0.22); color: #fff; border-color: rgba(198,125,6,0.6); }'
      + '.pp-tb-home-btn:active { transform: scale(0.94); }'
      + '.pp-tb-home-btn:focus-visible { outline: 2px solid var(--clay, #c67d06); outline-offset: 2px; }'
      + '.pp-tb-home-btn svg { width: 17px; height: 17px; display: block; }'
      /* Topbar layout: home-btn links vóór het logo-blok */
      + '.dy-topbar { display: flex; align-items: center; }';
    var s = document.createElement('style');
    s.id = 'pp-sb-home-btn-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function homeIconSvg() {
    return ''
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +   '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'
      + '</svg>';
  }

  function navigateHome(e) {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    try {
      if (window.DY && typeof DY.navigeer === 'function') {
        DY.navigeer('home');
      } else {
        window.location.href = '/';
      }
      // Zorg dat we bovenaan starten (voorkom "hangende" oude scroll positie)
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
    } catch (err) { log('nav failed', err && err.message); }
  }

  // ── Desktop: sidebar knop ──
  function ensureSidebarButton() {
    var rij = document.querySelector('.dy-sb-logo .dy-sb-logo-rij');
    if (!rij) return;
    if (rij.querySelector('.pp-sb-home-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-sb-home-btn';
    btn.setAttribute('aria-label', 'Ga naar homepage');
    btn.setAttribute('title', 'Homepage');
    btn.setAttribute('data-testid', 'sb-home-btn');
    btn.innerHTML = homeIconSvg();
    btn.addEventListener('click', navigateHome);
    rij.appendChild(btn);
    log('sidebar home-btn geïnjecteerd');
  }

  // ── Mobile: topbar knop (links vóór het logo) ──
  function ensureTopbarButton() {
    var topbar = document.getElementById('dy-topbar');
    if (!topbar) return;
    if (topbar.querySelector('.pp-tb-home-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-tb-home-btn';
    btn.setAttribute('aria-label', 'Ga naar homepage');
    btn.setAttribute('title', 'Homepage');
    btn.setAttribute('data-testid', 'tb-home-btn');
    btn.innerHTML = homeIconSvg();
    btn.addEventListener('click', navigateHome);
    // Prepend ipv append zodat 'ie linksbovenin komt (vóór het logo-blok)
    topbar.insertBefore(btn, topbar.firstChild);
    log('topbar home-btn geïnjecteerd');
  }

  function ensureButtons() {
    injectStyles();
    ensureSidebarButton();
    ensureTopbarButton();
  }

  // ── Scroll-to-top guard bij navigatie ──
  // Voorkomt dat gebruiker in oude scroll-positie blijft na route-change
  // (perceptie: "oude pagina blijft hangen").
  function installNavScrollReset() {
    if (window.__ppNavScrollHooked) return;
    if (!window.DY || typeof DY.navigeer !== 'function') {
      return setTimeout(installNavScrollReset, 400);
    }
    window.__ppNavScrollHooked = true;
    var orig = DY.navigeer;
    DY.navigeer = function (pagina) {
      var result;
      try { result = orig.apply(this, arguments); } catch (e) { throw e; }
      // Na route-change: scroll top + focus main voor screenreaders. Async
      // om render-tijd te geven.
      try {
        setTimeout(function () {
          try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (_) { window.scrollTo(0, 0); }
          var main = document.getElementById('dy-main');
          if (main) main.scrollTop = 0;
        }, 30);
      } catch (_) {}
      return result;
    };
    log('DY.navigeer scroll-reset wrapper actief');
  }

  function init() {
    ensureButtons();
    installNavScrollReset();
    // De sidebar/topbar wordt lazy gerenderd; MutationObserver vangt latere renders op
    try {
      var mo = new MutationObserver(function () { ensureButtons(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    // Extra safety net
    setTimeout(ensureButtons, 500);
    setTimeout(ensureButtons, 2000);
  }

  window.PP_SidebarHomeBtn = { VERSION: '1.1.0', _rehook: ensureButtons };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('init v1.1.0');
})();
