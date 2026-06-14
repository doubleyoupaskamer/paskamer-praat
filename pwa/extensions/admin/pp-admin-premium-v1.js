/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat — Admin Premium Management (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Route: admin_premium  →  /#admin_premium  (alleen DY._isAdmin())
 *
 * Tabs:
 *   1. Stripe Status     — keys (masked), config, webhook URL, packages
 *   2. Checkout Debug    — test-knop, raw response, redirect URL, errors
 *   3. Users             — premium_users tabel + grant/revoke
 *   4. Transactions      — payment_transactions log
 *   5. Webhooks          — stripe_events monitor
 *   6. Entitlements      — feature-toegang per email
 *
 * Admin-auth: X-Admin-Secret + X-User-Email headers (zelfde als image-gen).
 *
 * NON-BREAKING: voegt alleen toe — geen wijziging in legacy/bestaande UI.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isAdmin() { return !!(window.DY && window.DY._isAdmin && window.DY._isAdmin()); }
  function apiBase() {
    if (window.DY && DY.config && DY.config.API_BASE) return DY.config.API_BASE;
    return window.location.origin;
  }
  function adminEmail() {
    try {
      if (window.firebase && firebase.auth) {
        var u = firebase.auth().currentUser;
        if (u && u.email) return u.email;
      }
    } catch(_) {}
    return '';
  }
  function getSecret() {
    return (window.DY && DY.ADMIN_GEN_SECRET) ||
           (localStorage.getItem('dy_admin_secret') || '');
  }
  function setSecretFlow() {
    var cur = getSecret();
    var v = prompt('Admin secret (X-Admin-Secret):', cur || '');
    if (v == null) return null;
    localStorage.setItem('dy_admin_secret', v);
    return v;
  }
  function headers() {
    var s = getSecret();
    if (!s) s = setSecretFlow();
    return {
      'Content-Type': 'application/json',
      'X-Admin-Secret': s || '',
      'X-User-Email': adminEmail(),
    };
  }
  async function api(path, opts) {
    opts = opts || {};
    var url = apiBase() + path;
    var init = {
      method: opts.method || 'GET',
      headers: headers(),
      cache: 'no-store',
    };
    if (opts.body) init.body = JSON.stringify(opts.body);
    var r;
    try { r = await fetch(url, init); }
    catch(e) { return { __error: 'Netwerkfout: ' + e.message }; }
    var txt = await r.text();
    var data;
    try { data = txt ? JSON.parse(txt) : {}; } catch(_) { data = { raw: txt }; }
    if (!r.ok) return { __error: data.detail || data.error || ('HTTP ' + r.status), __status: r.status, __body: data };
    return data;
  }

  // ── CSS (eenmalig) ──────────────────────────────────────────────────
  function ensureStyle() {
    if (document.getElementById('pp-admin-prem-style')) return;
    var s = document.createElement('style');
    s.id = 'pp-admin-prem-style';
    s.textContent = [
      '.ppap{padding:20px 16px 90px;color:#fcf8ef;font-family:"DM Sans",system-ui,sans-serif;max-width:1100px;margin:0 auto}',
      '.ppap h1{font:400 1.6rem/1.2 "DM Serif Display",Georgia,serif;margin:0 0 6px;color:#fcf8ef}',
      '.ppap .ppap-sub{color:rgba(252,248,239,.65);font-size:.85rem;margin:0 0 18px}',
      '.ppap-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;border-bottom:1px solid rgba(252,248,239,.10);padding-bottom:8px}',
      '.ppap-tab{font:600 .82rem/1 "DM Sans",sans-serif;padding:9px 13px;background:transparent;border:1px solid rgba(252,248,239,.10);border-radius:100px;color:rgba(252,248,239,.7);cursor:pointer;transition:all .15s ease}',
      '.ppap-tab:hover{color:#fcf8ef;border-color:rgba(212,145,10,.4)}',
      '.ppap-tab.on{background:#d4910a;color:#1e1a0f;border-color:#d4910a}',
      '.ppap-card{background:rgba(255,255,255,.03);border:1px solid rgba(252,248,239,.08);border-radius:14px;padding:18px;margin-bottom:14px}',
      '.ppap-card h3{font:600 1rem/1.2 "DM Sans",sans-serif;margin:0 0 12px;color:#fcf8ef;letter-spacing:-.005em}',
      '.ppap-kv{display:grid;grid-template-columns:180px 1fr;gap:8px 14px;font-size:.85rem}',
      '.ppap-kv dt{color:rgba(252,248,239,.55);font-weight:500}',
      '.ppap-kv dd{margin:0;color:#fcf8ef;word-break:break-all;font-family:"DM Mono",ui-monospace,monospace;font-size:.78rem}',
      '.ppap-pill{display:inline-block;padding:3px 9px;border-radius:100px;font:600 .68rem/1.4 "DM Sans",sans-serif;letter-spacing:.04em;text-transform:uppercase}',
      '.ppap-pill.ok{background:rgba(34,197,94,.18);color:#5fd592}',
      '.ppap-pill.fail{background:rgba(239,68,68,.18);color:#ff8585}',
      '.ppap-pill.test{background:rgba(212,145,10,.18);color:#d4910a}',
      '.ppap-pill.warn{background:rgba(245,158,11,.18);color:#f5b94a}',
      '.ppap-btn{font:600 .82rem/1 "DM Sans",sans-serif;padding:10px 16px;background:#d4910a;color:#1e1a0f;border:none;border-radius:100px;cursor:pointer;transition:all .15s ease;margin:0 6px 6px 0}',
      '.ppap-btn:hover{background:#b87807;transform:translateY(-1px)}',
      '.ppap-btn.ghost{background:transparent;color:#d4910a;border:1px solid rgba(212,145,10,.35)}',
      '.ppap-btn.ghost:hover{background:rgba(212,145,10,.10)}',
      '.ppap-btn.danger{background:transparent;color:#ff8585;border:1px solid rgba(239,68,68,.35)}',
      '.ppap-btn.danger:hover{background:rgba(239,68,68,.10)}',
      '.ppap-input{font:500 .85rem/1 "DM Sans",sans-serif;padding:10px 13px;background:rgba(255,255,255,.04);border:1px solid rgba(252,248,239,.14);border-radius:10px;color:#fcf8ef;min-width:240px;margin:0 6px 6px 0}',
      '.ppap-input:focus{outline:none;border-color:#d4910a}',
      '.ppap-table{width:100%;border-collapse:collapse;font-size:.82rem}',
      '.ppap-table thead th{text-align:left;padding:9px 10px;color:rgba(252,248,239,.55);font:600 .7rem/1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid rgba(252,248,239,.10)}',
      '.ppap-table tbody td{padding:11px 10px;border-bottom:1px solid rgba(252,248,239,.05);vertical-align:top;font-family:"DM Mono",ui-monospace,monospace;font-size:.74rem;word-break:break-word}',
      '.ppap-table tbody td.act{font-family:"DM Sans",sans-serif;font-size:.78rem;white-space:nowrap}',
      '.ppap-pre{background:#0f0c08;border:1px solid rgba(252,248,239,.08);border-radius:8px;padding:12px;font:500 .72rem/1.45 "DM Mono",ui-monospace,monospace;color:#a8e6c9;overflow-x:auto;max-height:280px;white-space:pre-wrap;word-break:break-all}',
      '.ppap-pre.err{color:#ff8585}',
      '.ppap-features{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-top:10px}',
      '.ppap-feat{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(252,248,239,.08);border-radius:10px;font-size:.82rem}',
      '.ppap-feat .lbl{color:rgba(252,248,239,.85)}',
      '@media(max-width:600px){.ppap-kv{grid-template-columns:1fr}.ppap-table tbody td{font-size:.68rem}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Tab state ───────────────────────────────────────────────────────
  var _state = { tab: 'status', stripe: null, lastTest: null, users: [], txns: [], events: [], entitlements: null };

  function setTab(t) { _state.tab = t; render(); load(); }

  async function load() {
    var t = _state.tab;
    if (t === 'status') {
      _state.stripe = await api('/api/admin/premium/stripe-status');
    } else if (t === 'users') {
      var r = await api('/api/admin/premium/users');
      _state.users = (r && r.users) || [];
      _state.usersErr = r && r.__error;
    } else if (t === 'transactions') {
      var rt = await api('/api/admin/premium/transactions?limit=50');
      _state.txns = (rt && rt.transactions) || [];
      _state.txnsErr = rt && rt.__error;
    } else if (t === 'webhooks') {
      var rw = await api('/api/admin/premium/webhooks?limit=50');
      _state.events = (rw && rw.events) || [];
      _state.eventsErr = rw && rw.__error;
    }
    render();
  }

  // ── Renderers ───────────────────────────────────────────────────────
  function topBar() {
    var tabs = [
      ['status',       'Stripe status'],
      ['checkout',     'Checkout debug'],
      ['users',        'Premium users'],
      ['transactions', 'Transactions'],
      ['webhooks',     'Webhooks'],
      ['entitlements', 'Entitlements'],
    ];
    return tabs.map(function(t) {
      var on = _state.tab === t[0];
      return '<button class="ppap-tab' + (on ? ' on' : '') + '" data-testid="ppap-tab-' + t[0] + '" onclick="PP_AdminPremium.tab(\'' + t[0] + '\')">' + t[1] + '</button>';
    }).join('');
  }

  function renderStatus() {
    var s = _state.stripe;
    if (!s) return '<div class="ppap-card">Status laden…</div>';
    if (s.__error) return errorCard('Stripe status', s.__error, s.__body);
    var keyOK = s.stripe_configured;
    return [
      '<div class="ppap-card" data-testid="ppap-stripe-card">',
        '<h3>Stripe configuratie ',
          '<span class="ppap-pill ' + (keyOK ? 'ok' : 'fail') + '">' + (keyOK ? 'Gekoppeld' : 'Niet geconfigureerd') + '</span>',
          ' <span class="ppap-pill ' + (s.stripe_key_type === 'live' ? 'ok' : 'test') + '">' + esc(s.stripe_key_type || '?') + '</span>',
        '</h3>',
        '<dl class="ppap-kv">',
          '<dt>API key</dt><dd>' + esc(s.stripe_api_key_masked || '—') + '</dd>',
          '<dt>Environment</dt><dd>' + esc(s.environment || '—') + '</dd>',
          '<dt>Webhook URL</dt><dd>' + esc(s.webhook_url || '—') + '</dd>',
          '<dt>Admin overrides</dt><dd>' + (s.admin_premium_emails || []).map(esc).join(', ') + '</dd>',
        '</dl>',
      '</div>',
      '<div class="ppap-card">',
        '<h3>Packages</h3>',
        '<dl class="ppap-kv">' +
          Object.keys(s.packages || {}).map(function(k) {
            var p = s.packages[k];
            return '<dt>' + esc(k) + '</dt><dd>€ ' + (p.amount).toFixed(2) + ' / ' + esc(p.currency.toUpperCase()) + ' — ' + esc(p.label || '') + '</dd>';
          }).join('') +
        '</dl>',
      '</div>',
    ].join('');
  }

  function renderCheckoutDebug() {
    var lt = _state.lastTest;
    return [
      '<div class="ppap-card">',
        '<h3>Test checkout-sessie</h3>',
        '<p class="ppap-sub">Maakt direct een echte Stripe-sessie aan. Gebruik testkaart <code>4242 4242 4242 4242</code>.</p>',
        '<input id="ppap-test-email" class="ppap-input" type="email" placeholder="[email protected]" value="' + esc(adminEmail() || '[email protected]') + '" data-testid="ppap-test-email">',
        '<button class="ppap-btn" data-testid="ppap-test-go" onclick="PP_AdminPremium.runTestCheckout()">Genereer sessie</button>',
        (lt
          ? (lt.ok
              ? '<div style="margin-top:14px"><span class="ppap-pill ok">SUCCESS</span>' +
                '<dl class="ppap-kv" style="margin-top:10px"><dt>Session ID</dt><dd>' + esc(lt.session_id) + '</dd><dt>Redirect URL</dt><dd><a href="' + esc(lt.url) + '" target="_blank" style="color:#d4910a;text-decoration:underline" data-testid="ppap-test-redirect">' + esc(lt.url) + '</a></dd></dl>' +
                '<pre class="ppap-pre" data-testid="ppap-test-raw">' + esc(JSON.stringify(lt, null, 2)) + '</pre></div>'
              : '<div style="margin-top:14px"><span class="ppap-pill fail">FAIL</span><pre class="ppap-pre err">' + esc(JSON.stringify(lt, null, 2)) + '</pre></div>')
          : ''),
      '</div>',
    ].join('');
  }

  function renderUsers() {
    if (_state.usersErr) return errorCard('Premium users', _state.usersErr);
    var rows = (_state.users || []).map(function(u) {
      var src = u.source || (u.plan === 'premium_admin' ? 'admin_override' : 'stripe');
      var pillCls = u.is_premium ? 'ok' : 'fail';
      return '<tr>' +
        '<td>' + esc(u.email || u.user_key || '?') + '</td>' +
        '<td><span class="ppap-pill ' + pillCls + '">' + (u.is_premium ? 'premium' : 'expired') + '</span></td>' +
        '<td>' + esc(src) + '</td>' +
        '<td>' + esc(u.plan || '—') + '</td>' +
        '<td>' + esc((u.expires_at || u.activated_at || '').slice(0, 19)) + '</td>' +
        '<td class="act">' +
          (src === 'admin_override'
            ? '<span class="ppap-pill warn">via env</span>'
            : '<button class="ppap-btn danger" data-testid="ppap-revoke-' + esc(u.email || '') + '" onclick="PP_AdminPremium.revoke(\'' + esc(u.email || u.user_key || '') + '\')">Revoke</button>') +
        '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:rgba(252,248,239,.5);padding:30px">Geen premium users</td></tr>';
    return [
      '<div class="ppap-card">',
        '<h3>Premium toekennen</h3>',
        '<input id="ppap-grant-email" class="ppap-input" type="email" placeholder="[email protected]" data-testid="ppap-grant-email">',
        '<input id="ppap-grant-days" class="ppap-input" type="number" min="1" max="3650" value="30" style="min-width:90px" data-testid="ppap-grant-days">',
        '<button class="ppap-btn" data-testid="ppap-grant-go" onclick="PP_AdminPremium.grant()">Geef premium</button>',
      '</div>',
      '<div class="ppap-card">',
        '<h3>Premium users <span class="ppap-pill test">' + (_state.users || []).length + '</span></h3>',
        '<table class="ppap-table" data-testid="ppap-users-table">',
          '<thead><tr><th>Email</th><th>Status</th><th>Bron</th><th>Plan</th><th>Datum</th><th>Actie</th></tr></thead>',
          '<tbody>' + rows + '</tbody>',
        '</table>',
      '</div>',
    ].join('');
  }

  function renderTransactions() {
    if (_state.txnsErr) return errorCard('Transactions', _state.txnsErr);
    var rows = (_state.txns || []).map(function(t) {
      var p = (t.payment_status || 'initiated').toLowerCase();
      var pill = p === 'paid' ? 'ok' : (p === 'initiated' || p === 'open' ? 'test' : 'fail');
      return '<tr>' +
        '<td>' + esc((t.session_id || '').slice(0, 18)) + '…</td>' +
        '<td>' + esc(t.email || t.user_key || '?') + '</td>' +
        '<td>€ ' + ((t.amount || 0).toFixed(2)) + ' ' + esc((t.currency || '').toUpperCase()) + '</td>' +
        '<td><span class="ppap-pill ' + pill + '">' + esc(t.payment_status || '?') + '</span></td>' +
        '<td>' + (t.premium_activated ? '<span class="ppap-pill ok">activated</span>' : '<span class="ppap-pill warn">pending</span>') + '</td>' +
        '<td>' + esc((t.created_at || '').slice(0, 19)) + '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:rgba(252,248,239,.5);padding:30px">Geen transacties</td></tr>';
    return [
      '<div class="ppap-card">',
        '<h3>Payment transactions <span class="ppap-pill test">' + (_state.txns || []).length + '</span></h3>',
        '<table class="ppap-table">',
          '<thead><tr><th>Session</th><th>Email</th><th>Bedrag</th><th>Payment</th><th>Premium</th><th>Aangemaakt</th></tr></thead>',
          '<tbody>' + rows + '</tbody>',
        '</table>',
      '</div>',
    ].join('');
  }

  function renderWebhooks() {
    if (_state.eventsErr) return errorCard('Webhooks', _state.eventsErr);
    var rows = (_state.events || []).map(function(e) {
      var pill = e.verified ? (e.payment_status === 'paid' ? 'ok' : 'warn') : 'fail';
      return '<tr>' +
        '<td>' + esc(e.event_type || '—') + '</td>' +
        '<td><span class="ppap-pill ' + pill + '">' + (e.verified ? esc(e.payment_status || 'verified') : 'invalid') + '</span></td>' +
        '<td>' + esc((e.session_id || '').slice(0, 22) || '—') + '</td>' +
        '<td>' + esc((e.event_id || '').slice(0, 22) || '—') + '</td>' +
        '<td>' + esc((e.received_at || '').slice(0, 19)) + '</td>' +
        '<td><button class="ppap-btn ghost" onclick="PP_AdminPremium.viewEvent(' + JSON.stringify(esc(JSON.stringify(e))).replace(/"/g, '&quot;') + ')">Bekijk</button></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:rgba(252,248,239,.5);padding:30px">Nog geen webhook events ontvangen.<br><small>Webhooks komen binnen via /api/webhook/stripe na configuratie in Stripe Dashboard.</small></td></tr>';
    return [
      '<div class="ppap-card">',
        '<h3>Stripe webhook events <span class="ppap-pill test">' + (_state.events || []).length + '</span></h3>',
        '<table class="ppap-table">',
          '<thead><tr><th>Type</th><th>Status</th><th>Session</th><th>Event ID</th><th>Ontvangen</th><th></th></tr></thead>',
          '<tbody>' + rows + '</tbody>',
        '</table>',
      '</div>',
    ].join('');
  }

  function renderEntitlements() {
    var ent = _state.entitlements;
    var emailDefault = (ent && ent.email) || adminEmail() || '';
    var card = '';
    if (ent && !ent.__error) {
      var feats = ent.features || {};
      card =
        '<div class="ppap-card" data-testid="ppap-ent-result">' +
          '<h3>' + esc(ent.email) + ' ' +
            '<span class="ppap-pill ' + (ent.is_premium ? 'ok' : 'fail') + '">' + (ent.is_premium ? 'PREMIUM' : 'GEEN PREMIUM') + '</span> ' +
            '<span class="ppap-pill test">' + esc(ent.source) + '</span>' +
          '</h3>' +
          '<dl class="ppap-kv">' +
            Object.keys(ent.detail || {}).map(function(k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(ent.detail[k]) + '</dd>'; }).join('') +
          '</dl>' +
          '<div class="ppap-features">' +
            Object.keys(feats).map(function(k) {
              return '<div class="ppap-feat"><span class="lbl">' + esc(k.replace(/_/g, ' ')) + '</span><span class="ppap-pill ' + (feats[k] ? 'ok' : 'fail') + '">' + (feats[k] ? 'allowed' : 'blocked') + '</span></div>';
            }).join('') +
          '</div>' +
        '</div>';
    } else if (ent && ent.__error) {
      card = errorCard('Entitlements', ent.__error);
    }
    return [
      '<div class="ppap-card">',
        '<h3>Check feature-toegang</h3>',
        '<input id="ppap-ent-email" class="ppap-input" type="email" placeholder="[email protected]" value="' + esc(emailDefault) + '" data-testid="ppap-ent-email">',
        '<button class="ppap-btn" data-testid="ppap-ent-go" onclick="PP_AdminPremium.checkEntitlements()">Check</button>',
      '</div>',
      card,
    ].join('');
  }

  function errorCard(title, err, body) {
    return '<div class="ppap-card"><h3>' + esc(title) + ' <span class="ppap-pill fail">ERROR</span></h3>' +
      '<pre class="ppap-pre err">' + esc(String(err)) + (body ? '\n' + esc(JSON.stringify(body, null, 2)) : '') + '</pre></div>';
  }

  function render() {
    ensureStyle();
    var main = document.getElementById('dy-main');
    if (!main) return;
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    var content = '';
    switch (_state.tab) {
      case 'status':        content = renderStatus(); break;
      case 'checkout':      content = renderCheckoutDebug(); break;
      case 'users':         content = renderUsers(); break;
      case 'transactions':  content = renderTransactions(); break;
      case 'webhooks':      content = renderWebhooks(); break;
      case 'entitlements':  content = renderEntitlements(); break;
    }
    main.innerHTML =
      '<div class="ppap" data-testid="ppap-root">' +
        '<button class="ppap-btn ghost" onclick="window.DY.navigeer(\'admin_brands\')" data-testid="ppap-back">← Admin</button>' +
        '<h1>Premium beheer</h1>' +
        '<p class="ppap-sub">Stripe checkout, premium users, webhooks &amp; entitlements — alles in één plek.</p>' +
        '<div class="ppap-tabs" data-testid="ppap-tabs">' + topBar() + '</div>' +
        content +
      '</div>';
  }

  // ── Actions ─────────────────────────────────────────────────────────
  async function runTestCheckout() {
    var emailEl = document.getElementById('ppap-test-email');
    var email = emailEl ? emailEl.value : '[email protected]';
    _state.lastTest = { ok: false, loading: true };
    render();
    var r = await api('/api/admin/premium/test-checkout', {
      method: 'POST',
      body: { email: email, origin_url: window.location.origin }
    });
    _state.lastTest = r.__error ? { ok: false, error: r.__error, body: r.__body } : r;
    render();
  }

  async function grant() {
    var emailEl = document.getElementById('ppap-grant-email');
    var daysEl  = document.getElementById('ppap-grant-days');
    var email = emailEl ? emailEl.value.trim() : '';
    var days  = daysEl ? parseInt(daysEl.value, 10) : 30;
    if (!email || email.indexOf('@') < 0) { alert('Geldig email-adres vereist'); return; }
    var r = await api('/api/admin/premium/grant', { method: 'POST', body: { email: email, days: days } });
    if (r.__error) { alert('Fout: ' + r.__error); return; }
    if (window.DY && DY.toast) DY.toast('Premium toegekend aan ' + email);
    load();
  }

  async function revoke(email) {
    if (!email) return;
    if (!confirm('Premium intrekken voor ' + email + '?')) return;
    var r = await api('/api/admin/premium/revoke', { method: 'POST', body: { email: email } });
    if (r.__error) { alert('Fout: ' + r.__error); return; }
    if (window.DY && DY.toast) DY.toast('Premium ingetrokken voor ' + email);
    load();
  }

  async function checkEntitlements() {
    var emailEl = document.getElementById('ppap-ent-email');
    var email = emailEl ? emailEl.value.trim() : '';
    if (!email) return;
    var r = await api('/api/admin/premium/entitlements?email=' + encodeURIComponent(email));
    _state.entitlements = r;
    render();
  }

  function viewEvent(jsonStr) {
    var win = window.open('', '_blank', 'width=720,height=520');
    if (!win) { alert(jsonStr); return; }
    win.document.write('<pre style="padding:20px;font-family:monospace;background:#0f0c08;color:#a8e6c9;min-height:100vh;margin:0;white-space:pre-wrap;word-break:break-all">' +
      String(jsonStr).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '</pre>');
  }

  // ── Route registratie ───────────────────────────────────────────────
  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._ppapWrapped) return;
    var orig = window.DY.toonPagina;
    window.DY._ppapWrapped = true;
    window.DY.toonPagina = function(pagina) {
      if (pagina === 'admin_premium') {
        _state.tab = 'status';
        render();
        load();
        return;
      }
      return orig.apply(this, arguments);
    };
  }

  // Inject admin-nav-link in bestaande admin-nav (additief)
  function injectNavLink() {
    var nav = document.querySelector('.pp-admin-nav');
    if (!nav) return;
    if (nav.querySelector('[data-testid="pp-nav-admin_premium"]')) return;
    var btn = document.createElement('button');
    btn.className = 'pp-admin-nav-btn';
    btn.setAttribute('data-testid', 'pp-nav-admin_premium');
    btn.textContent = 'Premium';
    btn.onclick = function() { window.DY.navigeer('admin_premium'); };
    nav.appendChild(btn);
  }

  function init() {
    if (window.DY && window.DY.toonPagina) registerRoute();
    setTimeout(registerRoute, 500);
    setTimeout(registerRoute, 1500);
    new MutationObserver(injectNavLink).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

  window.PP_AdminPremium = {
    tab: setTab,
    runTestCheckout: runTestCheckout,
    grant: grant,
    revoke: revoke,
    checkEntitlements: checkEntitlements,
    viewEvent: viewEvent,
    VERSION: '1.0.0',
  };
})();
