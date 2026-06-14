// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat - Admin Server Errors v1 (v60)
//
// Niet-invasieve companion voor admin.html:
//   • Voegt een tweede panel toe in tab "Errors" met server-side
//     client errors uit MongoDB (verzameld door error-logger-v1.js).
//   • Per regel een "✕"-knop voor delete.
//   • Bulk "Wis alle" + "Wis ouder dan 24u" knoppen.
//   • Filter op kind, zoek op message, auto-refresh elke 30s.
//
// Raakt het core bundle NIET aan. Wordt los geladen vanuit admin.html.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── 1) Backend base URL bepalen ─────────────────────────────────
  function apiBase() {
    try {
      if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
        return window.DY.aiHealth.apiBase();
      }
    } catch (e) { /* ignore */ }
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('emergentagent.com') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    if (host.indexOf('paskamerpraat.nl') >= 0)  return 'https://paskamer-stability.preview.emergentagent.com';
    return '';
  }

  // ── 2) DOM helpers ──────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmt(n) {
    try { return Number(n||0).toLocaleString('nl-NL'); } catch (e) { return String(n||0); }
  }
  function tijd(ts) {
    if (!ts) return '-';
    try { return new Date(ts).toLocaleString('nl-NL', { hour12:false }); }
    catch (e) { return String(ts).slice(0,19); }
  }
  function kindBadge(k) {
    var cls = 'b-gray';
    if (k === 'runtime-error')      cls = 'b-red';
    else if (k === 'unhandled-rejection') cls = 'b-amber';
    else if (k === 'console-error') cls = 'b-blue';
    else if (k === 'resource-error') cls = 'b-amber';
    return '<span class="badge ' + cls + '" style="font-size:9px">' + esc(k || '-') + '</span>';
  }

  // ── 3) State ────────────────────────────────────────────────────
  var state = {
    rows: [],
    total: 0,
    filterKind: '',
    filterQ: '',
    busy: false,
    autoTimer: null,
  };

  // ── 4) Panel HTML injecteren in #t-errors ───────────────────────
  function ensurePanel() {
    var tab = document.getElementById('t-errors');
    if (!tab) return null;
    var existing = document.getElementById('se-panel');
    if (existing) return existing;

    var panel = document.createElement('div');
    panel.className = 'panel';
    panel.id = 'se-panel';
    panel.style.marginTop = '14px';
    panel.innerHTML =
      '<div class="panel-head">' +
        '<span class="panel-title">🛰 Server-side client errors ' +
          '<span id="se-total" class="badge b-gold" style="font-size:9px;margin-left:4px">0</span>' +
        '</span>' +
        '<div class="panel-actions" style="flex-wrap:wrap;gap:6px">' +
          '<select class="inp" id="se-kind" style="font-size:11px">' +
            '<option value="">Alle types</option>' +
            '<option value="runtime-error">runtime-error</option>' +
            '<option value="unhandled-rejection">unhandled-rejection</option>' +
            '<option value="console-error">console-error</option>' +
            '<option value="resource-error">resource-error</option>' +
            '<option value="manual">manual</option>' +
          '</select>' +
          '<input class="inp" id="se-q" placeholder="Zoek in bericht…" style="font-size:11px;min-width:140px">' +
          '<button class="btn btn-sm" id="se-refresh">↻ Vernieuwen</button>' +
          '<label class="muted" style="font-size:10px;display:flex;align-items:center;gap:4px">' +
            '<input type="checkbox" id="se-auto" checked style="margin:0"> auto 30s' +
          '</label>' +
          '<button class="btn btn-sm" id="se-clear-old">🧹 &gt;24u wissen</button>' +
          '<button class="btn btn-sm btn-red" id="se-clear-all">🗑 Wis alles</button>' +
        '</div>' +
      '</div>' +
      '<div style="overflow-x:auto;max-height:520px;overflow-y:auto">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Tijd</th><th>Type</th><th>Bericht</th>' +
            '<th>Bron</th><th>UA</th><th></th>' +
          '</tr></thead>' +
          '<tbody id="se-tbody">' +
            '<tr><td colspan="6" class="loading">Laden…</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';
    tab.appendChild(panel);

    // listeners
    panel.querySelector('#se-refresh').addEventListener('click', function () { fetchAndRender(true); });
    panel.querySelector('#se-clear-all').addEventListener('click', onClearAll);
    panel.querySelector('#se-clear-old').addEventListener('click', onClearOld);
    panel.querySelector('#se-kind').addEventListener('change', function (e) {
      state.filterKind = e.target.value; fetchAndRender(true);
    });
    var qEl = panel.querySelector('#se-q');
    var qTimer = null;
    qEl.addEventListener('input', function (e) {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        state.filterQ = e.target.value.trim();
        fetchAndRender(true);
      }, 300);
    });
    panel.querySelector('#se-auto').addEventListener('change', function (e) {
      if (e.target.checked) startAuto(); else stopAuto();
    });

    return panel;
  }

  // ── 5) Render ───────────────────────────────────────────────────
  function render() {
    var tbody = document.getElementById('se-tbody');
    var totEl = document.getElementById('se-total');
    if (!tbody) return;
    if (totEl) totEl.textContent = fmt(state.total);

    if (!state.rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Geen errors gevonden.</td></tr>';
      return;
    }
    tbody.innerHTML = state.rows.map(function (r) {
      var src = '';
      if (r.url) src += '<div class="mono muted" style="font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.url) + '</div>';
      if (r.lineno) src += '<div class="muted" style="font-size:10px">L' + esc(r.lineno) + (r.colno ? ':'+esc(r.colno) : '') + '</div>';
      if (!src) src = '<span class="muted" style="font-size:10px">-</span>';

      var ua = (r.ua || '').slice(0, 60);
      var msg = esc(String(r.message || '').slice(0, 240));
      var stack = r.stack ? '<details style="margin-top:4px"><summary class="muted" style="font-size:10px;cursor:pointer">stack</summary><pre class="mono" style="font-size:10px;white-space:pre-wrap;max-width:520px;color:var(--text2);margin:4px 0 0">' + esc(String(r.stack).slice(0, 1500)) + '</pre></details>' : '';

      return '<tr>' +
        '<td class="mono muted" style="white-space:nowrap;font-size:10px">' + esc(tijd(r.server_ts || r.ts)) + '</td>' +
        '<td>' + kindBadge(r.kind) + '</td>' +
        '<td style="max-width:420px"><div style="font-size:11px;color:var(--text)">' + msg + '</div>' + stack + '</td>' +
        '<td>' + src + '</td>' +
        '<td class="muted" style="font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.ua||'') + '">' + esc(ua) + '</td>' +
        '<td style="text-align:right"><button class="btn btn-sm btn-red" data-eid="' + esc(r.id) + '" title="Verwijderen">✕</button></td>' +
      '</tr>';
    }).join('');

    // delete-knoppen
    var btns = tbody.querySelectorAll('button[data-eid]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-eid');
        if (id) onDeleteOne(id);
      });
    }
  }

  // ── 6) Fetch ────────────────────────────────────────────────────
  async function fetchAndRender(force) {
    if (state.busy && !force) return;
    state.busy = true;
    var base = apiBase();
    if (!base) { state.busy = false; return; }
    var u = base + '/api/client-error/recent?limit=200';
    if (state.filterKind) u += '&kind=' + encodeURIComponent(state.filterKind);
    if (state.filterQ)    u += '&q='    + encodeURIComponent(state.filterQ);
    try {
      var res = await fetch(u, { credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      state.rows  = Array.isArray(data.errors) ? data.errors : [];
      state.total = data.total || state.rows.length;
      render();
    } catch (e) {
      var tbody = document.getElementById('se-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:14px;color:var(--red);font-size:12px">⚠ Kon errors niet laden: ' + esc(e.message || e) + '</td></tr>';
    } finally {
      state.busy = false;
    }
  }

  // ── 7) Acties ───────────────────────────────────────────────────
  async function onDeleteOne(id) {
    if (!confirm('Deze error verwijderen?')) return;
    var base = apiBase(); if (!base) return;
    try {
      await fetch(base + '/api/client-error/' + encodeURIComponent(id), { method: 'DELETE' });
      state.rows = state.rows.filter(function (r) { return r.id !== id; });
      state.total = Math.max(0, state.total - 1);
      render();
    } catch (e) { alert('Mislukt: ' + (e.message || e)); }
  }
  async function onClearAll() {
    if (!confirm('ALLE server-side client errors permanent verwijderen?')) return;
    var base = apiBase(); if (!base) return;
    try {
      await fetch(base + '/api/client-error', { method: 'DELETE' });
      state.rows = []; state.total = 0; render();
    } catch (e) { alert('Mislukt: ' + (e.message || e)); }
  }
  async function onClearOld() {
    if (!confirm('Errors ouder dan 24 uur verwijderen?')) return;
    var base = apiBase(); if (!base) return;
    try {
      await fetch(base + '/api/client-error?older_than_hours=24', { method: 'DELETE' });
      fetchAndRender(true);
    } catch (e) { alert('Mislukt: ' + (e.message || e)); }
  }

  // ── 8) Auto-refresh ─────────────────────────────────────────────
  function startAuto() {
    stopAuto();
    state.autoTimer = setInterval(function () {
      var tab = document.getElementById('t-errors');
      if (tab && tab.classList.contains('on')) fetchAndRender(false);
    }, 30000);
  }
  function stopAuto() {
    if (state.autoTimer) clearInterval(state.autoTimer);
    state.autoTimer = null;
  }

  // ── 9) Trigger op tab-wissel + initieel ─────────────────────────
  function onTabShown() {
    var tab = document.getElementById('t-errors');
    if (!tab || !tab.classList.contains('on')) return;
    ensurePanel();
    fetchAndRender(true);
  }

  function init() {
    ensurePanel();
    // Patch globale go(): roep onze handler na tab-wissel.
    try {
      var origGo = window.go;
      if (typeof origGo === 'function' && !origGo.__seWrapped) {
        window.go = function (el) {
          var r = origGo.apply(this, arguments);
          try { onTabShown(); } catch (e) { /* ignore */ }
          return r;
        };
        window.go.__seWrapped = true;
      }
    } catch (e) { /* ignore */ }

    // Als de errors-tab al actief is bij init, direct laden.
    onTabShown();
    startAuto();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // admin-logic-v177.js wordt na ons geladen → wacht 1 tick
    setTimeout(init, 50);
  }

  // Debug-API
  try {
    window.DY = window.DY || {};
    window.DY.adminErrors = {
      version: 'v1-v60',
      refresh: function () { fetchAndRender(true); },
      state: function () { return { total: state.total, rows: state.rows.length }; },
    };
  } catch (e) { /* ignore */ }
})();
