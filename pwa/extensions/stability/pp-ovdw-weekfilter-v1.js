/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Post van de Week (OVDW) Week-Filter & Audit Wrapper v1.0.0
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING wrapper rond DY._ovdwLaad en DY._pvdwLaadWinnaar.
 * Lost twee productie-bugs op zonder pwa-v463 of UI te wijzigen.
 *
 * Bugs:
 *   1. _ovdwLaad query had GEEN week-filter:
 *        DY.db.collection('stories').orderBy('ts','desc').limit(40)
 *      → Posts van mei/april/maart bleven verschijnen als "actieve"
 *        Post van de Week kaarten.
 *   2. _pvdwLaadWinnaar haalt meest recente `status=='selected'`
 *      op, ook als die uit een veel oudere week komt → "winnaar van
 *      week 18" bleef hangen tot er een nieuwe selected-record kwam.
 *
 * Fix-strategie (additief):
 *   A) Week-window bepaling
 *        weekStart = maandag 00:01:00 (lokale tijd, NL = Europe/Amsterdam)
 *        weekEnd   = zondag  23:59:59
 *      Daarnaast ISO-weekId 'YYYY-Www' (UTC) voor winnaar-vergelijking.
 *   B) _ovdwLaad wrapper:
 *        - Roept origineel aan
 *        - Filtert kaarten in DOM: kaarten waarvan ts buiten week-window
 *          valt krijgen `display:none` (UI blijft 100% intact)
 *        - Toont leeg-state als 0 kaarten over zijn
 *   C) _pvdwLaadWinnaar wrapper:
 *        - Roept origineel aan
 *        - Checkt na render: als winnaar-banner weekId !== vorige ISO-week,
 *          vervangt banner door "geen winnaar" state (UI hergebruik).
 *   D) Audit logging via PP_OvdwAudit.report() voor diagnose.
 *
 * Veiligheid:
 *   - Geen functies overschreven, alleen `.apply()` wrap met
 *     post-hoc DOM-filter.
 *   - Wrapper draait read-only (geen Firestore writes).
 *   - Wekelijkse cron job voor winnaar-selectie + notifications is
 *     BACKEND verantwoordelijkheid (zie OVDW_CRON_TODO in code).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppOvdwWeekfilterInit) return;
  window.__ppOvdwWeekfilterInit = true;

  var TAG = '[ovdw-weekfilter]';
  var VERBOSE = false;
  try {
    if (new URLSearchParams(location.search).get('debug') === 'ovdw') VERBOSE = true;
    if (localStorage.getItem('pp_debug_ovdw') === '1') VERBOSE = true;
  } catch (_) {}

  window.__ppOvdwAudit = window.__ppOvdwAudit || [];
  function log(kind, payload) {
    try {
      var entry = Object.assign({ kind: kind, ts: new Date().toISOString() }, payload || {});
      window.__ppOvdwAudit.push(entry);
      if (window.__ppOvdwAudit.length > 50) window.__ppOvdwAudit.shift();
      if (VERBOSE) { try { console.log(TAG, kind, payload); } catch (_) {} }
    } catch (_) {}
  }

  // ── A) Week-window helpers ──────────────────────────────────────
  // Maandag 00:01 lokale tijd → zondag 23:59:59. NL-zone Europe/Amsterdam.
  function currentWeekWindow() {
    var now = new Date();
    var dow = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    var diffToMon = (dow === 0 ? -6 : 1 - dow);
    var monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);
    monday.setHours(0, 1, 0, 0);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday, startMs: monday.getTime(), endMs: sunday.getTime() };
  }

  // ISO week-id (UTC) zoals server gebruikt: 'YYYY-Www'
  function isoWeekId(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
  }
  function prevIsoWeekId() {
    var d = new Date();
    d.setDate(d.getDate() - 7);
    return isoWeekId(d);
  }
  function currentIsoWeekId() {
    return isoWeekId(new Date());
  }

  // Extract timestamp uit kaart (ts data attr, of probeer via post-id lookup)
  function getKaartTsMs(kaart, postsById) {
    // Eerst: kijk in posts-cache als beschikbaar
    var pid = kaart.dataset && kaart.dataset.postId;
    if (pid && postsById && postsById[pid]) {
      var p = postsById[pid];
      var t = p.tsMs || (p.ts && p.ts.toMillis ? p.ts.toMillis()
            : (p.ts && p.ts.seconds ? p.ts.seconds * 1000 : 0));
      if (t) return t;
    }
    // Fallback: parse de getoonde datum-tekst (formaat "dd mmm")
    // We laten kaarten ZONDER eenduidige ts staan om data niet weg te gooien.
    return null;
  }

  // ── B) DY._ovdwLaad wrapper ─────────────────────────────────────
  function wrapOvdwLaad() {
    if (!window.DY || typeof DY._ovdwLaad !== 'function') return false;
    if (DY._ovdwLaad.__ppWeekFiltered) return true;
    var orig = DY._ovdwLaad;
    DY._ovdwLaad.__ppWeekFiltered = true;

    DY._ovdwLaad = function () {
      var self = this, args = arguments;
      var weekWindow = currentWeekWindow();
      log('ovdw_laad_start', {
        weekStart: weekWindow.start.toISOString(),
        weekEnd: weekWindow.end.toISOString()
      });

      var result;
      try { result = orig.apply(self, args); }
      catch (e) { log('ovdw_laad_error', { error: (e && e.message) || String(e) }); throw e; }

      function applyWeekFilter() {
        try {
          var grid = document.getElementById('dy-ovdw-grid');
          if (!grid) { setTimeout(applyWeekFilter, 250); return; }
          var kaarten = grid.querySelectorAll('.dy-ovdw-kaart');
          if (!kaarten.length) return;

          // Bouw post-cache uit Firestore voor accurate ts (lazy fetch)
          var ids = [];
          kaarten.forEach(function (k) {
            if (k.dataset && k.dataset.postId) ids.push(k.dataset.postId);
          });
          if (!ids.length || !DY.db) return;

          // Haal stories docs op (max 40 = limit van _ovdwLaad)
          Promise.all(ids.slice(0, 40).map(function (id) {
            return DY.db.collection('stories').doc(id).get()
              .then(function (s) { return s.exists ? Object.assign({ _id: id }, s.data()) : null; })
              .catch(function () { return null; });
          })).then(function (posts) {
            var byId = {};
            posts.forEach(function (p) { if (p) byId[p._id] = p; });

            var visibleCount = 0;
            var filteredCount = 0;
            kaarten.forEach(function (k) {
              var ts = getKaartTsMs(k, byId);
              if (ts == null) { visibleCount++; return; } // onbekend = laten staan
              if (ts < weekWindow.startMs || ts > weekWindow.endMs) {
                k.style.display = 'none';
                k.setAttribute('data-pp-week-hidden', '1');
                filteredCount++;
              } else {
                k.style.display = '';
                k.removeAttribute('data-pp-week-hidden');
                visibleCount++;
              }
            });

            log('ovdw_weekfilter_applied', {
              total: kaarten.length,
              visible: visibleCount,
              filtered: filteredCount,
              weekStart: weekWindow.start.toISOString()
            });

            // Geen kaarten meer over deze week? Toon leeg-state (hergebruik
            // bestaande markup uit pwa-v463, vermijd nieuwe UI).
            if (visibleCount === 0 && !grid.querySelector('.dy-ovdw-leeg')) {
              grid.insertAdjacentHTML('afterbegin',
                '<div class="dy-ovdw-leeg" data-pp-empty="weekfilter">' +
                  '<div class="dy-ovdw-leeg-icon">\u2736</div>' +
                  '<p>Nog geen posts deze week.</p>' +
                  '<p class="dy-ovdw-leeg-sub">Deel jouw look en maak kans op Post van de Week!</p>' +
                '</div>');
            } else {
              var oldEmpty = grid.querySelector('[data-pp-empty="weekfilter"]');
              if (oldEmpty && visibleCount > 0) oldEmpty.remove();
            }
          });
        } catch (e) {
          log('ovdw_weekfilter_error', { error: (e && e.message) || String(e) });
        }
      }

      // Geef _ovdwLaad tijd om DOM te renderen
      if (result && typeof result.then === 'function') {
        result.then(applyWeekFilter).catch(applyWeekFilter);
      } else {
        setTimeout(applyWeekFilter, 600);
      }
      return result;
    };
    return true;
  }

  // ── C) DY._pvdwLaadWinnaar wrapper ──────────────────────────────
  function wrapPvdwLaadWinnaar() {
    if (!window.DY || typeof DY._pvdwLaadWinnaar !== 'function') return false;
    if (DY._pvdwLaadWinnaar.__ppWeekFiltered) return true;
    var orig = DY._pvdwLaadWinnaar;
    DY._pvdwLaadWinnaar.__ppWeekFiltered = true;

    DY._pvdwLaadWinnaar = function () {
      var self = this, args = arguments;
      var prevWeek = prevIsoWeekId();
      var thisWeek = currentIsoWeekId();
      log('winnaar_laad_start', { prevWeek: prevWeek, thisWeek: thisWeek });

      var result;
      try { result = orig.apply(self, args); }
      catch (e) { log('winnaar_laad_error', { error: (e && e.message) || String(e) }); throw e; }

      function validateWinnaarWeek() {
        try {
          if (!DY.db) return;
          // Re-query winnaar maar nu MET week-filter
          DY.db.collection('weekly_rankings')
            .where('status', '==', 'selected')
            .where('weekId', '==', prevWeek)
            .limit(1).get()
            .then(function (snap) {
              var banner = document.getElementById('dy-ovdw-winnaar-banner');
              if (!banner) return;
              if (snap.empty) {
                // Geen winnaar voor vorige week → toon "geen winnaar" state
                // Hergebruik bestaande markup (geen UI changes).
                banner.innerHTML =
                  '<div class="dy-ovdw-geen-winnaar" data-pp-week-validated="1">' +
                    '<span class="dy-ovdw-geen-icon">👑</span>' +
                    '<div>' +
                      '<div class="dy-ovdw-geen-titel">Nog geen winnaar deze week</div>' +
                      '<div class="dy-ovdw-geen-sub">Posts met 25+ likes maken kans. ' +
                        'Winnaar wordt elke maandag gekozen.</div>' +
                    '</div>' +
                  '</div>';
                log('winnaar_geen_voor_vorige_week', { prevWeek: prevWeek });
              } else {
                log('winnaar_valide', { prevWeek: prevWeek });
              }
            }).catch(function (e) {
              log('winnaar_check_error', { error: (e && e.message) || String(e) });
            });
        } catch (e) {
          log('winnaar_validate_error', { error: (e && e.message) || String(e) });
        }
      }

      if (result && typeof result.then === 'function') {
        result.then(validateWinnaarWeek).catch(validateWinnaarWeek);
      } else {
        setTimeout(validateWinnaarWeek, 800);
      }
      return result;
    };
    return true;
  }

  // ── Init met retry voor defer-loading ───────────────────────────
  function tryInstall() {
    return wrapOvdwLaad() && wrapPvdwLaadWinnaar();
  }
  function init() {
    if (tryInstall()) { log('installed'); return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryInstall() || tries > 80) {
        clearInterval(iv);
        log('installed', { tries: tries });
      }
    }, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public diagnostic API ───────────────────────────────────────
  window.PP_OvdwAudit = {
    VERSION: '1.0.0',
    weekWindow: currentWeekWindow,
    currentIsoWeekId: currentIsoWeekId,
    prevIsoWeekId: prevIsoWeekId,
    report: function () {
      return {
        version: '1.0.0',
        installed: !!(window.DY && DY._ovdwLaad && DY._ovdwLaad.__ppWeekFiltered),
        winnaarWrapped: !!(window.DY && DY._pvdwLaadWinnaar && DY._pvdwLaadWinnaar.__ppWeekFiltered),
        weekWindow: currentWeekWindow(),
        currentWeekId: currentIsoWeekId(),
        prevWeekId: prevIsoWeekId(),
        events: (window.__ppOvdwAudit || []).slice()
      };
    },
    events: function () { return (window.__ppOvdwAudit || []).slice(); },
    clear: function () { window.__ppOvdwAudit = []; },
    setVerbose: function (on) {
      VERBOSE = !!on;
      try { localStorage.setItem('pp_debug_ovdw', on ? '1' : '0'); } catch (_) {}
      return VERBOSE;
    }
  };

  /* OVDW_CRON_TODO (backend - buiten scope PWA-only fix):
   * Voor volledige cyclus (maandag 00:01 reset, winnaar-selectie,
   * admin + user notification) is een Cloud Function / Cloudflare Worker
   * vereist die wekelijks:
   *   1. Top story van afgelopen week selecteert (likes>=25, week-window)
   *   2. weekly_rankings doc schrijft {weekId, postId, status:'selected'}
   *   3. brand_admin_log entry maakt voor admin
   *   4. /api/notify-winner endpoint aanroept met postId+uid
   * De PWA leest hier alleen uit - geen client-side write nodig.
   */
})();
