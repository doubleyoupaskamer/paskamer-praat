// DoubleYou · Realtime Presence Engine v4.0
// Fix: wacht op Firebase Auth voor eerste write
// Fix: heartbeat stopt bij auth-change
// Fix: geen dubbele navigeer-hook met dy-tracking.js

(function() {
'use strict';

var ua = navigator.userAgent;
if (/bot|crawler|spider|scraper|headless|phantom|puppeteer/i.test(ua)) return;

var HEARTBEAT_MS = 12000;
var STALE_MS     = 90000; // 90s stale threshold (admin gebruikt 5min filter)
var GUEST_KEY    = 'dy_guest_id';
var SESSION_KEY  = 'dy_session_id';
var GEO_KEY      = 'dy_geo_cache';
var GEO_TTL      = 21600000; // 6 uur

function mkId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

var _guestId   = (function(){ try { return localStorage.getItem(GUEST_KEY) || (function(){ var v=mkId('gst'); localStorage.setItem(GUEST_KEY,v); return v; })(); } catch(e){ return mkId('gst'); } })();
var _sessionId = (function(){ try { return sessionStorage.getItem(SESSION_KEY) || (function(){ var v=mkId('ses'); sessionStorage.setItem(SESSION_KEY,v); return v; })(); } catch(e){ return mkId('ses'); } })();

var _tzCountryMap = {
  'Europe/Amsterdam':'NL','Europe/Brussels':'BE','Europe/London':'GB','Europe/Paris':'FR',
  'Europe/Berlin':'DE','Europe/Rome':'IT','Europe/Madrid':'ES','Europe/Warsaw':'PL',
  'America/New_York':'US','America/Chicago':'US','America/Los_Angeles':'US','America/Toronto':'CA',
  'Asia/Tokyo':'JP','Asia/Shanghai':'CN','Asia/Singapore':'SG','Australia/Sydney':'AU'
};
var _tz      = (function(){ try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e){ return ''; } })();
var _lang    = navigator.language || '';
var _country = _tzCountryMap[_tz] || (_lang.includes('-') ? _lang.split('-')[1] : '');

var _dev = {
  type:    /Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
  browser: (ua.match(/(Chrome|Firefox|Safari|Edge)\/[\d]+/) || ['?'])[0].split('/')[0],
  os:      /Win/i.test(ua)?'Windows':/Mac/i.test(ua)?'macOS':/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':'Linux',
  pwa:     window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
  screen:  window.screen ? (window.screen.width + 'x' + window.screen.height) : '',
  timezone: _tz,
  lang:    _lang,
  country: _country
};

var _firebaseUid  = null;
var _geoData      = null;
var _geoReady     = false;
var _isAnonymous  = true;
var _displayName  = null;
var _presRef      = null;
var _heartTimer   = null;
var _connectedAt  = Date.now();
var _currentRoute = 'home';
var _actCount     = 0;
var _initialized  = false;
var _firstWrite   = true;

function _auth() { return window.firebase && firebase.auth ? firebase.auth() : null; }
function _db()   { return (window.DY && DY.db) || (window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null); }

// ── Geo helpers ─────────────────────────────────────────────────
function _geoFields() {
  if (_geoData) {
    return {
      country:      _geoData.country      || _dev.country || '',
      country_name: _geoData.country_name || '',
      region:       _geoData.region       || '',
      city:         _geoData.city         || '',
      org:          _geoData.org          || '',
      timezone:     _geoData.timezone     || _tz,
      geo_ready:    true
    };
  }
  return { country: _dev.country||'', country_name:'', region:'', city:'', org:'', timezone:_tz, geo_ready:false };
}

var _geoFetching = false;
function _fetchGeo(cb) {
  try {
    var cached = JSON.parse(localStorage.getItem(GEO_KEY)||'null');
    if (cached && cached.ts && (Date.now()-cached.ts) < GEO_TTL && cached.city) {
      _geoData = cached; _geoReady = true;
      if (window.DY) DY._geoData = _geoData;
      if (cb) cb(_geoData);
      return;
    }
  } catch(e) {}

  if (_geoFetching) { if (cb) setTimeout(function(){ if (_geoData) cb(_geoData); }, 2000); return; }
  _geoFetching = true;

  fetch('https://ipapi.co/json/', { cache: 'no-cache' })
    .then(function(r){ return r.json(); })
    .then(function(d) {
      _geoData = {
        country:      d.country_code   || d.country        || '',
        country_name: d.country_name   || d.country        || '',
        region:       d.region         || d.region_code    || '',
        city:         d.city           || '',
        org:          d.org            || d.asn            || '',
        timezone:     d.timezone       || _tz,
        latitude:     d.latitude       || null,
        longitude:    d.longitude      || null,
        ts: Date.now()
      };
      _geoReady = true;
      try { localStorage.setItem(GEO_KEY, JSON.stringify(_geoData)); } catch(e) {}
      if (window.DY) DY._geoData = _geoData;
      _geoFetching = false;
      if (cb) cb(_geoData);
    })
    .catch(function() {
      _geoData = { country:_country, country_name:'', region:'', city:'', org:'', timezone:_tz, ts:Date.now() };
      _geoReady = true;
      if (window.DY) DY._geoData = _geoData;
      _geoFetching = false;
      if (cb) cb(_geoData);
    });
}

// ── Presence data payload ───────────────────────────────────────
function _data(online) {
  var geo = _geoFields();
  var fsTs = null;
  try { fsTs = firebase.firestore.FieldValue.serverTimestamp(); } catch(e) {}
  return {
    uid:          _firebaseUid,
    guestId:      _isAnonymous ? _guestId : null,
    displayName:  _displayName || (!_isAnonymous && window.DY && DY.profile ? (DY.profile.displayName || DY.profile.naam || null) : null),
    isAnonymous:  _isAnonymous,
    sessionId:    _sessionId,
    connectedAt:  _connectedAt,
    sessionMs:    Date.now() - _connectedAt,
    online:       (online !== false) && (window._dyOnlineZichtbaar !== false),
    lastSeenMs:   Date.now(),
    lastSeen:     fsTs,
    route:        _currentRoute,
    device:       _dev.type,
    browser:      _dev.browser,
    os:           _dev.os,
    pwa:          _dev.pwa,
    screen:       _dev.screen,
    lang:         _dev.lang,
    country:      geo.country,
    country_name: geo.country_name,
    region:       geo.region,
    city:         geo.city,
    org:          geo.org,
    timezone:     geo.timezone,
    geo_ready:    geo.geo_ready,
    activityCount: _actCount
  };
}

// ── Schrijf naar Firestore — alleen als auth klaar is ───────────
function _write(online) {
  var db = _db();
  if (!db || !_firebaseUid) return;

  // Veiligheidscheck: zorg dat de auth uid overeenkomt met _firebaseUid
  var a = _auth();
  if (a && a.currentUser && a.currentUser.uid !== _firebaseUid) return;

  if (!_presRef) _presRef = db.collection('realtime_status').doc(_firebaseUid);

  var payload = _data(online);
  var op;

  if (_firstWrite) {
    _firstWrite = false;
    op = _presRef.set(payload, { merge: true });
  } else {
    var fsTs = null;
    try { fsTs = firebase.firestore.FieldValue.serverTimestamp(); } catch(e) {}
    var heartUpdate = {
      online:        payload.online,
      lastSeenMs:    payload.lastSeenMs,
      lastSeen:      fsTs,
      route:         payload.route,
      sessionMs:     payload.sessionMs,
      activityCount: payload.activityCount,
      country:       payload.country,
      country_name:  payload.country_name,
      region:        payload.region,
      city:          payload.city,
      org:           payload.org,
      timezone:      payload.timezone,
      geo_ready:     payload.geo_ready
    };
    // Voeg displayName toe bij heartbeat zodat naam altijd up-to-date is
    var dn = payload.displayName
      || (!_isAnonymous && window.DY && DY.profile ? (DY.profile.displayName || DY.profile.naam || null) : null);
    if (dn) heartUpdate.displayName = dn;
    op = _presRef.update(heartUpdate);
  }

  op.catch(function(e) {
    if (e.code === 'not-found') { _firstWrite = true; _write(online); return; }
    if (e.code === 'permission-denied') {
      // Anonieme user heeft geen toegang meer — reset en probeer opnieuw na auth
      _firstWrite = true;
    }
  });
}

// ── Heartbeat — stopt automatisch bij _firebaseUid = null ───────
function _startHeartbeat() {
  if (_heartTimer) clearInterval(_heartTimer);
  _heartTimer = setInterval(function() {
    if (!document.hidden && _firebaseUid) _write(true);
  }, HEARTBEAT_MS);
}

function _stopHeartbeat() {
  if (_heartTimer) { clearInterval(_heartTimer); _heartTimer = null; }
}

// ── Route tracking — maar GEEN DY.navigeer override ────────────
// dy-tracking.js doet dit al. Wij luisteren alleen via DY._onNavigeer hook.
// Dit voorkomt dubbele wrapper-chain breuk.
window.DY = window.DY || {};
DY._presenceOnNavigeer = function(pagina) {
  _currentRoute = pagina || 'home';
  if (_firebaseUid) _write(true);
};

// ── Activity counter ────────────────────────────────────────────
['click','keydown','scroll','touchstart'].forEach(function(ev) {
  document.addEventListener(ev, function(){ _actCount++; }, { passive: true, capture: false });
});

document.addEventListener('visibilitychange', function() {
  if (_firebaseUid) _write(!document.hidden);
});
window.addEventListener('beforeunload', function() {
  if (_firebaseUid) _write(false);
});
window.addEventListener('online',  function() { if (_firebaseUid) _write(true);  });
window.addEventListener('offline', function() { if (_firebaseUid) _write(false); });

// ── Anoniem inloggen voor guest presence ────────────────────────
function _anonSignIn() {
  var a = _auth();
  if (!a) { setTimeout(_anonSignIn, 500); return; }

  a.signInAnonymously()
    .then(function(cred) {
      _firebaseUid = cred.user.uid;
      _isAnonymous = true;
      _displayName = null;
      _presRef     = null;
      _firstWrite  = true;
      _currentRoute = (window.DY && DY.pagina) || 'home';
      // Delay geo fetch tot na eerste render — niet blokkeren bij startup
      setTimeout(function() { _fetchGeo(function() { _write(true); }); }, 500);
      _startHeartbeat();
    })
    .catch(function(e) {
    });
}

// ── Hoofd init — wacht op Firebase SDK via polling ───────────────
function _initWithAuth() {
  var a = _auth();
  var db = _db();

  // Wacht tot zowel Auth als Firestore beschikbaar zijn
  if (!a || !db) { setTimeout(_initWithAuth, 300); return; }
  if (_initialized) return;
  _initialized = true;

  a.onAuthStateChanged(function(user) {
    // Stop heartbeat van vorige sessie direct
    _stopHeartbeat();
    _presRef    = null;
    _firstWrite = true;

    if (user) {
      _firebaseUid = user.uid;
      _isAnonymous = user.isAnonymous;
      _displayName = (!user.isAnonymous && window.DY && DY.profile)
        ? (DY.profile.displayName || DY.profile.naam || null)
        : null;
      _currentRoute = (window.DY && DY.pagina) || 'home';

      // Alleen echte users tracken in realtime_status
      // Anonieme users: alleen als er geen echte user is
      _fetchGeo(function() { _write(true); });
      _startHeartbeat();
    } else {
      // Geen user — start anonieme sessie voor guest tracking
      _firebaseUid = null;
      setTimeout(_anonSignIn, 500);
    }
  });
}

// Start pas na DOMContentLoaded zodat Firebase SDK zeker geladen is (defer)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(_initWithAuth, 200);
  });
} else {
  setTimeout(_initWithAuth, 200);
}

// ── Admin cleanup utility ────────────────────────────────────────
window.DY_cleanStalePresence = function(db) {
  var cutoff = Date.now() - STALE_MS;
  db.collection('realtime_status').where('online','==',true).get()
    .then(function(snap) {
      var b = db.batch(); var n = 0;
      snap.docs.forEach(function(d) {
        if ((d.data().lastSeenMs||0) < cutoff) { b.update(d.ref, {online:false}); n++; }
      });
      if (n > 0) b.commit().then(function(){ });
    }).catch(function(){});
};

})();
