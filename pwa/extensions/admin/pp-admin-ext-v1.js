/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat — Admin Panel Extensions (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Voegt 3 nieuwe admin-modules toe:
 *   - admin_wallet         : user balances + manual adjust
 *   - admin_payments       : Shopify orders overview
 *   - admin_placements     : per-placement kill-switch
 *
 * BELANGRIJK:
 *   Geen bestaande brand-portal-v1.js gewijzigd. Deze module REGISTREERT
 *   alleen nieuwe routes in DY.toonPagina via dezelfde patroon als BP_PAGES.
 *
 * Include via:
 *   <script defer src="/extensions/admin/pp-admin-ext-v1.js?v=1.0.0"></script>
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isAdmin() { return !!(window.DY && window.DY._isAdmin && window.DY._isAdmin()); }
  function db()      { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function nu()      { return window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString(); }
  function toast(msg, err) {
    if (window.DY && typeof window.DY.toast === 'function') return window.DY.toast(msg, err);
    if (window.alert) alert(msg);
  }

  // ── 1. ADMIN WALLET ────────────────────────────────────────────────
  async function renderAdminWallet() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Wallets laden...</div></div>';
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }

    try {
      // Top 50 users sorted by wallet_balance desc
      var snap = await db().collection('users').orderBy('wallet_balance', 'desc').limit(50).get();
      var rows = [];
      snap.forEach(function(d) {
        var u = d.data();
        rows.push(
          '<tr data-testid="admin-wallet-rij-' + esc(d.id) + '">' +
            '<td>' + esc(u.email || u.displayName || d.id) + '</td>' +
            '<td>€ ' + ((u.wallet_balance || 0)).toFixed(2) + '</td>' +
            '<td>' + esc(u.wallet_currency || 'EUR') + '</td>' +
            '<td>' + ((u.transactions || []).length) + '</td>' +
            '<td>' +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminExt.adjustWallet(\'' + esc(d.id) + '\',1000)" data-testid="admin-wallet-credit-' + esc(d.id) + '">+ €10</button>' +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminExt.adjustWallet(\'' + esc(d.id) + '\',-1000)" data-testid="admin-wallet-debit-' + esc(d.id) + '">- €10</button>' +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminExt.viewTransactions(\'' + esc(d.id) + '\')" data-testid="admin-wallet-tx-' + esc(d.id) + '">Tx</button>' +
            '</td>' +
          '</tr>'
        );
      });
      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'admin_brands\')" data-testid="admin-wallet-back">&larr; Admin</button>' +
          '<h1>Wallet management</h1>' +
          '<p class="bp-sub">Top 50 users gesorteerd op saldo. Klik op +€10 / -€10 voor handmatige correctie.</p>' +
          (rows.length
            ? '<div class="bp-tabel-scroll"><table class="bp-tabel"><thead><tr><th>User</th><th>Saldo</th><th>Valuta</th><th>#Tx</th><th>Acties</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
            : '<div class="bp-empty"><div class="bp-empty-titel">Geen users gevonden</div></div>'
          ) +
        '</div>';
    } catch(e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div class="bp-empty-titel">Fout</div><div>' + esc(e.message) + '</div></div></div>';
    }
  }

  async function adjustWallet(uid, deltaCents) {
    var reason = prompt('Reden voor wallet-aanpassing (' + (deltaCents > 0 ? '+' : '') + deltaCents + ' cents):', 'Manual admin adjustment');
    if (!reason) return;
    var backend = (window.REACT_APP_BACKEND_URL || '').replace(/\/$/, '') || window.location.origin;
    var adminSecret = prompt('Admin secret (X-Admin-Secret header):');
    if (!adminSecret) return;
    try {
      var r = await fetch(backend + '/api/wallet/admin/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ uid: uid, delta_cents: deltaCents, reason: reason, admin_uid: (window.DY.user || {}).uid || 'unknown' })
      });
      if (!r.ok) { toast('Fout: ' + r.status, true); return; }
      var data = await r.json();
      toast('Wallet bijgewerkt. Nieuw saldo: €' + (data.new_balance_cents / 100).toFixed(2));
      renderAdminWallet();
    } catch(e) {
      toast('Netwerkfout: ' + e.message, true);
    }
  }

  async function viewTransactions(uid) {
    var main = document.getElementById('dy-main');
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Transacties laden...</div></div>';
    try {
      var snap = await db().collection('payments').where('uid', '==', uid).orderBy('created_at', 'desc').limit(100).get();
      var rows = [];
      snap.forEach(function(d) {
        var p = d.data();
        rows.push('<tr><td>' + esc(p.type) + '</td><td>€' + ((p.amount_cents || 0) / 100).toFixed(2) + '</td><td>' + esc(p.status) + '</td><td>' + esc(p.shopify_order_id || '-') + '</td><td>' + esc(p.created_at) + '</td></tr>');
      });
      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="PP_AdminExt.renderAdminWallet()" data-testid="admin-tx-back">&larr; Wallets</button>' +
          '<h1>Transacties — ' + esc(uid) + '</h1>' +
          (rows.length
            ? '<div class="bp-tabel-scroll"><table class="bp-tabel"><thead><tr><th>Type</th><th>Bedrag</th><th>Status</th><th>Shopify Order</th><th>Datum</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
            : '<div class="bp-empty"><div class="bp-empty-titel">Geen transacties</div></div>'
          ) +
        '</div>';
    } catch(e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div>' + esc(e.message) + '</div></div></div>';
    }
  }

  // ── 2. ADMIN PAYMENTS ──────────────────────────────────────────────
  async function renderAdminPayments() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Payments laden...</div></div>';
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    try {
      var snap = await db().collection('payments').orderBy('created_at', 'desc').limit(100).get();
      var rowsAll = [], totals = { completed: 0, pending: 0, failed: 0, refunded: 0 };
      snap.forEach(function(d) {
        var p = d.data();
        totals[p.status] = (totals[p.status] || 0) + 1;
        rowsAll.push(
          '<tr data-testid="admin-payment-rij-' + esc(d.id) + '" data-status="' + esc(p.status) + '">' +
            '<td>' + esc(p.uid) + '</td>' +
            '<td>' + esc(p.type) + '</td>' +
            '<td>€' + ((p.amount_cents || 0) / 100).toFixed(2) + '</td>' +
            '<td><span class="bp-badge bp-badge-' + esc(p.status) + '">' + esc(p.status) + '</span></td>' +
            '<td>' + esc(p.shopify_order_id || '-') + '</td>' +
            '<td>' + esc((p.created_at || '').slice(0, 19).replace('T', ' ')) + '</td>' +
          '</tr>'
        );
      });
      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'admin_brands\')" data-testid="admin-payments-back">&larr; Admin</button>' +
          '<h1>Payments overzicht</h1>' +
          '<div class="bp-stat-grid">' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Completed</div><div class="bp-stat-num">' + totals.completed + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Pending</div><div class="bp-stat-num">' + totals.pending + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Failed</div><div class="bp-stat-num">' + totals.failed + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Refunded</div><div class="bp-stat-num">' + totals.refunded + '</div></div>' +
          '</div>' +
          (rowsAll.length
            ? '<div class="bp-tabel-scroll"><table class="bp-tabel"><thead><tr><th>User</th><th>Type</th><th>Bedrag</th><th>Status</th><th>Shopify</th><th>Datum</th></tr></thead><tbody>' + rowsAll.join('') + '</tbody></table></div>'
            : '<div class="bp-empty"><div class="bp-empty-titel">Nog geen payments</div></div>'
          ) +
        '</div>';
    } catch(e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div>' + esc(e.message) + '</div></div></div>';
    }
  }

  // ── 3. ADMIN PLACEMENTS ────────────────────────────────────────────
  async function renderAdminPlacements() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Placements laden...</div></div>';
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    try {
      var snap = await db().collection('admin_settings').doc('global').get();
      var cur = (snap.exists ? snap.data() : {}).placements_enabled || {
        feed: true, stories: false, outfit_review: false, ai_assist: false, similar_items: false
      };
      var keys = ['feed','stories','outfit_review','ai_assist','similar_items'];
      var labels = { feed:'Merken-tab feed', stories:'Story-ring', outfit_review:'Outfit Review', ai_assist:'AI Style Assistent', similar_items:'Vergelijkbaar zoeken' };
      var rows = keys.map(function(k) {
        var on = cur[k] !== false;
        return (
          '<div class="bp-placement-rij" data-testid="placement-rij-' + esc(k) + '">' +
            '<div><strong>' + esc(labels[k]) + '</strong><div class="bp-mini">' + esc(k) + '</div></div>' +
            '<label class="bp-toggle">' +
              '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="PP_AdminExt.togglePlacement(\'' + esc(k) + '\', this.checked)" data-testid="placement-toggle-' + esc(k) + '">' +
              '<span class="bp-toggle-slider"></span>' +
            '</label>' +
          '</div>'
        );
      }).join('');
      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'admin_brands\')" data-testid="admin-placements-back">&larr; Admin</button>' +
          '<h1>Placements control</h1>' +
          '<p class="bp-sub">Master kill-switches per plaatsing-type. Uitzetten stopt onmiddellijk alle weergave.</p>' +
          '<div class="bp-placement-lijst">' + rows + '</div>' +
        '</div>';
    } catch(e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div>' + esc(e.message) + '</div></div></div>';
    }
  }

  async function togglePlacement(key, enabled) {
    // v1.0.2: Gebruik nested object i.p.v. dotted-path met set+merge.
    // set+merge met "placements_enabled.feed" schrijft soms een letterlijk
    // veld met die naam i.p.v. nested update → toggles springen terug.
    var doc = db().collection('admin_settings').doc('global');
    try {
      // Lees huidige state om merge correct te doen
      var snap = await doc.get();
      var current = (snap.exists ? (snap.data() || {}).placements_enabled : null) || {
        feed: true, stories: false, outfit_review: false, ai_assist: false, similar_items: false
      };
      current[key] = !!enabled;
      var patch = {
        placements_enabled: current,
        updated_at: nu(),
        updated_by: (window.DY.user || {}).uid || 'unknown'
      };
      await doc.set(patch, { merge: true });
      toast('Placement ' + key + ' is nu ' + (enabled ? 'AAN' : 'UIT'));
    } catch(e) {
      toast('Fout bij opslaan: ' + (e.code || e.message), true);
      // Reset UI naar oude waarde
      try {
        var cb = document.querySelector('[data-testid="placement-toggle-' + key + '"]');
        if (cb) cb.checked = !enabled;
      } catch(_){}
    }
  }

  // ── REGISTRATIE (zonder bestaande BP_PAGES te wijzigen) ────────────
  // v1.0.4: force-reset lock zodat herhaalde nav altijd opnieuw initialiseert.
  function registerRoutes() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_admin_ext_wrapped) return;
    window.DY._pp_admin_ext_wrapped = true;
    var origToon = window.DY.toonPagina;
    window.DY.toonPagina = function(pagina) {
      if (pagina === 'admin_wallet' || pagina === 'admin_payments' || pagina === 'admin_placements') {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        if (pagina === 'admin_wallet')     return renderAdminWallet();
        if (pagina === 'admin_payments')   return renderAdminPayments();
        if (pagina === 'admin_placements') return renderAdminPlacements();
      }
      return origToon.apply(this, arguments);
    };
    // v1.0.6: Fix bootstrap race — als URL al een extension route bevat, force-render
    try {
      var qs = new URLSearchParams(window.location.search);
      var p = qs.get('pagina');
      if (p === 'admin_wallet' || p === 'admin_payments' || p === 'admin_placements') {
        window.DY.navigeer(p);
      }
    } catch(e) {}
  }

  // ── AUTO-INJECT NAV BUTTONS in admin pagina's ──────────────────────
  function injectAdminNav() {
    // Vind admin headers (admin_brands / admin_campagnes / admin_inkomsten)
    var pages = ['admin_brands','admin_campagnes','admin_campagne_diagnose','admin_inkomsten','admin_wallet','admin_payments','admin_placements'];
    if (pages.indexOf(window.DY && window.DY.pagina) === -1) return;
    var page = document.querySelector('.bp-page');
    if (!page) return;
    if (page.querySelector('.pp-admin-nav')) return; // al geinjecteerd

    var h1 = page.querySelector('h1');
    if (!h1) return;
    var nav = document.createElement('div');
    nav.className = 'pp-admin-nav';
    nav.setAttribute('data-testid', 'pp-admin-nav');
    var current = window.DY.pagina;
    var items = [
      { id:'admin_brands',    label:'Merken' },
      { id:'admin_campagnes', label:'Campagnes' },
      { id:'admin_campagne_diagnose', label:'Diagnose' },
      { id:'admin_inkomsten', label:'Inkomsten' },
      { id:'admin_wallet',    label:'Wallets' },
      { id:'admin_payments',  label:'Payments' },
      { id:'admin_placements',label:'Placements' }
    ];
    nav.innerHTML = items.map(function(it) {
      var on = it.id === current;
      return '<button class="pp-admin-nav-btn' + (on ? ' on' : '') + '" onclick="window.DY.navigeer(\'' + it.id + '\')" data-testid="pp-nav-' + it.id + '">' + it.label + '</button>';
    }).join('');
    h1.parentNode.insertBefore(nav, h1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      registerRoutes();
      var obs = new MutationObserver(injectAdminNav);
      obs.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    setTimeout(function() {
      registerRoutes();
      var obs = new MutationObserver(injectAdminNav);
      obs.observe(document.body, { childList: true, subtree: true });
    }, 100);
  }

  window.PP_AdminExt = {
    renderAdminWallet:     renderAdminWallet,
    renderAdminPayments:   renderAdminPayments,
    renderAdminPlacements: renderAdminPlacements,
    adjustWallet:          adjustWallet,
    viewTransactions:      viewTransactions,
    togglePlacement:       togglePlacement,
    VERSION:               '1.0.0'
  };
})();
