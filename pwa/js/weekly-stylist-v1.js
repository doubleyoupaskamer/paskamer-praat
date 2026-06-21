// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Weekly Stylist Brief v1
//
// Detecteert wanneer een nieuwe ISO-week is begonnen sinds de gebruiker
// voor het laatst zijn weekbrief zag. Toont dan een non-blocking banner
// "Jouw stylist-brief van deze week" → opent volledig overlay met de
// 3 picks (uit /api/weekly-stylist). Affiliate-tagger v46 voegt
// automatisch tags toe aan de Zalando/Bol-zoeklinks.
//
// Niet-invasief: eigen modal, eigen banner, geen impact op feed/login.
// Cache per week in localStorage zodat de AI-call max 1x per week wordt
// gedaan per browser-profiel.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  /* global firebase */

  if (window.__ppWeeklyStylistInit) return;
  window.__ppWeeklyStylistInit = true;

  var DEFAULT_API_BASE = '';
  var BANNER_ID = 'dy-weekly-banner';
  var MODAL_ID  = 'dy-weekly-modal';
  var STYLE_ID  = 'dy-weekly-style';
  var LS_PREFIX = 'dy_weekly_';
  var SEEN_KEY  = 'dy_weekly_seen';

  function apiBase() {
    if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
      return window.DY.aiHealth.apiBase();
    }
    if (window.DY && typeof window.DY.apiBase === 'string') return window.DY.apiBase;
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('emergentagent.com') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    if (host.indexOf('paskamerpraat.nl') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    return DEFAULT_API_BASE;
  }

  function currentWeek() {
    var d = new Date();
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BANNER_ID + '{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0) + 220px);',
      '  transform:translate(-50%,16px);opacity:0;pointer-events:none;',
      '  background:linear-gradient(135deg,#c89b3c,#a47c28);color:#1e1a0f;',
      '  padding:12px 16px 12px 14px;border-radius:14px;',
      '  font:700 13px "DM Sans",system-ui,sans-serif;z-index:2147483639;',
      '  box-shadow:0 12px 32px rgba(168,124,40,.42);',
      '  display:flex;align-items:center;gap:12px;max-width:92vw;cursor:pointer;',
      '  transition:opacity .3s,transform .3s cubic-bezier(.23,1,.32,1)}',
      '#' + BANNER_ID + '.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
      '#' + BANNER_ID + ' .ico{width:36px;height:36px;border-radius:10px;background:#1e1a0f;color:#c89b3c;',
      '  display:grid;place-items:center;font:700 18px serif;flex:none}',
      '#' + BANNER_ID + ' .txt small{display:block;font-weight:500;font-size:11px;opacity:.78;margin-top:1px}',
      '#' + BANNER_ID + ' .x{background:transparent;border:0;font:400 18px serif;color:#1e1a0f;cursor:pointer;opacity:.55;padding:4px 6px}',
      '#' + BANNER_ID + ' .x:hover{opacity:1}',
      '#' + MODAL_ID + '{position:fixed;inset:0;background:rgba(20,17,8,.78);backdrop-filter:blur(8px);',
      '  -webkit-backdrop-filter:blur(8px);z-index:2147483641;display:none;opacity:0;',
      '  transition:opacity .25s}',
      '#' + MODAL_ID + '.show{display:flex;opacity:1}',
      '#' + MODAL_ID + ' .frame{margin:auto;background:#fefcf5;color:#1e1a0f;',
      '  width:min(580px,94vw);max-height:92vh;border-radius:22px;overflow:hidden;',
      '  display:flex;flex-direction:column;box-shadow:0 24px 56px rgba(0,0,0,.45)}',
      '#' + MODAL_ID + ' header{padding:18px 22px 8px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}',
      '#' + MODAL_ID + ' header .t{margin:0;font:700 18px "DM Sans";letter-spacing:-.01em}',
      '#' + MODAL_ID + ' header .s{display:block;color:#7a6a3f;font-size:12px;margin-top:2px;text-transform:uppercase;letter-spacing:.08em}',
      '#' + MODAL_ID + ' .close{background:transparent;border:0;font:400 24px serif;color:#1e1a0f;cursor:pointer;width:34px;height:34px;border-radius:10px}',
      '#' + MODAL_ID + ' .close:hover{background:rgba(30,26,15,.08)}',
      '#' + MODAL_ID + ' .intro{padding:0 22px 14px;font:400 14px/1.55 "DM Sans";color:#3b3624}',
      '#' + MODAL_ID + ' main{padding:0 22px 22px;overflow-y:auto;flex:1}',
      '#' + MODAL_ID + ' .pick{padding:14px 0;border-top:1px solid rgba(30,26,15,.08)}',
      '#' + MODAL_ID + ' .pick:first-child{border-top:0}',
      '#' + MODAL_ID + ' .pick h3{margin:0 0 6px;font:700 15px "DM Sans"}',
      '#' + MODAL_ID + ' .pick p{margin:0;font:400 13px/1.5 "DM Sans";color:#3b3624}',
      '#' + MODAL_ID + ' .pick ul{margin:8px 0 0;padding-left:20px;font-size:12.5px;color:#5b4d28;list-style:disc}',
      '#' + MODAL_ID + ' .pick ul li{margin:3px 0}',
      '#' + MODAL_ID + ' .pick .reason{margin-top:8px;font-size:11.5px;color:#7a6a3f;font-style:italic}',
      '#' + MODAL_ID + ' .pick .shop{display:inline-flex;align-items:center;gap:6px;margin-top:10px;',
      '  background:#1e1a0f;color:#fefcf5;padding:9px 14px;border-radius:999px;',
      '  font:700 12px "DM Sans";text-decoration:none;transition:background .2s}',
      '#' + MODAL_ID + ' .pick .shop:hover{background:#2a2515}',
      '#' + MODAL_ID + ' .loading,.error{padding:60px 22px;text-align:center;color:#7a6a3f}',
      '#' + MODAL_ID + ' .loading .spin{width:42px;height:42px;border:3px solid #e8dcb3;border-top-color:#c89b3c;',
      '  border-radius:50%;animation:dyWSpin 1s linear infinite;margin:0 auto 14px}',
      '@keyframes dyWSpin{to{transform:rotate(360deg)}}',
      '@media (max-width:480px){#' + MODAL_ID + ' .frame{width:100vw;max-height:100vh;border-radius:0;height:100vh}}',
      '@media (prefers-reduced-motion: reduce){',
      '  #' + BANNER_ID + ',#' + MODAL_ID + '{transition:none}#' + MODAL_ID + ' .spin{animation:none}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function getUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (e) { return null; } }
  function logEvent(name, extra) {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      firebase.firestore().collection('kai_events').add(Object.assign({
        eventType: name,
        userId: getUid() || 'anon',
        ts: firebase.firestore.FieldValue.serverTimestamp()
      }, extra || {})).catch(function() { /* noop */ });
    } catch (e) { /* noop */ }
  }

  function loadCached(week) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + week);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveCached(week, data) {
    try { localStorage.setItem(LS_PREFIX + week, JSON.stringify(data)); } catch (e) { /* noop */ }
  }

  function markSeen(week) {
    try { localStorage.setItem(SEEN_KEY, week); } catch (e) { /* noop */ }
  }
  function isSeenThisWeek(week) {
    try { return localStorage.getItem(SEEN_KEY) === week; } catch (e) { return false; }
  }

  // ── Banner ──
  function showBanner(week) {
    injectStyles();
    var existing = document.getElementById(BANNER_ID);
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = BANNER_ID;
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="ico">★</div>' +
      '<div class="txt">Jouw stylist-brief is er<small>3 picks voor deze week</small></div>' +
      '<button type="button" class="x" aria-label="Sluit">×</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });
    el.addEventListener('click', function(ev) {
      if (ev.target.classList.contains('x')) { hideBanner(); markSeen(week); return; }
      openModal(week);
    });
    // Auto-hide na 14s
    setTimeout(hideBanner, 14000);
    logEvent('weekly_banner_shown', { week: week });
  }

  function hideBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el) el.classList.remove('show');
  }

  // ── Modal ──
  function buildModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;
    injectStyles();
    var m = document.createElement('div');
    m.id = MODAL_ID;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML =
      '<div class="frame">' +
        '<header>' +
          '<div><div class="t">Deze week voor jou</div><span class="s" data-week></span></div>' +
          '<button type="button" class="close" data-close>×</button>' +
        '</header>' +
        '<div class="intro" data-intro></div>' +
        '<main data-body><div class="loading"><div class="spin"></div>Stylist analyseert jouw smaak…</div></main>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function(e) { if (e.target === m) closeModal(); });
    m.querySelector('[data-close]').addEventListener('click', closeModal);
    return m;
  }

  async function openModal(week) {
    var m = buildModal();
    m.querySelector('[data-week]').textContent = week;
    requestAnimationFrame(function() { m.classList.add('show'); });
    hideBanner();
    markSeen(week);
    var cached = loadCached(week);
    if (cached) return renderPicks(cached);
    try {
      var data = await fetchWeekly(week);
      saveCached(week, data);
      renderPicks(data);
      logEvent('weekly_picks_loaded', { week: week, picks: (data.picks || []).length });
    } catch (e) {
      m.querySelector('[data-body]').innerHTML =
        '<div class="error" style="padding:40px 22px;text-align:center;color:#7a6a3f">' +
        '<div style="font-size:42px;margin-bottom:14px;line-height:1">💫</div>' +
        '<strong style="display:block;font:600 15px DM Sans;color:#1e1a0f;margin-bottom:6px">AI-stylist even offline</strong>' +
        '<div style="font-size:13px;line-height:1.5;margin-bottom:18px">Onze styliste is even bezig. Probeer over een paar minuten opnieuw.</div>' +
        '<button type="button" class="shop" data-retry style="background:#c89b3c;color:#1e1a0f;border:0">Opnieuw proberen</button></div>';
      m.querySelector('[data-retry]').addEventListener('click', function() { openModal(week); });
      logEvent('weekly_picks_error', { msg: (e.message || '').slice(0, 120) });
    }
  }

  function closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.classList.remove('show');
  }

  function renderPicks(data) {
    var m = document.getElementById(MODAL_ID);
    m.querySelector('[data-intro]').textContent = data.intro || '';
    var body = m.querySelector('[data-body]');
    var picks = data.picks || [];
    if (!picks.length) { body.innerHTML = '<div class="error">Geen picks gevonden.</div>'; return; }
    body.innerHTML = picks.map(function(p) {
      var query = encodeURIComponent(p.affiliate_query || p.title);
      var zalandoUrl = 'https://www.zalando.nl/catalog/?q=' + query;
      var itemsHtml = (p.items || []).map(function(i) { return '<li>' + escapeHtml(i) + '</li>'; }).join('');
      return '<article class="pick">' +
        '<h3>' + escapeHtml(p.title) + '</h3>' +
        '<p>' + escapeHtml(p.description) + '</p>' +
        (itemsHtml ? '<ul>' + itemsHtml + '</ul>' : '') +
        '<div class="reason">' + escapeHtml(p.reason) + '</div>' +
        '<a class="shop" href="' + zalandoUrl + '" target="_blank" rel="noopener">Shop deze look →</a>' +
        '</article>';
    }).join('');
    // Affiliate-tagger v46 pakt deze automatisch op (delegated rescan)
    try { if (window.DY && DY.affiliate) DY.affiliate.rescan(); } catch (e) { /* noop */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  async function fetchWeekly(week) {
    var ctx = buildUserContext();
    var res = await fetch(apiBase() + '/api/weekly-stylist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: getUid(), user_context: ctx, week: week })
    });
    if (!res.ok) {
      var t = await res.text();
      throw new Error('weekly ' + res.status + ': ' + t.slice(0, 100));
    }
    return res.json();
  }

  function buildUserContext() {
    var parts = [];
    try {
      if (window.DY && DY.userProfile) {
        var p = DY.userProfile;
        if (p.lengte) parts.push('lengte: ' + p.lengte);
        if (p.bouw)   parts.push('bouw: ' + p.bouw);
        if (p.stijl)  parts.push('voorkeur: ' + p.stijl);
      }
    } catch (e) { /* noop */ }
    return parts.join(', ') || 'Geen profiel ingesteld';
  }

  // ── Auth + Outfit-data Guard (v1.1, 2026-02-19) ─────────────────
  // Stijlbrief mag ALLEEN beschikbaar zijn voor:
  //   1. ingelogde gebruikers (DY.user.uid bestaat)
  //   2. gebruikers met voldoende opgeslagen outfit-data (>= MIN_LOOKS)
  // Niet-ingelogde bezoekers krijgen NOOIT de "stijlbrief is er" popup.
  var MIN_LOOKS = 3;
  function isAuthed() {
    try {
      if (window.DY && DY.user && DY.user.uid) return true;
      if (typeof firebase !== 'undefined' && firebase.auth &&
          firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) return true;
    } catch (e) {}
    return false;
  }
  function hasEnoughOutfits(uid) {
    return new Promise(function(resolve) {
      if (!uid) return resolve(false);
      try {
        if (typeof firebase === 'undefined' || !firebase.firestore) return resolve(false);
        // Combineer twee bronnen: 'looks' en 'lookbook' (beide kunnen voorkomen)
        var fs = firebase.firestore();
        var p1 = fs.collection('looks').where('userId', '==', uid).limit(MIN_LOOKS).get()
          .then(function(s){ return s.size; }).catch(function(){ return 0; });
        var p2 = fs.collection('lookbook').where('userId', '==', uid).limit(MIN_LOOKS).get()
          .then(function(s){ return s.size; }).catch(function(){ return 0; });
        Promise.all([p1, p2]).then(function(counts){
          var total = (counts[0] || 0) + (counts[1] || 0);
          resolve(total >= MIN_LOOKS);
        }).catch(function(){ resolve(false); });
      } catch (e) { resolve(false); }
    });
  }
  function passesGuards() {
    return new Promise(function(resolve) {
      if (!isAuthed()) {
        logEvent('weekly_skipped_not_authed', {});
        return resolve(false);
      }
      var uid = getUid();
      hasEnoughOutfits(uid).then(function(enough) {
        if (!enough) logEvent('weekly_skipped_insufficient_outfits', { uid: uid });
        resolve(enough);
      });
    });
  }
  function clearStaleCache() {
    // Verwijder banner + modal uit DOM (na logout/account-switch)
    try {
      var b = document.getElementById(BANNER_ID); if (b) b.remove();
      var m = document.getElementById(MODAL_ID);  if (m) m.remove();
    } catch (e) {}
  }
  // Reset cache + DOM bij auth-state change (logout, account switch)
  try {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(function(user) {
        if (!user || user.isAnonymous) {
          clearStaleCache();
          // Wis SEEN-marker zodat na re-login opnieuw guards draaien
          try { localStorage.removeItem(SEEN_KEY); } catch (e) {}
        }
      });
    }
  } catch (e) {}

  // ── Init ──
  function init() {
    var week = currentWeek();
    if (isSeenThisWeek(week)) return; // al gezien deze week
    // Wacht op health-check + 4 seconden - niet direct bij page-load (laat feed eerst laden)
    function maybeShow() {
      var p = (window.DY && window.DY.aiHealth && window.DY.aiHealth.isHealthy)
        ? window.DY.aiHealth.isHealthy()
        : Promise.resolve(true);
      Promise.resolve(p).then(function(ok) {
        if (!ok) { logEvent('weekly_skipped_backend_offline', { week: week }); return; }
        // v1.1 GUARD: alleen tonen voor ingelogde users met >= 3 opgeslagen outfits
        passesGuards().then(function(allowed) {
          if (!allowed) return;
          showBanner(week);
        });
      });
    }
    // Geef auth-state tijd om te initialiseren (Firebase persist + token refresh)
    setTimeout(maybeShow, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API - voor handmatige trigger uit hub-menu
  window.DY = window.DY || {};
  window.DY.weeklyStylist = {
    open:  function() {
      // v1.1 GUARD: ook handmatige triggers respecteren auth + outfit-data
      passesGuards().then(function(allowed) {
        if (!allowed) {
          try { console.warn('[weekly-stylist] open() geblokkeerd: guards niet pass'); } catch (e) {}
          return;
        }
        openModal(currentWeek());
      });
    },
    close: closeModal,
    week:  currentWeek,
    clear: function() {
      try {
        Object.keys(localStorage).forEach(function(k) {
          if (k.indexOf(LS_PREFIX) === 0) localStorage.removeItem(k);
        });
        localStorage.removeItem(SEEN_KEY);
      } catch (e) { /* noop */ }
    }
  };
})();
