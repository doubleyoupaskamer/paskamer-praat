/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou Live Module (Start Live Sheet + Camera Preview) v1.0.0
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

  // Studio formats de 5 premium categorieën
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
    isStarting: false,
    mode: 'now',           // 'now' | 'scheduled'
    scheduledFor: null     // Date object when mode === 'scheduled'
  };

  // ───────────── Datetime helpers voor "Later plannen" ─────────────
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function defaultScheduledDate() {
    // 1 uur vanaf nu, afgerond naar volgend kwartier
    var d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    var m = d.getMinutes();
    var next = Math.ceil(m / 15) * 15;
    if (next >= 60) { d.setHours(d.getHours() + 1); d.setMinutes(0); }
    else d.setMinutes(next);
    return d;
  }
  function toLocalInputValue(d) {
    // <input type="datetime-local"> verwacht 'YYYY-MM-DDTHH:MM' in local tz
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fromLocalInputValue(v) {
    // Parse als LOCAL time (browser doet dit automatisch bij new Date(string))
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function minAllowedDate() { return new Date(Date.now() + 15 * 60 * 1000); }         // T+15min
  function maxAllowedDate() { return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); } // T+7d

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
        '<button type="button" class="pp-live-sheet-close" id="pp-live-sheet-close" ' +
          'aria-label="Sluit studio" data-testid="live-sheet-close-btn">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
            '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" ' +
              'stroke-linecap="round" fill="none"/>' +
          '</svg>' +
        '</button>' +
        '<div class="pp-live-sheet-handle" aria-hidden="true"></div>' +
        '<div class="pp-live-sheet-title">🎬 Start een Paskamer Studio sessie</div>' +
        '<div class="pp-live-sheet-sub">Kies je format en ga live voor jouw community.</div>' +

        // ── Mode toggle: Nu vs Later plannen ────────────────────────
        '<div class="pp-live-mode-toggle" role="tablist" data-testid="live-mode-toggle">' +
          '<button type="button" class="pp-live-mode-opt pp-live-mode-active" ' +
            'data-mode="now" data-testid="live-mode-now" role="tab">' +
            '<span class="pp-live-mode-emoji">🔴</span> Nu live' +
          '</button>' +
          '<button type="button" class="pp-live-mode-opt" ' +
            'data-mode="scheduled" data-testid="live-mode-scheduled" role="tab">' +
            '<span class="pp-live-mode-emoji">📅</span> Later plannen' +
          '</button>' +
        '</div>' +

        // ── Datetime picker (alleen zichtbaar bij mode=scheduled) ───
        '<div class="pp-live-schedule-wrap" id="pp-live-schedule-wrap" style="display:none">' +
          '<label class="pp-live-schedule-label" for="pp-live-schedule-input">' +
            'Wanneer ga je live? <span class="pp-live-schedule-hint">(min. 15 min, max. 7 dagen)</span>' +
          '</label>' +
          '<input type="datetime-local" class="pp-live-schedule-input" ' +
            'id="pp-live-schedule-input" data-testid="live-schedule-input">' +
          '<div class="pp-live-schedule-preview" id="pp-live-schedule-preview"></div>' +
        '</div>' +

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
          '<span class="pp-live-dot" id="pp-live-start-dot"></span>' +
          '<span id="pp-live-start-btn-label">Ga live</span>' +
        '</button>' +
      '</div>';

    document.body.appendChild(modal);

    // Backdrop click closes
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeSheet();
    });

    // Close button (X)
    var closeBtn = modal.querySelector('#pp-live-sheet-close');
    if (closeBtn) closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeSheet();
    });

    // ESC key closes sheet
    if (!window.__ppLiveSheetEscHooked) {
      window.__ppLiveSheetEscHooked = true;
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var m = document.getElementById('pp-live-start');
        if (m && m.classList.contains('pp-live-open')) closeSheet();
      });
    }

    // Mode toggle (Nu / Later plannen)
    modal.querySelectorAll('.pp-live-mode-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode');
        setMode(mode);
      });
    });

    // Datetime input change → update preview + valideer
    var dtInput = modal.querySelector('#pp-live-schedule-input');
    if (dtInput) {
      dtInput.setAttribute('min', toLocalInputValue(minAllowedDate()));
      dtInput.setAttribute('max', toLocalInputValue(maxAllowedDate()));
      dtInput.value = toLocalInputValue(defaultScheduledDate());
      dtInput.addEventListener('change', updateSchedulePreview);
      dtInput.addEventListener('input', updateSchedulePreview);
    }

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
    setMode('now');

    return modal;
  }

  // ───────────── Mode: Nu / Later plannen ─────────────
  function setMode(mode) {
    state.mode = mode;
    var modal = document.getElementById('pp-live-start');
    if (!modal) return;
    modal.querySelectorAll('.pp-live-mode-opt').forEach(function (b) {
      if (b.getAttribute('data-mode') === mode) b.classList.add('pp-live-mode-active');
      else b.classList.remove('pp-live-mode-active');
    });
    var wrap = modal.querySelector('#pp-live-schedule-wrap');
    if (wrap) wrap.style.display = (mode === 'scheduled') ? '' : 'none';
    // Update start-button label + dot
    var lbl = modal.querySelector('#pp-live-start-btn-label');
    var dot = modal.querySelector('#pp-live-start-dot');
    if (lbl) lbl.textContent = (mode === 'scheduled') ? 'Plan aankondiging' : 'Ga live';
    if (dot) dot.style.display = (mode === 'scheduled') ? 'none' : '';
    // Preview updaten
    updateSchedulePreview();
  }

  function formatDutchDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var dagen = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
    var maanden = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    var vandaag = new Date(); vandaag.setHours(0,0,0,0);
    var morgen  = new Date(vandaag.getTime() + 86400000);
    var target  = new Date(d);  target.setHours(0,0,0,0);
    var tijd = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (target.getTime() === vandaag.getTime()) return 'vandaag ' + tijd;
    if (target.getTime() === morgen.getTime())  return 'morgen ' + tijd;
    var diffDays = Math.round((target.getTime() - vandaag.getTime()) / 86400000);
    if (diffDays > 0 && diffDays < 7) return dagen[d.getDay()] + ' ' + tijd;
    return d.getDate() + ' ' + maanden[d.getMonth()] + ' ' + tijd;
  }

  function updateSchedulePreview() {
    var input = document.getElementById('pp-live-schedule-input');
    var preview = document.getElementById('pp-live-schedule-preview');
    if (!input || !preview) return;
    var d = fromLocalInputValue(input.value);
    if (!d) { preview.textContent = ''; return; }
    var min = minAllowedDate();
    var max = maxAllowedDate();
    if (d < min) {
      preview.innerHTML = '<span class="pp-live-schedule-warn">⚠️ Moet minimaal 15 min in de toekomst zijn</span>';
      state.scheduledFor = null;
      return;
    }
    if (d > max) {
      preview.innerHTML = '<span class="pp-live-schedule-warn">⚠️ Maximaal 7 dagen vooruit plannen</span>';
      state.scheduledFor = null;
      return;
    }
    state.scheduledFor = d;
    var diffMs = d.getTime() - Date.now();
    var diffH = Math.round(diffMs / (60 * 60 * 1000));
    var relatief;
    if (diffMs < 60 * 60 * 1000) relatief = 'over ' + Math.round(diffMs / 60000) + ' min';
    else if (diffH < 24) relatief = 'over ' + diffH + ' uur';
    else relatief = 'over ' + Math.round(diffH / 24) + ' dagen';
    preview.innerHTML = '<strong>' + formatDutchDate(d) + '</strong> <span class="pp-live-schedule-relatief">(' + relatief + ')</span>';
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
    // Firestore rules eisen echt-ingelogde user (niet anonymous). Guest-auth
    // maakt een anonymous session aan, die mag WEL lezen/kijken maar niet zelf
    // een live starten. Toon standaard login-popup (net als andere app-flows)
    // en sluit de start-sheet, ipv een rode error binnen de sheet.
    if (!u || u.isAnonymous) {
      try { closeSheet(); } catch (_) {}
      try {
        if (window.DY && typeof DY.toonLoginPrompt === 'function') {
          DY.toonLoginPrompt('Log in om een live paskamersessie te starten en interactie te hebben met je community.');
        }
      } catch (_) {}
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
      showError('Verbinding niet beschikbaar probeer opnieuw.');
      return;
    }

    state.isStarting = true;
    var btn = document.getElementById('pp-live-start-go');
    var lbl = document.getElementById('pp-live-start-btn-label');
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = 'Bezig…';

    // ─── Dubbele-sessie preventie ────────────────────────────────
    // Als deze host al een actieve live-sessie heeft, die eerst netjes
    // afsluiten (status='ended') voordat we een nieuwe aanmaken. Anders
    // krijg je "ghost lives" die eindeloos in het grid blijven staan.
    function endOldSessionsAndCreate() {
      return f.collection('live_sessions')
        .where('hostUid', '==', u.uid)
        .where('status', '==', 'live')
        .limit(10)
        .get()
        .then(function (snap) {
          if (snap.empty) return null;
          var batch = f.batch();
          var endTs = firebase.firestore.FieldValue.serverTimestamp();
          snap.forEach(function (d) {
            batch.update(d.ref, { status: 'ended', endedAt: endTs });
          });
          log('closing ' + snap.size + ' stale session(s) for host ' + u.uid);
          return batch.commit();
        })
        .catch(function (e) {
          // Als de query faalt (bijv. ontbrekende index) niet blokkeren 
          // sessie gewoon aanmaken. Cron worker ruimt eventuele stale wel op.
          log('stale-session cleanup skipped', e && e.message);
          return null;
        });
    }

    var profile = (window.DY && DY.profile) || {};
    var hostName = profile.gebruikersnaam || profile.naam || u.displayName || (u.email && u.email.split('@')[0]) || 'gebruiker';
    if (hostName && hostName.charAt(0) !== '@') hostName = '@' + hostName;

    // Detect brand vs user host via approved brands lookup (best-effort)
    var isBrand = !!(profile.isBrand || profile.brandId);
    var isScheduled = (state.mode === 'scheduled');

    // Extra valideren bij scheduled mode
    if (isScheduled) {
      updateSchedulePreview(); // parse latest input
      if (!(state.scheduledFor instanceof Date) || isNaN(state.scheduledFor.getTime())) {
        state.isStarting = false;
        if (btn) btn.disabled = false;
        if (lbl) lbl.textContent = 'Plan aankondiging';
        showError('Kies een geldige datum en tijd (min. 15 min, max. 7 dagen).');
        return;
      }
    }

    var sessionDoc = {
      hostUid: u.uid,
      hostType: isBrand ? 'brand' : 'user',
      hostName: hostName,
      hostAvatar: profile.fotoUrl || u.photoURL || null,
      brandId: isBrand ? u.uid : null,
      title: title.substring(0, 80),
      format: state.selectedFormat,
      tags: [],
      status: isScheduled ? 'scheduled' : 'live',
      viewers: 0,
      reactions: 0,
      reminderCount: 0,
      cohosts: [],
      startedAt: isScheduled ? null : firebase.firestore.FieldValue.serverTimestamp(),
      endedAt: null,
      scheduledFor: isScheduled ? firebase.firestore.Timestamp.fromDate(state.scheduledFor) : null,
      scheduledAt: isScheduled ? firebase.firestore.FieldValue.serverTimestamp() : null,
      // grace period voor no-show (scheduledFor + 30 min)
      goLiveGraceUntil: isScheduled
        ? firebase.firestore.Timestamp.fromDate(new Date(state.scheduledFor.getTime() + 30 * 60 * 1000))
        : null
    };

    // Bij scheduled: geen oude live-sessies afsluiten (kan meerdere geplande hebben)
    var setupPromise = isScheduled
      ? Promise.resolve(null)
      : endOldSessionsAndCreate();

    setupPromise.then(function () {
      return f.collection('live_sessions').add(sessionDoc);
    }).then(function (ref) {
      state.activeSessionId = isScheduled ? null : ref.id;
      state.isStarting = false;
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = isScheduled ? 'Plan aankondiging' : 'Ga live';
      closeSheet();

      if (isScheduled) {
        // Success toast + notify volgers (best-effort, non-blocking)
        try {
          var when = formatDutchDate(state.scheduledFor);
          if (window.DY && DY.toastSucces) DY.toastSucces('📅 Live gepland voor ' + when);
        } catch (_) {}
        notifyFollowersOfSchedule(f, u, ref.id, sessionDoc);
        log('scheduled session', ref.id, 'for', state.scheduledFor);
        return;
      }

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
      if (lbl) lbl.textContent = isScheduled ? 'Plan aankondiging' : 'Ga live';
      showError('Kon sessie niet ' + (isScheduled ? 'plannen' : 'starten') + ': ' + (err && err.message || 'onbekende fout'));
      log('create failed', err && err.message);
    });
  }

  // ───────────── Followers notify bij schedule ─────────────
  // Best-effort als de "volgers" collectie niet bestaat of query faalt,
  // gaat de scheduling gewoon door. Cron worker verstuurt T-15 reminders.
  function notifyFollowersOfSchedule(f, u, sessionId, sessionDoc) {
    try {
      // Probeer volgers-lijst op te halen (gangbare paden in deze app)
      var followersPromise = f.collection('followers')
        .where('followedUid', '==', u.uid)
        .limit(500)
        .get()
        .catch(function () {
          // Fallback: users/{uid}/followers subcollection
          return f.collection('users').doc(u.uid).collection('followers').limit(500).get();
        });

      followersPromise.then(function (snap) {
        if (!snap || snap.empty) { log('geen followers om te notificeren'); return; }
        var whenStr = formatDutchDate(sessionDoc.scheduledFor.toDate ? sessionDoc.scheduledFor.toDate() : state.scheduledFor);
        var batch = f.batch();
        var count = 0;
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          var followerUid = d.followerUid || d.uid || doc.id;
          if (!followerUid || followerUid === u.uid) return;
          var meldRef = f.collection('meldingen').doc();
          batch.set(meldRef, {
            userId: followerUid,
            reporterUid: followerUid,
            type: 'live_scheduled',
            titel: '📅 ' + sessionDoc.hostName + ' plant een live',
            bericht: sessionDoc.hostName + ' plant een live: "' + sessionDoc.title + '" op ' + whenStr,
            sessionId: sessionId,
            hostUid: u.uid,
            hostName: sessionDoc.hostName,
            deeplink: '/?pagina=live&aankomend=' + sessionId,
            gelezen: false,
            ts: new Date().toISOString()
          });
          count++;
        });
        if (count > 0) {
          batch.commit()
            .then(function () { log('notified ' + count + ' followers'); })
            .catch(function (e) { log('follower notify batch fail', e && e.message); });
        }
      }).catch(function (e) { log('follower notify skip', e && e.message); });
    } catch (e) { log('followers notify threw', e); }
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
