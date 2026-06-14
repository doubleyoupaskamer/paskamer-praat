// DoubleYou · Centrale Event Tracking Engine v2.0
// Fix: geen dubbele presence engine
// Fix: app_open pas tracken na auth (geen premature flush)
// Fix: DY.navigeer hook triggert ook DY._presenceOnNavigeer

(function() {
'use strict';

var BATCH_SIZE  = 15;
var BATCH_DELAY = 1500;
var MAX_QUEUE   = 200;
var SESSION_KEY = 'dy_session_id';

// ── Session ID ─────────────────────────────────────────────────
function getSessionId() {
  try {
    var sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch(e) {
    return 'ses_' + Date.now().toString(36);
  }
}

// ── Device info ────────────────────────────────────────────────
var _deviceInfo = (function() {
  var ua = navigator.userAgent;
  return {
    type:     /Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    browser:  (ua.match(/(Chrome|Firefox|Safari|Edge)\/[\d.]+/) || ['unknown'])[0],
    platform: navigator.platform || 'unknown',
    lang:     navigator.language || 'nl',
    sw:       'serviceWorker' in navigator,
    pwa:      window.matchMedia('(display-mode: standalone)').matches
  };
})();

var _queue      = [];
var _flushing   = false;
var _flushTimer = null;
var _sessionId  = getSessionId();
var _authReady  = false;

window.DY = window.DY || {};

// ── Kern trackEvent ────────────────────────────────────────────
DY.trackEvent = function(opts) {
  if (!opts || !opts.type) return;

  // Deduplicatie: skip identieke events binnen 1 seconde
  var now = Date.now();
  var key = opts.type + '_' + (opts.targetId || '') + '_' + (opts.userId || '');
  if (DY._lastEvent && DY._lastEvent.key === key && now - DY._lastEvent.ts < 1000) return;
  DY._lastEvent = { key: key, ts: now };

  var _geo = (DY._geoData) ? {
    country:      DY._geoData.country      || '',
    country_name: DY._geoData.country_name || '',
    region:       DY._geoData.region       || '',
    city:         DY._geoData.city         || '',
    timezone:     DY._geoData.timezone     || ''
  } : null;

  var currentUid = null;
  try { currentUid = firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid; } catch(e) {}

  // Verrijk metadata met displayName voor admin naam-weergave (voorkomt extra Firestore query)
  var _displayName = null;
  try {
    _displayName = (DY.profile && (DY.profile.displayName || DY.profile.naam)) ||
                   (firebase.auth && firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous
                     ? (firebase.auth().currentUser.displayName || null)
                     : null);
  } catch(e) {}

  var event = {
    type:        opts.type,
    category:    opts.category  || 'gebruiker',
    userId:      opts.userId    || currentUid || (DY.user && DY.user.uid) || null,
    displayName: _displayName,
    targetId:    opts.targetId  || null,
    metadata:    opts.metadata  || {},
    sessionId:   _sessionId,
    deviceInfo:  _deviceInfo,
    geo:         _geo,
    route:       DY.pagina      || 'onbekend',
    timestamp:   now,
    source:      opts.source    || 'app'
  };

  _queue.push(event);
  if (_queue.length > MAX_QUEUE) _queue.shift();

  // Kritieke events direct flushen
  var kritiek = ['error','crash','auth_fail','install'];
  if (kritiek.indexOf(opts.type) !== -1) {
    _flushNow();
  } else if (_authReady) {
    // Alleen flushen als auth klaar is - voorkomt premature writes
    _scheduleFlush();
  }
  // Vóór auth: events stapelen in _queue, flush zodra auth klaar is
};

// ── Flush logica ────────────────────────────────────────────────
function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(_flushNow, BATCH_DELAY);
}

function _flushNow() {
  clearTimeout(_flushTimer);
  _flushTimer = null;
  if (_flushing || _queue.length === 0) return;
  if (!window.firebase || !DY.db) return;

  // Controleer auth - schrijf alleen als er een Firebase user is (anoniem of echt)
  var currentUser = null;
  try { currentUser = firebase.auth && firebase.auth().currentUser; } catch(e) {}
  if (!currentUser) { _scheduleFlush(); return; }

  _flushing = true;
  var batch_events = _queue.splice(0, BATCH_SIZE);
  var batch = DY.db.batch();
  var ref   = DY.db.collection('activity_logs');

  batch_events.forEach(function(ev) { batch.set(ref.doc(), ev); });

  batch.commit()
    .catch(function(err) {
      // Bij fout: zet events terug voor retry
      _queue.unshift.apply(_queue, batch_events);
    })
    .finally(function() {
      _flushing = false;
      if (_queue.length > 0) _scheduleFlush();
    });
}

// ── DY.navigeer hook - eenmalig, triggert ook presence ─────────
var _navigeerHooked = false;
function _hookNavigeer() {
  if (_navigeerHooked || !DY.navigeer) return;
  _navigeerHooked = true;

  var _origNavigeer = DY.navigeer;
  DY.navigeer = function(pagina) {
    // 1. Roep originele navigeer aan
    var result = _origNavigeer.apply(this, arguments);
    // 2. Track navigatie event
    DY.trackEvent({ type: 'navigeer', category: 'navigatie', targetId: pagina });
    // 3. Informeer presence engine (geen dubbele hook nodig)
    if (typeof DY._presenceOnNavigeer === 'function') DY._presenceOnNavigeer(pagina);
    return result;
  };
}

// ── Functie hooks voor engagement tracking ──────────────────────
function _hookEventFunctions() {
  // Like
  var origLike = DY.reelToggleLike;
  if (origLike && !origLike._tracked) {
    DY.reelToggleLike = function(btn, docId) {
      DY.trackEvent({ type: 'like', category: 'engagement', targetId: docId });
      return origLike.call(this, btn, docId);
    };
    DY.reelToggleLike._tracked = true;
  }

  // Reactie plaatsen
  var origReactie = DY.plaatsReactie;
  if (origReactie && !origReactie._tracked) {
    DY.plaatsReactie = function() {
      DY.trackEvent({ type: 'reactie', category: 'engagement' });
      return origReactie.apply(this, arguments);
    };
    DY.plaatsReactie._tracked = true;
  }

  // Volgen
  var origVolg = DY.toggleVolgen;
  if (origVolg && !origVolg._tracked) {
    DY.toggleVolgen = function(uid) {
      DY.trackEvent({ type: 'volgen', category: 'sociaal', targetId: uid });
      return origVolg.apply(this, arguments);
    };
    DY.toggleVolgen._tracked = true;
  }

  // Verhaal plaatsen
  var origPlaats = DY.plaatsVerhaal;
  if (origPlaats && !origPlaats._tracked) {
    DY.plaatsVerhaal = function() {
      DY.trackEvent({ type: 'verhaal_plaatsen', category: 'content' });
      return origPlaats.apply(this, arguments);
    };
    DY.plaatsVerhaal._tracked = true;
  }

  // DM versturen
  var origDM = DY._verstuurDM;
  if (origDM && !origDM._tracked) {
    DY._verstuurDM = function() {
      DY.trackEvent({ type: 'dm_versturen', category: 'berichten' });
      return origDM.apply(this, arguments);
    };
    DY._verstuurDM._tracked = true;
  }

  // Overlay openen
  var origOverlay = DY._openDetailOverlay;
  if (origOverlay && !origOverlay._tracked) {
    DY._openDetailOverlay = async function(id) {
      DY.trackEvent({ type: 'overlay_open', category: 'engagement', targetId: id });
      return origOverlay.apply(this, arguments);
    };
    DY._openDetailOverlay._tracked = true;
  }

  // DSP punten verdienen
  var origGeefPunten = DY.geefPunten;
  if (origGeefPunten && !origGeefPunten._tracked) {
    DY.geefPunten = async function(actieKey, extraData) {
      DY.trackEvent({ type: 'dsp_verdienen', category: 'dsp', targetId: actieKey, metadata: { actie: actieKey } });
      return origGeefPunten.apply(this, arguments);
    };
    DY.geefPunten._tracked = true;
  }

  // Navigeer hook - nu pas, nadat DY.navigeer zeker beschikbaar is
  _hookNavigeer();
}

// ── Error tracking ─────────────────────────────────────────────
window.addEventListener('error', function(e) {
  DY.trackEvent({
    type: 'js_error', category: 'systeem',
    metadata: { message: e.message||'', filename: e.filename||'', lineno: e.lineno||0, colno: e.colno||0 },
    source: 'window.onerror'
  });
});

window.addEventListener('unhandledrejection', function(e) {
  DY.trackEvent({
    type: 'promise_rejection', category: 'systeem',
    metadata: { reason: String(e.reason).slice(0, 200) },
    source: 'unhandledrejection'
  });
});

// ── onAuthReady hook ────────────────────────────────────────────
var _origOnAuthReady = DY.onAuthReady;
DY.onAuthReady = function(user) {
  if (_origOnAuthReady) _origOnAuthReady.call(DY, user);

  _authReady = true;

  if (user && !user.isAnonymous) {
    // app_open nu tracken - auth is klaar, write zal slagen
    DY.trackEvent({
      type: 'app_open', category: 'sessie',
      metadata: { referrer: document.referrer || 'direct', uid: user.uid },
      source: 'init'
    });
    DY.trackEvent({ type: 'login', category: 'auth', metadata: { uid: user.uid } });
  } else {
    DY.trackEvent({
      type: 'app_open', category: 'sessie',
      metadata: { referrer: document.referrer || 'direct' },
      source: 'init'
    });
    DY.trackEvent({ type: 'gast_sessie', category: 'auth' });
  }

  // Flush alle gebufferde events
  setTimeout(_flushNow, 500);
  setTimeout(_hookEventFunctions, 800);
};

// ── Flush bij page hide ─────────────────────────────────────────
document.addEventListener('visibilitychange', function() {
  if (document.hidden) _flushNow();
});
window.addEventListener('beforeunload', function() { _flushNow(); });

})();
