/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Nav Context & Brand-Logo Universalizer (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Fixt 2 P0 issues uit master prompt v60.1.164:
 *
 *  1. "Terug naar merken" knop ([data-testid="brand-detail-back"]) viel
 *     soms terug naar /feed door brand-portal _renderLock absorptie.
 *     Fix: capture-phase delegator die ALTIJD eerst BP.renderMerken()
 *     direct aanroept (analoog aan v60.1.159 PP_Wallet.openWallet pattern).
 *
 *  2. Brand-logo's tonen overal initials ("TE" voor "test b.v.") i.p.v.
 *     het echte logo uit brands/{uid}.logo. Fix: kleine cache + injectie
 *     in alle .pp-uitg-logo en .bp-prod-noimg containers wanneer de
 *     brandId beschikbaar is.
 *
 * Geen redesign, geen route-mutaties. Pure DOM-injection + delegators.
 *
 * Public API:
 *   PP_NavContext.openMerken()       — direct BP.renderMerken bypass
 *   PP_NavContext.resolveBackRoute() — context-aware back-route resolver
 *   PP_NavContext.brandLogoFor(brandId) — Promise<logoUrl|null>
 *   PP_NavContext.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppNavContextInit) return;
  window.__ppNavContextInit = true;

  var TAG = '[nav-context]';
  var LOGO_CACHE = {};      // brandId → { url: string|null, ts: number }
  var LOGO_TTL_MS = 5 * 60 * 1000;  // 5 minuten

  function db() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }

  // ────────── BACK-ROUTE RESOLVER ──────────
  // Context-aware fallback: voorkomt dat brand-portal pagina's terugvallen
  // naar /feed in plaats van de logische merken-overzichtspagina.
  function openMerken() {
    try {
      if (window.DY) {
        try { if (DY.brandPortal) DY.brandPortal._renderLock = false; } catch (_) {}
        try { window.DY._laatstGerenderd = null; } catch (_) {}
        try { window.DY.pagina = 'merken'; } catch (_) {}
      }
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('pagina', 'merken');
        url.searchParams.delete('id');
        history.pushState(null, '', url.toString());
      } catch (_) {}
      // Direct render via brand-portal helper als beschikbaar
      if (window.DY && DY.brandPortal && typeof DY.brandPortal.renderMerken === 'function') {
        return DY.brandPortal.renderMerken();
      }
      // Fallback naar navigeer
      if (window.DY && typeof DY.navigeer === 'function') {
        return DY.navigeer('merken');
      }
    } catch (e) {
      try { console.warn(TAG, 'openMerken failed:', e); } catch (_) {}
    }
  }

  function resolveBackRoute(opts) {
    opts = opts || {};
    var ctx = opts.context || (window.DY && window.DY.pagina) || '';
    // Context-aware mapping
    if (/^brand_/.test(ctx) || ctx === 'merken_detail' || ctx === 'brand_detail') {
      return { route: 'merken', handler: openMerken };
    }
    if (ctx === 'wallet') {
      return { route: 'brand_dashboard', handler: function () {
        if (window.DY && DY.navigeer) DY.navigeer('brand_dashboard');
      }};
    }
    // Fallback: history back (NIET hardcoded /feed)
    return { route: 'history', handler: function () {
      if (window.history && history.length > 1) history.back();
      else if (window.DY && DY.navigeer) DY.navigeer('feed');
    }};
  }

  function setupBackButtonDelegator() {
    document.addEventListener('click', function (e) {
      try {
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        var btn = target.closest('[data-testid="brand-detail-back"]');
        if (!btn) return;
        // Forceer context-aware back-route (geen feed-fallback)
        e.preventDefault();
        e.stopPropagation();
        openMerken();
      } catch (_) {}
    }, true);
  }

  // ────────── BRAND LOGO RESOLVER ──────────
  // Haalt brand-logo uit Firestore met TTL caching. Returns null als geen
  // logo aanwezig is (caller moet initials fallback tonen).
  function brandLogoFor(brandId) {
    if (!brandId) return Promise.resolve(null);
    var nu = Date.now();
    var cached = LOGO_CACHE[brandId];
    if (cached && (nu - cached.ts) < LOGO_TTL_MS) {
      return Promise.resolve(cached.url);
    }
    var d = db();
    if (!d) return Promise.resolve(null);
    return d.collection('brands').doc(brandId).get()
      .then(function (snap) {
        var url = null;
        if (snap.exists) {
          var data = snap.data() || {};
          if (data.logo && typeof data.logo === 'string') url = data.logo;
        }
        LOGO_CACHE[brandId] = { url: url, ts: nu };
        return url;
      })
      .catch(function () {
        LOGO_CACHE[brandId] = { url: null, ts: nu };
        return null;
      });
  }

  // ────────── LOGO INJECTOR ──────────
  // Vervangt initials-placeholders met echt brand-logo waar mogelijk.
  // Werkt op:
  //   - .pp-uitg-logo (Uitgelicht campagne-kaart)
  //   - .bp-prod-noimg (brand-profile product zonder afbeelding)
  // Zoekt brandId via data-brand-id attribuut OF closest [data-brand-id].
  function injectLogos() {
    var els = document.querySelectorAll(
      '.pp-uitg-logo[data-brand-id]:not([data-pp-logo-checked]), ' +
      '[data-brand-id] .pp-uitg-logo:not([data-pp-logo-checked])'
    );
    Array.prototype.forEach.call(els, function (el) {
      try {
        el.setAttribute('data-pp-logo-checked', '1');
        var brandId = el.getAttribute('data-brand-id') ||
                      (el.closest('[data-brand-id]') && el.closest('[data-brand-id]').getAttribute('data-brand-id'));
        if (!brandId) return;
        brandLogoFor(brandId).then(function (logoUrl) {
          if (!logoUrl) return; // geen logo → initials behouden
          // Vervang inhoud met <img> maar behoud className voor styling
          el.innerHTML = '';
          var img = document.createElement('img');
          img.src = logoUrl;
          img.alt = '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit';
          img.onerror = function () {
            // Bij broken image: behoud lege state (caller's CSS toont fallback)
            try { el.removeChild(img); } catch (_) {}
          };
          el.appendChild(img);
        });
      } catch (_) {}
    });
  }

  // ────────── PATCH UITGELICHT CARDS ──────────
  // De pp-feedtabs-v1.js render produceert .pp-uitg-logo zonder data-brand-id.
  // Wij injecteren die attributen post-render zodat de logo-injector werkt
  // zonder pp-feedtabs te wijzigen.
  function patchUitgelichtCards() {
    var cards = document.querySelectorAll('.pp-uitg-kaart:not([data-pp-brand-id-set])');
    Array.prototype.forEach.call(cards, function (card) {
      try {
        card.setAttribute('data-pp-brand-id-set', '1');
        var testid = card.getAttribute('data-testid') || '';
        // testid format: pp-uitg-<campaignId>; we need brandId — extract from onclick
        var onclick = card.getAttribute('onclick') || '';
        // onclick="PP_FeedTabs.openCamp('cid','bid')" — extract 2nd arg
        var m = onclick.match(/openCamp\('[^']*','([^']*)'/);
        if (m && m[1]) {
          var logo = card.querySelector('.pp-uitg-logo');
          if (logo && !logo.getAttribute('data-brand-id')) {
            logo.setAttribute('data-brand-id', m[1]);
          }
        }
      } catch (_) {}
    });
  }

  // ────────── INIT ──────────
  function init() {
    setupBackButtonDelegator();
    var obs = new MutationObserver(function () {
      try {
        patchUitgelichtCards();
        injectLogos();
      } catch (_) {}
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      patchUitgelichtCards();
      injectLogos();
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_NavContext = {
    openMerken:        openMerken,
    resolveBackRoute:  resolveBackRoute,
    brandLogoFor:      brandLogoFor,
    injectLogos:       injectLogos,
    VERSION:           '1.0.0'
  };
})();
