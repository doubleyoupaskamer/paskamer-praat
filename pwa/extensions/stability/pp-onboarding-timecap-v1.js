/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Onboarding Time Cap Guard (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING optimization layer: dwingt af dat de welkomst-spinner en
 * eerste paint binnen MAX 5 seconden afronden. Werkt PARALLEL met de
 * bestaande inline timers in index.html en de pwa-v463 hide-logica - geen
 * functie wordt overschreven, geen flow wordt herschreven.
 *
 * Wat doet de guard?
 *   1) initTimerGuard()     - start een onafhankelijke 5000ms hard-cap
 *                             timer aan boot. Forceert `#dy-initial-loader`
 *                             verborgen ongeacht state van pwa-v463.
 *   2) onboardingStateResolver() - bepaalt of `#dy-main` content heeft.
 *                             Zo niet, triggert fallback render
 *                             (DY.toonPagina('feed') of skeleton).
 *   3) metrics tracking     - performance.now() snapshots voor:
 *                             boot, first-paint, loader-hide, ui-ready.
 *                             Opgeslagen in window.__ppOnboardingMetrics.
 *   4) main-thread watchdog - registreert long tasks (>200ms) via
 *                             PerformanceObserver bij ondersteunende
 *                             browsers; degraded mode flag.
 *
 * Veiligheid:
 *   - Wijzigt NIETS aan auth/wallet/campagne/Firestore flows.
 *   - Forceert nooit een redirect of routing-break.
 *   - Bij conflict met `window._dyMinSpinnerUntil` neemt de strikt-
 *     vroegere cap voorrang (kortste tijd wint = wij).
 *
 * Debug:
 *   - window.__ppOnboardingMetrics
 *   - window.PP_OnboardingGuard.report()
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppOnboardingTimecapInit) return;
  window.__ppOnboardingTimecapInit = true;

  var TAG = '[onboarding-timecap]';
  var HARD_CAP_MS = 5000;
  var FALLBACK_CHECK_MS = 5000;

  // Boot anchor - zo vroeg mogelijk vastpinnen
  var BOOT_T = (window.performance && performance.now) ? performance.now() : Date.now();
  var BOOT_WALL = Date.now();

  var metrics = {
    bootAt:           BOOT_WALL,
    bootPerfMs:       BOOT_T,
    firstPaintMs:     null,
    loaderHiddenMs:   null,
    uiReadyMs:        null,
    fallbackTriggered: false,
    degradedMode:     false,
    longTasks:        []
  };
  window.__ppOnboardingMetrics = metrics;

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function mark(field) {
    if (metrics[field] == null) {
      metrics[field] = Math.round(now() - BOOT_T);
      try { console.log(TAG, field, metrics[field] + 'ms'); } catch (_) {}
    }
  }

  // ── 1) Hard cap op spinner ──────────────────────────────────────
  function hideLoaderHard() {
    var l = document.getElementById('dy-initial-loader');
    if (!l) { mark('loaderHiddenMs'); return false; }
    if (l.classList.contains('verborgen') ||
        getComputedStyle(l).visibility === 'hidden') {
      mark('loaderHiddenMs');
      return false;
    }
    try {
      l.classList.add('verborgen');
      l.style.opacity = '0';
      l.style.visibility = 'hidden';
      l.style.pointerEvents = 'none';
      // Verwijder uit DOM na transition
      setTimeout(function () {
        try { if (l && l.parentNode) l.parentNode.removeChild(l); } catch (_) {}
      }, 350);
      mark('loaderHiddenMs');
      return true;
    } catch (e) {
      try { console.warn(TAG, 'hideLoaderHard failed', e); } catch (_) {}
      return false;
    }
  }

  // Sync onze cap met bestaande `_dyMinSpinnerUntil` (kortste wint)
  function tightenMinSpinner() {
    try {
      var ourCap = BOOT_WALL + HARD_CAP_MS;
      var existing = window._dyMinSpinnerUntil || 0;
      if (!existing || existing > ourCap) {
        window._dyMinSpinnerUntil = ourCap;
      }
    } catch (_) {}
  }

  function initTimerGuard() {
    tightenMinSpinner();
    setTimeout(function () {
      hideLoaderHard();
    }, HARD_CAP_MS);
  }

  // ── 2) Fallback state resolver ──────────────────────────────────
  function mainHasContent() {
    try {
      var m = document.getElementById('dy-main');
      if (!m) return false;
      var html = m.innerHTML || '';
      // Strip loaders/spinners om alleen "echte" content te tellen
      var stripped = html
        .replace(/<div[^>]*class="[^"]*dy-loader[^"]*"[^>]*>[\s\S]*?<\/div>/g, '')
        .replace(/<div[^>]*class="[^"]*dy-spinner[^"]*"[^>]*>[\s\S]*?<\/div>/g, '')
        .trim();
      return stripped.length > 80;
    } catch (e) { return false; }
  }

  function injectSkeletonShell() {
    try {
      var m = document.getElementById('dy-main');
      if (!m || mainHasContent()) return false;
      // Lichte fallback shell - geen routing, geen state-mutaties
      m.innerHTML =
        '<div class="dy-feed-skeleton" data-testid="onboarding-skeleton" ' +
          'style="padding:20px;display:flex;flex-direction:column;gap:14px">' +
          '<div style="height:56px;background:linear-gradient(90deg,#1a140e,#221912,#1a140e);' +
            'background-size:200% 100%;animation:dyShim 1.4s ease-in-out infinite;border-radius:12px"></div>' +
          '<div style="height:220px;background:linear-gradient(90deg,#1a140e,#221912,#1a140e);' +
            'background-size:200% 100%;animation:dyShim 1.4s ease-in-out infinite;border-radius:14px"></div>' +
          '<div style="height:220px;background:linear-gradient(90deg,#1a140e,#221912,#1a140e);' +
            'background-size:200% 100%;animation:dyShim 1.4s ease-in-out infinite;border-radius:14px"></div>' +
          '<div style="text-align:center;color:rgba(245,233,216,0.45);font-size:13px;' +
            'margin-top:8px" data-testid="onboarding-degraded-msg">Inhoud wordt geladen...</div>' +
        '</div>';
      // Inject shimmer keyframes (eenmalig)
      if (!document.getElementById('pp-onboard-shim-css')) {
        var s = document.createElement('style');
        s.id = 'pp-onboard-shim-css';
        s.textContent = '@keyframes dyShim { 0%{background-position:200% 0} 100%{background-position:-200% 0} }';
        document.head.appendChild(s);
      }
      metrics.degradedMode = true;
      try { console.warn(TAG, 'skeleton fallback rendered (degraded mode)'); } catch (_) {}
      return true;
    } catch (e) { return false; }
  }

  function onboardingStateResolver() {
    if (mainHasContent()) {
      mark('uiReadyMs');
      return 'ready';
    }
    metrics.fallbackTriggered = true;
    // Probeer DY-route fallback (bestaande emergency-flow al in index.html
    // op 5s, wij zijn een extra safety net).
    try {
      if (window.DY && typeof DY.toonPagina === 'function') {
        var pag = (DY.pagina && DY.pagina !== 'onboarding') ? DY.pagina : 'feed';
        DY.pagina = null; // omzeil de dedup-guard
        DY.toonPagina(pag);
        // Geef render 250ms om binnen te komen, dan check
        setTimeout(function () {
          if (!mainHasContent()) injectSkeletonShell();
          else mark('uiReadyMs');
        }, 250);
        return 'route-retry';
      }
    } catch (_) {}
    injectSkeletonShell();
    return 'skeleton';
  }

  // ── 3) Long-task watchdog ───────────────────────────────────────
  function startLongTaskWatcher() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.duration > 200) {
            metrics.longTasks.push({
              startMs: Math.round(e.startTime - BOOT_T),
              durationMs: Math.round(e.duration),
              name: e.name || 'task'
            });
            // Cap buffer
            if (metrics.longTasks.length > 50) metrics.longTasks.shift();
          }
        });
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch (_) {}
  }

  // ── First paint detector ────────────────────────────────────────
  function watchFirstPaint() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) {
          if (e.name === 'first-contentful-paint' && metrics.firstPaintMs == null) {
            metrics.firstPaintMs = Math.round(e.startTime);
          }
        });
      });
      po.observe({ entryTypes: ['paint'] });
    } catch (_) {}
    // Fallback: marker als DOMContentLoaded fires en geen FCP gevangen
    setTimeout(function () {
      if (metrics.firstPaintMs == null) {
        metrics.firstPaintMs = Math.round(now() - BOOT_T);
      }
    }, 1500);
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    initTimerGuard();
    watchFirstPaint();
    startLongTaskWatcher();

    // Fallback check op exact 5000ms
    setTimeout(function () {
      onboardingStateResolver();
    }, FALLBACK_CHECK_MS);

    // Extra safety: na 6s nog steeds geen content? Tweede poging skeleton.
    setTimeout(function () {
      if (!mainHasContent()) injectSkeletonShell();
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ──────────────────────────────────────────────────
  window.PP_OnboardingGuard = {
    VERSION: '1.0.0',
    report: function () {
      return Object.assign({}, metrics, {
        capMs: HARD_CAP_MS,
        capRespected: (metrics.loaderHiddenMs == null) || metrics.loaderHiddenMs <= (HARD_CAP_MS + 300),
        contentAfterCap: mainHasContent()
      });
    },
    metrics: function () { return Object.assign({}, metrics); },
    initTimerGuard: initTimerGuard,
    onboardingStateResolver: onboardingStateResolver,
    forceHideLoader: hideLoaderHard
  };
})();
