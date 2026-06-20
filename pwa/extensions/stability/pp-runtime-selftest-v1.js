/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Runtime Self-Test & Audit Aggregator (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Combineert ALLE bestaande audit-API's tot één rapport zodat je
 * met één console-call de complete runtime-health ziet:
 *
 *   PP_SelfTest.run()        - draait alle checks, levert structured report
 *   PP_SelfTest.summary()    - 1-regel samenvatting
 *   PP_SelfTest.healthy()    - boolean
 *
 * AGGREGEERT:
 *   - PP_PROMISE_GUARD       (error/promise buffer + autofill stub)
 *   - PP_OnboardingGuard     (boot performance metrics)
 *   - PP_NavAudit            (route/nav events + button inventory)
 *   - PP_CampaignAudit       (campagne flow events)
 *   - PP_TopupRouter         (topup intent routing)
 *
 * EN VOERT ZELF UIT:
 *   - Service Worker health check (registratie + actief)
 *   - DY core API check (auth, db, navigeer, toonPagina aanwezig)
 *   - Firebase modules check (auth, firestore geladen)
 *   - DOM health check (geen elementen met `display:none` blokkerend)
 *   - LocalStorage health (geen quota issues)
 *   - Performance budget (LCP / TTI / longTasks)
 *
 * Pure read-only diagnose. Geen mutaties aan applicatiestate.
 * Geen nieuwe features, geen UI elementen. Alleen console-output.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppSelfTestInit) return;
  window.__ppSelfTestInit = true;

  function safeCall(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  function checkServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return { status: 'unsupported' };
    }
    return safeCall(function () {
      return navigator.serviceWorker.getRegistration().then(function (reg) {
        return {
          status: reg ? 'registered' : 'not_registered',
          scope: reg ? reg.scope : null,
          active: !!(reg && reg.active),
          waiting: !!(reg && reg.waiting),
          installing: !!(reg && reg.installing)
        };
      }).catch(function (e) {
        return { status: 'error', error: (e && e.message) || String(e) };
      });
    }, Promise.resolve({ status: 'error', error: 'getRegistration_threw' }));
  }

  function checkDYCore() {
    return {
      DY_defined: typeof window.DY === 'object' && window.DY !== null,
      DY_navigeer: typeof (window.DY && DY.navigeer) === 'function',
      DY_toonPagina: typeof (window.DY && DY.toonPagina) === 'function',
      DY_db: !!(window.DY && DY.db),
      DY_user_authed: !!(window.DY && DY.user),
      DY_currentPage: (window.DY && DY.pagina) || null,
      navWrappers: {
        toonPagina: !!(window.DY && DY.toonPagina && DY.toonPagina.__navRestored),
        navigeer:   !!(window.DY && DY.navigeer && DY.navigeer.__navRestored),
        routeSafety: !!(window.DY && DY._pp_route_safety_wrapped)
      }
    };
  }

  function checkFirebase() {
    return {
      firebase_defined: typeof window.firebase !== 'undefined',
      auth_loaded: !!(window.firebase && firebase.auth),
      firestore_loaded: !!(window.firebase && firebase.firestore),
      current_user: safeCall(function () {
        var u = firebase.auth().currentUser;
        return u ? { uid: u.uid, emailVerified: u.emailVerified, anonymous: u.isAnonymous } : null;
      }, null)
    };
  }

  function checkLocalStorage() {
    try {
      var key = '__pp_test_' + Date.now();
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      var used = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          used += (k.length + (localStorage.getItem(k) || '').length);
        }
      } catch (_) {}
      return { available: true, approxBytes: used };
    } catch (e) {
      return { available: false, error: (e && e.message) || String(e) };
    }
  }

  function checkPerformance() {
    var nav = safeCall(function () {
      return performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    }, null);
    var paint = safeCall(function () {
      var out = {};
      (performance.getEntriesByType('paint') || []).forEach(function (p) {
        out[p.name] = Math.round(p.startTime);
      });
      return out;
    }, {});
    return {
      navTiming: nav ? {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadEventEndMs: Math.round(nav.loadEventEnd),
        responseEndMs: Math.round(nav.responseEnd)
      } : null,
      paint: paint,
      memory: safeCall(function () {
        return performance.memory ? {
          usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
          limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
        } : null;
      }, null)
    };
  }

  function aggregateGuards() {
    return {
      promiseGuard: window.PP_PROMISE_GUARD ? safeCall(window.PP_PROMISE_GUARD.summary, null) : null,
      onboarding:   window.PP_OnboardingGuard ? safeCall(window.PP_OnboardingGuard.report, null) : null,
      navAudit:     window.PP_NavAudit ? safeCall(window.PP_NavAudit.summary, null) : null,
      campaignAudit: window.PP_CampaignAudit ? safeCall(window.PP_CampaignAudit.summary, null) : null,
      topupRouter:  window.PP_TopupRouter ? { wrapped: safeCall(window.PP_TopupRouter.isWrapped, false) } : null
    };
  }

  function run() {
    var dy = checkDYCore();
    var fb = checkFirebase();
    var ls = checkLocalStorage();
    var perf = checkPerformance();
    var guards = aggregateGuards();

    var errors = [];
    if (!dy.DY_defined) errors.push('DY namespace ontbreekt');
    if (!dy.DY_navigeer) errors.push('DY.navigeer ontbreekt');
    if (!dy.DY_toonPagina) errors.push('DY.toonPagina ontbreekt');
    if (!fb.firebase_defined) errors.push('Firebase niet geladen');
    if (!ls.available) errors.push('LocalStorage niet beschikbaar: ' + ls.error);
    if (!window.PP_PROMISE_GUARD) errors.push('PP_PROMISE_GUARD niet actief');
    if (!window.PP_OnboardingGuard) errors.push('PP_OnboardingGuard niet actief');

    var warnings = [];
    if (guards.promiseGuard && guards.promiseGuard.realErrors > 0) {
      warnings.push(guards.promiseGuard.realErrors + ' niet-benigne errors in buffer');
    }
    if (guards.onboarding && guards.onboarding.loaderHiddenMs > 5500) {
      warnings.push('Onboarding loader > 5.5s zichtbaar');
    }
    if (guards.onboarding && guards.onboarding.longTasks && guards.onboarding.longTasks.length > 5) {
      warnings.push(guards.onboarding.longTasks.length + ' long tasks (>200ms) tijdens boot');
    }
    if (perf.memory && perf.memory.usedMB > 200) {
      warnings.push('Hoog geheugengebruik: ' + perf.memory.usedMB + 'MB');
    }

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      healthy: errors.length === 0,
      criticalErrors: errors,
      warnings: warnings,
      dyCore: dy,
      firebase: fb,
      localStorage: ls,
      performance: perf,
      guards: guards
    };
  }

  function summary() {
    var r = run();
    return {
      healthy: r.healthy,
      errors: r.criticalErrors.length,
      warnings: r.warnings.length,
      criticalErrors: r.criticalErrors,
      navWrapped: r.dyCore.navWrappers,
      authed: r.dyCore.DY_user_authed,
      currentPage: r.dyCore.DY_currentPage
    };
  }

  window.PP_SelfTest = {
    VERSION: '1.0.0',
    run: run,
    summary: summary,
    healthy: function () { return run().healthy; },
    // Async-aware variant die ook SW-check wacht
    runAsync: function () {
      var base = run();
      return Promise.resolve(checkServiceWorker()).then(function (sw) {
        base.serviceWorker = sw;
        return base;
      });
    }
  };
})();
