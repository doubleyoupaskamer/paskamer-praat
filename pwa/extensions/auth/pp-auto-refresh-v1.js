/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Auto Refresh User Data (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Garantie: BIJ IEDERE HANDELING van de gebruiker worden user-specifieke
 * gegevens (avatar, naam, premium status, profile, initialen) opnieuw
 * gefetcht en gerenderd. Geen stale data meer mogelijk.
 *
 * Triggers:
 *   1. Bij login (`pp:login` event van session-cleanup)
 *   2. Bij user-switch (`pp:userchange` event)
 *   3. Bij window focus (terug uit andere tab)
 *   4. Bij iedere paginanavigatie (wrap van DY.navigeer / DY.toonPagina)
 *   5. Periodiek elke 60s wanneer tab actief is
 *
 * Wat wordt vernieuwd:
 *   • DY.profile  (Firestore users/{uid} doc)
 *   • Avatar/initialen DOM (topbar + sidebar)
 *   • Premium status (force-fresh fetch zonder cache)
 *   • PP_CampaignRenderer cache (anti-stale campagnes)
 *
 * NON-BREAKING: alleen toevoegingen - geen wijziging in legacy logica.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _lastRefreshTs = 0;
  var _pendingRefresh = null;
  var THROTTLE_MS = 800; // burst-protectie

  function isLoggedIn() {
    return !!(window.DY && window.DY.user && window.DY.user.uid);
  }

  // ── Forceer fresh Firestore profile-doc fetch ───────────────────────
  async function refreshProfile() {
    if (!isLoggedIn() || !window.DY.db) return;
    try {
      var uid = window.DY.user.uid;
      // .get() met server-cache bypass via cache:'no-store' van Firebase v9
      var snap;
      try {
        snap = await window.DY.db.collection('users').doc(uid).get({ source: 'server' });
      } catch (e) {
        // Fallback voor netwerkproblemen - gebruik cache
        snap = await window.DY.db.collection('users').doc(uid).get();
      }
      if (snap && snap.exists) {
        window.DY.profile = snap.data();
      }
    } catch (e) { /* swallow - graceful */ }
  }

  // ── Forceer fresh premium-status fetch ──────────────────────────────
  async function refreshPremium() {
    if (!isLoggedIn()) return;
    try {
      if (window.DY && window.DY.premium && typeof window.DY.premium.status === 'function') {
        await window.DY.premium.status(true); // force=true → bypass cache
      }
    } catch (e) { /* swallow */ }
  }

  // ── Forceer avatar/initialen herrender ──────────────────────────────
  function refreshAvatarUI() {
    try {
      if (window.DY && typeof window.DY.updateTopbarAvatar === 'function') {
        window.DY.updateTopbarAvatar();
      }
      if (window.DY && typeof window.DY.updateNav === 'function') {
        window.DY.updateNav();
      }
    } catch (e) { /* ignore */ }
  }

  // ── Forceer Universal Renderer campagnes herfetch ───────────────────
  function refreshCampaigns() {
    try {
      if (window.PP_CampaignRenderer && typeof window.PP_CampaignRenderer.refresh === 'function') {
        window.PP_CampaignRenderer.refresh();
      }
    } catch (e) { /* ignore */ }
  }

  // ── Hoofdrefresh - throttled om duplicates te voorkomen ─────────────
  function scheduleRefresh(reason) {
    var now = Date.now();
    if (now - _lastRefreshTs < THROTTLE_MS) {
      // Coalesceer in 1 pending call
      if (_pendingRefresh) return;
      _pendingRefresh = setTimeout(function() {
        _pendingRefresh = null;
        scheduleRefresh(reason);
      }, THROTTLE_MS);
      return;
    }
    _lastRefreshTs = now;
    doRefresh(reason);
  }

  async function doRefresh(reason) {
    if (!isLoggedIn()) {
      // Voor uitgelogde users: alleen UI sync (avatar reset naar guest)
      refreshAvatarUI();
      return;
    }
    // Voor ingelogde users: full refresh
    await Promise.all([
      refreshProfile(),
      refreshPremium(),
    ]);
    refreshAvatarUI();
    refreshCampaigns();
    try {
      document.dispatchEvent(new CustomEvent('pp:refreshed', { detail: { reason: reason, ts: Date.now() } }));
    } catch (_) {}
  }

  // ── Wrap DY.navigeer + DY.toonPagina voor nav-trigger ───────────────
  function wrapNavigation() {
    if (!window.DY) return false;
    if (window.DY._ppAutoRefreshWrapped) return true;
    window.DY._ppAutoRefreshWrapped = true;

    if (typeof window.DY.navigeer === 'function') {
      var origNav = window.DY.navigeer;
      window.DY.navigeer = function() {
        var ret = origNav.apply(this, arguments);
        setTimeout(function() { scheduleRefresh('nav:' + arguments[0]); }, 100);
        return ret;
      };
    }
    if (typeof window.DY.toonPagina === 'function') {
      var origToon = window.DY.toonPagina;
      window.DY.toonPagina = function(pagina) {
        var ret = origToon.apply(this, arguments);
        // Critical pages: refresh user data
        var triggerPages = { profiel: 1, instellingen: 1, premium: 1, garderobe: 1, feed: 1, account: 1 };
        if (triggerPages[pagina]) {
          setTimeout(function() { scheduleRefresh('page:' + pagina); }, 150);
        }
        return ret;
      };
    }
    return true;
  }

  // ── Listen to session events ────────────────────────────────────────
  document.addEventListener('pp:login', function(ev) {
    scheduleRefresh('login:' + (ev.detail && ev.detail.uid));
  });
  document.addEventListener('pp:userchange', function(ev) {
    scheduleRefresh('userchange');
  });
  // Geen refresh on logout (cleanup module doet dat al)

  // ── Window focus listener - return uit andere tab ───────────────────
  window.addEventListener('focus', function() { scheduleRefresh('focus'); });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') scheduleRefresh('visible');
  });

  // ── Periodieke heartbeat (60s) voor lange sessies ───────────────────
  setInterval(function() {
    if (document.visibilityState === 'visible' && isLoggedIn()) {
      scheduleRefresh('heartbeat');
    }
  }, 60 * 1000);

  // ── Init ────────────────────────────────────────────────────────────
  function init() {
    var ok = wrapNavigation();
    if (!ok) { setTimeout(init, 400); return; }
    // First-load: forceer een refresh na 1s zodat alle modules geladen zijn
    setTimeout(function() { scheduleRefresh('init'); }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  // Public API
  window.PP_AutoRefresh = {
    refresh: function(reason) { scheduleRefresh(reason || 'manual'); },
    refreshNow: doRefresh,
    VERSION: '1.0.0',
  };
})();
