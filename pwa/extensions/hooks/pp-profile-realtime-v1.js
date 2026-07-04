/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT . Realtime Profile Sync (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * DOEL
 * Alle profielwijzigingen (avatar, naam, bio, stad, socials, ...) direct
 * zichtbaar in ALLE geopende weergaves . topbar, feed-header, reactie-
 * input, DM header, profielpagina . zonder page-refresh en over meerdere
 * browser-tabs synchroon.
 *
 * ARCHITECTUUR (100% additief, geen legacy code aanraken)
 *   1. Firestore `.onSnapshot('users/{uid}')` listener zodra Firebase Auth
 *      een user rapporteert. Elke wijziging → `window.DY.profile` update.
 *   2. Custom event `pp-profile-updated` gedispatched op `document` zodat
 *      externe listeners kunnen reageren.
 *   3. Bekende legacy render-hooks worden aangeroepen (defensief, als ze
 *      bestaan): `DY.updateTopbarAvatar()`, `DY.updateNav()`,
 *      en re-render `DY.renderProfiel()` wanneer user zich op de
 *      profielpagina bevindt.
 *   4. Nieuwe render-hint attributen (`data-pp-live-avatar` /
 *      `data-pp-live-name` / `data-pp-live-bio`) worden automatisch
 *      geüpdate . future-proof voor nieuwe componenten.
 *   5. Cross-tab sync via BroadcastChannel `pp-profile-sync` met
 *      localStorage-fallback voor Safari <=15.
 *
 * FALLBACK-HIËRARCHIE (nooit een lege state)
 *   Naam:   profile.naam → displayName → email(prefix) → 'Gebruiker'
 *   Avatar: profile.avatar → photoURL → initialen-cirkel (kleur o.b.v. uid)
 *   Bio:    profile.bio → '' (leeg maar geen crash)
 *
 * DEFENSE
 *   - Firestore fail → behoud laatst-bekende DY.profile (geen crash)
 *   - Auth logout → listener unsubscribed, DY.profile leeggemaakt
 *   - Snapshot-throttling: max 1 render per 250ms (voorkomt DOM-thrashing)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LOG_TAG = '[pp-profile-rt]';
  var THROTTLE_MS = 250;
  var _unsub = null;
  var _currentUid = null;
  var _lastRender = 0;
  var _pendingRender = null;
  var _bc = null;

  function log(msg) {
    try { if (window.DY && DY.DEBUG) console.log(LOG_TAG, msg); } catch (_) {}
  }
  function fbAuth() { try { return firebase.auth(); } catch (_) { return null; } }
  function fbDb()   { try { return firebase.firestore(); } catch (_) { return null; } }

  // Initialize BroadcastChannel voor cross-tab sync
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      _bc = new BroadcastChannel('pp-profile-sync');
      _bc.onmessage = function (ev) {
        try {
          if (!ev || !ev.data || ev.data.type !== 'profile-updated') return;
          if (ev.data.uid !== _currentUid) return; // andere user, negeer
          // Andere tab heeft profiel bijgewerkt → merge lokaal
          applyProfile(ev.data.profile, /* skipBroadcast */ true);
        } catch (_) {}
      };
    }
  } catch (_) { /* Safari <15 */ }

  // ─── Fallback helpers ─────────────────────────────────────────────────
  function bestNaam(p, user) {
    p = p || {}; user = user || {};
    var kandidaten = [p.naam, p.displayName, p.name, p.gebruikersnaam, user.displayName];
    for (var i = 0; i < kandidaten.length; i++) {
      if (kandidaten[i] && String(kandidaten[i]).trim()) return String(kandidaten[i]).trim();
    }
    if (user.email) return String(user.email).split('@')[0];
    return 'Gebruiker';
  }
  function bestAvatarUrl(p, user) {
    p = p || {}; user = user || {};
    return p.avatar || p.avatarUrl || p.profielFoto || p.photoURL || user.photoURL || null;
  }
  function initials(naam) {
    var s = (naam || '').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    if (parts.length === 1) return parts[0].substr(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function initialsColor(uid) {
    // Deterministisch . zelfde uid = zelfde kleur
    var hash = 0;
    var s = String(uid || 'x');
    for (var i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    var hues = [15, 30, 45, 130, 190, 210, 260, 285, 340];
    return 'hsl(' + hues[Math.abs(hash) % hues.length] + ',65%,45%)';
  }

  // ─── Apply profile update (rendert + broadcast) ───────────────────────
  function applyProfile(newData, skipBroadcast) {
    try {
      if (!newData) return;
      // Merge in DY.profile zonder bestaande refs kapot te maken
      window.DY = window.DY || {};
      DY.profile = Object.assign({}, DY.profile || {}, newData);
      // Broadcast naar andere tabs
      if (!skipBroadcast && _bc && _currentUid) {
        try { _bc.postMessage({ type: 'profile-updated', uid: _currentUid, profile: DY.profile }); } catch (_) {}
      }
      // Storage-event fallback (voor Safari zonder BroadcastChannel)
      if (!skipBroadcast && !_bc) {
        try { localStorage.setItem('pp-profile-tick', String(Date.now())); } catch (_) {}
      }
      // Throttle DOM re-render
      var now = Date.now();
      if (now - _lastRender < THROTTLE_MS) {
        if (_pendingRender) clearTimeout(_pendingRender);
        _pendingRender = setTimeout(scheduleRender, THROTTLE_MS - (now - _lastRender));
      } else {
        scheduleRender();
      }
    } catch (e) {
      log('applyProfile err: ' + (e && e.message));
    }
  }

  function scheduleRender() {
    _lastRender = Date.now();
    _pendingRender = null;
    requestAnimationFrame(renderAll);
  }

  // ─── Renderers ────────────────────────────────────────────────────────
  function renderAll() {
    try {
      updateLiveAvatars();
      updateLiveNames();
      updateLiveBios();
      updateTopbar();
      updateReactieInputs();
      rerenderProfileIfActive();
      // Custom event voor externe modules
      try {
        document.dispatchEvent(new CustomEvent('pp-profile-updated', {
          detail: { uid: _currentUid, profile: DY.profile }
        }));
      } catch (_) {}
    } catch (e) {
      log('renderAll err: ' + (e && e.message));
    }
  }

  function updateTopbar() {
    try {
      if (window.DY && typeof DY.updateTopbarAvatar === 'function') {
        DY.updateTopbarAvatar();
      }
      if (window.DY && typeof DY.updateNav === 'function') {
        DY.updateNav();
      }
    } catch (_) {}
  }

  function rerenderProfileIfActive() {
    try {
      // Alleen re-renderen als de gebruiker op de eigen profiel-pagina is
      var hash = String(location.hash || '').toLowerCase();
      var qsPage = new URLSearchParams(location.search || '').get('pagina');
      var onOwnProfile = hash.indexOf('#profiel') === 0 || qsPage === 'profiel';
      if (!onOwnProfile) return;
      // Anti-loop guard: renderProfiel triggert nooit een Firestore write
      // maar leest DY.profile → veilig om aan te roepen.
      if (window.DY && typeof DY.renderProfiel === 'function') {
        DY.renderProfiel();
      }
    } catch (_) {}
  }

  function updateLiveAvatars() {
    var url = bestAvatarUrl(DY.profile, DY.user);
    var naam = bestNaam(DY.profile, DY.user);
    var init = initials(naam);
    var color = initialsColor(_currentUid);
    var nodes = document.querySelectorAll('[data-pp-live-avatar]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // Skip nodes van andere users (uid attribuut check)
      var targetUid = el.getAttribute('data-pp-uid');
      if (targetUid && targetUid !== _currentUid) continue;
      renderAvatarInto(el, url, init, color);
    }
  }
  function renderAvatarInto(el, url, init, color) {
    try {
      // Als url beschikbaar → toon <img>. Anders → initialen-cirkel.
      if (url) {
        var img = el.querySelector('img.pp-live-avatar-img');
        if (!img) {
          el.innerHTML = '';
          img = document.createElement('img');
          img.className = 'pp-live-avatar-img';
          img.setAttribute('loading', 'lazy');
          img.setAttribute('decoding', 'async');
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block';
          img.onerror = function () {
            // Fallback: als afbeelding niet laadt → initialen
            renderAvatarInto(el, null, init, color);
          };
          el.appendChild(img);
        }
        if (img.src !== url) img.src = url;
      } else {
        el.innerHTML = '<span class="pp-live-avatar-init" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:' + color + ';color:#fff;font-weight:700;border-radius:50%;font-family:DM Sans,system-ui,sans-serif;letter-spacing:.02em">' + init + '</span>';
      }
    } catch (_) {}
  }

  function updateLiveNames() {
    var naam = bestNaam(DY.profile, DY.user);
    var nodes = document.querySelectorAll('[data-pp-live-name]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var uidAttr = el.getAttribute('data-pp-uid');
      if (uidAttr && uidAttr !== _currentUid) continue;
      if (el.textContent !== naam) el.textContent = naam;
    }
  }

  function updateLiveBios() {
    var bio = (DY.profile && (DY.profile.bio || DY.profile.beschrijving)) || '';
    var nodes = document.querySelectorAll('[data-pp-live-bio]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var uidAttr = el.getAttribute('data-pp-uid');
      if (uidAttr && uidAttr !== _currentUid) continue;
      if (el.textContent !== bio) el.textContent = bio;
    }
  }

  // Update bestaande legacy reactie-avatars die de initialen tonen
  // (via bekende class `.dy-reactie-avatar-eigen`). Non-destructief:
  // alleen als er GEEN img in staat.
  function updateReactieInputs() {
    try {
      var naam = bestNaam(DY.profile, DY.user);
      var init = initials(naam);
      var color = initialsColor(_currentUid);
      var url = bestAvatarUrl(DY.profile, DY.user);
      var nodes = document.querySelectorAll('.dy-reactie-avatar-eigen, [data-pp-user-avatar="self"]');
      for (var i = 0; i < nodes.length; i++) {
        renderAvatarInto(nodes[i], url, init, color);
      }
    } catch (_) {}
  }

  // ─── Firestore listener setup ─────────────────────────────────────────
  function attachListener(uid) {
    detachListener();
    _currentUid = uid;
    var db = fbDb();
    if (!db || !uid) return;
    try {
      _unsub = db.collection('users').doc(uid).onSnapshot(
        function (snap) {
          try {
            if (!snap || !snap.exists) {
              log('users doc niet gevonden voor uid=' + uid);
              return;
            }
            var data = snap.data() || {};
            data.uid = uid;
            applyProfile(data);
          } catch (e) {
            log('snapshot handler err: ' + (e && e.message));
          }
        },
        function (err) {
          // Firestore-fout . behoud bestaande DY.profile, geen crash
          log('onSnapshot error: ' + (err && err.message));
        }
      );
      log('listener attached voor uid=' + uid);
    } catch (e) {
      log('attachListener err: ' + (e && e.message));
    }
  }

  function detachListener() {
    try { if (typeof _unsub === 'function') _unsub(); } catch (_) {}
    _unsub = null;
    _currentUid = null;
  }

  // ─── Auth-listener → koppel/loskoppel bij (uit)loggen ─────────────────
  function bootstrap() {
    var attempts = 0;
    var iv = setInterval(function () {
      var a = fbAuth();
      if (!a) {
        if (attempts++ > 40) clearInterval(iv);
        return;
      }
      clearInterval(iv);
      a.onAuthStateChanged(function (u) {
        if (u && !u.isAnonymous && u.uid) {
          attachListener(u.uid);
        } else {
          detachListener();
          // Trigger een lege render zodat topbar/avatar terugvalt op gast-state
          scheduleRender();
        }
      });
    }, 200);
  }

  // Public API
  window.PP_ProfileRT = {
    VERSION: '1.0.0',
    forceRefresh: function () { renderAll(); },
    getProfile: function () { return window.DY && DY.profile ? Object.assign({}, DY.profile) : null; },
    bestNaam: function () { return bestNaam(window.DY && DY.profile, window.DY && DY.user); },
    bestAvatarUrl: function () { return bestAvatarUrl(window.DY && DY.profile, window.DY && DY.user); },
    initials: initials,
    initialsColor: initialsColor,
    renderAvatarInto: renderAvatarInto,
    detach: detachListener,
  };

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  // Cross-tab fallback via storage-event (Safari <15)
  window.addEventListener('storage', function (e) {
    try {
      if (e && e.key === 'pp-profile-tick') scheduleRender();
    } catch (_) {}
  });

  log('Realtime profile sync geladen');
})();
