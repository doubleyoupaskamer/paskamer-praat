/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat — Placements Extension Helper (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Centrale helper voor placement-gating zonder bestaande code te wijzigen.
 * Pluggable via global namespace: window.PP_Placements.
 *
 * Gebruik:
 *   if (PP_Placements.isPlacementEnabled(user, 'stories')) { ... }
 *   if (PP_Placements.isPlacementActive('stories')) { ... } // global flag
 *
 * Backward compatible:
 *   - user.plaatsingen undefined → ALLE placements actief
 *   - user.plaatsingen [] (lege array) → ALLE placements actief
 *   - admin_settings.placements_enabled override (global kill-switch)
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var ALL_PLACEMENTS = [
    'feed',           // bestaand
    'stories',        // nieuw
    'outfit_review',  // nieuw
    'ai_assist',      // nieuw
    'similar_items'   // nieuw
  ];

  // Cache van admin_settings.placements_enabled, refreshed via subscribe
  var _adminPlacements = null;
  var _adminPlacementsTs = 0;
  var ADMIN_CACHE_TTL = 60000; // 60s

  function _normalizeUser(user) {
    return user && typeof user === 'object' ? user : {};
  }

  /**
   * Check of een placement actief is voor een specifieke gebruiker.
   * @param {object} user — Firebase user doc OR { plaatsingen, feature_flags }
   * @param {string} placement — 'feed' | 'stories' | 'outfit_review' | 'ai_assist' | 'similar_items'
   * @returns {boolean}
   */
  function isPlacementEnabled(user, placement) {
    if (ALL_PLACEMENTS.indexOf(placement) === -1) return false;

    // 1. Global admin kill-switch (highest priority)
    if (_adminPlacements && _adminPlacements[placement] === false) return false;

    // 2. Per-user opt-out
    user = _normalizeUser(user);
    var userArr = user.plaatsingen;
    if (Array.isArray(userArr) && userArr.length > 0) {
      return userArr.indexOf(placement) !== -1;
    }

    // 3. Default: ON (backward compat — geen user.plaatsingen = alles aan)
    return true;
  }

  /**
   * Check of een placement globaal actief is (zonder user context).
   * Voor render-decisions die niet per-user variëren (bv. campagne-feed).
   */
  function isPlacementActive(placement) {
    if (ALL_PLACEMENTS.indexOf(placement) === -1) return false;
    if (_adminPlacements && _adminPlacements[placement] === false) return false;
    return true;
  }

  /**
   * Filter een array van campaigns/items op user's enabled placements.
   * @param {array} items — items met .plaatsingen array
   * @param {object} user
   * @returns {array}
   */
  function filterByEnabledPlacements(items, user) {
    if (!Array.isArray(items)) return [];
    return items.filter(function(item) {
      var plaats = item.plaatsingen || [];
      if (!plaats.length) return true; // backward compat
      return plaats.some(function(p) { return isPlacementEnabled(user, p); });
    });
  }

  /**
   * Subscribe op admin_settings/global voor real-time placement updates.
   * Call deze eenmalig bij app-init na Firebase init.
   *
   * Failure-tolerant: bij permission-denied (rules niet gedeployed of
   * anonieme user zonder read access) → silent fallback naar defaults.
   * Geen console warnings — gebruikers hoeven dit niet te zien.
   */
  function subscribeAdminPlacements(firestore) {
    if (!firestore) return;
    try {
      firestore.collection('admin_settings').doc('global').onSnapshot(function(snap) {
        if (snap.exists) {
          var data = snap.data() || {};
          _adminPlacements = data.placements_enabled || null;
          _adminPlacementsTs = Date.now();
        }
      }, function(_err) {
        // Silent: rules zonder admin_settings read = defaults to all-enabled
        _adminPlacements = null;
      });
    } catch(e) {
      // Silent
    }
  }

  /**
   * Eénmalige refresh (zonder real-time listener).
   */
  async function refreshAdminPlacements(firestore) {
    if (!firestore) return;
    if (Date.now() - _adminPlacementsTs < ADMIN_CACHE_TTL) return;
    try {
      var snap = await firestore.collection('admin_settings').doc('global').get();
      if (snap.exists) {
        _adminPlacements = (snap.data() || {}).placements_enabled || null;
        _adminPlacementsTs = Date.now();
      }
    } catch(e) {}
  }

  function getAllPlacements() { return ALL_PLACEMENTS.slice(); }
  function getAdminOverrides() { return _adminPlacements ? Object.assign({}, _adminPlacements) : null; }

  // Expose
  window.PP_Placements = {
    isPlacementEnabled: isPlacementEnabled,
    isPlacementActive:  isPlacementActive,
    filterByEnabledPlacements: filterByEnabledPlacements,
    subscribeAdminPlacements:  subscribeAdminPlacements,
    refreshAdminPlacements:    refreshAdminPlacements,
    getAllPlacements:          getAllPlacements,
    getAdminOverrides:         getAdminOverrides,
    VERSION: '1.0.0'
  };

  // Auto-subscribe als Firebase al klaar staat
  if (window.firebase && window.firebase.firestore) {
    try { subscribeAdminPlacements(window.firebase.firestore()); } catch(e) {}
  }
})();
