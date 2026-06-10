// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — App Badge v1
// Toont rood teller-bolletje op het app-icoon (Android 7+, iOS 16.4+, desktop)
// Som van: ongelezen meldingen + ongelezen DM's
//
// Werking:
//  - Luistert realtime via Firestore op `meldingen` en `gesprekken`
//  - Berekent totaal aantal ongelezen items per gebruiker
//  - Roept navigator.setAppBadge(n) aan (of clearAppBadge wanneer 0)
//  - Werkt 100% non-invasief — naast bestaande DY.controleerMeldingen
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (!('setAppBadge' in navigator)) {
    // Browser ondersteunt Badging API niet (Firefox/Safari < 16.4)
    return;
  }

  var _aantalMeld = 0;
  var _aantalDM   = 0;
  var _unsubMeld  = null;
  var _unsubDM    = null;
  var _laatstUid  = null;

  function totaal() { return _aantalMeld + _aantalDM; }

  function pasBadgeToe() {
    var n = totaal();
    try {
      if (n > 0) navigator.setAppBadge(n).catch(function(){});
      else      (navigator.clearAppBadge || navigator.setAppBadge).call(navigator, 0)
                  .catch(function(){});
    } catch (e) {}
  }

  function start() {
    if (!window.DY || !DY.user || !DY.db || DY.user.uid === _laatstUid) return;
    stop(); // veiligheidshalve vorige listeners stoppen
    _laatstUid = DY.user.uid;

    // ─── Ongelezen meldingen ─────────────────────────────────────
    try {
      _unsubMeld = DY.db.collection('meldingen')
        .where('userId', '==', DY.user.uid)
        .where('gelezen', '==', false)
        .onSnapshot(function(snap) {
          _aantalMeld = snap ? (snap.size || 0) : 0;
          pasBadgeToe();
        }, function() {
          // Fallback zonder composite index
          DY.db.collection('meldingen')
            .where('userId', '==', DY.user.uid)
            .limit(50).get()
            .then(function(snap) {
              _aantalMeld = (snap && snap.docs ? snap.docs : [])
                .filter(function(d) { return d.data().gelezen !== true; }).length;
              pasBadgeToe();
            }).catch(function(){});
        });
    } catch (e) {}

    // ─── Ongelezen DM's ──────────────────────────────────────────
    try {
      _unsubDM = DY.db.collection('gesprekken')
        .where('deelnemers', 'array-contains', DY.user.uid)
        .onSnapshot(function(snap) {
          var n = 0;
          if (snap) snap.forEach(function(doc) {
            var d = doc.data() || {};
            var ongelezen = (d.ongelezen && d.ongelezen[DY.user.uid]) || 0;
            if (typeof ongelezen === 'number' && ongelezen > 0) n += ongelezen;
          });
          _aantalDM = n;
          pasBadgeToe();
        }, function(){});
    } catch (e) {}
  }

  function stop() {
    try { if (_unsubMeld) _unsubMeld(); } catch (e) {}
    try { if (_unsubDM)   _unsubDM();   } catch (e) {}
    _unsubMeld = null; _unsubDM = null;
    _aantalMeld = 0; _aantalDM = 0;
    pasBadgeToe();
    _laatstUid = null;
  }

  // Poll voor login/logout
  setInterval(function() {
    if (!window.DY) return;
    if (DY.user && DY.user.uid) {
      if (DY.user.uid !== _laatstUid) start();
    } else {
      if (_laatstUid) stop();
    }
  }, 1500);
})();
