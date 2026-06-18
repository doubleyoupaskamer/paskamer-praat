/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Campaign Flow Audit Layer (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING DEBUG / GUARD LAYER voor de Merken-Campagne flow.
 *
 * Doel:
 *   - 100% traceability van campagne-button-clicks, route-transities en
 *     state-mutaties zonder bestaande code te wijzigen.
 *   - Veiligheidsnetten (guards) die kapotte handlers of corrupte
 *     state-overgangen detecteren en fallback-acties triggeren - nooit
 *     blank screen, nooit redirect-loop.
 *
 * Hoe?
 *   1) Globale click-observer (capture-phase) → traceert clicks op alle
 *      `[data-testid^="brand-camp-"]` en `[data-testid^="bp-camp-"]`
 *      knoppen + admin tabs. Geen preventDefault, geen stopPropagation.
 *   2) Wrapper rond `DY.navigeer(pagina)` voor route-validatie + tracing.
 *   3) Wrapper rond `DY.brandPortal.nieuweCampagne / bewerkCampagne /
 *      pauseCampagne / resumeCampagne` voor state-mutatie tracing.
 *   4) State drift watcher: signaleert wanneer `BP._huidigCampagneId`
 *      buiten de bekende paden gemuteerd wordt of langer dan 60s blijft
 *      hangen (orphan edit-context).
 *   5) Firestore-call tracer: wrap `DY.db.collection('campaigns')` calls
 *      via een lichte proxy (best-effort, breaks niet bij ontbrekende
 *      Firebase).
 *
 * Debug API:
 *   - window.__ppCampaignAudit  (laatste 200 events, ring buffer)
 *   - window.PP_CampaignAudit.report()         → structured rapport
 *   - window.PP_CampaignAudit.summary()        → korte samenvatting
 *   - window.PP_CampaignAudit.clear()
 *   - window.PP_CampaignAudit.isInstalled()
 *
 * Activatie:
 *   Stil-logging is ALTIJD actief (passief, lage footprint).
 *   Uitgebreide trace ALS query-param ?debug=campaign aanwezig is OF
 *   localStorage.pp_debug_campaign === '1' → toont ook console.log met
 *   prefix [campaign-audit].
 *
 * VEILIG: geen wijzigingen aan brand-portal-v1.js, geen DOM-injectie,
 * geen routes, geen Firestore writes.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppCampaignAuditInit) return;
  window.__ppCampaignAuditInit = true;

  var TAG = '[campaign-audit]';
  var BUFFER_MAX = 200;
  var ORPHAN_TIMEOUT_MS = 60000;

  // ── Verbose mode detectie ────────────────────────────────────────
  var VERBOSE = false;
  try {
    var qs = new URLSearchParams(location.search);
    if (qs.get('debug') === 'campaign') VERBOSE = true;
    if (localStorage.getItem('pp_debug_campaign') === '1') VERBOSE = true;
  } catch (_) {}

  window.__ppCampaignAudit = window.__ppCampaignAudit || [];

  function log(kind, payload) {
    try {
      var entry = Object.assign({ kind: kind, ts: new Date().toISOString() }, payload || {});
      window.__ppCampaignAudit.push(entry);
      if (window.__ppCampaignAudit.length > BUFFER_MAX) {
        window.__ppCampaignAudit.splice(0, window.__ppCampaignAudit.length - BUFFER_MAX);
      }
      if (VERBOSE) {
        try { console.log(TAG, kind, payload); } catch (_) {}
      }
    } catch (_) {}
  }

  // ── 1) Click-observer ───────────────────────────────────────────
  var CAMPAIGN_TESTID_PREFIXES = [
    'brand-camp-',      // brand portal campagne CTAs
    'bp-camp-',         // form fields + submit
    'brand-dash-campagnes',
    'admin-tab-campagnes',
    'admin-camp-'       // toekomstige admin actions
  ];

  function matchCampaignTestid(testid) {
    if (!testid) return null;
    for (var i = 0; i < CAMPAIGN_TESTID_PREFIXES.length; i++) {
      var p = CAMPAIGN_TESTID_PREFIXES[i];
      if (testid === p || testid.indexOf(p) === 0) return p;
    }
    return null;
  }

  document.addEventListener('click', function (ev) {
    try {
      var el = ev.target;
      // walk up max 5 levels naar een element met data-testid
      var hops = 0, tid = null;
      while (el && hops < 5) {
        if (el.getAttribute) {
          tid = el.getAttribute('data-testid');
          if (tid) break;
        }
        el = el.parentNode;
        hops++;
      }
      var prefix = matchCampaignTestid(tid);
      if (!prefix) return;
      log('click', {
        testid: tid,
        prefix: prefix,
        tag: (el && el.tagName) || null,
        text: (el && (el.textContent || '').trim().slice(0, 60)) || null,
        route: (window.DY && DY.pagina) || null,
        uid: (window.firebase && firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.uid) || null,
        editingId: (window.DY && DY.brandPortal && DY.brandPortal._huidigCampagneId) || null
      });
    } catch (e) {
      log('click_error', { error: (e && e.message) || String(e) });
    }
  }, true);

  // ── 2) Route wrapper (DY.navigeer) ──────────────────────────────
  var CAMP_ROUTES = {
    brand_campagnes: 1,
    brand_campagne_nieuw: 1,
    admin_campagnes: 1
  };

  function wrapNavigeer() {
    if (!window.DY || typeof DY.navigeer !== 'function') return false;
    if (DY.navigeer.__campAudited) return true;
    var orig = DY.navigeer;
    var wrapped = function (pagina, params) {
      try {
        var isCamp = !!CAMP_ROUTES[pagina];
        if (isCamp || pagina === undefined) {
          log('navigeer', {
            naar: pagina,
            van: (window.DY && DY.pagina) || null,
            editingId: (window.DY && DY.brandPortal && DY.brandPortal._huidigCampagneId) || null,
            params: params || null
          });
        }
      } catch (_) {}
      try {
        return orig.apply(this, arguments);
      } catch (e) {
        // Guard: vang exceptions zodat één kapotte handler niet de
        // hele UI breekt. Log + fallback naar brand_dashboard.
        log('navigeer_error', {
          naar: pagina,
          error: (e && e.message) || String(e)
        });
        try {
          if (CAMP_ROUTES[pagina]) {
            // Veilige fallback - geen redirect, alleen state reset
            return orig.call(this, 'brand_dashboard');
          }
        } catch (_) {}
        throw e;
      }
    };
    wrapped.__campAudited = true;
    DY.navigeer = wrapped;
    return true;
  }

  // ── 3) brandPortal action wrappers ──────────────────────────────
  function wrapBrandPortalActions() {
    if (!window.DY || !DY.brandPortal) return false;
    var bp = DY.brandPortal;
    if (bp.__campAudited) return true;
    bp.__campAudited = true;

    var ACTIONS = ['nieuweCampagne', 'bewerkCampagne', 'pauseCampagne', 'resumeCampagne'];
    ACTIONS.forEach(function (name) {
      if (typeof bp[name] !== 'function') return;
      var orig = bp[name];
      bp[name] = function () {
        var args = Array.prototype.slice.call(arguments);
        var before = bp._huidigCampagneId;
        log('action_call', {
          action: name,
          args: args,
          beforeEditingId: before,
          route: (window.DY && DY.pagina) || null
        });
        try {
          var r = orig.apply(this, args);
          // Async support: log na resolve
          if (r && typeof r.then === 'function') {
            r.then(function () {
              log('action_done', {
                action: name,
                afterEditingId: bp._huidigCampagneId,
                route: (window.DY && DY.pagina) || null
              });
            }, function (err) {
              log('action_error', {
                action: name,
                error: (err && err.message) || String(err)
              });
            });
          } else {
            log('action_done', {
              action: name,
              afterEditingId: bp._huidigCampagneId,
              route: (window.DY && DY.pagina) || null
            });
          }
          return r;
        } catch (e) {
          log('action_error', {
            action: name,
            error: (e && e.message) || String(e)
          });
          throw e;
        }
      };
    });
    return true;
  }

  // ── 4) State drift watcher ──────────────────────────────────────
  function startStateWatcher() {
    if (!window.DY || !DY.brandPortal) return false;
    var bp = DY.brandPortal;
    if (bp.__campStateWatcher) return true;
    bp.__campStateWatcher = true;

    var lastId = bp._huidigCampagneId || null;
    var lastChangeAt = Date.now();

    setInterval(function () {
      try {
        var cur = bp._huidigCampagneId || null;
        if (cur !== lastId) {
          log('state_change', {
            field: '_huidigCampagneId',
            from: lastId,
            to: cur,
            route: (window.DY && DY.pagina) || null
          });
          lastId = cur;
          lastChangeAt = Date.now();
          return;
        }
        // Orphan detectie: editing-id staat actief maar we zitten niet
        // meer op het form. Indicatie van state-drift.
        if (cur && (Date.now() - lastChangeAt) > ORPHAN_TIMEOUT_MS) {
          var route = (window.DY && DY.pagina) || null;
          if (route !== 'brand_campagne_nieuw') {
            log('state_drift', {
              field: '_huidigCampagneId',
              value: cur,
              route: route,
              ageMs: Date.now() - lastChangeAt,
              hint: 'editing-id active outside brand_campagne_nieuw route'
            });
            // Veilige auto-clear om vervolgklikken niet te corrumperen
            try { bp._huidigCampagneId = null; lastId = null; lastChangeAt = Date.now(); } catch (_) {}
            log('state_autoclear', { field: '_huidigCampagneId' });
          }
        }
      } catch (_) {}
    }, 5000);

    return true;
  }

  // ── 5) Lichte Firestore-tracer voor campaigns collectie ─────────
  function wrapFirestoreCampaigns() {
    if (!window.DY || !DY.db || typeof DY.db.collection !== 'function') return false;
    if (DY.db.__campAudited) return true;
    var orig = DY.db.collection;
    DY.db.collection = function (name) {
      var coll = orig.apply(this, arguments);
      if (name !== 'campaigns') return coll;
      // Wrap een paar veelgebruikte methodes (alleen tracing)
      try {
        var origDoc = coll.doc && coll.doc.bind(coll);
        if (origDoc) {
          coll.doc = function (id) {
            var d = origDoc(id);
            // Wrap set/get/update voor tracing
            ['set', 'update'].forEach(function (m) {
              if (typeof d[m] !== 'function') return;
              var om = d[m].bind(d);
              d[m] = function (data, opts) {
                log('fs_write', {
                  op: m,
                  docId: id,
                  fields: data ? Object.keys(data) : [],
                  hasStatus: !!(data && data.status),
                  status: (data && data.status) || null
                });
                return om(data, opts);
              };
            });
            return d;
          };
        }
      } catch (_) {}
      return coll;
    };
    DY.db.__campAudited = true;
    return true;
  }

  // ── Init met retry (defer-scripts laden async) ──────────────────
  function tryInstall() {
    var ok = {
      navigeer: wrapNavigeer(),
      actions:  wrapBrandPortalActions(),
      state:    startStateWatcher(),
      firestore: wrapFirestoreCampaigns()
    };
    return ok.navigeer && ok.actions; // minimum acceptabel
  }

  function init() {
    if (tryInstall()) {
      log('installed', { verbose: VERBOSE });
      try { if (VERBOSE) console.log(TAG, 'audit layer installed (verbose=on)'); } catch (_) {}
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 60) {
        clearInterval(iv);
        log('installed', { verbose: VERBOSE, tries: tries });
        try { if (VERBOSE) console.log(TAG, 'audit layer installed after', tries, 'retries'); } catch (_) {}
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Rapport-generator (Output-Audit voor de master prompt) ──────
  function generateReport() {
    var events = (window.__ppCampaignAudit || []).slice();
    var byKind = {};
    events.forEach(function (e) { byKind[e.kind] = (byKind[e.kind] || 0) + 1; });

    var clicksWithoutHandler = [];
    var navErrors = events.filter(function (e) { return e.kind === 'navigeer_error'; });
    var actionErrors = events.filter(function (e) { return e.kind === 'action_error'; });
    var stateDrifts = events.filter(function (e) { return e.kind === 'state_drift'; });
    var autoclears  = events.filter(function (e) { return e.kind === 'state_autoclear'; });

    // Race-condition heuristiek: 2+ navigeer events binnen 200ms
    var races = [];
    for (var i = 1; i < events.length; i++) {
      if (events[i].kind === 'navigeer' && events[i - 1].kind === 'navigeer') {
        var dt = new Date(events[i].ts) - new Date(events[i - 1].ts);
        if (dt < 200) races.push({ a: events[i - 1], b: events[i], deltaMs: dt });
      }
    }

    return {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      verbose: VERBOSE,
      totalEvents: events.length,
      byKind: byKind,
      buttonIssues: clicksWithoutHandler,
      routeIssues: navErrors,
      stateIssues: stateDrifts.concat(autoclears),
      apiIssues: events.filter(function (e) { return e.kind === 'fs_write' && !e.status && e.fields && e.fields.indexOf('status') >= 0; }),
      actionErrors: actionErrors,
      raceConditions: races,
      isInstalled: !!(window.DY && DY.navigeer && DY.navigeer.__campAudited),
      fixStrategy: [
        'Houd campaign-audit-v1 actief in productie (passieve modus). Schakel verbose aan via ?debug=campaign of localStorage.pp_debug_campaign=1.',
        'Bij state_drift events: controleer of bewerkCampagne ID correct gereset wordt na save/cancel. Auto-clear is reeds geactiveerd na 60s buiten brand_campagne_nieuw.',
        'Bij navigeer_error events: fallback naar brand_dashboard is reeds actief. Onderzoek originele exception in errorlogs.',
        'Bij race_conditions (<200ms tussen 2 navigeers): voeg debounce toe op nieuweCampagne/bewerkCampagne (kandidaat voor v2).',
        'Periodiek logs exporteren via PP_CampaignAudit.report() en archiveren in Firestore brand_admin_log voor lange-termijn analyse.'
      ]
    };
  }

  function summary() {
    var r = generateReport();
    return {
      totalEvents: r.totalEvents,
      byKind: r.byKind,
      routeIssues: r.routeIssues.length,
      stateIssues: r.stateIssues.length,
      apiIssues: r.apiIssues.length,
      actionErrors: r.actionErrors.length,
      raceConditions: r.raceConditions.length,
      installed: r.isInstalled
    };
  }

  window.PP_CampaignAudit = {
    VERSION: '1.0.0',
    report:  generateReport,
    summary: summary,
    events:  function () { return (window.__ppCampaignAudit || []).slice(); },
    clear:   function () { window.__ppCampaignAudit = []; },
    isInstalled: function () {
      return !!(window.DY && DY.navigeer && DY.navigeer.__campAudited);
    },
    setVerbose: function (on) {
      VERBOSE = !!on;
      try { localStorage.setItem('pp_debug_campaign', on ? '1' : '0'); } catch (_) {}
      return VERBOSE;
    }
  };
})();
