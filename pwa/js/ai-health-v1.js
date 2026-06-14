// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — AI Backend Health & Config (v48-fix)
//
// Centrale plek voor:
//   1. apiBase() resolver — slimme default per host
//   2. healthCheck() — pingt /api/ai/health met cache (1 call per sessie)
//   3. Helper voor andere scripts om "lazy" features uit te zetten
//      als backend offline is (geen rode error-toasts in productie)
//
// Dit script wordt VÓÓR virtual-tryon, outfit-score, weekly-stylist
// geladen in index.html zodat zij `window.DY.aiHealth` kunnen gebruiken.
//
// Non-invasief: raakt geen bestaande code aan, alleen window.DY namespace.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppAiHealthInit) return;
  window.__ppAiHealthInit = true;

  // ─── Default API base per host ────────────────────────────────
  // Volgorde:
  //   1. window.DY.apiBase als die expliciet is gezet → gebruik die
  //   2. Hostname matched → gebruik harde fallback (LIVE Emergent backend)
  //   3. Anders → relatief (same-origin, voor lokale dev)
  // v60.1.46: bijgewerkte LIVE_BACKEND URL (oude fitting-chat-app preview is dood)
  var LIVE_BACKEND = 'https://paskamer-stability.preview.emergentagent.com';

  function resolveApiBase() {
    if (window.DY && typeof window.DY.apiBase === 'string' && window.DY.apiBase) {
      return window.DY.apiBase.replace(/\/+$/, '');
    }
    var host = (location.hostname || '').toLowerCase();
    // Productie + alle previews → gebruik Emergent backend (working & live)
    if (host.indexOf('paskamerpraat.nl') >= 0 ||
        host.indexOf('emergentagent.com') >= 0 ||
        host.indexOf('cloudflare') >= 0 ||
        host.indexOf('pages.dev') >= 0) {
      return LIVE_BACKEND;
    }
    // Localhost/file:// → relative (uvicorn lokaal)
    return '';
  }

  // Cache voor gehele tab-sessie
  var _base = resolveApiBase();
  var _healthPromise = null;
  var _healthCache = null;  // {ok:true/false, ts:Date.now()}

  function healthCheck(force) {
    if (!force && _healthCache && (Date.now() - _healthCache.ts) < 5 * 60 * 1000) {
      return Promise.resolve(_healthCache.ok);
    }
    if (_healthPromise && !force) return _healthPromise;
    _healthPromise = fetch(_base + '/api/ai/health', {
      method: 'GET',
      cache: 'no-store',
      // Korte timeout via AbortController
      signal: (function() {
        try { var c = new AbortController(); setTimeout(function() { c.abort(); }, 4000); return c.signal; }
        catch (e) { return undefined; }
      })()
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(j) {
      var ok = !!(j && j.status === 'ok' && j.emergent_key_configured);
      _healthCache = { ok: ok, ts: Date.now() };
      _healthPromise = null;
      return ok;
    })
    .catch(function() {
      _healthCache = { ok: false, ts: Date.now() };
      _healthPromise = null;
      return false;
    });
    return _healthPromise;
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.aiHealth = {
    apiBase:     function() { return _base; },
    isHealthy:   healthCheck,
    forceCheck:  function() { return healthCheck(true); },
    setApiBase:  function(url) { _base = (url || '').replace(/\/+$/, ''); _healthCache = null; },
    _backend:    LIVE_BACKEND
  };

  // Voer 1 ping direct uit zodat downstream scripts kunnen wachten
  healthCheck();
})();
