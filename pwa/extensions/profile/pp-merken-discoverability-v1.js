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

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // ────────── INJECT CSS (eenmalig) ──────────
  function injectCss() {
    if (document.getElementById('pp-merken-disc-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-merken-disc-css';
    s.textContent =
      '#' + TEASER_ID + '{margin:8px 0 18px;padding:16px 18px;background:linear-gradient(155deg,rgba(212,145,10,0.10),rgba(20,16,12,0.4));border:1px solid rgba(212,145,10,0.22);border-radius:14px}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-body{flex:1;min-width:0}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-titel{font:400 clamp(1.05rem,2.6vw,1.35rem)/1.25 "DM Serif Display","Cormorant Garamond",Georgia,serif;color:#fcf8ef;margin:0 0 6px;letter-spacing:-.01em}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-text{font-size:13px;color:rgba(245,236,224,0.72);margin:0;line-height:1.5}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-toggle{flex:0 0 auto;background:transparent;border:1px solid rgba(245,236,224,0.18);border-radius:999px;color:rgba(245,236,224,0.82);width:32px;height:32px;padding:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.18s ease;font-family:inherit;margin-top:2px}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-toggle{flex:0 0 auto;background:transparent;border:1px solid rgba(245,236,224,0.18);border-radius:999px;color:rgba(245,236,224,0.82);width:32px;height:32px;padding:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.18s ease;font-family:inherit}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-toggle:hover{background:rgba(212,145,10,0.15);border-color:rgba(212,145,10,0.55);color:#f0b340}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-toggle svg{width:14px;height:14px;transition:transform 0.22s ease}' +
      '#' + TEASER_ID + '[data-open="true"] .pp-merken-teaser-toggle svg{transform:rotate(180deg)}' +
      '#' + TEASER_ID + ' .pp-merken-teaser-az{display:none;flex-wrap:wrap;gap:4px;justify-content:flex-start;margin-top:12px}' +
      '#' + TEASER_ID + '[data-open="true"] .pp-merken-teaser-az{display:flex}' +
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
      // Voorkeur: history.back() gebruikt eigen navigatie-context
      if (window.history && history.length > 1) return history.back();
    } catch (_) {}
    // Safe fallback
    if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('feed');
  }

  // ────────── INJECT: Uitgelicht teaser ──────────
  // v1.1.0 (2026-02-23): Plaats teaser PRECIES vóór de "Gesponsord door
  // onze partners" header (.pp-uitg-header) i.p.v. boven de hele grid.
  // Voorheen stond hij boven "Uitgelicht" eyebrow; user wilde hem expliciet
  // direct boven het "Gesponsord door onze partners" blok.
  function injectUitgelichtTeaser() {
    if (document.getElementById(TEASER_ID)) return;
    // Zoek het pp-uitg-header blok met h2 "Gesponsord door onze partners"
    var anchor = null;
    var headers = document.querySelectorAll('.pp-uitg-header');
    for (var i = 0; i < headers.length; i++) {
      var h2 = headers[i].querySelector('.pp-uitg-titel');
      if (h2 && /Gesponsord door onze partners/i.test(h2.textContent || '')) {
        anchor = headers[i];
        break;
      }
    }
    if (!anchor || !anchor.parentNode) return;

    var box = document.createElement('div');
    box.id = TEASER_ID;
    box.setAttribute('data-testid', 'uitg-merken-teaser');
    box.setAttribute('data-open', 'false');
    var azHtml = LETTERS.map(function (l) {
      return '<button type="button" data-letter="' + l + '" data-testid="uitg-az-' + l + '">' + l + '</button>';
    }).join('');
    // v60.1.215: intro-tekst + A-Z collapsible samengevoegd
    // Configureerbaar via window.PP_UITG_INTRO (Firestore config/uitgelicht_intro)
    var introCfg = (window.PP_UITG_INTRO && typeof window.PP_UITG_INTRO === 'object') ? window.PP_UITG_INTRO : {};
    var introTitel = introCfg.titel || 'Ontdek exclusieve merken, collecties en aanbiedingen';
    var introTekst = introCfg.tekst || 'Ontdek exclusieve merken, collecties en aanbiedingen speciaal geselecteerd voor de Tall & Plus Size Community.';
    box.innerHTML =
      '<div class="pp-merken-teaser-head">' +
        '<div class="pp-merken-teaser-body">' +
          (introTitel ? '<h3 class="pp-merken-teaser-titel">' + esc(introTitel) + '</h3>' : '') +
          (introTekst ? '<p class="pp-merken-teaser-text">' + esc(introTekst) + '</p>' : '') +
        '</div>' +
        '<button type="button" class="pp-merken-teaser-toggle" data-testid="uitg-az-toggle" aria-expanded="false" aria-label="Toon alfabet filter" title="Toon alfabet filter">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
      '</div>' +
      '<div class="pp-merken-teaser-az" role="navigation" aria-label="Merken alfabet">' + azHtml + '</div>';

    box.addEventListener('click', function (e) {
      var toggle = e.target && e.target.closest && e.target.closest('.pp-merken-teaser-toggle');
      if (toggle) {
        var isOpen = box.getAttribute('data-open') === 'true';
        box.setAttribute('data-open', isOpen ? 'false' : 'true');
        toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        toggle.setAttribute('aria-label', isOpen ? 'Toon alfabet filter' : 'Verberg alfabet filter');
        toggle.setAttribute('title', isOpen ? 'Toon alfabet filter' : 'Verberg alfabet filter');
        return;
      }
      var btn = e.target && e.target.closest && e.target.closest('button[data-letter]');
      if (!btn) return;
      gotoMerken(btn.getAttribute('data-letter'));
    });

    anchor.parentNode.insertBefore(box, anchor);
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
    VERSION: '1.1.0',
    gotoMerken: gotoMerken,
    backFromMerken: backFromMerken
  };
})();
