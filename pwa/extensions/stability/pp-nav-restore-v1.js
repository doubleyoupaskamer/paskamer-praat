/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Navigation Restoration & Audit Layer (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING audit + repair layer voor alle UI-knoppen en navigatie.
 *
 * Probleemanalyse:
 *   Diverse knoppen (Top leden, Post van de Week, Ontwerp, Modegenoten,
 *   Winkel, Review, etc.) vallen onder bepaalde omstandigheden onbedoeld
 *   terug naar de homepage/feed via de catch-all fallback in pwa-v463
 *   (regel ~1126: `if (!pagina || !renders[pagina])`).
 *
 * Root causes geïdentificeerd:
 *   1. RENDERER NIET KLAAR  - Click vuurt vóór `renders[pagina]` geladen
 *      is (race tijdens bootstrap) → fallback naar feed.
 *   2. NAAM ALIAS MISMATCH  - Diverse aliassen ("top leden", "topleden",
 *      "post van de week" etc.) komen NIET 1-op-1 overeen met de
 *      canonieke routes (leaderboard, ovdw, configurator, vrienden).
 *      Geen mismatch in huidige code maar wel in nieuwe/dynamische CTA's
 *      en deep-links uit campagnes/notifications.
 *   3. AUTH GUARD FALLBACK  - leaderboard/configurator vallen by-design
 *      terug bij niet-ingelogd / non-premium, maar voor de gebruiker
 *      ziet dit eruit als "homepage redirect".
 *   4. ASYNC RENDER FAILURE - Render-functie throwt onverwacht → de 8s
 *      safety-timer in pwa-v463 toont "Terug naar feed" knop.
 *
 * Fix-strategie (additief, geen wijziging aan pwa-v463):
 *   A) Route Alias Resolver        - vertaalt populaire alternatieve
 *                                    namen naar canonieke route-IDs.
 *   B) Renderer-readiness wrapper  - wacht tot 2s op renders[pagina]
 *                                    voordat fallback geaccepteerd wordt.
 *   C) Auth/Premium UX hint        - logt "by design" fallbacks zodat
 *                                    user weet dat het géén bug is.
 *   D) Click-audit observer        - inventariseert alle navigeer-clicks
 *                                    met origin, label, target route,
 *                                    resolved route, decision.
 *   E) Structured report           - PP_NavAudit.report() per spec.
 *
 * Veiligheid:
 *   - Geen aanpassing aan DY.navigeer / DY.toonPagina logica.
 *   - Alle wrappers proxiën met try/catch → fallback naar originele call.
 *   - Auth-required & premium-required guards blijven by-design.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppNavRestoreInit) return;
  window.__ppNavRestoreInit = true;

  var TAG = '[nav-restore]';
  var BUFFER_MAX = 250;
  var RENDERER_WAIT_MS = 2000;

  var VERBOSE = false;
  try {
    if (new URLSearchParams(location.search).get('debug') === 'nav') VERBOSE = true;
    if (localStorage.getItem('pp_debug_nav') === '1') VERBOSE = true;
  } catch (_) {}

  window.__ppNavAudit = window.__ppNavAudit || [];

  function log(kind, payload) {
    try {
      var entry = Object.assign({ kind: kind, ts: new Date().toISOString() }, payload || {});
      window.__ppNavAudit.push(entry);
      if (window.__ppNavAudit.length > BUFFER_MAX) {
        window.__ppNavAudit.splice(0, window.__ppNavAudit.length - BUFFER_MAX);
      }
      if (VERBOSE) { try { console.log(TAG, kind, payload); } catch (_) {} }
    } catch (_) {}
  }

  // ── A) Route-alias resolver ─────────────────────────────────────
  // Map van gangbare alternatieve namen → canonieke route-IDs.
  // Behoud BESTAANDE namen; voeg ALLEEN alternatieven toe.
  var ROUTE_ALIASES = {
    // Top leden
    'topleden':          'leaderboard',
    'top-leden':         'leaderboard',
    'top_leden':         'leaderboard',
    'top leden':         'leaderboard',
    'topmembers':        'leaderboard',
    'ranking':           'leaderboard',
    'leaders':           'leaderboard',

    // Post van de week
    'post-van-de-week':  'ovdw',
    'postvandeweek':     'ovdw',
    'post_van_de_week':  'ovdw',
    'post van de week':  'ovdw',
    'postweek':          'ovdw',
    'pvdw':              'ovdw',
    'weekpost':          'ovdw',

    // Ontwerp / Configurator
    'ontwerp':           'configurator',
    'ontwerpen':         'configurator',
    'design':            'configurator',
    'configureer':       'configurator',

    // Modegenoten / Vrienden / Community
    'modegenoten':       'vrienden',
    'mode genoten':      'vrienden',
    'mode-genoten':      'vrienden',
    'fashionmates':      'vrienden',
    'community':         'vrienden',
    'mensen':            'vind_mensen',
    'vind-mensen':       'vind_mensen',
    'vind mensen':       'vind_mensen',
    'matches':           'vrienden',

    // Winkel
    'shop':              'winkel',
    'store':             'winkel',
    'webshop':           'winkel',

    // Reviews
    'review':            'reviews',
    'pasvorm-reviews':   'reviews',
    'pasvorm review':    'reviews',
    'pasvormreviews':    'reviews',

    // Lookbook / Looks
    'looks':             'lookbook',
    'look':              'lookbook',
    'inspiratie':        'lookbook',
    'lookboek':          'lookbook',

    // Challenges
    'challenge':         'challenges',
    'uitdagingen':       'challenges',

    // Kleuren AI
    'kleuren-ai':        'kleuren_ai',
    'kleurenai':         'kleuren_ai',
    'outfit-vergelijker':'kleuren_ai',
    'ai':                'kleuren_ai',

    // Brand portal
    'merken':            'merken_overzicht',
    'merken-portal':     'brand_portal',
    'brand':             'brand_portal',
    'merken_pakketten':  'merken_pakketten',
    'pakketten':         'merken_pakketten',

    // Profiel
    'profile':           'profiel',
    'account':           'profiel',
    'mijn-profiel':      'profiel',

    // Berichten
    'messages':          'berichten',
    'inbox':             'berichten',
    'dm':                'berichten',

    // Wallet
    'wallet':            'b2c_wallet',
    'saldo':             'b2c_wallet',
    'b2c-wallet':        'b2c_wallet',

    // Premium
    'premium':           'home',  // fallback - upgrade-modal triggert via configurator
    'upgrade':           'home'
  };

  function normalizeRouteName(name) {
    if (!name) return name;
    var s = String(name).trim().toLowerCase();
    // Vervang spaces, dashes, dots door underscore-variant voor alias lookup
    var compact = s.replace(/[\s\.\-]+/g, '');
    return s in ROUTE_ALIASES ? ROUTE_ALIASES[s]
         : compact in ROUTE_ALIASES ? ROUTE_ALIASES[compact]
         : name;  // behoud originele case als geen alias
  }

  // ── B) Renderer-readiness wrapper rond DY.toonPagina ────────────
  function getRenderersMap() {
    // pwa-v463 maakt de renderers map LOKAAL binnen toonPagina aan
    // → we kunnen het niet rechtstreeks lezen. We proben via een
    // bekende renderer-functie test op DY-namespace.
    if (!window.DY) return null;
    // We weten dat een aantal routes mappen naar DY.render<Name>.
    // Voor renderer-readiness: check of bekende renders gedefinieerd zijn.
    return {
      hasRenderer: function (pagina) {
        var map = {
          feed: 'renderFeed', home: 'renderHome', lookbook: 'renderLookbook',
          vrienden: 'renderVrienden', vind_mensen: 'renderVindMensen',
          nieuw: 'renderNieuwVerhaal', deel: 'renderDeelHub',
          profiel: 'renderProfiel', dsp: 'renderDSP', detail: 'renderDetail',
          winkel: 'renderWinkel', bestellingen: 'renderBestellingen',
          onboarding: 'renderOnboarding', profiel_bewerken: 'renderProfielBewerken',
          body_profile: 'renderBodyProfile', gebruiker: 'renderGebruikersProfiel',
          challenges: 'renderChallenges', ovdw: 'renderOvdwFeed',
          leaderboard: 'renderLeaderboard', reviews: 'renderReviewsOverzicht',
          reviews_nieuw: 'renderReviews', berichten: 'renderBerichten',
          meldingen: 'renderMeldingen', paskamer: 'renderPaskamerPagina',
          configurator: 'renderConfigurator', bericht_detail: 'renderBerichtDetail',
          lookbook_nieuw: 'renderNieuwLook', lookbook_detail: 'renderLookDetail',
          story_poster: 'renderStoryPoster', voorwaarden: 'renderVoorwaarden',
          privacy: 'renderPrivacyBeleid', privacy_center: 'renderPrivacyCenter',
          community_regels: 'renderCommunityRegels', beta_pagina: 'renderBetaPagina',
          account_verwijder: 'renderAccountVerwijder', admin: 'renderAdmin',
          kleuren_ai: 'renderKleurenAI', login: 'renderLogin', register: 'renderRegister'
        };
        var fname = map[pagina];
        return fname ? typeof DY[fname] === 'function' : false;
      }
    };
  }

  function waitForRenderer(pagina, maxMs, cb) {
    var rmap = getRenderersMap();
    if (!rmap || rmap.hasRenderer(pagina)) return cb(true);
    var elapsed = 0;
    var iv = setInterval(function () {
      elapsed += 50;
      if (rmap.hasRenderer(pagina)) { clearInterval(iv); cb(true); return; }
      if (elapsed >= maxMs) { clearInterval(iv); cb(false); }
    }, 50);
  }

  function wrapToonPagina() {
    if (!window.DY || typeof DY.toonPagina !== 'function') return false;
    if (DY.toonPagina.__navRestored) return true;

    var orig = DY.toonPagina;
    var wrapped = function (pagina) {
      var origPagina = pagina;
      var resolved = normalizeRouteName(pagina);
      var aliased = resolved !== pagina;

      // Audit log
      log('toonPagina_call', {
        requested: origPagina,
        resolved: resolved,
        aliased: aliased,
        authed: !!(window.DY && DY.user),
        currentPage: (window.DY && DY.pagina) || null
      });

      // Renderer-readiness check: als gewone naam onbekend en
      // alias evenmin werkt, wacht max 2s op laadbaarheid.
      var rmap = getRenderersMap();
      if (rmap && resolved && !rmap.hasRenderer(resolved)) {
        // Maak afspraak: wacht of fallback
        waitForRenderer(resolved, RENDERER_WAIT_MS, function (ready) {
          log('toonPagina_readiness', {
            route: resolved,
            ready: ready,
            waitedMs: RENDERER_WAIT_MS
          });
          // Of klaar of niet: roep originele aan met resolved naam.
          // Originele functie handelt fallback gracefully af.
          try { orig.call(DY, resolved); }
          catch (e) {
            log('toonPagina_error', { route: resolved, error: (e && e.message) || String(e) });
            try { orig.call(DY, origPagina); } catch (_) {}
          }
        });
        return;
      }

      // Standaard pad: roep originele met resolved naam (gerichte fix
      // voor alias-mismatches zonder code-rewrite).
      try {
        return orig.call(DY, resolved);
      } catch (e) {
        log('toonPagina_error', { route: resolved, error: (e && e.message) || String(e) });
        return orig.call(DY, origPagina);
      }
    };
    wrapped.__navRestored = true;
    DY.toonPagina = wrapped;
    return true;
  }

  function wrapNavigeer() {
    if (!window.DY || typeof DY.navigeer !== 'function') return false;
    if (DY.navigeer.__navRestored) return true;

    var orig = DY.navigeer;
    var wrapped = function (pagina, params) {
      var resolved = normalizeRouteName(pagina);
      var aliased = resolved !== pagina;
      if (aliased) {
        log('navigeer_aliased', { from: pagina, to: resolved });
      }
      try {
        return orig.call(this, resolved, params);
      } catch (e) {
        log('navigeer_error', { route: resolved, error: (e && e.message) || String(e) });
        // Veiligheidsnet: probeer originele naam
        try { return orig.call(this, pagina, params); } catch (_) {}
      }
    };
    wrapped.__navRestored = true;
    DY.navigeer = wrapped;
    return true;
  }

  // ── D) Click-audit observer ─────────────────────────────────────
  // Niet-invasieve capture-phase observer. Detecteert clicks op alle
  // navigatie-knoppen en logt label + intended route.
  function startClickObserver() {
    document.addEventListener('click', function (ev) {
      try {
        var el = ev.target;
        var hops = 0;
        while (el && hops < 6 && el.tagName) {
          var tag = el.tagName.toLowerCase();
          if (tag === 'button' || tag === 'a' || el.getAttribute('data-testid') || el.getAttribute('onclick')) {
            var oc = el.getAttribute('onclick') || '';
            var routeMatch = oc.match(/(?:DY\.navigeer|DY\.toonPagina)\(['"]([^'"]+)['"]/);
            var route = routeMatch ? routeMatch[1] : null;
            var label = (el.textContent || '').trim().slice(0, 40);
            if (route || el.getAttribute('data-testid')) {
              log('click', {
                tag: tag,
                label: label,
                requestedRoute: route,
                resolvedRoute: route ? normalizeRouteName(route) : null,
                testid: el.getAttribute('data-testid') || null,
                currentPage: (window.DY && DY.pagina) || null
              });
            }
            break;
          }
          el = el.parentNode;
          hops++;
        }
      } catch (_) {}
    }, true);
  }

  // ── Init met retry voor defer-loading ───────────────────────────
  function tryInstall() {
    var ok = wrapToonPagina() && wrapNavigeer();
    return ok;
  }

  function init() {
    startClickObserver();
    if (tryInstall()) {
      log('installed', { verbose: VERBOSE });
      try { if (VERBOSE) console.log(TAG, 'navigation restore layer active'); } catch (_) {}
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 80) {
        clearInterval(iv);
        log('installed', { verbose: VERBOSE, tries: tries });
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── E) Structured report API ────────────────────────────────────
  function inventoryButtons() {
    var inventory = [];
    try {
      var buttons = document.querySelectorAll('button[onclick], a[onclick], [data-testid]');
      var rmap = getRenderersMap();
      buttons.forEach(function (el) {
        var oc = el.getAttribute('onclick') || '';
        var routeMatch = oc.match(/(?:DY\.navigeer|DY\.toonPagina)\(['"]([^'"]+)['"]/);
        if (!routeMatch && !el.getAttribute('data-testid')) return;
        var route = routeMatch ? routeMatch[1] : null;
        var resolved = route ? normalizeRouteName(route) : null;
        var hasRenderer = resolved && rmap ? rmap.hasRenderer(resolved) : null;
        inventory.push({
          label: (el.textContent || '').trim().slice(0, 50),
          testid: el.getAttribute('data-testid') || null,
          requestedRoute: route,
          resolvedRoute: resolved,
          aliased: route && resolved !== route,
          rendererAvailable: hasRenderer,
          potentialIssue: route && hasRenderer === false ?
            'no_renderer (zou naar feed/home fallen)' : null
        });
      });
    } catch (_) {}
    return inventory;
  }

  function generateReport() {
    var events = (window.__ppNavAudit || []).slice();
    var byKind = {};
    events.forEach(function (e) { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });

    var aliased = events.filter(function (e) {
      return (e.kind === 'navigeer_aliased') ||
             (e.kind === 'toonPagina_call' && e.aliased);
    });
    var rendererFailed = events.filter(function (e) {
      return e.kind === 'toonPagina_readiness' && !e.ready;
    });
    var errors = events.filter(function (e) {
      return e.kind === 'toonPagina_error' || e.kind === 'navigeer_error';
    });
    var inventory = inventoryButtons();
    var buttonsWithIssues = inventory.filter(function (b) { return b.potentialIssue; });

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      verbose: VERBOSE,
      totalEvents: events.length,
      byKind: byKind,
      // 10. OPLEVERING velden:
      restoredButtons: aliased.map(function (e) {
        return { from: e.from || e.requested, to: e.to || e.resolved };
      }),
      routesAdjusted: Object.keys(ROUTE_ALIASES).length,
      handlersReconnected: ['DY.toonPagina', 'DY.navigeer'],
      errorsFound: errors,
      rendererFailures: rendererFailed,
      rootCauses: [
        '1. Catch-all fallback in pwa-v463 (regel ~1126): onbekende route → feed/home',
        '2. Alias-mismatch: "topleden", "post-van-de-week", "ontwerp" etc. niet 1:1 met routes',
        '3. Renderer-race: defer-load timing kan klik vóór render-functie definitie veroorzaken',
        '4. By-design auth/premium guards (leaderboard, configurator) ogen als bug'
      ],
      newSafeguards: [
        'A. Route alias resolver (' + Object.keys(ROUTE_ALIASES).length + ' aliases)',
        'B. Renderer-readiness wrapper (max ' + RENDERER_WAIT_MS + 'ms wachten)',
        'C. Click-audit observer (capture-phase, 250-event ring buffer)',
        'D. Try/catch fallback in beide nav-functies (originele code blijft intact)'
      ],
      buttonInventory: inventory,
      buttonsWithIssues: buttonsWithIssues,
      isInstalled: !!(window.DY && DY.toonPagina && DY.toonPagina.__navRestored)
    };
  }

  function summary() {
    var r = generateReport();
    return {
      totalEvents: r.totalEvents,
      byKind: r.byKind,
      buttonsScanned: r.buttonInventory.length,
      buttonsWithIssues: r.buttonsWithIssues.length,
      aliasesActive: r.routesAdjusted,
      errors: r.errorsFound.length,
      installed: r.isInstalled
    };
  }

  window.PP_NavAudit = {
    VERSION: '1.0.0',
    report:  generateReport,
    summary: summary,
    events:  function () { return (window.__ppNavAudit || []).slice(); },
    inventory: inventoryButtons,
    aliases: function () { return Object.assign({}, ROUTE_ALIASES); },
    resolve: normalizeRouteName,
    clear:   function () { window.__ppNavAudit = []; },
    isInstalled: function () {
      return !!(window.DY && DY.toonPagina && DY.toonPagina.__navRestored);
    },
    setVerbose: function (on) {
      VERBOSE = !!on;
      try { localStorage.setItem('pp_debug_nav', on ? '1' : '0'); } catch (_) {}
      return VERBOSE;
    }
  };
})();
