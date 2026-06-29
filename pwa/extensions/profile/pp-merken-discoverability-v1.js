/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Merken Discoverability (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Phase B additief module. Twee P0 toevoegingen:
 *
 *  1. UITGELICHT TAB → Bovenaan een subtiele intro + 0-9 A-Z chooser bar:
 *      "Ontdek merken die speciaal voor de Tall & Plus Size community
 *       ontworpen zijn."   [0-9] [A] [B] ... [Z]
 *     Klik op een letter → navigeert naar de Merken-pagina met die
 *     letter pre-selected (gebruikt PP_NavContext.openMerken indien
 *     beschikbaar voor render-lock bypass).
 *
 *  2. MERKEN PAGINA → "← Terug" knop bovenaan ontbrak. Voegen we
 *     additief toe (MutationObserver injection) met history.back()
 *     fallback; bij geen history → safe fallback naar feed.
 *
 * Geen wijzigingen aan brand-portal-v1.js (legacy) of pp-feedtabs-v1.js.
 * Pure DOM-injection via MutationObserver + delegated click handlers.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppMerkenDiscInit) return;
  window.__ppMerkenDiscInit = true;

  var LETTERS = '0-9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z'.split(',');
  var TEASER_ID  = 'pp-merken-teaser-uitg';
  var BACK_BTN_ID = 'pp-merken-back-btn';

  // ────────── INJECT CSS (eenmalig) ──────────
  function injectCss() {
    if (document.getElementById('pp-merken-disc-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-merken-disc-css';
    s.textContent =
      '#' + TEASER_ID + '{margin:8px 0 18px;padding:14px 16px;background:linear-gradient(155deg,rgba(212,145,10,0.08),rgba(20,16,12,0.4));border:1px solid rgba(212,145,10,0.22);border-radius:14px}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-text{font-size:13px;color:rgba(245,236,224,0.78);margin:0 0 10px;line-height:1.4}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-az{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-start}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-az button{background:transparent;border:1px solid rgba(245,236,224,0.12);border-radius:8px;color:rgba(245,236,224,0.72);padding:4px 9px;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s ease;font-family:inherit;letter-spacing:0.04em}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-az button:hover{background:rgba(212,145,10,0.18);border-color:rgba(212,145,10,0.55);color:#f0b340;transform:translateY(-1px)}' +
      '#' + BACK_BTN_ID + '{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid rgba(245,236,224,0.18);border-radius:999px;color:rgba(245,236,224,0.85);padding:6px 14px 6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;margin:0 0 14px;transition:all 0.18s ease;font-family:inherit}' +
      '#' + BACK_BTN_ID + ':hover{background:rgba(212,145,10,0.12);border-color:rgba(212,145,10,0.45);color:#f0b340;transform:translateX(-2px)}' +
      '@media (max-width:480px){#' + TEASER_ID + ' .pp-merken-teaser-az button{padding:3px 7px;font-size:11px}}';
    document.head.appendChild(s);
  }

  // ────────── HANDLER: chooser klik ──────────
  function gotoMerken(letter) {
    try {
      if (letter) {
        try { sessionStorage.setItem('pp-merken-az-prefill', letter); } catch (_) {}
      }
      if (window.PP_NavContext && typeof PP_NavContext.openMerken === 'function') {
        return PP_NavContext.openMerken();
      }
      if (window.DY && typeof DY.navigeer === 'function') return DY.navigeer('merken');
    } catch (_) {}
  }

  // ────────── HANDLER: back ──────────
  function backFromMerken() {
    try {
      // Voorkeur: history.back() — gebruikt eigen navigatie-context
      if (window.history && history.length > 1) return history.back();
    } catch (_) {}
    // Safe fallback
    if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('feed');
  }

  // ────────── INJECT: Uitgelicht teaser ──────────
  function injectUitgelichtTeaser() {
    // Toon alleen wanneer de Uitgelicht-tab content gerenderd is
    var grid = document.querySelector('.pp-uitg-feed-grid');
    if (!grid) return;
    if (document.getElementById(TEASER_ID)) return;

    var box = document.createElement('div');
    box.id = TEASER_ID;
    box.setAttribute('data-testid', 'uitg-merken-teaser');
    var azHtml = LETTERS.map(function (l) {
      return '<button type="button" data-letter="' + l + '" data-testid="uitg-az-' + l + '">' + l + '</button>';
    }).join('');
    box.innerHTML =
      '<p class="pp-merken-teaser-text">Ontdek merken die speciaal voor de Tall &amp; Plus Size community ontworpen zijn.</p>' +
      '<div class="pp-merken-teaser-az" role="navigation" aria-label="Merken alfabet">' + azHtml + '</div>';

    // Delegated click
    box.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('button[data-letter]');
      if (!btn) return;
      gotoMerken(btn.getAttribute('data-letter'));
    });

    // Plaats VOOR de grid (subtiel bovenaan de Uitgelicht-tab content)
    grid.parentNode.insertBefore(box, grid);
  }

  // ────────── INJECT: Merken-pagina back button ──────────
  function injectMerkenBackBtn() {
    if (!window.DY || window.DY.pagina !== 'merken') return;
    var page = document.querySelector('#dy-main .bp-page');
    if (!page) return;
    if (page.querySelector('#' + BACK_BTN_ID)) return;
    // Plaats VOOR de bp-header
    var header = page.querySelector('.bp-header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.id = BACK_BTN_ID;
    btn.type = 'button';
    btn.className = 'bp-back';
    btn.setAttribute('data-testid', 'merken-back-btn');
    btn.setAttribute('aria-label', 'Terug');
    btn.innerHTML = '<span aria-hidden="true">&larr;</span> Terug';
    btn.addEventListener('click', backFromMerken);
    page.insertBefore(btn, header);
  }

  // ────────── INIT ──────────
  function init() {
    injectCss();
    var obs = new MutationObserver(function () {
      try {
        injectUitgelichtTeaser();
        injectMerkenBackBtn();
      } catch (_) {}
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      injectUitgelichtTeaser();
      injectMerkenBackBtn();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_MerkenDiscoverability = {
    VERSION: '1.0.0',
    gotoMerken: gotoMerken,
    backFromMerken: backFromMerken
  };
})();
