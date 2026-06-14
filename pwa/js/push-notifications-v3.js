// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Push Notifications v1
// Subscription flow met segmenten - werkt met bestaande SW push listener
//
// Architectuur:
//  - Geen extra Firebase SDK (bestaande compat SDK heeft geen Messaging),
//    gebruikt standaard Web Push API rechtstreeks via de service worker.
//  - VAPID public key wordt opgehaald uit Firestore: app_config/push.vapid_public
//    (eenmalig in te stellen door admin - geen code-deploy nodig).
//  - Subscription endpoint + keys + voorkeuren worden opgeslagen in Firestore
//    onder users/{uid}/push_subscriptions/{endpointId} (te lezen door backend).
//  - Voorkeuren per segment op users/{uid}.push_voorkeuren - backend honoreert
//    deze bij verzenden via de web-push library.
//
// UI:
//  - Klein bel-icoon onder de FAB (rechtsonder, boven AI-knop)
//  - Niet getoond als browser geen Push API of permission permanent denied
//  - Klik → modal met "Aanzetten" + segment-checkboxes
//
// Non-invasief: bestaande sw.js push/notificationclick listeners blijven werken.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return; // browser ondersteunt Push API niet (oudere iOS Safari < 16.4)
  }

  var BTN_ID    = 'dy-push-btn';
  var MODAL_ID  = 'dy-push-modal';
  var DEFAULT_VOORKEUREN = {
    reacties:   true,
    matchLooks: true,
    dms:        true,
    challenges: true,
    weekly:     false
  };

  var _vapidKey = null;
  var _bezig    = false;

  // ─── Init ───────────────────────────────────────────────────────
  function init() {
    if (!window.DY) { setTimeout(init, 300); return; }
    injectStyles();
    // GEEN eigen bel-FAB meer - entry alleen via hub-menu in feed-card.
    // Ruim eventuele oude FAB-instanties op (uit gecachte JS-versies).
    purgeLegacyBtn();
  }

  function purgeLegacyBtn() {
    // extra-menu-v3.js doet al een interval-purge voor #dy-push-btn.
    // Hier alleen eenmalig opruimen bij init.
    var btn = document.getElementById(BTN_ID);
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }

  // ─── UI: Bel-icoon FAB (gedeactiveerd, kept for backward compat) ──
  function buildBtn() { /* no-op: entry alleen via hub-menu */ }

  // ─── UI: Modal ─────────────────────────────────────────────────
  function buildModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) return m;
    m = document.createElement('div');
    m.id = MODAL_ID;
    m.innerHTML =
      '<div class="dy-push-card" role="dialog" aria-label="Notificaties">' +
        '<button type="button" class="dy-push-close" aria-label="Sluiten">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<div class="dy-push-emoji">🔔</div>' +
        '<h3>Blijf op de hoogte</h3>' +
        '<p class="dy-push-intro">Krijg directe meldingen - kies waarover.</p>' +
        '<div class="dy-push-status" id="dy-push-status"></div>' +
        '<div class="dy-push-opties" id="dy-push-opties">' +
          checkbox('reacties',   'Reacties op mijn posts',         true) +
          checkbox('matchLooks', 'Nieuwe looks/reviews met mijn maat', true) +
          checkbox('dms',        'Privéberichten',                 true) +
          checkbox('challenges', 'Challenges &amp; evenementen',   true) +
          checkbox('weekly',     'Wekelijkse community highlights', false) +
        '</div>' +
        '<div class="dy-push-acties">' +
          '<button type="button" class="dy-push-primair" id="dy-push-aanzetten">Notificaties aanzetten</button>' +
          '<button type="button" class="dy-push-uit" id="dy-push-uitzetten" style="display:none">Uitzetten</button>' +
        '</div>' +
        '<p class="dy-push-hint">Werkt op Android, desktop en iOS 16.4+. Je kunt dit altijd weer uitzetten.</p>' +
      '</div>';
    document.body.appendChild(m);

    m.querySelector('.dy-push-close').onclick = closeModal;
    m.addEventListener('click', function(e) { if (e.target === m) closeModal(); });
    document.getElementById('dy-push-aanzetten').onclick = aanzetten;
    document.getElementById('dy-push-uitzetten').onclick = uitzetten;

    // Voorkeur-checkboxes auto-saven
    m.querySelectorAll('input[data-pref]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        saveVoorkeuren();
      });
    });
    return m;
  }

  function checkbox(key, label, def) {
    return '<label class="dy-push-opt"><input type="checkbox" data-pref="' + key + '" ' +
      (def ? 'checked' : '') + '><span>' + label + '</span></label>';
  }

  async function openModal() {
    if (!DY.user) { try { DY.toonLogin && DY.toonLogin(); } catch (e) {} return; }
    var m = buildModal();
    m.classList.add('open');
    document.body.classList.add('dy-push-lock');

    // Laad bestaande voorkeuren
    try {
      var doc = await DY.db.collection('users').doc(DY.user.uid).get();
      var v = (doc.exists && doc.data().push_voorkeuren) || DEFAULT_VOORKEUREN;
      Object.keys(v).forEach(function(k) {
        var cb = m.querySelector('input[data-pref="' + k + '"]');
        if (cb) cb.checked = !!v[k];
      });
    } catch (e) {}

    // Update status + knoppen op basis van huidige permission
    updateStatus();
  }

  function closeModal() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.classList.remove('open');
    document.body.classList.remove('dy-push-lock');
  }

  function updateStatus() {
    var st = document.getElementById('dy-push-status');
    var aanBtn = document.getElementById('dy-push-aanzetten');
    var uitBtn = document.getElementById('dy-push-uitzetten');
    if (!st) return;
    var perm = Notification.permission;
    if (perm === 'granted') {
      st.innerHTML = '<span class="dy-push-statusdot dy-push-statusdot-aan"></span> Notificaties staan aan';
      st.className = 'dy-push-status dy-push-status-aan';
      aanBtn.style.display = 'none';
      uitBtn.style.display = 'inline-flex';
    } else if (perm === 'denied') {
      st.innerHTML = 'Notificaties zijn geblokkeerd door je browser. Sta ze toe via de site-instellingen.';
      st.className = 'dy-push-status dy-push-status-denied';
      aanBtn.style.display = 'none';
      uitBtn.style.display = 'none';
    } else {
      st.innerHTML = 'Notificaties staan nog uit';
      st.className = 'dy-push-status';
      aanBtn.style.display = 'inline-flex';
      uitBtn.style.display = 'none';
    }
  }

  // ─── VAPID key ophalen ──────────────────────────────────────────
  async function getVapidKey() {
    if (_vapidKey) return _vapidKey;
    try {
      var doc = await DY.db.collection('app_config').doc('push').get();
      if (doc.exists && doc.data().vapid_public) {
        _vapidKey = doc.data().vapid_public;
        return _vapidKey;
      }
    } catch (e) {}
    return null;
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  // ─── Subscribe flow ────────────────────────────────────────────
  async function aanzetten() {
    if (_bezig) return;
    _bezig = true;
    var aanBtn = document.getElementById('dy-push-aanzetten');
    var origText = aanBtn.textContent;
    aanBtn.disabled = true;
    aanBtn.textContent = 'Even geduld…';
    try {
      var vapid = await getVapidKey();
      if (!vapid) {
        alert('Push-notificaties zijn nog niet geconfigureerd. Neem contact op met de beheerder.');
        return;
      }

      // Vraag permissie (browser-prompt)
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        updateStatus();
        return;
      }

      // Subscribe via service worker
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid)
      });

      // Sla op in Firestore: users/{uid}/push_subscriptions/{endpointHash}
      var subJSON = sub.toJSON();
      var hash = await sha1(sub.endpoint);
      await DY.db
        .collection('users').doc(DY.user.uid)
        .collection('push_subscriptions').doc(hash)
        .set({
          endpoint:  subJSON.endpoint,
          keys:      subJSON.keys || {},
          ua:        navigator.userAgent.slice(0, 200),
          aangemaakt: firebase.firestore.FieldValue.serverTimestamp(),
          actief:    true
        }, { merge: true });

      await saveVoorkeuren();
      await testNotificatie();
      updateStatus();

      try {
        if (typeof DY.trackPWAEvent === 'function') DY.trackPWAEvent('push_aangezet', {});
      } catch (e) {}
    } catch (e) {
      alert('Kon notificaties niet aanzetten: ' + (e.message || e));
    } finally {
      aanBtn.disabled = false;
      aanBtn.textContent = origText;
      _bezig = false;
    }
  }

  async function uitzetten() {
    if (_bezig) return;
    _bezig = true;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        var hash = await sha1(sub.endpoint);
        await sub.unsubscribe();
        try {
          await DY.db.collection('users').doc(DY.user.uid)
            .collection('push_subscriptions').doc(hash)
            .set({ actief: false, uitgezetOp: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (e) {}
      }
      // Reset checkboxes uitschakelen niet - voorkeuren blijven bewaard voor evt. terug
      updateStatus();
      try {
        if (typeof DY.trackPWAEvent === 'function') DY.trackPWAEvent('push_uitgezet', {});
      } catch (e) {}
    } catch (e) {
      alert('Kon niet uitzetten: ' + (e.message || e));
    } finally {
      _bezig = false;
    }
  }

  async function saveVoorkeuren() {
    if (!DY.user) return;
    var m = document.getElementById(MODAL_ID);
    if (!m) return;
    var v = {};
    m.querySelectorAll('input[data-pref]').forEach(function(cb) {
      v[cb.dataset.pref] = !!cb.checked;
    });
    try {
      await DY.db.collection('users').doc(DY.user.uid).set({
        push_voorkeuren: v,
        push_voorkeuren_bijgewerkt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {}
  }

  async function testNotificatie() {
    try {
      var reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Notificaties staan aan ✨', {
        body: 'Welkom bij Doubleyou - we houden je op de hoogte.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'pp-welcome',
        requireInteraction: false
      });
    } catch (e) {}
  }

  async function sha1(s) {
    try {
      var buf = new TextEncoder().encode(s);
      var hash = await crypto.subtle.digest('SHA-1', buf);
      return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    } catch (e) {
      // Fallback: simple hash
      var h = 0;
      for (var i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
      return Math.abs(h).toString(16);
    }
  }

  // ─── Styles ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dy-push-styles')) return;
    var s = document.createElement('style');
    s.id = 'dy-push-styles';
    s.textContent = `
#${BTN_ID} {
  position: fixed; bottom: calc(140px + env(safe-area-inset-bottom, 0)); right: 18px;
  z-index: 9997; display: none; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--white, #fefcf5); color: var(--ink, #1e1a0f);
  border: 1px solid var(--border-m, rgba(30,26,15,0.18));
  cursor: pointer; box-shadow: 0 4px 14px rgba(30,26,15,0.18);
  transition: transform .2s ease, background .2s ease;
}
#${BTN_ID}:hover { transform: translateY(-2px); background: var(--warm, #f5edda); }
#${BTN_ID}.dy-push-aan { color: var(--clay-d, #a56605); }
#${BTN_ID}.dy-push-aan::after {
  content: ''; position: absolute; top: 6px; right: 6px;
  width: 9px; height: 9px; border-radius: 50%; background: #1a6b3a;
  border: 2px solid var(--white, #fefcf5);
}

#${MODAL_ID} {
  position: fixed; inset: 0; background: rgba(30,26,15,0.55);
  backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
  z-index: 10002; display: none; align-items: center; justify-content: center;
  padding: var(--sp-4, 1rem);
  animation: dy-push-fade var(--dur-mid, .25s) var(--ease-out, ease);
}
#${MODAL_ID}.open { display: flex; }
@keyframes dy-push-fade { from { opacity: 0; } to { opacity: 1; } }

.dy-push-card {
  position: relative;
  background: var(--cream, #fdf8f0); color: var(--ink, #1e1a0f);
  width: 100%; max-width: 420px;
  max-height: calc(100vh - var(--sp-8, 2rem));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  border-radius: var(--r-xl, 20px);
  padding: var(--sp-8, 2rem) var(--sp-6, 1.5rem) var(--sp-6, 1.5rem);
  box-shadow: 0 16px 48px rgba(30,26,15,0.18), 0 4px 12px rgba(30,26,15,0.08);
  animation: dy-push-slide var(--dur-slow, .42s) var(--ease-out, cubic-bezier(0.23,1,0.32,1));
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
}
@keyframes dy-push-slide { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Clay-glow accent boven in de modal - identiek aan .dy-dsppop-glow */
.dy-push-card::before {
  content: ''; position: absolute; top: -60px; left: 50%; transform: translateX(-50%);
  width: 240px; height: 240px;
  background: radial-gradient(circle, var(--clay-glow, rgba(198,125,6,0.20)) 0%, transparent 70%);
  pointer-events: none; border-radius: 50%; z-index: 0;
}
.dy-push-card > * { position: relative; z-index: 1; }

.dy-push-close {
  position: absolute; top: var(--sp-3, 0.75rem); right: var(--sp-3, 0.75rem);
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--warm, #f5edda); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--ink-muted, #7a6a3a); z-index: 2;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              color var(--dur-fast, .15s) var(--ease-out, ease),
              transform var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.dy-push-close:hover { background: var(--parchment, #e2cfa0); color: var(--ink, #1e1a0f); transform: scale(1.1); }
.dy-push-close:active { transform: scale(0.94); }
.dy-push-close svg { width: 16px; height: 16px; }

.dy-push-emoji { font-size: 40px; text-align: center; margin-bottom: var(--sp-2, 0.5rem); }
.dy-push-card h3 {
  font-size: var(--t-xl, 1.375rem); margin: 0 0 var(--sp-2, 0.5rem);
  text-align: center; font-weight: 700; letter-spacing: -0.01em;
  color: var(--ink, #1e1a0f);
}
.dy-push-intro {
  text-align: center; margin: 0 0 var(--sp-4, 1rem);
  color: var(--ink-soft, #3a3018);
  font-size: var(--t-base, 0.875rem); line-height: 1.55;
}

.dy-push-status {
  font-size: var(--t-sm, 0.75rem);
  margin: var(--sp-3, 0.75rem) 0 var(--sp-4, 1rem);
  padding: var(--sp-2, 0.5rem) var(--sp-3, 0.75rem);
  background: var(--warm, #f5edda); border-radius: var(--r-md, 10px);
  text-align: center;
  color: var(--ink-soft, #3a3018);
  line-height: 1.5;
}
.dy-push-status-aan { background: rgba(26,107,58,0.12); color: var(--success, #1a6b3a); font-weight: 600; }
.dy-push-status-denied { background: rgba(192,57,43,0.10); color: var(--danger, #c0392b); }
.dy-push-statusdot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--ink-muted, #7a6a3a); margin-right: 6px; vertical-align: middle;
}
.dy-push-statusdot-aan { background: var(--success, #1a6b3a); box-shadow: 0 0 0 3px rgba(26,107,58,0.20); }

.dy-push-opties {
  display: flex; flex-direction: column;
  gap: var(--sp-2, 0.5rem);
  margin-bottom: var(--sp-4, 1rem);
}
.dy-push-opt {
  display: flex; align-items: center; gap: var(--sp-3, 0.75rem);
  padding: var(--sp-3, 0.75rem);
  background: var(--white, #fefcf5);
  border: 1px solid var(--border, rgba(30,26,15,0.10));
  border-radius: var(--r-md, 10px);
  font-size: var(--t-base, 0.875rem);
  color: var(--ink, #1e1a0f);
  cursor: pointer;
  transition: border-color var(--dur-fast, .15s) var(--ease-out, ease),
              background var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.dy-push-opt:hover { border-color: var(--clay, #c67d06); background: var(--clay-alpha, rgba(198,125,6,0.10)); }
.dy-push-opt input { accent-color: var(--clay, #c67d06); width: 18px; height: 18px; flex-shrink: 0; cursor: pointer; }

.dy-push-acties { display: flex; gap: var(--sp-3, 0.75rem); justify-content: center; flex-wrap: wrap; }
.dy-push-primair, .dy-push-uit {
  border: none; padding: var(--sp-3, 0.75rem) var(--sp-6, 1.5rem);
  border-radius: var(--r-pill, 100px);
  font-family: inherit; font-weight: 600; font-size: var(--t-base, 0.875rem);
  cursor: pointer;
  display: inline-flex; align-items: center; gap: var(--sp-2, 0.5rem);
  transition: transform var(--dur-fast, .15s) var(--ease-out, ease),
              background var(--dur-fast, .15s) var(--ease-out, ease),
              box-shadow var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.dy-push-primair { background: var(--ink, #1e1a0f); color: var(--white, #fefcf5); }
.dy-push-primair:hover {
  background: var(--clay-d, #a56605); transform: translateY(-1px);
  box-shadow: 0 6px 16px var(--clay-glow, rgba(198,125,6,0.20));
}
.dy-push-primair:active { transform: translateY(0) scale(0.98); }
.dy-push-primair:disabled { opacity: .6; cursor: wait; transform: none; box-shadow: none; }
.dy-push-uit { background: transparent; color: var(--danger, #c0392b); border: 1px solid var(--danger, #c0392b); }
.dy-push-uit:hover { background: rgba(192,57,43,0.08); }
/* WCAG 2.4.7 - focus indicator voor keyboard nav (push modal) */
.dy-push-primair:focus-visible,
.dy-push-uit:focus-visible,
.dy-push-opt:focus-visible {
  outline: 2px solid var(--clay, #c67d06);
  outline-offset: 2px;
}

.dy-push-hint {
  font-size: var(--t-xs, 0.65rem);
  text-align: center; color: var(--ink-muted, #7a6a3a);
  margin: var(--sp-4, 1rem) 0 0; line-height: 1.5;
}

/* Body scroll lock terwijl modal open */
body.dy-push-lock { overflow: hidden !important; touch-action: none; }

/* ═══════════════════════════════════════════════════════════════
   DARK MODE - v43 contrast fix voor push modal
   Zelfde aanpak als AI Style Assistant: alle text-tokens
   expliciet overriden zodat ze contrast houden in dark mode.
   ═══════════════════════════════════════════════════════════════ */
@media (prefers-color-scheme: dark) {
  .dy-push-card {
    background:
      radial-gradient(60% 50% at  0%   0%, rgba(232,185,74,0.18) 0%, rgba(232,185,74,0) 60%),
      radial-gradient(70% 60% at 100% 100%, rgba(198,125,6, 0.22) 0%, rgba(198,125,6, 0) 65%),
      linear-gradient(160deg, #2a2218 0%, #1e1a0f 100%);
    color: #f5edda;
  }
  .dy-push-card h3   { color: #fef5d6; }
  .dy-push-intro     { color: #e8d8a8; }
  .dy-push-status    { color: #e8d8a8; background: rgba(254,237,182,0.08); border: 1px solid rgba(232,185,74,0.22); }
  .dy-push-opt-label { color: #f5edda; }
  .dy-push-opt-desc  { color: #d4c89a; }
  .dy-push-hint      { color: #d4c89a; }
  .dy-push-close {
    background: rgba(254,237,182,0.10);
    color: #d4c89a;
    border: 1px solid rgba(232,185,74,0.28);
  }
  .dy-push-close:hover { background: rgba(232,185,74,0.24); color: #fff5d6; }
  .dy-push-opt { background: rgba(254,237,182,0.06); border-color: rgba(232,185,74,0.22); }
  .dy-push-opt:hover { background: rgba(232,185,74,0.14); border-color: #e8b94a; }
  .dy-push-opt input[type="checkbox"] { accent-color: #e8b94a; }
  .dy-push-uit {
    color: #ff7a6c;
    border-color: rgba(255,122,108,0.55);
  }
  .dy-push-uit:hover { background: rgba(255,122,108,0.12); }
}
`;
    document.head.appendChild(s);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API voor het hub-menu om aan te roepen
  window.DY = window.DY || {};
  window.DY.Push = { open: openModal, close: closeModal };
})();
