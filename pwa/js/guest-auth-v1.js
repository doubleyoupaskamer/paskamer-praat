// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Guest Anonymous Auth v1 (v53)
//
// Doel: gasten (niet-ingelogde gebruikers) automatisch laten authenticeren
// via Firebase Anonymous Authentication, zodat:
//   - de Firestore rules `request.auth != null` checks blijven werken
//   - AI Fit Chat / app_config/ai leesbaar wordt voor gasten
//   - uid persistent blijft over refresh/reconnect via Firebase Auth IndexedDB
//   - Premium tier consistent user_key kan binden (zie premium-v1.js)
//   - geen login-prompt nodig is, geen UX-verandering
//
// Non-invasief: laadt VÓÓR ai-fit-chat-v3 en zet alleen
// firebase.auth().signInAnonymously() in gang als er nog geen currentUser is.
// Bij faal: silent fallback — bestaande error-flow van ai-fit-chat blijft werken.
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__ppGuestAuthInit) return;
  window.__ppGuestAuthInit = true;

  var MAX_RETRIES = 2;
  var RETRY_DELAY = 1500;
  var STATE_FLAG = '__ppGuestAuthState';

  function logEvent(name, data) {
    try { if (window.DY && typeof window.DY.trackPWAEvent === 'function') window.DY.trackPWAEvent(name, data || {}); } catch (e) {}
  }

  function ensurePersistence(fbAuth) {
    // LOCAL persistence is default in v9-compat; v8 namespace ook. Forceer expliciet
    // zodat een private/incognito sessie consistent gedrag krijgt.
    try {
      if (fbAuth.setPersistence && window.firebase && window.firebase.auth && window.firebase.auth.Auth && window.firebase.auth.Auth.Persistence) {
        return fbAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(function () {
          // private mode kan LOCAL blokkeren — val terug op SESSION
          return fbAuth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION).catch(function () {});
        });
      }
    } catch (e) {}
    return Promise.resolve();
  }

  async function signInAnon(fbAuth, attempt) {
    attempt = attempt || 0;
    try {
      await ensurePersistence(fbAuth);
      var res = await fbAuth.signInAnonymously();
      var uid = (res && res.user && res.user.uid) || (fbAuth.currentUser && fbAuth.currentUser.uid);
      window[STATE_FLAG] = { ok: true, uid: uid, anonymous: true, attempts: attempt + 1 };
      logEvent('guest_auth_anonymous_success', { uid: uid, attempt: attempt + 1 });
      // Stuur custom event uit zodat andere scripts (AI Chat, Premium) kunnen reageren
      try { window.dispatchEvent(new CustomEvent('dy-guest-auth-ready', { detail: { uid: uid, anonymous: true } })); } catch (e) {}
      return uid;
    } catch (err) {
      var code = (err && err.code) || 'unknown';
      // operation-not-allowed: anonymous auth niet aangezet in Firebase Console
      // → harde fout, niet retrien
      if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        window[STATE_FLAG] = { ok: false, error: code, attempts: attempt + 1, hard: true };
        logEvent('guest_auth_anonymous_blocked', { code: code });
        return null;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(function (r) { setTimeout(r, RETRY_DELAY * (attempt + 1)); });
        return signInAnon(fbAuth, attempt + 1);
      }
      window[STATE_FLAG] = { ok: false, error: code, attempts: attempt + 1 };
      logEvent('guest_auth_anonymous_failed', { code: code, attempts: attempt + 1 });
      return null;
    }
  }

  function waitForFirebase(timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    return new Promise(function (resolve) {
      var start = Date.now();
      var iv = setInterval(function () {
        if (window.firebase && window.firebase.auth) {
          clearInterval(iv);
          resolve(window.firebase.auth());
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          resolve(null);
        }
      }, 120);
    });
  }

  async function init() {
    var fbAuth = await waitForFirebase();
    if (!fbAuth) {
      window[STATE_FLAG] = { ok: false, error: 'firebase_not_loaded', attempts: 0 };
      return;
    }

    // Reconnect/refresh: als al ingelogd (echte user of bestaande anon), niets doen
    if (fbAuth.currentUser) {
      var u = fbAuth.currentUser;
      window[STATE_FLAG] = { ok: true, uid: u.uid, anonymous: !!u.isAnonymous, attempts: 0, restored: true };
      try { window.dispatchEvent(new CustomEvent('dy-guest-auth-ready', { detail: { uid: u.uid, anonymous: !!u.isAnonymous, restored: true } })); } catch (e) {}
      return;
    }

    // Wacht 1 onAuthStateChanged tick — kan zijn dat persistente sessie nog laadt
    var restored = await new Promise(function (resolve) {
      var to = setTimeout(function () { resolve(null); }, 1200);
      var unsub = fbAuth.onAuthStateChanged(function (user) {
        clearTimeout(to);
        unsub && unsub();
        resolve(user);
      });
    });

    if (restored) {
      window[STATE_FLAG] = { ok: true, uid: restored.uid, anonymous: !!restored.isAnonymous, restored: true };
      try { window.dispatchEvent(new CustomEvent('dy-guest-auth-ready', { detail: { uid: restored.uid, anonymous: !!restored.isAnonymous, restored: true } })); } catch (e) {}
      return;
    }

    // Geen sessie → log gast in
    await signInAnon(fbAuth, 0);
  }

  // Public API voor debug / tests
  window.DY = window.DY || {};
  window.DY.guestAuth = {
    state: function () { return window[STATE_FLAG] || { ok: false, error: 'not_initialized' }; },
    isAnonymous: function () {
      try {
        var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
        return !!(u && u.isAnonymous);
      } catch (e) { return false; }
    },
    reauthIfMissing: async function () {
      try {
        var a = window.firebase && window.firebase.auth && window.firebase.auth();
        if (!a) return null;
        if (a.currentUser) return a.currentUser.uid;
        return await signInAnon(a, 0);
      } catch (e) { return null; }
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
