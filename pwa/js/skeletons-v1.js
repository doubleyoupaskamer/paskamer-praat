// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Skeletons + API Retry Toast v1 (non-invasief)
//
// Twee dingen:
//
// 1. Skeleton loaders in de feed-container als content > 1500ms uitblijft
//    - Detecteert eerste echte feed-card render → verwijdert skeletons
//    - Werkt op `.dy-reel-container` / `#dy-feed` / `[data-feed-root]`
//
// 2. Generieke "Opnieuw proberen" toast bij API-fails
//    - Beschikbaar via `DY.retryToast.show(callback, message?)`
//    - Auto-hide na 8s als gebruiker niets doet
//    - Stack-aware (max 1 zichtbaar tegelijk)
//
// Geen breaking changes - alleen additieve UI helpers.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppSkeletonsInit) return;
  window.__ppSkeletonsInit = true;

  // ─────────────────────────────────────────────────────────
  // 1. Skeleton loaders
  // ─────────────────────────────────────────────────────────

  var STYLE_ID = 'dy-skeletons-style';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.dy-skeleton-card{',
      '  background:#fefcf5;border:1px solid rgba(30,26,15,.08);border-radius:16px;',
      '  padding:14px;margin:12px auto;max-width:560px;overflow:hidden;position:relative;',
      '}',
      '.dy-skeleton-row{height:14px;border-radius:6px;background:linear-gradient(90deg,#f1ecdf 0%,#e9e2cf 50%,#f1ecdf 100%);',
      '  background-size:200% 100%;animation:dySkelShine 1.4s linear infinite;margin:8px 0}',
      '.dy-skeleton-row.w70{width:70%}',
      '.dy-skeleton-row.w45{width:45%}',
      '.dy-skeleton-img{height:280px;border-radius:12px;background:linear-gradient(90deg,#f1ecdf 0%,#e4dcc7 50%,#f1ecdf 100%);',
      '  background-size:200% 100%;animation:dySkelShine 1.4s linear infinite;margin:8px 0}',
      '@keyframes dySkelShine{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '@media (prefers-reduced-motion: reduce){',
      '  .dy-skeleton-row,.dy-skeleton-img{animation:none}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function makeSkeletonCard() {
    var c = document.createElement('div');
    c.className = 'dy-skeleton-card';
    c.setAttribute('data-pp-skeleton', '1');
    c.innerHTML =
      '<div class="dy-skeleton-row w45"></div>' +
      '<div class="dy-skeleton-img"></div>' +
      '<div class="dy-skeleton-row w70"></div>' +
      '<div class="dy-skeleton-row w45"></div>';
    return c;
  }

  function findFeedRoot() {
    // v60.1 fix: NOOIT meer fallback naar <main> - dat zorgde ervoor dat op
    // niet-feed pagina's (home, profiel, brand-portal, voorwaarden, etc.)
    // skeleton-cards in #dy-main werden geïnjecteerd. Alleen echte
    // feed-containers triggeren skeletons.
    return document.querySelector('[data-feed-root]') ||
           document.querySelector('.dy-reel-container') ||
           document.querySelector('#dy-feed') ||
           document.querySelector('#dy-verhalen') ||
           null;
  }

  function isOpFeedPagina() {
    // Extra defensieve check: alleen op feed-pagina mogen skeletons getoond
    // worden. Voorkomt edge-cases waarin DOM toch matcht maar context anders is.
    try {
      if (window.DY && typeof window.DY.pagina === 'string') {
        return window.DY.pagina === 'feed';
      }
    } catch (e) { /* noop */ }
    // Fallback: check URL/hash
    try {
      var hash = (location.hash || '').replace(/^#\/?/, '');
      var qs = new URLSearchParams(location.search || '');
      var p = qs.get('pagina') || hash || '';
      // Geen pagina-parameter → eerste bezoek → guest gaat naar 'home' (NIET feed)
      // Dus we tonen géén skeletons tenzij expliciet feed.
      return p === 'feed';
    } catch (e) { return false; }
  }

  function feedHasContent(root) {
    if (!root) return false;
    // Echte content: feed cards of reel content
    return !!(root.querySelector('.dy-reel-content') ||
              root.querySelector('.dy-feed-card') ||
              root.querySelector('[data-post-id]'));
  }

  function showSkeletons(root, count) {
    if (!root || root.querySelector('[data-pp-skeleton]')) return;
    injectStyles();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < (count || 3); i++) frag.appendChild(makeSkeletonCard());
    root.appendChild(frag);
  }

  function removeSkeletons(root) {
    if (!root) return;
    var skels = root.querySelectorAll('[data-pp-skeleton]');
    for (var i = 0; i < skels.length; i++) skels[i].remove();
  }

  // v60.1 fix: ruim eventuele orphan-skeletons uit eerdere sessies/bugs op
  function nukeOrphanSkeletons() {
    try {
      var orphans = document.querySelectorAll('[data-pp-skeleton]');
      for (var i = 0; i < orphans.length; i++) orphans[i].remove();
    } catch (e) { /* noop */ }
  }

  function maybeShowSkeletons() {
    // v60.1 fix: alleen op feed-pagina skeletons tonen, anders forceren we
    // lege blokken op homepage/profile/brand-portal/etc.
    if (!isOpFeedPagina()) return;
    var root = findFeedRoot();
    if (!root) return;
    if (feedHasContent(root)) return; // er is al echte content
    showSkeletons(root, 3);
  }

  // Wacht tot DOM klaar is + 1500ms buffer, dan tonen als feed leeg
  function initSkeletons() {
    setTimeout(maybeShowSkeletons, 1500);
    // Watch voor content-arrival: zodra echte cards verschijnen → opruimen.
    // OOK opruimen als gebruiker wegnavigeert van feed.
    try {
      var mo = new MutationObserver(function() {
        // Niet meer op feed → skeletons direct weg
        if (!isOpFeedPagina()) {
          removeSkeletons(document.querySelector('main'));
          removeSkeletons(document.body);
          return;
        }
        var root = findFeedRoot();
        if (root && feedHasContent(root)) {
          removeSkeletons(root);
          mo.disconnect();
        }
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
      // Safety: na 30s sowieso opruimen
      setTimeout(function() {
        try { mo.disconnect(); } catch (e) { /* noop */ }
        removeSkeletons(findFeedRoot());
        removeSkeletons(document.querySelector('main'));
      }, 30000);
    } catch (e) { /* noop */ }
  }

  // ─────────────────────────────────────────────────────────
  // 2. Retry toast
  // ─────────────────────────────────────────────────────────

  var TOAST_ID = 'dy-retry-toast';
  var TOAST_STYLE = 'dy-retry-toast-style';

  function injectToastStyles() {
    if (document.getElementById(TOAST_STYLE)) return;
    var s = document.createElement('style');
    s.id = TOAST_STYLE;
    s.textContent = [
      '#' + TOAST_ID + '{',
      '  position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0) + 140px);',
      '  transform:translate(-50%,16px);opacity:0;pointer-events:none;z-index:2147483644;',
      '  background:#1e1a0f;color:#fefcf5;padding:12px 18px;border-radius:14px;',
      '  font:600 13px/1.35 "DM Sans","Inter",system-ui,sans-serif;max-width:92vw;',
      '  box-shadow:0 12px 32px rgba(0,0,0,.34);border:1px solid rgba(254,252,245,.16);',
      '  display:flex;align-items:center;gap:12px;',
      '  transition:opacity .26s ease, transform .26s cubic-bezier(.23,1,.32,1);',
      '}',
      '#' + TOAST_ID + '.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
      '#' + TOAST_ID + ' .msg{flex:1;min-width:0}',
      '#' + TOAST_ID + ' button{',
      '  background:#c89b3c;color:#1e1a0f;border:0;padding:7px 14px;border-radius:999px;',
      '  font:700 12px inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;',
      '  flex:none',
      '}',
      '#' + TOAST_ID + ' button:hover{background:#d8aa48}',
      '#' + TOAST_ID + ' .close{',
      '  background:transparent;color:rgba(254,252,245,.6);padding:4px 8px;border-radius:8px;',
      '  font:400 16px inherit',
      '}',
      '@media (prefers-reduced-motion: reduce){#' + TOAST_ID + '{transition:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var currentToast = null;
  var currentTimer = null;

  function hideToast() {
    var el = document.getElementById(TOAST_ID);
    if (el) el.classList.remove('show');
    if (currentTimer) { clearTimeout(currentTimer); currentTimer = null; }
    currentToast = null;
  }

  function showToast(callback, message) {
    injectToastStyles();
    var msg = message || 'Even niet gelukt. Probeer het opnieuw.';
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('role', 'alert');
      el.setAttribute('aria-live', 'assertive');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    var msgEl = document.createElement('span'); msgEl.className = 'msg'; msgEl.textContent = msg;
    var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Opnieuw';
    var close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×';
    btn.addEventListener('click', function() {
      hideToast();
      try { typeof callback === 'function' && callback(); } catch (e) { /* noop */ }
    });
    close.addEventListener('click', hideToast);
    el.appendChild(msgEl); el.appendChild(btn); el.appendChild(close);
    requestAnimationFrame(function() { el.classList.add('show'); });
    currentToast = el;
    if (currentTimer) clearTimeout(currentTimer);
    currentTimer = setTimeout(hideToast, 8000);
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.retryToast = { show: showToast, hide: hideToast };
  window.DY.skeletons = {
    show:    showSkeletons,
    remove:  removeSkeletons,
    rescan:  maybeShowSkeletons
  };

  // Init skeletons na load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      nukeOrphanSkeletons();
      initSkeletons();
    });
  } else {
    nukeOrphanSkeletons();
    initSkeletons();
  }
})();
