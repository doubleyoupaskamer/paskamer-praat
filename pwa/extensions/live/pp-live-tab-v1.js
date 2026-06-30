/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou — Live Module (Tab + Grid Renderer)  v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Voegt een "Live" tab toe aan de bestaande
 * navigatie (zowel mobile bottom-nav als sidebar) en registreert een eigen
 * page-renderer voor `pagina=live` en `pagina=live_detail` zonder de
 * legacy DY.toonPagina renders-map te muteren.
 *
 * Architectuurkeuzes:
 *  - Tab insertion gebeurt via DOM injection on DOMContentLoaded met retry,
 *    zonder index.html aan te raken (additief).
 *  - Page rendering via wrapper rond DY.navigeer + DY.toonPagina (idempotent).
 *  - Grid leest uit Firestore collection `live_sessions` (status='live').
 *  - SEO-vriendelijke deep links: ?pagina=live_detail&id={sessionId}.
 *
 * Public API:
 *   PP_Live.openLive()
 *   PP_Live.openSession(id)
 *   PP_Live.openStart()
 *   PP_Live.VERSION
 *
 * Gerelateerde modules:
 *   pp-live-player-v1.js  — modal player + chat + reactions
 *   pp-live-start-v1.js   — start-live bottom sheet + camera preview
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppLiveTabInit) return;
  window.__ppLiveTabInit = true;

  var TAG = '[live-tab]';
  var VERSION = '1.0.0';

  // Public namespace (other live modules read from this)
  var PP_Live = window.PP_Live || (window.PP_Live = {});
  PP_Live.VERSION = VERSION;
  PP_Live._sessions = [];
  PP_Live._unsubscribeGrid = null;

  function db() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }
  function auth() {
    return (window.firebase && firebase.auth) ? firebase.auth() : null;
  }

  function log() {
    try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {}
  }

  // ───────────── Tab insertion ─────────────
  function buildNavBtnMobile() {
    var btn = document.createElement('button');
    btn.className = 'dy-nav-item';
    btn.setAttribute('data-pagina', 'live');
    btn.setAttribute('aria-label', 'Live');
    btn.setAttribute('data-testid', 'live-nav-btn-mobile');
    btn.innerHTML = '' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>' +
        '<path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>' +
        '<path d="M8.4 8.4a5 5 0 0 0 0 7.2M15.6 8.4a5 5 0 0 1 0 7.2"/>' +
      '</svg>' +
      '<span>Live</span>' +
      '<span class="pp-live-nav-dot" aria-hidden="true"></span>';
    btn.addEventListener('click', function () {
      try { if (window.DY && DY.navigeer) DY.navigeer('live'); } catch (e) {}
    });
    return btn;
  }

  function buildNavBtnSidebar() {
    var btn = document.createElement('button');
    btn.className = 'dy-sb-item';
    btn.setAttribute('data-pagina', 'live');
    btn.setAttribute('aria-label', 'Live');
    btn.setAttribute('data-testid', 'live-nav-btn-sidebar');
    btn.innerHTML = '' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>' +
        '<path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>' +
        '<path d="M8.4 8.4a5 5 0 0 0 0 7.2M15.6 8.4a5 5 0 0 1 0 7.2"/>' +
      '</svg>' +
      '<span>Live</span>' +
      '<span class="pp-live-nav-dot" aria-hidden="true"></span>';
    btn.addEventListener('click', function () {
      try { if (window.DY && DY.navigeer) DY.navigeer('live'); } catch (e) {}
    });
    return btn;
  }

  function ensureNavButtons() {
    try {
      var mobileNav = document.getElementById('dy-nav');
      if (mobileNav && !mobileNav.querySelector('[data-pagina="live"]')) {
        var existing = mobileNav.querySelector('[data-pagina="vrienden"]');
        var btn = buildNavBtnMobile();
        if (existing && existing.nextSibling) {
          mobileNav.insertBefore(btn, existing.nextSibling);
        } else {
          mobileNav.appendChild(btn);
        }
      }
      var sideNav = document.querySelector('.dy-sb-nav');
      if (sideNav && !sideNav.querySelector('[data-pagina="live"]')) {
        var sExisting = sideNav.querySelector('[data-pagina="vrienden"]');
        var sBtn = buildNavBtnSidebar();
        if (sExisting && sExisting.nextSibling) {
          sideNav.insertBefore(sBtn, sExisting.nextSibling);
        } else {
          sideNav.appendChild(sBtn);
        }
      }
    } catch (e) { log('ensureNavButtons failed', e); }
  }

  // Refresh "active" state on legacy nav reconciliation
  function syncNavActive() {
    try {
      var pagina = (window.DY && DY.pagina) || '';
      document.querySelectorAll('[data-pagina="live"]').forEach(function (el) {
        if (pagina === 'live' || pagina === 'live_detail') {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });
    } catch (e) {}
  }

  // ───────────── Render: grid pagina ─────────────
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initialFor(name) {
    if (!name) return '?';
    var n = String(name).trim();
    if (n.charAt(0) === '@') n = n.substring(1);
    return n.charAt(0).toUpperCase() || '?';
  }

  function sessionCardHtml(s, featured) {
    var id = s.id;
    var title = escapeHtml(s.title || 'Live sessie');
    var name = escapeHtml(s.hostName || 'anoniem');
    var viewers = (typeof s.viewers === 'number') ? s.viewers : 0;
    var tags = Array.isArray(s.tags) ? s.tags.slice(0, 3) : [];
    var thumbCls = featured ? 'pp-live-thumb' :
      (s.id && s.id.charCodeAt(0) % 2 === 0 ? 'pp-live-thumb pp-live-thumb-alt' : 'pp-live-thumb pp-live-thumb-alt2');
    var emoji = featured ? '👗🪞' : (s.emoji || '✨');
    var cohostBadge = (Array.isArray(s.cohosts) && s.cohosts.length > 0)
      ? '<div class="pp-live-cohost-badge">⚡ CO-HOST</div>' : '';

    var tagsHtml = tags.map(function (t) {
      return '<span class="pp-live-tag">' + escapeHtml(t) + '</span>';
    }).join('');

    return '' +
      '<div class="pp-live-card ' + (featured ? 'pp-live-featured' : '') + '" ' +
        'data-testid="live-card-' + escapeHtml(id) + '" data-session-id="' + escapeHtml(id) + '">' +
        '<div class="' + thumbCls + '">' + (s.thumbUrl
            ? '<div class="pp-live-thumb-img" style="background-image:url(' + JSON.stringify(s.thumbUrl) + ');position:absolute;inset:0"></div>'
            : escapeHtml(emoji)) + '</div>' +
        '<div class="pp-live-card-overlay"></div>' +
        cohostBadge +
        '<div class="pp-live-badge"><div class="pp-live-dot"></div> LIVE</div>' +
        '<div class="pp-live-viewer-count">👁 ' + viewers + '</div>' +
        '<div class="pp-live-card-info">' +
          '<div class="pp-live-card-user">' +
            '<div class="pp-live-avatar">' + escapeHtml(initialFor(s.hostName)) + '</div>' +
            '<span class="pp-live-username">' + (name.charAt(0) === '@' ? name : '@' + name) + '</span>' +
          '</div>' +
          '<div class="pp-live-card-titel">' + title + '</div>' +
          (tagsHtml ? '<div class="pp-live-card-tags">' + tagsHtml + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  function emptyStateHtml() {
    return '' +
      '<div class="pp-live-empty" data-testid="live-empty-state">' +
        '<span class="pp-live-empty-emoji">📡</span>' +
        '<div class="pp-live-empty-title">Nog niemand live</div>' +
        '<div>Wees de eerste — druk op de knop hierboven om je live sessie te starten.</div>' +
      '</div>';
  }

  function skeletonGridHtml() {
    var out = '';
    for (var i = 0; i < 6; i++) out += '<div class="pp-live-skel"></div>';
    return '<div class="pp-live-grid">' + out + '</div>';
  }

  function renderLivePage() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.className = 'dy-main';
    main.innerHTML = '' +
      '<div class="pp-live-page" data-testid="live-page">' +
        '<div class="pp-live-head">' +
          '<h2 class="pp-live-title"><span class="pp-live-pulse-dot"></span> Live nu</h2>' +
          '<span class="pp-live-sub" id="pp-live-count">0 sessies</span>' +
        '</div>' +
        '<button class="pp-live-cta" data-testid="live-go-live-btn" type="button">' +
          '<span class="pp-live-cta-icon">📡</span>' +
          'Start een live paskamersessie' +
        '</button>' +
        '<div id="pp-live-grid-wrap">' + skeletonGridHtml() + '</div>' +
      '</div>';

    // CTA wire-up
    var cta = main.querySelector('[data-testid="live-go-live-btn"]');
    if (cta) cta.addEventListener('click', function () {
      if (PP_Live.openStart) PP_Live.openStart();
    });

    // Live subscription
    startGridSubscription();
    syncNavActive();

    // Tell SEO module this is a public list-page (gets indexed)
    try {
      if (window.PP_SEO && PP_SEO.applyForPage) PP_SEO.applyForPage('live');
    } catch (_) {}
  }

  function paintGrid(sessions) {
    var wrap = document.getElementById('pp-live-grid-wrap');
    if (!wrap) return;
    if (!sessions || sessions.length === 0) {
      wrap.innerHTML = emptyStateHtml();
    } else {
      var html = '<div class="pp-live-grid" data-testid="live-grid">';
      // First session featured if it has cohosts or many viewers
      var first = sessions[0];
      var firstFeatured = !!(first && ((first.cohosts && first.cohosts.length > 0) || (first.viewers || 0) > 100));
      sessions.forEach(function (s, idx) {
        html += sessionCardHtml(s, idx === 0 && firstFeatured);
      });
      html += '</div>';
      wrap.innerHTML = html;
      wrap.querySelectorAll('[data-session-id]').forEach(function (el) {
        el.addEventListener('click', function () {
          var id = el.getAttribute('data-session-id');
          if (id && PP_Live.openSession) PP_Live.openSession(id);
        });
      });
    }
    var cnt = document.getElementById('pp-live-count');
    if (cnt) cnt.textContent = (sessions ? sessions.length : 0) + ' ' +
      (sessions && sessions.length === 1 ? 'sessie' : 'sessies');

    // Nav dot when there are live sessions
    try {
      document.querySelectorAll('[data-pagina="live"]').forEach(function (el) {
        if (sessions && sessions.length > 0) el.setAttribute('data-has-live', '1');
        else el.removeAttribute('data-has-live');
      });
    } catch (_) {}
    PP_Live._sessions = sessions || [];
  }

  function stopGridSubscription() {
    try { if (typeof PP_Live._unsubscribeGrid === 'function') PP_Live._unsubscribeGrid(); } catch (_) {}
    PP_Live._unsubscribeGrid = null;
  }

  function startGridSubscription() {
    stopGridSubscription();
    var f = db();
    if (!f) {
      // Firestore not ready yet — retry shortly
      setTimeout(startGridSubscription, 800);
      return;
    }
    try {
      var q = f.collection('live_sessions')
        .where('status', '==', 'live')
        .orderBy('startedAt', 'desc')
        .limit(50);
      PP_Live._unsubscribeGrid = q.onSnapshot(function (snap) {
        var list = [];
        snap.forEach(function (d) {
          var data = d.data() || {};
          data.id = d.id;
          list.push(data);
        });
        paintGrid(list);
      }, function (err) {
        log('grid subscription error', err && err.message);
        paintGrid([]);
      });
    } catch (e) {
      log('startGridSubscription failed', e);
      paintGrid([]);
    }
  }

  // ───────────── Public actions ─────────────
  function openLive() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('pagina', 'live');
      url.searchParams.delete('id');
      history.pushState(null, '', url.toString());
    } catch (_) {}
    try { if (window.DY) DY.pagina = 'live'; } catch (_) {}
    renderLivePage();
  }

  function openSession(id) {
    if (!id) return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('pagina', 'live_detail');
      url.searchParams.set('id', id);
      history.pushState(null, '', url.toString());
    } catch (_) {}
    try { if (window.DY) DY.pagina = 'live_detail'; } catch (_) {}
    // Player module owns the actual modal open
    if (PP_Live.openPlayer) PP_Live.openPlayer(id);
    // Background: keep showing the live grid behind the modal if it isn't rendered yet
    var main = document.getElementById('dy-main');
    if (main && !main.querySelector('[data-testid="live-page"]')) {
      renderLivePage();
    }
  }

  function openStart() {
    if (PP_Live.openStartSheet) PP_Live.openStartSheet();
  }

  PP_Live.openLive = openLive;
  PP_Live.openSession = openSession;
  PP_Live.openStart = openStart;
  PP_Live.refreshGrid = startGridSubscription;
  PP_Live._renderGrid = renderLivePage;

  // ───────────── Hook DY.navigeer + DY.toonPagina ─────────────
  function wrapNavigeer() {
    if (!window.DY || typeof DY.navigeer !== 'function') {
      setTimeout(wrapNavigeer, 300);
      return;
    }
    if (!DY.navigeer.__ppLiveWrapped) {
      var orig = DY.navigeer.bind(DY);
      var wrapped = function (pagina) {
        if (pagina === 'live') {
          try { stopGridSubscription(); } catch (_) {}
          try { if (DY._history && DY.pagina && DY.pagina !== 'live') DY._history.push(DY.pagina); } catch (_) {}
          DY.pagina = 'live';
          DY._laatstGerenderd = 'live';
          try {
            var url = new URL(window.location.href);
            url.searchParams.set('pagina', 'live');
            url.searchParams.delete('id');
            history.pushState(null, '', url.toString());
          } catch (_) {}
          renderLivePage();
          return;
        }
        if (pagina === 'live_detail') {
          try {
            var u = new URL(window.location.href);
            var sid = u.searchParams.get('id');
            if (sid) {
              openSession(sid);
              return;
            }
          } catch (_) {}
          wrapped('live');
          return;
        }
        if ((DY.pagina === 'live' || DY.pagina === 'live_detail') &&
            pagina !== 'live' && pagina !== 'live_detail') {
          stopGridSubscription();
          if (PP_Live.closePlayer) PP_Live.closePlayer({ skipHistory: true });
        }
        return orig(pagina);
      };
      wrapped.__ppLiveWrapped = true;
      DY.navigeer = wrapped;
    }

    // Ook DY.toonPagina wrappen — legacy boot belt deze direct (bypass van navigeer)
    if (typeof DY.toonPagina === 'function' && !DY.toonPagina.__ppLiveWrapped) {
      var origToon = DY.toonPagina.bind(DY);
      var wrappedToon = function (pagina) {
        if (pagina === 'live') {
          DY.pagina = 'live';
          DY._laatstGerenderd = 'live';
          renderLivePage();
          return;
        }
        if (pagina === 'live_detail') {
          try {
            var u = new URL(window.location.href);
            var sid = u.searchParams.get('id');
            renderLivePage();
            if (sid && PP_Live.openPlayer) {
              setTimeout(function () { PP_Live.openPlayer(sid); }, 60);
            }
          } catch (_) { renderLivePage(); }
          return;
        }
        // Cleanup als we live verlaten
        if ((DY.pagina === 'live' || DY.pagina === 'live_detail') &&
            pagina !== 'live' && pagina !== 'live_detail') {
          stopGridSubscription();
          if (PP_Live.closePlayer) PP_Live.closePlayer({ skipHistory: true });
        }
        return origToon(pagina);
      };
      wrappedToon.__ppLiveWrapped = true;
      DY.toonPagina = wrappedToon;
    }
    log('DY.navigeer + DY.toonPagina wrapped');
  }

  // ───────────── Bootstrap ─────────────
  function urlPaginaIsLive() {
    try {
      // Eerst: pre-boot deeplink uit inline script in index.html
      if (window.__ppLiveDeeplink && window.__ppLiveDeeplink.pagina) return true;
      var u = new URL(window.location.href);
      var p = u.searchParams.get('pagina');
      return p === 'live' || p === 'live_detail';
    } catch (_) { return false; }
  }

  function urlLivePaginaAndId() {
    // Geeft { pagina, id } terug uit pre-boot deeplink of huidige URL
    try {
      if (window.__ppLiveDeeplink && window.__ppLiveDeeplink.pagina) {
        return {
          pagina: window.__ppLiveDeeplink.pagina,
          id: window.__ppLiveDeeplink.id || null
        };
      }
      var u = new URL(window.location.href);
      return {
        pagina: u.searchParams.get('pagina'),
        id: u.searchParams.get('id')
      };
    } catch (_) { return { pagina: null, id: null }; }
  }

  // Retry wrapping a few times in case toonPagina is defined later
  function wrapWithRetry() {
    wrapNavigeer();
    var n = 0;
    var iv = setInterval(function () {
      n++;
      wrapNavigeer();
      if (n > 12) clearInterval(iv);
    }, 400);
  }

  function init() {
    ensureNavButtons();
    wrapWithRetry();

    // Watchdog: als URL ?pagina=live OF ?pagina=live_detail bevat, bewaak dat
    // de live-pagina rendered blijft. Legacy boot kan 'live' niet kennen en
    // valt terug op 'feed'/'home', dus we forceren render én herstellen na
    // overschrijvingen voor de eerste 15 seconden.
    if (urlPaginaIsLive()) {
      var attempts = 0;
      var maxAttempts = 60; // 60 × 250ms = 15s
      var stillNeedsRender = function () {
        var main = document.getElementById('dy-main');
        if (!main) return false;
        return !main.querySelector('[data-testid="live-page"]');
      };
      var forceRender = function () {
        if (!window.DY || !document.getElementById('dy-main')) return;
        try {
          var info = urlLivePaginaAndId();
          var p = info.pagina || 'live';
          try { window.DY.pagina = p; } catch (_) {}
          try { window.DY._laatstGerenderd = p; } catch (_) {}
          // Restore URL (legacy strip-de query weg via replaceState naar '/')
          try {
            var u = new URL(window.location.href);
            if (u.searchParams.get('pagina') !== p) {
              u.searchParams.set('pagina', p);
              if (info.id) u.searchParams.set('id', info.id);
              else u.searchParams.delete('id');
              history.replaceState({ _dy: true, pagina: p }, '', u.toString());
            }
          } catch (_) {}
          renderLivePage();
          if (p === 'live_detail' && info.id && PP_Live.openPlayer) {
            var modal = document.getElementById('pp-live-player');
            if (!modal || !modal.classList.contains('pp-live-open')) {
              setTimeout(function () { PP_Live.openPlayer(info.id); }, 60);
            }
          }
        } catch (e) { log('forceRender failed', e); }
      };
      var iv2 = setInterval(function () {
        attempts++;
        if (stillNeedsRender()) forceRender();
        if (attempts > maxAttempts) clearInterval(iv2);
      }, 250);

      // MutationObserver: als #dy-main verandert en we zitten op live URL,
      // ren-render. We koppelen 'm pas zodra DY ready is.
      var moAttached = false;
      var attachObs = function () {
        if (moAttached) return;
        var main = document.getElementById('dy-main');
        if (!main) { setTimeout(attachObs, 400); return; }
        moAttached = true;
        try {
          var obs = new MutationObserver(function () {
            if (!urlPaginaIsLive()) {
              try { obs.disconnect(); } catch (_) {}
              return;
            }
            if (stillNeedsRender()) {
              // Throttle: alleen 1x per 250ms her-render
              if (window.__ppLiveLastForce && (Date.now() - window.__ppLiveLastForce) < 250) return;
              window.__ppLiveLastForce = Date.now();
              forceRender();
            }
          });
          obs.observe(main, { childList: true, subtree: false });
          // Auto-disconnect na 20s
          setTimeout(function () { try { obs.disconnect(); } catch (_) {} }, 20000);
        } catch (e) { log('observer attach failed', e); }
      };
      attachObs();
    }

    // History (back/forward) handling
    window.addEventListener('popstate', function () {
      try {
        var u = new URL(window.location.href);
        var p = u.searchParams.get('pagina');
        if (p === 'live') {
          if (PP_Live.closePlayer) PP_Live.closePlayer({ skipHistory: true });
          if (window.DY) DY.pagina = 'live';
          renderLivePage();
        } else if (p === 'live_detail') {
          var sid = u.searchParams.get('id');
          if (sid && PP_Live.openPlayer) PP_Live.openPlayer(sid);
        } else {
          if (PP_Live.closePlayer) PP_Live.closePlayer({ skipHistory: true });
          stopGridSubscription();
        }
      } catch (_) {}
    });

    setInterval(syncNavActive, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  log('init', VERSION);
})();
