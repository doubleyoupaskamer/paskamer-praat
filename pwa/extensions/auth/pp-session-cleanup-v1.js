/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Session Cleanup & Cache Isolation (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Lost een kritiek lek op: na uitloggen bleven user-specifieke caches
 * (premium status, avatar, outfit scores, admin secret, etc.) zichtbaar.
 *
 * Werkwijze (additief, niet-invasief):
 *   1. Wrapt DY.uitloggen() - wist alle user-specifieke storage keys.
 *   2. Luistert op firebase.auth().onAuthStateChanged voor user-switch.
 *      Bij UID-change: forceer cache-purge + reload van premium status.
 *   3. Stuurt CustomEvents `pp:logout` en `pp:userchange` zodat extensies
 *      hun eigen state kunnen resetten.
 *   4. Vernieuwt avatar/topbar/UI direct na logout.
 *
 * GEEN refactor - legacy DY.uitloggen blijft draaien. Wij voegen alleen
 * extra purge-logica toe NA de bestaande cleanup.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // ── Keys die NOOIT worden gewist (publieke app-config) ──────────────
  var KEEP_KEYS = [
    'dy_app_version',
    'dy_install_v',
    'dy_pwa_geinstalleerd',
    'dy_item_poll_id',           // guest poll continuiteit
    'dy_item_poll_stem',         // poll stem bewaard
    'dy_consent',
    'dy_theme',
    'dy_locale',
  ];

  // ── Keys / prefixes die ALTIJD worden gewist bij logout ─────────────
  var USER_KEYS_EXACT = [
    'dy_premium_cache',
    'dy_premium_email',
    'dy_premium_userkey',
    'dy_premium_pending',
    'dy_saved_looks',
    'dy_bookmark_queue',
    'dy_admin_secret',
    'dy_laatste_bezoek',
    'dy_first_session_done',
    'dy_ticket_counter',
    'dy_overlay_dismissed_until',
    'dy_brand_portal_state',
    'dy_brand_portal_last',
    'dy_brand_portal_cache',
    'dy_wallet_cache',
    'dy_wallet_balance',
    'dy_user_profile',
    'dy_user_settings',
    'dy_user_preferences',
    'dy_garderobe_cache',
    'dy_notif_cache',
    'dy_ai_chat_session',
  ];
  var USER_KEY_PREFIXES = [
    'dy_outfit_score_',       // AI scores per outfit
    'dy_activiteit_maand_',   // activiteit-tracker per user/maand
    'dy_brand_portal',        // alle brand-portal lokale state
    'dy_premium_',             // alle premium-gerelateerde keys
    'dy_wallet_',              // wallet caches
    'dy_user_',                // user-specifieke prefs
    'dy_garderobe_',           // garderobe data
    'dy_ai_',                  // AI sessions / chat
    'dy_review_draft_',        // concept reviews
    'dy_outfit_draft_',
  ];
  var SESSION_KEYS_EXACT = [
    '_dy_actieve_pagina',
    'dy_overlay_gezien',
    'dy_safety_shown',
    'dy_route_freeze',
  ];

  // ── Cache wipe ──────────────────────────────────────────────────────
  function wipeLocalStorage() {
    var removed = [];
    try {
      // Exact keys
      USER_KEYS_EXACT.forEach(function(k) {
        if (localStorage.getItem(k) !== null) {
          localStorage.removeItem(k);
          removed.push(k);
        }
      });
      // Prefix-based scan (cover dynamische keys zoals dy_outfit_score_<id>)
      var toDelete = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key) continue;
        if (KEEP_KEYS.indexOf(key) >= 0) continue;
        var match = USER_KEY_PREFIXES.some(function(p) { return key.indexOf(p) === 0; });
        if (match) toDelete.push(key);
      }
      toDelete.forEach(function(k) { localStorage.removeItem(k); removed.push(k); });
    } catch (e) { /* ignore quota / disabled storage */ }
    return removed;
  }

  function wipeSessionStorage() {
    var removed = [];
    try {
      SESSION_KEYS_EXACT.forEach(function(k) {
        if (sessionStorage.getItem(k) !== null) {
          sessionStorage.removeItem(k);
          removed.push(k);
        }
      });
    } catch (e) { /* ignore */ }
    return removed;
  }

  // ── In-memory cleanup van extensies ─────────────────────────────────
  function wipeExtensionState() {
    try {
      // Universal Campaign Renderer - stop onSnapshot listener
      if (window.PP_CampaignRenderer && typeof window.PP_CampaignRenderer._unsubscribe === 'function') {
        try { window.PP_CampaignRenderer._unsubscribe(); } catch(_) {}
      }
      // Feed tabs - reset Uitgelicht-state, herstel feed
      if (window.PP_FeedTabs && typeof window.PP_FeedTabs.refresh === 'function') {
        var grid = document.getElementById('pp-uitgelicht-grid');
        if (grid && grid.parentNode) grid.parentNode.removeChild(grid);
        var verhalen = document.getElementById('dy-verhalen');
        if (verhalen) verhalen.style.display = '';
      }
      // Wallet UI cache
      if (window.PP_Wallet && window.PP_Wallet._state) {
        window.PP_Wallet._state = {};
      }
      // Admin premium state (admin-only, maar veilig)
      if (window.PP_AdminPremium) {
        window.PP_AdminPremium._state = { tab: 'status' };
      }
    } catch (e) { /* ignore */ }
  }

  // ── Avatar / topbar refresh ─────────────────────────────────────────
  function refreshTopbar() {
    try {
      if (window.DY && typeof window.DY.updateTopbarAvatar === 'function') {
        window.DY.updateTopbarAvatar();
      }
      if (window.DY && typeof window.DY.updateNav === 'function') {
        window.DY.updateNav();
      }
      // Wis evt. avatar-img cached in topbar
      var av = document.querySelector('.dy-topbar-avatar img, [data-testid="topbar-avatar"] img');
      if (av && (!window.DY || !window.DY.user)) {
        av.removeAttribute('src');
        av.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  }

  // ── Wrap DY.uitloggen - extra cleanup NA legacy logout ──────────────
  function wrapLogout() {
    if (!window.DY || typeof window.DY.uitloggen !== 'function') return false;
    if (window.DY._ppSessionWrapped) return true;
    var orig = window.DY.uitloggen;
    window.DY._ppSessionWrapped = true;
    window.DY.uitloggen = async function() {
      var lastUid = (window.DY && window.DY.user && window.DY.user.uid) || null;
      try { await orig.apply(this, arguments); }
      catch (e) { console.warn('[pp-session] legacy uitloggen error:', e); }
      // Extra purge (idempotent - legacy heeft al deel gedaan)
      try {
        var lsRemoved = wipeLocalStorage();
        var ssRemoved = wipeSessionStorage();
        wipeExtensionState();
        refreshTopbar();
        console.info('[pp-session] logout purge complete', { ls: lsRemoved.length, ss: ssRemoved.length });
      } catch (e) { console.warn('[pp-session] purge error:', e); }
      // Fire event voor andere modules
      try {
        document.dispatchEvent(new CustomEvent('pp:logout', { detail: { prevUid: lastUid } }));
      } catch(_) {}
    };
    return true;
  }

  // ── User-switch detectie via Firebase onAuthStateChanged ────────────
  var _lastUid = null;
  function watchAuthChanges() {
    if (window._ppSessionAuthWatching) return;
    if (!window.firebase || !firebase.auth) return;
    window._ppSessionAuthWatching = true;
    try {
      firebase.auth().onAuthStateChanged(function(user) {
        var uid = user && user.uid;
        if (uid === _lastUid) return;
        var prevUid = _lastUid;
        _lastUid = uid;
        if (!uid) {
          // Logout-pad - al afgehandeld door wrapLogout, maar safety net:
          try { document.dispatchEvent(new CustomEvent('pp:logout', { detail: { prevUid: prevUid } })); } catch(_) {}
          return;
        }
        if (prevUid && prevUid !== uid) {
          // USER-SWITCH gedetecteerd → purge oude data
          console.info('[pp-session] user-switch detected:', prevUid, '→', uid);
          wipeLocalStorage();
          wipeSessionStorage();
          wipeExtensionState();
          refreshTopbar();
          try { document.dispatchEvent(new CustomEvent('pp:userchange', { detail: { prevUid: prevUid, uid: uid } })); } catch(_) {}
          // Force premium status refetch
          try { if (window.DY && DY.premium && DY.premium.status) DY.premium.status(true); } catch(_) {}
        } else {
          // Eerste login of refresh - vuur login event
          try { document.dispatchEvent(new CustomEvent('pp:login', { detail: { uid: uid } })); } catch(_) {}
        }
      });
    } catch (e) { console.warn('[pp-session] auth-watch setup faalde:', e); }
  }

  // ── Tab-sync via storage event (logout in tab A → andere tabs reagen) ─
  function watchTabSync() {
    window.addEventListener('storage', function(ev) {
      if (!ev.key) return;
      // Firebase auth gebruikt 'firebase:authUser:*' - bij verwijdering = logout
      if (ev.key.indexOf('firebase:authUser:') === 0 && ev.newValue == null) {
        console.info('[pp-session] cross-tab logout detected, purging this tab');
        try {
          wipeLocalStorage();
          wipeSessionStorage();
          wipeExtensionState();
          refreshTopbar();
          // Forceer reload zodat private routes ge-purged worden
          if (window.DY && DY.user) {
            window.DY.user = null;
            if (DY.toonPagina) DY.toonPagina('login');
          }
        } catch (e) { /* ignore */ }
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────
  function init() {
    var ok = wrapLogout();
    if (!ok) setTimeout(init, 400);
    watchAuthChanges();
    setTimeout(watchAuthChanges, 1000);
    watchTabSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  // Public API voor handmatige cleanup (debug / extensies)
  window.PP_Session = {
    purgeAll: function() {
      var ls = wipeLocalStorage();
      var ss = wipeSessionStorage();
      wipeExtensionState();
      refreshTopbar();
      return { ls: ls, ss: ss };
    },
    KEEP_KEYS: KEEP_KEYS,
    USER_KEY_PREFIXES: USER_KEY_PREFIXES,
    VERSION: '1.0.0',
  };
})();
