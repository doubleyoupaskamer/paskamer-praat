/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou — Live Module (Player Modal + Realtime Chat + Reactions) v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Bouwt EENMALIG het #pp-live-player modal
 * in document.body en vult dat met:
 *   • live "video" area (placeholder met pulse + emoji; fase 2: WebRTC stream)
 *   • host & co-host pillows met follow buttons
 *   • realtime chat via Firestore (live_sessions/{id}/chat)
 *   • reactions overlay (lokaal + server emit)
 *
 * Strikt isolerend: gebruikt `.pp-live-*` classes uit pp-live-v1.css.
 *
 * Public API:
 *   PP_Live.openPlayer(sessionId)
 *   PP_Live.closePlayer({ skipHistory?: boolean })
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppLivePlayerInit) return;
  window.__ppLivePlayerInit = true;

  var TAG = '[live-player]';
  var VERSION = '1.0.0';
  var PP_Live = window.PP_Live || (window.PP_Live = {});

  function db() { return (window.firebase && firebase.firestore) ? firebase.firestore() : null; }
  function auth() { return (window.firebase && firebase.auth) ? firebase.auth() : null; }
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  var REACTIONS = ['❤️', '🔥', '😍', '👏', '✨', '💛'];
  var state = {
    sessionId: null,
    sessionData: null,
    unsubscribeSession: null,
    unsubscribeChat: null,
    isOpen: false
  };

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function initialFor(name) {
    if (!name) return '?';
    var n = String(name).trim();
    if (n.charAt(0) === '@') n = n.substring(1);
    return n.charAt(0).toUpperCase() || '?';
  }

  // ───────────── Modal DOM (lazy create once) ─────────────
  function ensureModal() {
    var modal = document.getElementById('pp-live-player');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'pp-live-player';
    modal.className = 'pp-live-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Paskamer Studio sessie');
    modal.innerHTML = '' +
      '<div class="pp-live-player-area" id="pp-live-player-area">' +
        '<div class="pp-live-video-pulse"></div>' +
        '<video class="pp-live-player-video" id="pp-live-player-video" playsinline autoplay muted style="display:none"></video>' +
        '<div class="pp-live-player-emoji" id="pp-live-player-emoji">👗🪞</div>' +
        '<div class="pp-live-player-top">' +
          '<button class="pp-live-close" data-testid="live-player-close" aria-label="Sluit live">✕</button>' +
          '<div class="pp-live-badge"><div class="pp-live-dot"></div> <span id="pp-live-badge-text">LIVE</span></div>' +
          '<div style="width:38px"></div>' +
        '</div>' +
        '<div class="pp-live-cohosts-bar" id="pp-live-cohosts-bar"></div>' +
        '<div class="pp-live-reactions-overlay" id="pp-live-reactions-overlay"></div>' +
      '</div>' +
      '<div class="pp-live-chat-area">' +
        '<div class="pp-live-chat-messages" id="pp-live-chat-messages" aria-live="polite"></div>' +
        '<div class="pp-live-chat-input-row">' +
          '<button class="pp-live-react-btn" id="pp-live-react-btn" data-testid="live-react-btn" aria-label="Stuur reactie">❤️</button>' +
          '<input type="text" class="pp-live-chat-input" id="pp-live-chat-input" data-testid="live-chat-input" placeholder="Schrijf een reactie..." aria-label="Chat bericht" maxlength="240">' +
          '<button class="pp-live-send-btn" id="pp-live-send-btn" data-testid="live-chat-send" aria-label="Verstuur">➤</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Wire up handlers (once)
    modal.querySelector('[data-testid="live-player-close"]').addEventListener('click', function () {
      closePlayer();
    });
    modal.querySelector('#pp-live-react-btn').addEventListener('click', function () {
      sendReaction();
    });
    modal.querySelector('#pp-live-send-btn').addEventListener('click', function () {
      sendChat();
    });
    modal.querySelector('#pp-live-chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
    // Backdrop click does NOT close (full-screen modal, only X button) — by design

    // ESC key closes
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.isOpen) closePlayer();
    });

    return modal;
  }

  function renderCohostsBar(session) {
    var bar = document.getElementById('pp-live-cohosts-bar');
    if (!bar) return;
    var hostName = (session && session.hostName) || 'anoniem';
    var displayName = hostName.charAt(0) === '@' ? hostName : '@' + hostName;
    var cohostHtml = '' +
      '<div class="pp-live-host-pill">' +
        '<div class="pp-live-avatar">' + escapeHtml(initialFor(hostName)) + '</div>' +
        '<span class="pp-live-host-name">' + escapeHtml(displayName) + '</span>' +
        '<button class="pp-live-follow-btn" data-testid="live-follow-btn" type="button" data-uid="' + escapeHtml(session.hostUid || '') + '">+ Volg</button>' +
      '</div>';
    if (Array.isArray(session.cohosts) && session.cohosts.length > 0) {
      session.cohosts.forEach(function (co) {
        var coName = (co && co.name) || 'co-host';
        var coDisp = coName.charAt(0) === '@' ? coName : '@' + coName;
        cohostHtml += '<div class="pp-live-cohost-x">×</div>';
        cohostHtml += '<div class="pp-live-host-pill">' +
          '<div class="pp-live-avatar">' + escapeHtml(initialFor(coName)) + '</div>' +
          '<span class="pp-live-host-name">' + escapeHtml(coDisp) + '</span>' +
          '<button class="pp-live-follow-btn" type="button" data-uid="' + escapeHtml((co && co.uid) || '') + '">+ Volg</button>' +
        '</div>';
      });
    }
    bar.innerHTML = cohostHtml;

    // Follow handler (lightweight; uses existing DY.toggleVolgen if available)
    bar.querySelectorAll('[data-testid="live-follow-btn"], .pp-live-follow-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var uid = btn.getAttribute('data-uid');
        if (!uid) return;
        try {
          if (window.DY && typeof DY.toggleVolgen === 'function') {
            DY.toggleVolgen(uid);
            btn.textContent = '✓ Volgend';
            btn.style.opacity = '0.7';
          } else if (window.DY && typeof DY.volgen === 'function') {
            DY.volgen(uid);
            btn.textContent = '✓ Volgend';
          } else {
            btn.textContent = 'Login om te volgen';
          }
        } catch (e) { log('follow failed', e); }
      });
    });
  }

  // ───────────── Chat ─────────────
  function chatMsgHtml(m) {
    var u = m.userName || '@anoniem';
    if (u.charAt(0) !== '@') u = '@' + u;
    return '' +
      '<div class="pp-live-chat-msg">' +
        '<div class="pp-live-chat-avatar">' + escapeHtml(initialFor(u)) + '</div>' +
        '<div class="pp-live-chat-bubble">' +
          '<div class="pp-live-chat-user">' + escapeHtml(u) + '</div>' +
          '<div class="pp-live-chat-text">' + escapeHtml(m.text || '') + '</div>' +
        '</div>' +
      '</div>';
  }

  function appendMsg(m) {
    var box = document.getElementById('pp-live-chat-messages');
    if (!box) return;
    var temp = document.createElement('div');
    temp.innerHTML = chatMsgHtml(m);
    var node = temp.firstChild;
    if (node) box.appendChild(node);
    box.scrollTop = box.scrollHeight;
    // Cap to last ~80 messages in the DOM for perf
    while (box.children.length > 80) box.removeChild(box.firstChild);
  }

  function subscribeChat(sessionId) {
    unsubscribeChat();
    var f = db();
    if (!f) return;
    try {
      var q = f.collection('live_sessions').doc(sessionId).collection('chat')
        .orderBy('createdAt', 'desc')
        .limit(40);
      // We subscribe descending for snappy initial load, then reverse paint
      state.unsubscribeChat = q.onSnapshot(function (snap) {
        var box = document.getElementById('pp-live-chat-messages');
        if (!box) return;
        var existing = box.getAttribute('data-loaded') === '1';
        if (!existing) {
          // First load — paint all in reverse order (asc)
          var rows = [];
          snap.forEach(function (d) { rows.push(d.data()); });
          rows.reverse();
          box.innerHTML = '';
          rows.forEach(appendMsg);
          box.setAttribute('data-loaded', '1');
        } else {
          // Append only new docs
          snap.docChanges().forEach(function (chg) {
            if (chg.type === 'added') {
              // The descending query puts new ones at the top; we need to detect new (not historical)
              // Track via createdAt newer than last shown? For simplicity, paint every "added" if not already present.
              var doc = chg.doc.data();
              if (doc.__paintedFlag) return;
              // We append; duplicate filter: keep last known IDs in a set on box
              var seen = box.__seenIds || (box.__seenIds = {});
              if (seen[chg.doc.id]) return;
              seen[chg.doc.id] = 1;
              appendMsg(doc);
            }
          });
        }
      }, function (err) {
        log('chat sub err', err && err.message);
      });
    } catch (e) { log('subscribeChat failed', e); }
  }

  function unsubscribeChat() {
    try { if (typeof state.unsubscribeChat === 'function') state.unsubscribeChat(); } catch (_) {}
    state.unsubscribeChat = null;
  }

  function currentUser() {
    var a = auth();
    return (a && a.currentUser) ? a.currentUser : null;
  }

  function sendChat() {
    var input = document.getElementById('pp-live-chat-input');
    if (!input || !state.sessionId) return;
    var text = (input.value || '').trim();
    if (!text) return;
    var u = currentUser();
    if (!u || u.isAnonymous) {
      // Not logged in (of anonymous guest) — local optimistic message + login prompt
      appendMsg({ userName: '@gast', text: text });
      input.value = '';
      try { if (window.DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Log in om mee te chatten in de Paskamer Studio.'); } catch (_) {}
      return;
    }
    var f = db();
    if (!f) return;
    var profile = (window.DY && DY.profile) || {};
    var userName = profile.gebruikersnaam || profile.naam || u.displayName || (u.email && u.email.split('@')[0]) || 'gebruiker';
    var msg = {
      uid: u.uid,
      userName: userName,
      text: text.substring(0, 240),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    input.value = '';
    // Optimistic UI
    appendMsg({ userName: userName, text: msg.text });
    f.collection('live_sessions').doc(state.sessionId).collection('chat').add(msg)
      .catch(function (e) { log('sendChat failed', e && e.message); });
  }

  // ───────────── Reactions ─────────────
  function spawnFloatingReact(emoji) {
    var overlay = document.getElementById('pp-live-reactions-overlay');
    if (!overlay) return;
    var el = document.createElement('div');
    el.className = 'pp-live-floating-react';
    el.textContent = emoji;
    el.style.right = (Math.random() * 30) + 'px';
    overlay.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (_) {} }, 2100);
  }

  function sendReaction() {
    var emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    spawnFloatingReact(emoji);
    if (!state.sessionId) return;
    var f = db();
    var u = currentUser();
    if (!f) return;
    // Anonymous of niet-ingelogd: alleen lokale float-animatie tonen +
    // eenmalig login-popup. Voorkomt "Missing or insufficient permissions"
    // in de console.
    if (!u || u.isAnonymous) {
      try {
        if (!state._loginPromptShown && window.DY && DY.toonLoginPrompt) {
          state._loginPromptShown = true;
          DY.toonLoginPrompt('Log in om reacties te sturen in de Paskamer Studio.');
        }
      } catch (_) {}
      return;
    }
    // Throttle to max 1 per 400ms to avoid runaway writes
    var now = Date.now();
    if (state._lastReactAt && (now - state._lastReactAt) < 400) return;
    state._lastReactAt = now;
    f.collection('live_sessions').doc(state.sessionId).collection('reactions').add({
      uid: u.uid,
      emoji: emoji,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function () {});
  }

  // ───────────── Session subscribe (viewer count + status) ─────────────
  function subscribeSession(sessionId) {
    unsubscribeSession();
    var f = db();
    if (!f) return;
    try {
      state.unsubscribeSession = f.collection('live_sessions').doc(sessionId)
        .onSnapshot(function (doc) {
          if (!doc.exists) {
            // Session was deleted — close gracefully
            log('session vanished', sessionId);
            closePlayer();
            return;
          }
          var data = doc.data() || {};
          data.id = doc.id;
          state.sessionData = data;
          var bt = document.getElementById('pp-live-badge-text');
          if (bt) bt.textContent = 'LIVE · ' + (data.viewers || 0);
          if (data.status === 'ended') {
            // Show end banner and auto-close
            var emo = document.getElementById('pp-live-player-emoji');
            if (emo) emo.textContent = '🎬';
            try {
              if (window.DY && DY.toastSucces) DY.toastSucces('Live sessie beëindigd');
              else if (window.alert) console.warn('Live sessie beëindigd');
            } catch (_) {}
            setTimeout(closePlayer, 1800);
          }
          renderCohostsBar(data);
        }, function (err) { log('session sub err', err && err.message); });
    } catch (e) { log('subscribeSession failed', e); }
  }

  function unsubscribeSession() {
    try { if (typeof state.unsubscribeSession === 'function') state.unsubscribeSession(); } catch (_) {}
    state.unsubscribeSession = null;
  }

  // ───────────── Viewer counter (best-effort) ─────────────
  function bumpViewerCount(sessionId, delta) {
    var f = db();
    var u = currentUser();
    if (!f || !sessionId) return;
    try {
      // Use atomic increment when available
      var inc = (firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.increment)
        ? firebase.firestore.FieldValue.increment(delta) : null;
      if (inc == null) return;
      f.collection('live_sessions').doc(sessionId).update({ viewers: inc }).catch(function () {});
    } catch (e) { log('bumpViewerCount failed', e); }
  }

  // ───────────── Public openPlayer / closePlayer ─────────────
  function openPlayer(sessionId) {
    if (!sessionId) return;
    var modal = ensureModal();
    state.sessionId = sessionId;
    state.isOpen = true;
    // Reset chat box flags
    var box = document.getElementById('pp-live-chat-messages');
    if (box) {
      box.innerHTML = '';
      box.removeAttribute('data-loaded');
      box.__seenIds = {};
    }
    modal.classList.add('pp-live-open');
    document.body.style.overflow = 'hidden';

    // Update URL deep-link (idempotent)
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('id') !== sessionId || u.searchParams.get('pagina') !== 'live_detail') {
        u.searchParams.set('pagina', 'live_detail');
        u.searchParams.set('id', sessionId);
        history.pushState(null, '', u.toString());
      }
    } catch (_) {}

    subscribeSession(sessionId);
    subscribeChat(sessionId);
    bumpViewerCount(sessionId, +1);

    // SEO entity update for sharable URL
    try {
      if (window.PP_SEO && PP_SEO.applyForPage) PP_SEO.applyForPage('live_detail', sessionId);
    } catch (_) {}

    log('opened', sessionId);
  }

  function closePlayer(opts) {
    opts = opts || {};
    var modal = document.getElementById('pp-live-player');
    if (modal) modal.classList.remove('pp-live-open');
    document.body.style.overflow = '';

    if (state.sessionId) bumpViewerCount(state.sessionId, -1);
    unsubscribeChat();
    unsubscribeSession();
    var sid = state.sessionId;
    state.sessionId = null;
    state.sessionData = null;
    state.isOpen = false;

    if (!opts.skipHistory) {
      // Update URL back to /?pagina=live (not full nav, just URL)
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.get('pagina') === 'live_detail') {
          u.searchParams.set('pagina', 'live');
          u.searchParams.delete('id');
          history.pushState(null, '', u.toString());
          try { if (window.DY) DY.pagina = 'live'; } catch (_) {}
          if (window.PP_SEO && PP_SEO.applyForPage) PP_SEO.applyForPage('live');
        }
      } catch (_) {}
    }
    log('closed', sid);
  }

  PP_Live.openPlayer = openPlayer;
  PP_Live.closePlayer = closePlayer;

  log('init', VERSION);
})();
