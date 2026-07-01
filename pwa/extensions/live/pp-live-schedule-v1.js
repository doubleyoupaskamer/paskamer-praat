/**
 * PASKAMER PRAAT Scheduled Live module (additief)
 * -----------------------------------------------------------------
 * Non-breaking. Bouwt bovenop pp-live-tab-v1.js + pp-live-start-v1.js.
 *
 * Verantwoordelijkheden:
 *   1. Aparte Firestore-subscription voor `status == 'scheduled'` sessies
 *      (min heden, max +7 dagen).
 *   2. Rendert de "AANKOMEND" sectie boven de LIVE-grid in de live-page.
 *   3. Countdown-updater per card (1s <1u, 30s <24u, 5min anders).
 *   4. Reminder-subscribe knop (opt-in T-15 push voor kijkers).
 *   5. Host-only controls op eigen kaart: "Ga nu live" (5 min voor tijd
 *      beschikbaar) en "Annuleren".
 *
 * Global namespace: window.PP_Live (shared met andere live-modules)
 */
(function () {
  'use strict';

  var VERSION = 'v1.0.0';
  var TAG = '[live-schedule]';
  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }

  var PP_Live = window.PP_Live = window.PP_Live || {};

  function db() {
    try {
      return (window.DY && DY.db) || (window.firebase && firebase.firestore ? firebase.firestore() : null);
    } catch (_) { return null; }
  }
  function auth() {
    try { return window.firebase && firebase.auth ? firebase.auth() : null; } catch (_) { return null; }
  }
  function currentUser() {
    var a = auth(); return (a && a.currentUser) ? a.currentUser : null;
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var state = {
    unsubscribe: null,
    docs: [],
    countdownTimer: null,
    reminderCache: {} // { sessionId: true/false }  optimistic
  };

  PP_Live._scheduled = state;

  // ───────────── Countdown formatting ─────────────
  function padStart(str, len, pad) {
    str = String(str);
    while (str.length < len) str = pad + str;
    return str;
  }
  function formatCountdown(targetMs, nowMs) {
    var diff = targetMs - nowMs;
    if (diff <= 0) return { text: 'begint nu', urgent: true };
    var s = Math.floor(diff / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600);  s %= 3600;
    var m = Math.floor(s / 60);
    var sec = s % 60;
    if (d > 0) return { text: d + 'd ' + h + 'u ' + m + 'm', urgent: false };
    if (h > 0) return { text: h + ':' + padStart(m, 2, '0') + ':' + padStart(sec, 2, '0'), urgent: h < 1 };
    return { text: padStart(m, 2, '0') + ':' + padStart(sec, 2, '0'), urgent: true };
  }
  function formatDutchDatetime(d) {
    var dagen = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
    var vandaag = new Date(); vandaag.setHours(0,0,0,0);
    var morgen  = new Date(vandaag.getTime() + 86400000);
    var target  = new Date(d);  target.setHours(0,0,0,0);
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var tijd = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (target.getTime() === vandaag.getTime()) return 'Vandaag ' + tijd;
    if (target.getTime() === morgen.getTime())  return 'Morgen ' + tijd;
    var diffDays = Math.round((target.getTime() - vandaag.getTime()) / 86400000);
    var dag = dagen[d.getDay()];
    var kap = dag.charAt(0).toUpperCase() + dag.slice(1);
    if (diffDays > 0 && diffDays < 7) return kap + ' ' + tijd;
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + tijd;
  }

  // ───────────── Firestore subscription ─────────────
  function subscribeScheduled() {
    var f = db();
    if (!f) return setTimeout(subscribeScheduled, 1000);
    if (state.unsubscribe) return; // already subscribed
    try {
      var now = new Date();
      var maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      var q = f.collection('live_sessions')
        .where('status', '==', 'scheduled')
        .where('scheduledFor', '>=', firebase.firestore.Timestamp.fromDate(now))
        .where('scheduledFor', '<=', firebase.firestore.Timestamp.fromDate(maxDate))
        .orderBy('scheduledFor', 'asc')
        .limit(50);

      state.unsubscribe = q.onSnapshot(function (snap) {
        state.docs = [];
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          d._id = doc.id;
          state.docs.push(d);
        });
        log('scheduled snap', state.docs.length);
        renderSection();
      }, function (err) {
        log('scheduled sub err', err && err.message);
        // Retry na 5s bij transient errors
        state.unsubscribe = null;
        setTimeout(subscribeScheduled, 5000);
      });
    } catch (e) { log('subscribe threw', e); }
  }

  function stopSubscription() {
    try { if (typeof state.unsubscribe === 'function') state.unsubscribe(); } catch (_) {}
    state.unsubscribe = null;
  }
  PP_Live._stopScheduledSub = stopSubscription;

  // ───────────── Render "AANKOMEND" section ─────────────
  function findAnchor() {
    // Zoek de live-page container en de grid-container erin
    var page = document.querySelector('[data-testid="live-page"]');
    if (!page) return null;
    var grid = page.querySelector('[data-testid="live-grid"]') || page.querySelector('.pp-live-grid');
    return { page: page, grid: grid };
  }

  function renderSection() {
    var anchor = findAnchor();
    if (!anchor) return; // live page nog niet gerenderd, subscribeGrid draait wel weer

    var existing = document.getElementById('pp-live-scheduled-section');

    // Als er geen scheduled sessies zijn → sectie verwijderen
    if (!state.docs.length) {
      if (existing) existing.remove();
      stopCountdown();
      return;
    }

    // Bouw HTML
    var cardsHtml = state.docs.map(cardHtml).join('');
    var html =
      '<section class="pp-live-scheduled" id="pp-live-scheduled-section" data-testid="live-scheduled-section">' +
        '<div class="pp-live-scheduled-header">' +
          '<h3 class="pp-live-scheduled-title">📅 Aankomend</h3>' +
          '<span class="pp-live-scheduled-count">' + state.docs.length + ' gepland</span>' +
        '</div>' +
        '<div class="pp-live-scheduled-grid">' + cardsHtml + '</div>' +
      '</section>';

    if (existing) {
      existing.outerHTML = html;
    } else {
      // Injecteer VÓÓR de "LIVE NU" grid
      if (anchor.grid) {
        anchor.grid.insertAdjacentHTML('beforebegin', html);
      } else {
        anchor.page.insertAdjacentHTML('beforeend', html);
      }
    }

    wireCardHandlers();
    startCountdown();
  }

  function cardHtml(s) {
    var when = s.scheduledFor && s.scheduledFor.toDate ? s.scheduledFor.toDate() : new Date(s.scheduledFor);
    var whenStr = formatDutchDatetime(when);
    var initial = (s.hostName || '?').replace(/^@/, '').charAt(0).toUpperCase();
    var u = currentUser();
    var isHost = u && s.hostUid === u.uid;
    // "Ga nu live" beschikbaar 5 min voor scheduledFor
    var minutesUntil = (when.getTime() - Date.now()) / 60000;
    var canGoLiveNow = isHost && minutesUntil <= 5;

    return '' +
      '<article class="pp-live-scheduled-card" data-session-id="' + escapeHtml(s._id) + '" ' +
        'data-scheduled-for="' + when.getTime() + '" data-testid="live-scheduled-card">' +
        '<div class="pp-live-scheduled-card-media">' +
          '<div class="pp-live-scheduled-card-emoji" aria-hidden="true">📡</div>' +
          '<div class="pp-live-scheduled-card-badge">AANKOMEND</div>' +
        '</div>' +
        '<div class="pp-live-scheduled-card-body">' +
          '<div class="pp-live-scheduled-card-host">' +
            '<div class="pp-live-scheduled-card-avatar" aria-hidden="true">' + escapeHtml(initial) + '</div>' +
            '<span class="pp-live-scheduled-card-hostname">' + escapeHtml(s.hostName || '@onbekend') + '</span>' +
          '</div>' +
          '<h4 class="pp-live-scheduled-card-title">' + escapeHtml(s.title || 'Live sessie') + '</h4>' +
          '<div class="pp-live-scheduled-card-when">' +
            '<span class="pp-live-scheduled-card-when-icon">🕒</span>' +
            '<span class="pp-live-scheduled-card-when-text">' + escapeHtml(whenStr) + '</span>' +
          '</div>' +
          '<div class="pp-live-scheduled-card-countdown" data-cd data-testid="live-countdown">' +
            '<span class="pp-live-scheduled-card-countdown-text">…</span>' +
          '</div>' +
          '<div class="pp-live-scheduled-card-actions">' +
            (isHost
              ? (canGoLiveNow
                  ? '<button type="button" class="pp-live-scheduled-btn pp-live-scheduled-btn-primary" data-action="go-live" data-testid="live-scheduled-go-now">🔴 Ga nu live</button>'
                  : '<button type="button" class="pp-live-scheduled-btn pp-live-scheduled-btn-primary" data-action="go-live" disabled title="Beschikbaar vanaf 5 min voor start">🔴 Ga nu live</button>'
                ) +
                '<button type="button" class="pp-live-scheduled-btn pp-live-scheduled-btn-ghost" data-action="cancel" data-testid="live-scheduled-cancel">Annuleer</button>'
              : '<button type="button" class="pp-live-scheduled-btn pp-live-scheduled-btn-primary" data-action="reminder" data-testid="live-scheduled-reminder">🔔 Herinner mij</button>'
            ) +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function wireCardHandlers() {
    var cards = document.querySelectorAll('#pp-live-scheduled-section .pp-live-scheduled-card');
    cards.forEach(function (card) {
      if (card.__ppWired) return;
      card.__ppWired = true;
      var sid = card.getAttribute('data-session-id');
      card.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          if (action === 'reminder') toggleReminder(sid, btn);
          else if (action === 'go-live') goLiveNow(sid, btn);
          else if (action === 'cancel') cancelScheduled(sid, btn);
        });
      });
      // Voor kijkers: check huidige reminder-status (async, fail-silent)
      var u = currentUser();
      if (u && !u.isAnonymous) refreshReminderState(sid, card);
    });
  }

  // ───────────── Countdown updater ─────────────
  function stopCountdown() {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
  }
  function startCountdown() {
    stopCountdown();
    var tick = function () {
      var section = document.getElementById('pp-live-scheduled-section');
      if (!section) { stopCountdown(); return; }
      var now = Date.now();
      var cards = section.querySelectorAll('.pp-live-scheduled-card');
      var nextInterval = 5 * 60 * 1000; // default: 5 min
      cards.forEach(function (card) {
        var t = parseInt(card.getAttribute('data-scheduled-for'), 10);
        if (!t) return;
        var cd = formatCountdown(t, now);
        var el = card.querySelector('[data-cd] .pp-live-scheduled-card-countdown-text');
        if (el) el.textContent = cd.text;
        var cdWrap = card.querySelector('[data-cd]');
        if (cdWrap) cdWrap.classList.toggle('pp-live-scheduled-card-cd-urgent', cd.urgent);
        var diff = t - now;
        if (diff < 60 * 60 * 1000) nextInterval = Math.min(nextInterval, 1000);
        else if (diff < 24 * 60 * 60 * 1000) nextInterval = Math.min(nextInterval, 30 * 1000);
      });
      // Herstel interval indien nodig
      if (state._interval !== nextInterval) {
        state._interval = nextInterval;
        stopCountdown();
        state.countdownTimer = setInterval(tick, nextInterval);
      }
    };
    tick(); // immediate first paint
    state._interval = null; // force interval-set in first tick
  }

  // ───────────── Reminder subscribe / unsubscribe ─────────────
  function refreshReminderState(sessionId, card) {
    var f = db(); var u = currentUser();
    if (!f || !u || u.isAnonymous) return;
    f.collection('live_sessions').doc(sessionId).collection('reminders').doc(u.uid).get()
      .then(function (doc) {
        var subscribed = doc.exists;
        state.reminderCache[sessionId] = subscribed;
        var btn = card.querySelector('[data-action="reminder"]');
        if (btn) updateReminderBtn(btn, subscribed);
      }).catch(function () {});
  }
  function updateReminderBtn(btn, subscribed) {
    if (subscribed) {
      btn.textContent = '✓ Herinnering aan';
      btn.classList.add('pp-live-scheduled-btn-active');
    } else {
      btn.textContent = '🔔 Herinner mij';
      btn.classList.remove('pp-live-scheduled-btn-active');
    }
  }

  function toggleReminder(sessionId, btn) {
    var u = currentUser();
    if (!u || u.isAnonymous) {
      try { if (window.DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Log in om een reminder te krijgen voor deze live.'); } catch (_) {}
      return;
    }
    var f = db(); if (!f) return;
    btn.disabled = true;
    var subscribed = !!state.reminderCache[sessionId];
    var newVal = !subscribed;
    var reminderRef = f.collection('live_sessions').doc(sessionId).collection('reminders').doc(u.uid);
    var sessionRef  = f.collection('live_sessions').doc(sessionId);
    var op = newVal
      ? reminderRef.set({
          uid: u.uid,
          subscribedAt: firebase.firestore.FieldValue.serverTimestamp(),
          notified15min: false,
          notifiedStart: false
        }).then(function () {
          return sessionRef.update({ reminderCount: firebase.firestore.FieldValue.increment(1) });
        })
      : reminderRef.delete().then(function () {
          return sessionRef.update({ reminderCount: firebase.firestore.FieldValue.increment(-1) });
        });

    op.then(function () {
      state.reminderCache[sessionId] = newVal;
      updateReminderBtn(btn, newVal);
      try {
        if (window.DY && DY.toastSucces) DY.toastSucces(newVal ? 'Reminder aan 🔔' : 'Reminder uit');
      } catch (_) {}
    }).catch(function (e) {
      log('reminder toggle fail', e && e.message);
      try { if (window.DY && DY.toastFout) DY.toastFout('Kon reminder niet aanpassen'); } catch (_) {}
    }).then(function () { btn.disabled = false; });
  }

  // ───────────── Host: Ga nu live (scheduled → live transition) ─────────────
  function goLiveNow(sessionId, btn) {
    var u = currentUser(); if (!u) return;
    var f = db(); if (!f) return;
    btn.disabled = true;
    btn.textContent = 'Bezig…';
    f.collection('live_sessions').doc(sessionId).update({
      status: 'live',
      startedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      // Open player (host preview)
      try { if (PP_Live.openPlayer) PP_Live.openPlayer(sessionId); } catch (_) {}
      // Vraag camera + koppel aan player video
      if (PP_Live.openStartSheet) {
        // De start-sheet requestCamera helper is niet direct herbruikbaar buiten
        // de sheet. Trigger een simpele getUserMedia hier zodat host direct z'n
        // camera ziet in de player.
        try {
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 } }, audio: false
          }).then(function (stream) {
            var v = document.getElementById('pp-live-player-video');
            var emo = document.getElementById('pp-live-player-emoji');
            if (v) { v.srcObject = stream; v.style.display = ''; v.muted = true; v.play().catch(function(){}); }
            if (emo) emo.style.display = 'none';
          }).catch(function () { /* camera denied player toont pulse */ });
        } catch (_) {}
      }
    }).catch(function (e) {
      log('go-live-now failed', e && e.message);
      btn.disabled = false;
      btn.textContent = '🔴 Ga nu live';
      try { if (window.DY && DY.toastFout) DY.toastFout('Kon live niet starten: ' + (e && e.message || 'fout')); } catch (_) {}
    });
  }

  // ───────────── Host: Annuleer geplande live ─────────────
  function cancelScheduled(sessionId, btn) {
    if (!confirm('Weet je zeker dat je deze geplande live wil annuleren? Aangemelde kijkers krijgen een melding.')) return;
    var u = currentUser(); if (!u) return;
    var f = db(); if (!f) return;
    btn.disabled = true;
    btn.textContent = 'Annuleren…';
    f.collection('live_sessions').doc(sessionId).update({
      status: 'cancelled',
      endedAt: firebase.firestore.FieldValue.serverTimestamp(),
      endedReason: 'host_cancelled'
    }).then(function () {
      try { if (window.DY && DY.toastSucces) DY.toastSucces('Geplande live geannuleerd'); } catch (_) {}
      // Cron worker verstuurt cancel-notificaties naar subscribers
    }).catch(function (e) {
      log('cancel failed', e && e.message);
      btn.disabled = false;
      btn.textContent = 'Annuleer';
      try { if (window.DY && DY.toastFout) DY.toastFout('Annuleren mislukt'); } catch (_) {}
    });
  }

  // ───────────── Init: haak in op renderLivePage ─────────────
  function init() {
    subscribeScheduled();
    // Observe DOM changes zodat we ook rerender wanneer de live-page opnieuw wordt gemount
    try {
      var mo = new MutationObserver(function () {
        if (state.docs && state.docs.length && document.querySelector('[data-testid="live-page"]')) {
          if (!document.getElementById('pp-live-scheduled-section')) {
            renderSection();
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

  log('init', VERSION);
})();
