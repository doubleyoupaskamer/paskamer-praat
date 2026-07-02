/**
 * PASKAMER PRAAT - Uitgelicht CMS Config Loader (v1.0.0)
 * ------------------------------------------------------
 * Leest de intro-sectie configuratie uit Firestore doc
 *   config/uitgelicht_intro  { enabled: bool, titel: str, tekst: str }
 * en zet deze op `window.PP_UITG_INTRO` zodat pp-feedtabs-v1.js
 * de intro-sectie kan renderen. Backward-compatible: als het doc
 * niet bestaat, worden de defaults uit pp-feedtabs-v1.js gebruikt.
 *
 * v1.0.0 (2026-07-02): initial release
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.PP_UITG_CFG_LOADED) return;
  window.PP_UITG_CFG_LOADED = true;

  function log(msg) { try { console.log('[pp-uitg-cms]', msg); } catch (_) {} }

  function tryLoad() {
    try {
      if (!window.firebase || !window.firebase.firestore) return false;
      var db = window.firebase.firestore();
      db.collection('config').doc('uitgelicht_intro').get()
        .then(function (snap) {
          if (!snap || !snap.exists) { log('geen config doc — defaults gebruiken'); return; }
          var d = snap.data() || {};
          window.PP_UITG_INTRO = {
            enabled: d.enabled !== false,
            titel: typeof d.titel === 'string' ? d.titel : '',
            tekst: typeof d.tekst === 'string' ? d.tekst : ''
          };
          log('config geladen: ' + JSON.stringify(window.PP_UITG_INTRO));
          // Trigger re-render als Uitgelicht al open is
          try {
            var grid = document.getElementById('pp-uitgelicht-grid');
            if (grid && window.PP_FeedTabs && typeof PP_FeedTabs.refresh === 'function') {
              PP_FeedTabs.refresh();
            }
          } catch (_) {}
        })
        .catch(function (err) { log('lees error: ' + (err && err.message)); });
      return true;
    } catch (_) { return false; }
  }

  var attempts = 0;
  var iv = setInterval(function () {
    if (tryLoad() || attempts++ > 20) clearInterval(iv);
  }, 500);
})();
