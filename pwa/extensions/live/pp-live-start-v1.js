/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou — Live Module (Start Live Sheet + Camera Preview) v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Bouwt het #pp-live-start modal (bottom
 * sheet) eenmalig in document.body. Pakt camera permissie via
 * navigator.mediaDevices.getUserMedia voor een LOKALE preview, en creëert
 * bij Start een `live_sessions` document in Firestore.
 *
 * Stage-1 architectuur:
 *   • Lokale camera preview voor de host (gebruikt MediaStream).
 *   • Geen broadcast naar viewers (komt in fase 2 via WebRTC SFU / Mux).
 *   • Viewers zien de placeholder + chat + reactions, host ziet preview.
 *
 * Public API:
 *   PP_Live.openStartSheet()
 *   PP_Live.closeStartSheet()
 *   PP_Live.endMyLive()
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppLiveStartInit) return;
  window.__ppLiveStartInit = true;

  var TAG = '[live-start]';
  var VERSION = '1.0.0';
  var PP_Live = window.PP_Live || (window.PP_Live = {});

  // Studio formats — de 5 premium categorieën
  var STUDIO_FORMATS = [
    { key: 'live',     label: 'Studio Live',     emoji: '🔴', desc: 'Live fashion & interactie' },
    { key: 'talks',    label: 'Studio Talks',    emoji: '🎙️', desc: 'Interviews met creators & merken' },
    { key: 'shows',    label: 'Studio Shows',    emoji: '🎭', desc: 'Modeshows & collectielanceringen' },
    { key: 'drops',    label: 'Studio Drops',    emoji: '💎', desc: 'Nieuwe releases & campagnes' },
    { key: 'sessions', label: 'Studio Sessions', emoji: '✨', desc: 'Styling & community' }
  ];

  function db() { return (window.firebase && firebase.firestore) ? firebase.firestore() : null; }
  function auth() { return (window.firebase && firebase.auth) ? firebase.auth() : null; }
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var state = {
    stream: null,
    selectedFormat: 'live',
    activeSessionId: null,
    isStarting: false
  };

  // ───────────── Modal DOM (lazy create) ─────────────
  function ensureSheet() {
    var modal = document.getElementById('pp-live-start');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pp-live-start';
    modal.className = 'pp-live-start-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Start Paskamer Studio sessie');

    var formatsHtml = STUDIO_FORMATS.map(function (f, idx) {
      var sel = idx === 0 ? ' pp-live-format-selected' : '';
      return '<button type="button" class="pp-live-format-tile' + sel + '" data-format="' + escapeHtml(f.key) + '" data-testid="live-format-' + escapeHtml(f.key) + '">' +
        '<span class="pp-live-format-emoji">' + f.emoji + '</span>' +
        '<span class="pp-live-format-label">' + escapeHtml(f.label) + '</span>' +
        '<span class="pp-live-format-desc">' + escapeHtml(f.desc) + '</span>' +
      '</button>';
    }).join('');

    modal.innerHTML = '' +
      '<div class="pp-live-start-sheet" role="document">' +
        '<div class="pp-live-sheet-handle" aria-hidden="true"></div>' +
        '<div class="pp-live-sheet-title">🎬 Start een Paskamer Studio sessie</div>' +
        '<div class="pp-live-sheet-sub">Kies je format en ga live voor jouw community.</div>' +

        '<div class="pp-live-error" id="pp-live-error" role="alert"></div>' +

        '<div class="pp-live-preview-wrap" id="pp-live-preview-wrap">' +
          '<video class="pp-live-preview-video" id="pp-live-preview-video" playsinline autoplay muted style="display:none"></video>' +
          '<div class="pp-live-preview-placeholder" id="pp-live-preview-placeholder">' +
            '<span class="pp-live-preview-placeholder-emoji">📷</span>' +
            '<span>Camera-toegang vereist voor preview</span>' +
            '<button type="button" class="pp-live-follow-btn" data-testid="live-camera-enable-btn" id="pp-live-camera-enable">Activeer camera</button>' +
          '</div>' +
        '</div>' +

        '<input type="text" class="pp-live-sheet-input" id="pp-live-title-input" data-testid="live-title-input" placeholder="Geef je sessie een titel..." maxlength="80">' +

        '<div class="pp-live-sheet-tags-label">Kies je format</div>' +
        '<div class="pp-live-format-grid" id="pp-live-formats">' + formatsHtml + '</div>' +

        '<button type="button" class="pp-live-start-btn" data-testid="live-start-btn" id="pp-live-start-go">' +
          '<span class="pp-live-dot"></span>' +
          '<span id="pp-live-start-btn-label">Ga live</span>' +
        '</button>' +
      '</div>';

    document.body.appendChild(modal);

    // Backdrop click closes
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeSheet();
    });

    // Format selection (single-select)
    modal.querySelectorAll('.pp-live-format-tile').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modal.querySelectorAll('.pp-live-format-tile').forEach(function (b) {
          b.classList.remove('pp-live-format-selected');
        });
        btn.classList.add('pp-live-format-selected');
        state.selectedFormat = btn.getAttribute('data-format');
      });
    });

    // Camera enable button
    var camBtn = modal.querySelector('#pp-live-camera-enable');
    if (camBtn) camBtn.addEventListener('click', requestCamera);

    // Start button
    modal.querySelector('#pp-live-start-go').addEventListener('click', startLive);

    // Initial state: default format = 'live'
    state.selectedFormat = 'live';

    return modal;
  }

  // ───────────── Camera ─────────────
  function stopCamera() {
    try {
      if (state.stream && state.stream.getTracks) {
        state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (_) {} });
      }
    } catch (_) {}
    state.stream = null;
    var v = document.getElementById('pp-live-preview-video');
    if (v) { v.srcObject = null; v.style.display = 'none'; }
    var ph = document.getElementById('pp-live-preview-placeholder');
    if (ph) ph.style.display = '';
  }

  function showError(msg) {
    var el = document.getElementById('pp-live-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.add('pp-live-active');
    setTimeout(function () { try { el.classList.remove('pp-live-active'); } catch (_) {} }, 5500);
  }

  function requestCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('Je browser ondersteunt geen camera-toegang.');
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      var v = document.getElementById('pp-live-preview-video');
      var ph = document.getElementById('pp-live-preview-placeholder');
      if (v) {
        v.srcObject = stream;
        v.style.display = '';
        v.play().catch(function () {});
      }
      if (ph) ph.style.display = 'none';
    }).catch(function (err) {
      log('camera denied', err && err.name);
      var msg = 'Camera niet beschikbaar.';
      if (err && err.name === 'NotAllowedError') msg = 'Geen camera-toegang. Sta toegang toe in je browser-instellingen.';
      else if (err && err.name === 'NotFoundError') msg = 'Geen camera gevonden op dit apparaat.';
      else if (err && err.name === 'NotReadableError') msg = 'Camera is in gebruik door een andere app.';
      showError(msg);
    });
  }

  // ───────────── Start live → Firestore ─────────────
  function currentUser() {
    var a = auth();
    return (a && a.currentUser) ? a.currentUser : null;
  }

  function startLive() {
    if (state.isStarting) return;
    var u = currentUser();
    if (!u) {
      showError('Log in om een live sessie te starten.');
      try { if (window.DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Log in om live te gaan.'); } catch (_) {}
      return;
    }
    // Firestore rules eisen echt-ingelogde user (niet anonymous). Guest-auth
    // maakt een anonymous session aan, die mag WEL lezen/kijken maar niet zelf
    // een live starten. Beter feedback dan de "Missing or insufficient permissions" error.
    if (u.isAnonymous) {
      showError('Je moet ingelogd zijn om zelf live te gaan. Anoniem kijken kan wel.');
      try { if (window.DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Log in om live te gaan.'); } catch (_) {}
      return;
    }
    var titleEl = document.getElementById('pp-live-title-input');
    var title = (titleEl && titleEl.value || '').trim();
    if (!title) {
      showError('Geef je sessie een titel.');
      if (titleEl) titleEl.focus();
      return;
    }
    if (!state.selectedFormat) {
      showError('Kies een Studio format.');
      return;
    }
    var f = db();
    if (!f) {
      showError('Verbinding niet beschikbaar — probeer opnieuw.');
      return;
    }

    state.isStarting = true;
    var btn = document.getElementById('pp-live-start-go');
    var lbl = document.getElementById('pp-live-start-btn-label');
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Bezig…';

    var profile = (window.DY && DY.profile) || {};
    var hostName = profile.gebruikersnaam || profile.naam || u.displayName || (u.email && u.email.split('@')[0]) || 'gebruiker';
    if (hostName && hostName.charAt(0) !== '@') hostName = '@' + hostName;

    // Detect brand vs user host via approved brands lookup (best-effort)
    var isBrand = !!(profile.isBrand || profile.brandId);
    var sessionDoc = {
      hostUid: u.uid,
      hostType: isBrand ? 'brand' : 'user',
      hostName: hostName,
      hostAvatar: profile.fotoUrl || u.photoURL || null,
      brandId: isBrand ? u.uid : null,
      title: title.substring(0, 80),
      format: state.selectedFormat,       // v13: primary categorization (live/talks/shows/drops/sessions)
      tags: [],                            // reserved for future audience tags
      status: 'live',
      viewers: 0,
      reactions: 0,
      cohosts: [],
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      endedAt: null,
      scheduledFor: null
    };

    f.collection('live_sessions').add(sessionDoc).then(function (ref) {
      state.activeSessionId = ref.id;
      state.isStarting = false;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = 'Ga live';
      closeSheet();
      // Open player as the host
      try {
        if (PP_Live.openPlayer) PP_Live.openPlayer(ref.id);
      } catch (e) { log('openPlayer failed', e); }
      // Attach host-only video stream to the player video element (lokale preview)
      attachHostStreamToPlayer();
      // Track analytics event (best-effort, fail-silent)
      try {
        if (window.DY && DY.profile && firebase && firebase.firestore && firebase.firestore.FieldValue) {
          f.collection('events').add({
            type: 'live_start',
            uid: u.uid,
            sessionId: ref.id,
            ts: firebase.firestore.FieldValue.serverTimestamp()
          }).catch(function () {});
        }
      } catch (_) {}
      log('started session', ref.id);
    }).catch(function (err) {
      state.isStarting = false;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = 'Ga live';
      showError('Kon sessie niet starten: ' + (err && err.message || 'onbekende fout'));
      log('start failed', err && err.message);
    });
  }

  function attachHostStreamToPlayer() {
    if (!state.stream) return;
    var v = document.getElementById('pp-live-player-video');
    var emo = document.getElementById('pp-live-player-emoji');
    if (v) {
      v.srcObject = state.stream;
      v.style.display = '';
      v.muted = true; // host hears own audio off
      v.play().catch(function () {});
    }
    if (emo) emo.style.display = 'none';
  }

  function endMyLive() {
    var sid = state.activeSessionId;
    if (!sid) return;
    var f = db();
    if (!f) return;
    f.collection('live_sessions').doc(sid).update({
      status: 'ended',
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function (e) { log('endMyLive update failed', e && e.message); });
    state.activeSessionId = null;
    stopCamera();
  }

  // ───────────── Open / Close sheet ─────────────
  function openSheet() {
    var u = currentUser();
    if (!u) {
      try { if (window.DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Log in om live te gaan.'); } catch (_) {}
      return;
    }
    var modal = ensureSheet();
    modal.classList.add('pp-live-open');
    document.body.style.overflow = 'hidden';
    // Try camera immediately for best UX (will fail silently if denied)
    setTimeout(requestCamera, 200);
  }

  function closeSheet() {
    var modal = document.getElementById('pp-live-start');
    if (modal) modal.classList.remove('pp-live-open');
    document.body.style.overflow = '';
    // Stop camera ONLY if we did not actually start a live (else stream is owned by player)
    if (!state.activeSessionId) stopCamera();
  }

  // Auto-end live when host closes the player they own
  // We hook into PP_Live.closePlayer (defined in pp-live-player-v1.js)
  function hookClosePlayer() {
    if (!PP_Live.closePlayer || PP_Live.closePlayer.__ppLiveHostHook) {
      // not ready yet or already hooked
      if (!PP_Live.closePlayer) return setTimeout(hookClosePlayer, 300);
      return;
    }
    var origClose = PP_Live.closePlayer;
    var wrapped = function (opts) {
      try {
        var sid = state.activeSessionId;
        if (sid) {
          // This was the host's own live → end it server-side
          endMyLive();
        }
      } catch (_) {}
      return origClose(opts);
    };
    wrapped.__ppLiveHostHook = true;
    PP_Live.closePlayer = wrapped;
  }

  PP_Live.openStartSheet = openSheet;
  PP_Live.closeStartSheet = closeSheet;
  PP_Live.endMyLive = endMyLive;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(hookClosePlayer, 600); });
  } else {
    setTimeout(hookClosePlayer, 600);
  }

  // End live on page unload to avoid stale sessions
  window.addEventListener('beforeunload', function () {
    try { if (state.activeSessionId) endMyLive(); } catch (_) {}
  });

  log('init', VERSION);
})();
