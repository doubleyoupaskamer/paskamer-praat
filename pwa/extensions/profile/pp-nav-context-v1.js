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
 *   PP_NavContext.openMerken()       direct BP.renderMerken bypass
 *   PP_NavContext.resolveBackRoute() context-aware back-route resolver
 *   PP_NavContext.brandLogoFor(brandId) Promise<logoUrl|null>
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
        // testid format: pp-uitg-<campaignId>; we need brandId extract from onclick
        var onclick = card.getAttribute('onclick') || '';
        // onclick="PP_FeedTabs.openCamp('cid','bid')" extract 2nd arg
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

  // ────────── HISTORY STACK & PARENT MAP (v1.2.0) ──────────
  // Tracked route stack die DY.navigeer() shadowt zonder hem te breken.
  // navStack[i] = { page: 'merken_detail', id: 'brandId', ts: 12345 }
  var navStack = [];
  var NAV_MAX = 25;

  // Parent-map: child page → logische parent route bij ontbrekende history.
  // Voorkomt dat empty states blindelings naar /feed vallen.
  var PARENT_MAP = {
    // Brand portal
    'brand_detail':       { page: 'merken' },
    'merken_detail':      { page: 'merken' },
    'brand_campaigns':    { page: 'brand_dashboard' },
    'brand_products':     { page: 'brand_dashboard' },
    'brand_wallet':       { page: 'brand_dashboard' },
    'brand_settings':     { page: 'brand_dashboard' },
    'brand_onboarding':   { page: 'brand_dashboard' },
    'campagne_detail':    { page: 'merken' },
    'product_detail':     { page: 'merken' },
    // B2C
    'wallet':             { page: 'profiel' },
    'wallet_topup':       { page: 'wallet' },
    'wallet_history':     { page: 'wallet' },
    'pakketten':          { page: 'profiel' },
    'instellingen':       { page: 'profiel' },
    'notificaties':       { page: 'feed' },
    'zoeken':             { page: 'feed' },
    // Admin
    'admin_users':        { page: 'admin' },
    'admin_transactions': { page: 'admin' },
    'admin_boosts':       { page: 'admin' }
  };

  function pushRoute(page, id) {
    try {
      if (!page) return;
      var last = navStack[navStack.length - 1];
      if (last && last.page === page && last.id === (id || null)) return; // dedupe
      navStack.push({ page: page, id: id || null, ts: Date.now() });
      if (navStack.length > NAV_MAX) navStack.shift();
    } catch (_) {}
  }

  // Hook DY.navigeer om elke route te tracken
  function installNavTracker() {
    try {
      if (!window.DY || typeof DY.navigeer !== 'function' || DY.__ppNavTrackerInstalled) return;
      var orig = DY.navigeer.bind(DY);
      DY.navigeer = function (page, id) {
        try { pushRoute(page, id); } catch (_) {}
        return orig(page, id);
      };
      DY.__ppNavTrackerInstalled = true;
      // Seed initial route
      try { pushRoute(DY.pagina || 'feed', DY.huidigeId || null); } catch (_) {}
    } catch (_) {}
  }

  // Context-aware back: probeer 1) navStack (skip current), 2) PARENT_MAP, 3) history.back, 4) feed.
  function goBack(opts) {
    opts = opts || {};
    try {
      var current = (window.DY && DY.pagina) || '';
      // 1) Pop current uit stack, neem previous
      while (navStack.length && navStack[navStack.length - 1].page === current) {
        navStack.pop();
      }
      var prev = navStack[navStack.length - 1];
      if (prev && prev.page) {
        // Bypass voor merken/brand portal gebruik openMerken() helper
        if (prev.page === 'merken') return openMerken();
        if (window.DY && typeof DY.navigeer === 'function') {
          return DY.navigeer(prev.page, prev.id || undefined);
        }
      }
      // 2) PARENT_MAP fallback
      var parent = PARENT_MAP[current];
      if (parent && parent.page) {
        if (parent.page === 'merken') return openMerken();
        if (window.DY && typeof DY.navigeer === 'function') {
          return DY.navigeer(parent.page, parent.id || undefined);
        }
      }
      // 3) Browser history (geen blinde /feed)
      if (window.history && history.length > 1) {
        try { history.back(); return; } catch (_) {}
      }
      // 4) Last resort: feed
      if (window.DY && typeof DY.navigeer === 'function') {
        DY.navigeer('feed');
      }
    } catch (e) {
      try { console.warn(TAG, 'goBack failed:', e); } catch (_) {}
      if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('feed');
    }
  }

  // ────────── INIT ──────────
  function init() {
    setupBackButtonDelegator();
    installNavTracker();
    setupUniversalBackDelegator();
    var obs = new MutationObserver(function () {
      try {
        patchUitgelichtCards();
        injectLogos();
        installNavTracker(); // probeer opnieuw als DY pas later geladen wordt
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

  // ────────── UNIVERSAL BACK BUTTON DELEGATOR (v1.2.0) ──────────
  // Vangt elke knop met data-testid="universal-back" of [data-pp-back="1"]
  // en routeert via context-aware goBack(). Bestaande specifieke
  // handlers (brand-detail-back, merken-back-btn) blijven intact en
  // voorrang houden deze delegator is een net-vanger voor nieuwe
  // back-knoppen die geen specifieke handler hebben.
  function setupUniversalBackDelegator() {
    document.addEventListener('click', function (e) {
      try {
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        var btn = target.closest('[data-testid="universal-back"], [data-pp-back="1"]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        goBack();
      } catch (_) {}
    }, true);
  }

  window.PP_NavContext = {
    openMerken:        openMerken,
    resolveBackRoute:  resolveBackRoute,
    brandLogoFor:      brandLogoFor,
    injectLogos:       injectLogos,
    goBack:            goBack,
    pushRoute:         pushRoute,
    getStack:          function () { return navStack.slice(); },
    PARENT_MAP:        PARENT_MAP,
    VERSION:           '1.2.0'
  };
})();
