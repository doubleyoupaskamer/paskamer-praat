/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - PWA Install Manager (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ÉÉN centrale beheerlaag voor PWA installatiestatus + popups op alle
 * platforms (Android Chrome, iOS Safari, Desktop Chrome/Edge).
 *
 * Lost specifiek op: "Installeer Doubleyou" popup blijft tonen op
 * desktop Chrome terwijl de PWA al geïnstalleerd is in een ander tab.
 *
 * Strategie (defensief & additief, breekt niets):
 *   1. Detecteer "app geïnstalleerd" via 5 methodes (best-of-all):
 *      - navigator.getInstalledRelatedApps() (Chrome desktop+Android)
 *      - display-mode media queries (standalone/minimal-ui/fullscreen/wco)
 *      - navigator.standalone (iOS Safari)
 *      - localStorage flag dy_pwa_geinstalleerd
 *      - referrer "android-app://"
 *   2. Als geïnstalleerd: zet localStorage flag PERMANENT + hide beide
 *      popup-systemen (inline #dy-install-banner + bottom-sheet #dy-a2hs-prompt).
 *   3. MutationObserver vangt popups die toch nog opduiken na detectie.
 *   4. Re-check elke 5s en bij focus/visibilitychange als gebruiker tab
 *      switcht naar de geïnstalleerde PWA en terug, status updaten.
 *
 * NIETS gewijzigd aan bestaande inline-banner of a2hs-prompt scripts.
 * Beide blijven werkend voor first-time gebruikers; deze manager voegt
 * alleen een suppression-laag toe wanneer detectie aangeeft dat de app
 * al geïnstalleerd is.
 *
 * Public API: window.DY.installManager
 *   .getStatus()      → 'installed' | 'available' | 'dismissed' | 'unsupported'
 *   .markInstalled()  → handmatig forceren
 *   .hidePopups()     → handmatig sluiten
 *   .recheck()        → opnieuw detecteren
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_InstallManager) return;

  var STORAGE_INSTALLED = 'dy_pwa_geinstalleerd';
  var STORAGE_DISMISS_V3 = 'dy_install_v3';
  var STORAGE_DISMISS_LEGACY = 'dy_a2hs_dismissed_at';
  var POPUP_IDS = ['dy-install-banner', 'dy-a2hs-prompt'];

  var _state = {
    installed: false,
    checked:   false,
    method:    null,
    related:   null // resultaat getInstalledRelatedApps
  };

  // ───────── Detectie helpers ─────────
  function checkDisplayMode() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return 'display-mode:standalone';
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'display-mode:minimal-ui';
      if (window.matchMedia('(display-mode: fullscreen)').matches) return 'display-mode:fullscreen';
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return 'display-mode:wco';
    } catch (e) {}
    return null;
  }

  function checkNavigatorStandalone() {
    try {
      if (window.navigator && window.navigator.standalone === true) return 'navigator.standalone';
    } catch (e) {}
    return null;
  }

  function checkAndroidReferrer() {
    try {
      if (document.referrer && document.referrer.indexOf('android-app://') === 0) return 'android-app-referrer';
    } catch (e) {}
    return null;
  }

  function checkLocalStorageFlag() {
    try {
      if (localStorage.getItem(STORAGE_INSTALLED) === '1') return 'localStorage';
    } catch (e) {}
    return null;
  }

  // navigator.getInstalledRelatedApps() Chrome desktop + Android only.
  // Detecteert of de PWA elders (in standalone-window) is geïnstalleerd
  // ook al zit user nu in een gewone browser-tab.
  function checkRelatedApps() {
    return new Promise(function (resolve) {
      try {
        if (navigator && typeof navigator.getInstalledRelatedApps === 'function') {
          navigator.getInstalledRelatedApps().then(function (apps) {
            _state.related = apps || [];
            if (apps && apps.length > 0) {
              resolve('getInstalledRelatedApps:' + apps.length);
            } else {
              resolve(null);
            }
          }).catch(function () { resolve(null); });
        } else {
          resolve(null);
        }
      } catch (e) { resolve(null); }
    });
  }

  function markInstalledPersistent(reason) {
    _state.installed = true;
    _state.method = reason || _state.method || 'manual';
    try { localStorage.setItem(STORAGE_INSTALLED, '1'); } catch (e) {}
    try { localStorage.setItem(STORAGE_DISMISS_V3, '1'); } catch (e) {}
    try { localStorage.setItem(STORAGE_DISMISS_LEGACY, String(Date.now())); } catch (e) {}
  }

  function hidePopups() {
    POPUP_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      try {
        el.style.display = 'none';
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.classList.remove('show', 'dy-install-slide-in');
        el.setAttribute('aria-hidden', 'true');
        if (id === 'dy-a2hs-prompt') {
          // bottom-sheet is dynamisch toegevoegd → veilig verwijderen
          try { el.remove(); } catch (e) {}
        }
      } catch (e) {}
    });
  }

  // ───────── Hoofd-detectie ─────────
  function runDetection() {
    // Stap 1: hard sync-checks (display-mode, navigator.standalone, referrer)
    // → DIRECT installed als één matcht
    var hardSync = checkDisplayMode() || checkNavigatorStandalone() || checkAndroidReferrer();
    if (hardSync) {
      markInstalledPersistent(hardSync);
      hidePopups();
      _state.checked = true;
      return Promise.resolve(_state);
    }
    // Stap 2: async getInstalledRelatedApps (authoritative voor desktop Chrome+Android)
    return checkRelatedApps().then(function (rel) {
      if (rel) {
        markInstalledPersistent(rel);
        hidePopups();
        _state.checked = true;
        return _state;
      }
      // Stap 3: als noch hardSync, noch getInstalledRelatedApps → app is NIET
      // geïnstalleerd in dit profiel. Een eerder gezette localStorage-flag
      // is daarmee STALE (bv. app gedeïnstalleerd, of andere browser-profiel).
      // We clearen die flag zodat de install-button weer kan verschijnen.
      try {
        // Alleen clearen als API beschikbaar is anders kunnen we niet
        // betrouwbaar zeggen dat hij niet geïnstalleerd is.
        if (typeof navigator !== 'undefined' &&
            typeof navigator.getInstalledRelatedApps === 'function') {
          if (localStorage.getItem(STORAGE_INSTALLED) === '1') {
            localStorage.removeItem(STORAGE_INSTALLED);
          }
        } else {
          // Geen related-apps API → respecteer localStorage flag als hint
          if (checkLocalStorageFlag()) {
            markInstalledPersistent('localStorage-fallback');
            hidePopups();
          }
        }
      } catch (e) {}
      _state.checked = true;
      return _state;
    });
  }

  // ───────── Popup-watcher ─────────
  // Mocht een popup TOCH verschijnen nadat we als geïnstalleerd hebben
  // gemarkeerd (race condition met andere scripts), direct verbergen.
  function startPopupWatcher() {
    try {
      var obs = new MutationObserver(function () {
        if (!_state.installed) return;
        var anyVisible = false;
        POPUP_IDS.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.style.display !== 'none' && el.offsetParent !== null) {
            anyVisible = true;
          }
        });
        if (anyVisible) hidePopups();
      });
      obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    } catch (e) {}
  }

  // ───────── Event listeners ─────────
  function setupEventListeners() {
    // appinstalled: definitief installatie-bevestiging
    window.addEventListener('appinstalled', function () {
      markInstalledPersistent('appinstalled-event');
      hidePopups();
    });

    // beforeinstallprompt: als app al als installed gemarkeerd is, niet tonen
    // Note: we vangen het NIET met preventDefault andere scripts (inline-banner +
    // a2hs-prompt) doen dat. We hebben enkel de suppression van hun popups via
    // de MutationObserver.

    // Display-mode change live tracking
    try {
      var mq = window.matchMedia('(display-mode: standalone)');
      var handler = function () {
        if (mq.matches) {
          markInstalledPersistent('display-mode-change');
          hidePopups();
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    } catch (e) {}

    // Re-detect bij focus/visibilitychange: user kan tussen browser-tab en
    // standalone PWA-venster wisselen. Bij terugkomst detecteren we
    // mogelijke nieuwe install-status.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && !_state.installed) {
        runDetection();
      }
    });
    window.addEventListener('focus', function () {
      if (!_state.installed) runDetection();
    });
  }

  // ───────── Public API ─────────
  function getStatus() {
    if (_state.installed) return 'installed';
    // dismissed states uit beide bestaande systemen respecteren
    try {
      if (localStorage.getItem(STORAGE_DISMISS_V3)) return 'dismissed';
      var legacy = localStorage.getItem(STORAGE_DISMISS_LEGACY);
      if (legacy) {
        var diffDays = (Date.now() - parseInt(legacy, 10)) / 86400000;
        if (diffDays < 14) return 'dismissed';
      }
    } catch (e) {}
    if (typeof navigator !== 'undefined' &&
        typeof navigator.getInstalledRelatedApps !== 'function' &&
        !(/iPad|iPhone|iPod/.test(navigator.userAgent)) &&
        !('serviceWorker' in navigator)) {
      return 'unsupported';
    }
    return 'available';
  }

  function init() {
    setupEventListeners();
    runDetection().then(function () {
      startPopupWatcher();
      // Periodieke re-check (goedkoop, één call per 5s) zolang niet installed
      setInterval(function () {
        if (!_state.installed) runDetection();
        else hidePopups(); // defensief
      }, 5000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

  window.PP_InstallManager = {
    getStatus:      getStatus,
    isInstalled:    function () { return _state.installed; },
    markInstalled:  function () { markInstalledPersistent('manual-api'); hidePopups(); },
    hidePopups:     hidePopups,
    recheck:        runDetection,
    _state:         _state,
    VERSION:        '1.0.0'
  };

  // Compatibiliteit: oude DY.isAppInstalled return ook true zodra wij dat detecteren.
  try {
    window.DY = window.DY || {};
    var origIsInstalled = window.DY.isAppInstalled;
    window.DY.isAppInstalled = function () {
      if (_state.installed) return true;
      if (typeof origIsInstalled === 'function') return origIsInstalled();
      return false;
    };
  } catch (e) {}
})();
