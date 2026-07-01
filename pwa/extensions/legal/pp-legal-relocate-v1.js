/**
 * PASKAMER PRAAT Legal footer verplaatsen onder Contact + footer hiden
 * -----------------------------------------------------------------
 * v1.0.0 (2026-07-01):
 *   1. Kopieert het W-mark + 5 legal links (Gebruikersreglement, Acceptable
 *      Use, Privacy & Cookies, Algemene Voorwaarden, Campagnevoorwaarden)
 *      naar direct ONDER de Contact-knop in de "Voor merken" sectie op de
 *      home hero.
 *   2. Verbergt de originele <footer> element (inclusief copyright + versie
 *      "v60.1.102" tekst) volledig.
 *
 * Non-breaking: het bronbestand pp-legal-footer-v1.js blijft ongewijzigd,
 * de anchors + hrefs blijven identiek zodat legal-flow intact is.
 */
(function () {
  'use strict';
  if (window.PP_LegalRelocate) return;

  var TAG = '[legal-relocate]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  function injectStyles() {
    if (document.getElementById('pp-legal-relocate-styles')) return;
    var css = ''
      /* Verberg de originele footer volledig */
      + '#pp-legal-footer, footer[data-testid="pp-legal-footer"] {'
      +   'display: none !important;'
      + '}'
      /* Compacte legal-block onder Contact button */
      + '.pp-legal-inline {'
      +   'margin-top: 18px;'
      +   'padding-top: 16px;'
      +   'border-top: 1px solid rgba(198,125,6,0.14);'
      +   'text-align: center;'
      + '}'
      + '.pp-legal-inline-mark {'
      +   'display: inline-flex;'
      +   'align-items: center;'
      +   'justify-content: center;'
      +   'width: 30px;'
      +   'height: 30px;'
      +   'margin: 0 auto 10px;'
      +   'border: 1px solid rgba(198,125,6,0.35);'
      +   'border-radius: 50%;'
      +   'font-family: "Cormorant Garamond", serif;'
      +   'font-size: 1rem;'
      +   'font-weight: 700;'
      +   'font-style: italic;'
      +   'color: rgba(198,125,6,0.85);'
      + '}'
      + '.pp-legal-inline-row {'
      +   'display: flex;'
      +   'flex-wrap: wrap;'
      +   'justify-content: center;'
      +   'gap: 4px 8px;'
      +   'font-size: 0.72rem;'
      +   'line-height: 1.6;'
      + '}'
      + '.pp-legal-inline-row a {'
      +   'color: rgba(254,252,245,0.55);'
      +   'text-decoration: none;'
      +   'transition: color 0.18s ease;'
      + '}'
      + '.pp-legal-inline-row a:hover {'
      +   'color: rgba(254,252,245,0.9);'
      +   'text-decoration: underline;'
      + '}'
      + '.pp-legal-inline-sep {'
      +   'color: rgba(198,125,6,0.35);'
      +   'font-size: 0.7rem;'
      + '}'
      /* Powered by link onderaan */
      + '.pp-legal-inline-powered {'
      +   'margin-top: 12px;'
      +   'text-align: center;'
      +   'font-size: 0.72rem;'
      +   'line-height: 1.5;'
      + '}'
      + '.pp-legal-inline-powered a {'
      +   'color: #d67c06;'
      +   'text-decoration: none;'
      +   'font-weight: 500;'
      +   'letter-spacing: 0.01em;'
      +   'transition: color 0.18s ease, text-shadow 0.18s ease;'
      + '}'
      + '.pp-legal-inline-powered a:hover {'
      +   'color: #f0952a;'
      +   'text-decoration: underline;'
      +   'text-shadow: 0 0 12px rgba(214,124,6,0.35);'
      + '}';
    var s = document.createElement('style');
    s.id = 'pp-legal-relocate-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildInlineBlock() {
    var wrap = document.createElement('div');
    wrap.className = 'pp-legal-inline';
    wrap.setAttribute('data-testid', 'legal-inline');
    wrap.innerHTML = ''
      + '<div class="pp-legal-inline-mark" aria-hidden="true">W</div>'
      + '<div class="pp-legal-inline-row">'
      +   '<a href="/voorwaarden/#reglement" data-testid="legal-inline-reglement">Gebruikersreglement</a>'
      +   '<span class="pp-legal-inline-sep">·</span>'
      +   '<a href="/voorwaarden/#aup" data-testid="legal-inline-aup">Acceptable Use</a>'
      +   '<span class="pp-legal-inline-sep">·</span>'
      +   '<a href="/voorwaarden/#privacy" data-testid="legal-inline-privacy">Privacy &amp; Cookies</a>'
      +   '<span class="pp-legal-inline-sep">·</span>'
      +   '<a href="/voorwaarden/#av" data-testid="legal-inline-av">Algemene Voorwaarden</a>'
      +   '<span class="pp-legal-inline-sep">·</span>'
      +   '<a href="/voorwaarden/#campagnes" data-testid="legal-inline-campagnes">Campagnevoorwaarden</a>'
      + '</div>'
      + '<div class="pp-legal-inline-powered">'
      +   '<a href="https://www.doubleyoufashion.nl" target="_blank" rel="noopener noreferrer" data-testid="legal-inline-powered">Powered by: Doubleyou Tailored for Tall &amp; Plus size. 2026©</a>'
      + '</div>';
    return wrap;
  }

  function ensureInlineBlock() {
    try {
      // Zoek de Contact-knop container op de home hero (.dy-hm-hero-legal)
      var legalWrap = document.querySelector('.dy-hm-hero-actions .dy-hm-hero-legal');
      if (!legalWrap) return;
      // Als 'ie er al staat: klaar
      if (legalWrap.parentNode.querySelector('.pp-legal-inline')) return;
      injectStyles();
      var block = buildInlineBlock();
      // Insert DIRECT NA de .dy-hm-hero-legal wrapper (die de Contact-knop bevat)
      if (legalWrap.nextSibling) {
        legalWrap.parentNode.insertBefore(block, legalWrap.nextSibling);
      } else {
        legalWrap.parentNode.appendChild(block);
      }
      log('legal block onder Contact ingevoegd');
    } catch (e) { log('inject fail', e && e.message); }
  }

  function init() {
    injectStyles();  // verberg de bestaande footer meteen
    ensureInlineBlock();
    try {
      var mo = new MutationObserver(function () { ensureInlineBlock(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
    setTimeout(ensureInlineBlock, 500);
    setTimeout(ensureInlineBlock, 2000);
  }

  window.PP_LegalRelocate = { VERSION: '1.0.0', _rehook: ensureInlineBlock };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('init v1.0.0');
})();
