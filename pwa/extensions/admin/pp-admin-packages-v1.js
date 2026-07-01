/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Admin Packages & Dashboard Module (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Centraal beheerplatform voor:
 *   - admin_dashboard       : telling-widgets (users, brands, financieel)
 *   - admin_b2c_packages    : 5 B2C boost-pakketten (Starter..Ultimate)
 *   - admin_b2b_packages    : 4 B2B campagne-pakketten (Starter..Ultimate)
 *   - admin_boost_products  : 3 post-boost producten (starter/groei/premium)
 *
 * BELANGRIJK:
 *   - Geen bestaande routes, files of betalingsflows gewijzigd.
 *   - Alleen schrijf-actie op `admin_settings/global` (bestaande doc).
 *   - Elke wijziging wordt gelogd in `admin_logs` collection.
 *   - Frontend permissions via DY._isAdmin(); Firestore rules moeten
 *     server-side óók admin-write op admin_settings/global beperken.
 *
 * Routes registreren via toonPagina wrapper (zelfde patroon als
 * pp-admin-ext-v1.js).
 *
 * Include via:
 *   <script defer src="/extensions/admin/pp-admin-packages-v1.js?v=..."></script>
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_AdminPackages) return;

  var ROUTES = ['admin_dashboard', 'admin_b2c_packages', 'admin_b2b_packages', 'admin_boost_products'];

  // ────── HELPERS ──────
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isAdmin() { return !!(window.DY && window.DY._isAdmin && window.DY._isAdmin()); }
  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function fv() { return window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue : null; }
  function uid() { var u = window.firebase && firebase.auth && firebase.auth().currentUser; return u ? u.uid : null; }
  function toast(msg, err) { try { window.DY && DY.toast && DY.toast(msg, !!err); } catch (e) {} }

  // Audit log elke beheeractie wordt persistent vastgelegd.
  function logAdminAction(action, target, oldValue, newValue) {
    try {
      db().collection('admin_logs').add({
        adminId:   uid() || 'unknown',
        adminEmail: (window.DY && DY.user && DY.user.email) || '',
        action:    String(action || ''),
        target:    String(target || ''),
        oldValue:  oldValue === undefined ? null : oldValue,
        newValue:  newValue === undefined ? null : newValue,
        timestamp: fv() ? fv().serverTimestamp() : new Date().toISOString()
      }).catch(function (e) { console.warn('[admin_logs] write fail:', e); });
    } catch (e) {}
  }

  function commonHeader(title, currentRoute) {
    return '<div class="bp-page">' +
      '<button class="bp-back" onclick="window.DY.navigeer(\'admin_brands\')" data-testid="admin-pkg-back">&larr; Admin</button>' +
      '<h1>' + esc(title) + '</h1>';
  }

  // ════════════════════════════════════════════════════════════════════
  // 1. DASHBOARD - Telling-widgets
  // ════════════════════════════════════════════════════════════════════
  async function renderAdminDashboard() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Dashboard laden...</div></div>';

    try {
      var d = db();
      // Tellingen parallel
      var counts = await Promise.all([
        d.collection('users').limit(10000).get().then(function (s) { return s.size; }).catch(function () { return 0; }),
        d.collection('users').where('premium_status', '==', 'active').limit(10000).get().then(function (s) { return s.size; }).catch(function () { return 0; }),
        d.collection('brands').limit(10000).get().then(function (s) { return s.size; }).catch(function () { return 0; }),
        d.collection('brands').where('status', '==', 'approved').limit(10000).get().then(function (s) { return s.size; }).catch(function () { return 0; }),
        d.collection('payments').orderBy('created_at', 'desc').limit(50).get().catch(function () { return { size: 0, forEach: function () {} }; }),
        d.collection('post_boosts').where('status', '==', 'active').limit(10000).get().then(function (s) { return s.size; }).catch(function () { return 0; })
      ]);

      var totalUsers      = counts[0];
      var premiumUsers    = counts[1];
      var totalBrands     = counts[2];
      var approvedBrands  = counts[3];
      var recentPayments  = counts[4];
      var activeBoosts    = counts[5];

      var revB2C = 0, revB2B = 0, txCount = 0;
      try {
        recentPayments.forEach(function (doc) {
          var p = doc.data() || {};
          var amt = (p.amount_cents || 0) / 100;
          if (p.wallet_type === 'b2c' || p.source === 'shopify_b2c') revB2C += amt;
          else revB2B += amt;
          txCount++;
        });
      } catch (e) {}

      main.innerHTML =
        commonHeader('Admin dashboard') +
          '<p class="bp-sub">Overzicht van gebruikers, merken, transacties en boosts.</p>' +
          '<div class="pp-admin-grid" data-testid="admin-dashboard-grid">' +
            statCard('Gebruikers', totalUsers,            'Totaal accounts',          'users') +
            statCard('Premium',     premiumUsers,         'Actieve premium',          'premium') +
            statCard('Merken',      approvedBrands,       'Goedgekeurde merken',      'brands') +
            statCard('Merk-aanvragen', Math.max(0, totalBrands - approvedBrands), 'Wachtend op review', 'pending') +
            statCard('Actieve boosts', activeBoosts,      'Lopende post-boosts',      'boosts') +
            statCard('Transacties',  txCount,             'Laatste 50',               'tx') +
            statCard('B2C omzet (laatste 50 tx)', '€ ' + revB2C.toFixed(2), 'Wallet + boost',  'rev-b2c') +
            statCard('B2B omzet (laatste 50 tx)', '€ ' + revB2B.toFixed(2), 'Merken wallet',   'rev-b2b') +
          '</div>' +
          '<div class="pp-admin-quick">' +
            '<button class="bp-btn bp-btn-primair" onclick="window.DY.navigeer(\'admin_b2c_packages\')" data-testid="admin-quick-b2c">B2C pakketten beheren</button>' +
            '<button class="bp-btn bp-btn-primair" onclick="window.DY.navigeer(\'admin_b2b_packages\')" data-testid="admin-quick-b2b">B2B pakketten beheren</button>' +
            '<button class="bp-btn bp-btn-primair" onclick="window.DY.navigeer(\'admin_boost_products\')" data-testid="admin-quick-boost">Boost producten beheren</button>' +
          '</div>' +
        '</div>';
    } catch (e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div class="bp-empty-titel">Fout bij laden</div><div>' + esc(e.message || '') + '</div></div></div>';
    }
  }

  function statCard(label, value, sub, testid) {
    return '<div class="pp-admin-stat" data-testid="admin-stat-' + esc(testid) + '">' +
      '<div class="pp-admin-stat-label">' + esc(label) + '</div>' +
      '<div class="pp-admin-stat-num">' + esc(value) + '</div>' +
      '<div class="pp-admin-stat-sub">' + esc(sub) + '</div>' +
    '</div>';
  }

  // ════════════════════════════════════════════════════════════════════
  // 2. GENERIC PACKAGE EDITOR (B2C + B2B delen layout)
  // ════════════════════════════════════════════════════════════════════
  async function loadSettings() {
    var snap = await db().collection('admin_settings').doc('global').get();
    return snap.exists ? snap.data() : {};
  }

  function defaultB2CPackages() {
    return [
      { id: 'starter-5',   name: 'Starter Boost',  amount: 5,  description: 'Voor gebruikers die hun outfit of post een eerste extra zetje willen geven.',  expectedImpact: 'Kleine extra zichtbaarheid voor één specifieke post.',                                active: true, popular: false },
      { id: 'groei-10',    name: 'Groei Boost',    amount: 10, description: 'Voor gebruikers die hun stijl vaker zichtbaar willen maken.',                  expectedImpact: 'Meer zichtbaarheid en een langere actieve periode dan Starter Boost.',                active: true, popular: false },
      { id: 'plus-15',     name: 'Plus Boost',     amount: 15, description: 'Voor gebruikers die meer aandacht willen voor hun content.',                   expectedImpact: 'Hogere zichtbaarheid en meer kansen op engagement.',                                  active: true, popular: true  },
      { id: 'pro-25',      name: 'Pro Boost',      amount: 25, description: 'Voor gebruikers die hun beste outfits extra willen laten opvallen.',           expectedImpact: 'Uitgebreidere zichtbaarheid en meer kansen op likes, reacties en opgeslagen outfits.', active: true, popular: false },
      { id: 'ultimate-50', name: 'Ultimate Boost', amount: 50, description: 'De krachtigste boost voor gebruikers die hun stijl maximaal onder de aandacht willen brengen.', expectedImpact: 'Maximale boostondersteuning binnen de beschikbare mogelijkheden.',     active: true, popular: false }
    ];
  }

  function defaultB2BPackages() {
    return [
      { id: 'starter-25',   name: 'Starter Campagne',  amount: 25,  description: 'Voor merken die hun zichtbaarheid binnen Paskamerpraat willen testen.',     expectedImpact: 'Beperkte testronde voor één campagne of placement.',          active: true, popular: false },
      { id: 'groei-50',     name: 'Groei Campagne',    amount: 50,  description: 'Voor merken die meer impact willen maken binnen de community.',             expectedImpact: 'Meer campagne-impressies en ruimte voor A/B-testing.',        active: true, popular: true  },
      { id: 'pro-100',      name: 'Pro Campagne',      amount: 100, description: 'Voor merken die structureel zichtbaar willen zijn.',                        expectedImpact: 'Sterke aanwezigheid en hogere kans op brand-recognition.',    active: true, popular: false },
      { id: 'ultimate-250', name: 'Ultimate Campagne', amount: 250, description: 'Voor merken die maximale zichtbaarheid willen binnen Paskamerpraat.',       expectedImpact: 'Maximale campagne-impact en langlopende zichtbaarheid.',      active: true, popular: false }
    ];
  }

  function defaultBoostProducts() {
    return {
      starter: { naam: 'Starter Boost', uur: 24,  prijs_cents: 199, weight: 1.5, badge: '✨', kleur: '#d4910a' },
      groei:   { naam: 'Groei Boost',   uur: 72,  prijs_cents: 499, weight: 2.5, badge: '🚀', kleur: '#a86b00' },
      premium: { naam: 'Premium Boost', uur: 168, prijs_cents: 999, weight: 4.0, badge: '✨', kleur: '#1e1a0f' }
    };
  }

  function renderPackageRow(idx, p, kind) {
    return '<div class="pp-pkg-row" data-idx="' + idx + '" data-testid="' + esc(kind) + '-pkg-row-' + idx + '">' +
      '<div class="pp-pkg-grid">' +
        field('Naam',         'name',           p.name || '',           idx, kind) +
        fieldNum('Bedrag (€)', 'amount',        p.amount,               idx, kind) +
        '</div>' +
      '<div class="pp-pkg-grid">' +
        fieldTextarea('Beschrijving',     'description',    p.description || '',     idx, kind) +
        fieldTextarea('Verwachte impact', 'expectedImpact', p.expectedImpact || '',  idx, kind) +
        '</div>' +
      '<div class="pp-pkg-flags">' +
        toggle('Actief',   'active',  !!p.active,  idx, kind) +
        toggle('Populair', 'popular', !!p.popular, idx, kind) +
        '<button class="bp-btn bp-btn-ghost pp-pkg-del" onclick="PP_AdminPackages.removePackage(\'' + kind + '\',' + idx + ')" data-testid="' + esc(kind) + '-pkg-del-' + idx + '">Verwijder</button>' +
      '</div>' +
    '</div>';
  }

  function field(label, name, val, idx, kind) {
    return '<label class="pp-pkg-field"><span>' + esc(label) + '</span>' +
      '<input type="text" data-field="' + esc(name) + '" data-idx="' + idx + '" data-kind="' + esc(kind) + '" value="' + esc(val) + '" data-testid="' + esc(kind) + '-' + esc(name) + '-' + idx + '">' +
    '</label>';
  }
  function fieldNum(label, name, val, idx, kind) {
    return '<label class="pp-pkg-field"><span>' + esc(label) + '</span>' +
      '<input type="number" step="0.01" min="0" data-field="' + esc(name) + '" data-idx="' + idx + '" data-kind="' + esc(kind) + '" value="' + esc(val == null ? '' : val) + '" data-testid="' + esc(kind) + '-' + esc(name) + '-' + idx + '">' +
    '</label>';
  }
  function fieldTextarea(label, name, val, idx, kind) {
    return '<label class="pp-pkg-field pp-pkg-field-full"><span>' + esc(label) + '</span>' +
      '<textarea rows="3" data-field="' + esc(name) + '" data-idx="' + idx + '" data-kind="' + esc(kind) + '" data-testid="' + esc(kind) + '-' + esc(name) + '-' + idx + '">' + esc(val) + '</textarea>' +
    '</label>';
  }
  function toggle(label, name, checked, idx, kind) {
    return '<label class="pp-pkg-toggle"><input type="checkbox" data-field="' + esc(name) + '" data-idx="' + idx + '" data-kind="' + esc(kind) + '"' + (checked ? ' checked' : '') + ' data-testid="' + esc(kind) + '-' + esc(name) + '-' + idx + '"> ' + esc(label) + '</label>';
  }

  async function renderPackagesEditor(kind /* 'b2c' or 'b2b' */) {
    var main = document.getElementById('dy-main');
    if (!main) return;
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Pakketten laden...</div></div>';

    try {
      var settings = await loadSettings();
      var key = kind === 'b2c' ? 'b2c_packages' : 'b2b_packages';
      var defaults = kind === 'b2c' ? defaultB2CPackages() : defaultB2BPackages();
      var current = Array.isArray(settings[key]) && settings[key].length ? settings[key] : defaults;

      _activePackagesCache = JSON.parse(JSON.stringify(current));
      _activePackagesKind  = kind;

      var title = kind === 'b2c' ? 'B2C boost-pakketten' : 'B2B campagne-pakketten';
      main.innerHTML =
        commonHeader(title) +
          '<p class="bp-sub">Beheer de pakketten die getoond worden bij wallet-opwaarderen. Wijzigingen zijn direct actief na opslaan.</p>' +
          '<div id="pp-pkg-list" class="pp-pkg-list">' +
            current.map(function (p, i) { return renderPackageRow(i, p, kind); }).join('') +
          '</div>' +
          '<div class="pp-pkg-actions">' +
            '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminPackages.addPackage(\'' + kind + '\')" data-testid="' + kind + '-pkg-add">+ Pakket toevoegen</button>' +
            '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminPackages.resetToDefault(\'' + kind + '\')" data-testid="' + kind + '-pkg-reset">Reset naar defaults</button>' +
            '<button class="bp-btn bp-btn-primair" onclick="PP_AdminPackages.savePackages(\'' + kind + '\')" data-testid="' + kind + '-pkg-save">Opslaan</button>' +
          '</div>' +
        '</div>';
    } catch (e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div class="bp-empty-titel">Fout</div><div>' + esc(e.message || '') + '</div></div></div>';
    }
  }

  var _activePackagesCache = null;
  var _activePackagesKind  = null;

  function _collectFromDOM() {
    var list = document.getElementById('pp-pkg-list');
    if (!list) return null;
    var rows = list.querySelectorAll('.pp-pkg-row');
    var arr = [];
    rows.forEach(function (row) {
      var idx = Number(row.getAttribute('data-idx'));
      var orig = (_activePackagesCache && _activePackagesCache[idx]) || {};
      var obj = Object.assign({}, orig);
      row.querySelectorAll('[data-field]').forEach(function (input) {
        var name = input.getAttribute('data-field');
        if (input.type === 'checkbox') obj[name] = input.checked;
        else if (input.type === 'number') obj[name] = input.value === '' ? null : Number(input.value);
        else obj[name] = input.value;
      });
      arr.push(obj);
    });
    return arr;
  }

  async function savePackages(kind) {
    if (!isAdmin()) { toast('Geen rechten', true); return; }
    var arr = _collectFromDOM();
    if (!arr) { toast('Geen data', true); return; }
    var key = kind === 'b2c' ? 'b2c_packages' : 'b2b_packages';
    try {
      var oldSettings = await loadSettings();
      var update = {};
      update[key] = arr;
      update[key + '_updated_at'] = fv() ? fv().serverTimestamp() : new Date().toISOString();
      update[key + '_updated_by'] = uid() || 'unknown';
      await db().collection('admin_settings').doc('global').set(update, { merge: true });
      logAdminAction('packages_update', key, oldSettings[key] || null, arr);
      toast('Pakketten opgeslagen (' + arr.length + ')');
      _activePackagesCache = JSON.parse(JSON.stringify(arr));
    } catch (e) {
      toast('Fout: ' + (e.message || e), true);
    }
  }

  function addPackage(kind) {
    var arr = _collectFromDOM() || [];
    arr.push({
      id: 'new-' + Date.now(),
      name: 'Nieuw pakket',
      amount: 0,
      description: '',
      expectedImpact: '',
      active: true,
      popular: false
    });
    _activePackagesCache = arr;
    _rerenderList(kind);
  }

  function removePackage(kind, idx) {
    var arr = _collectFromDOM() || [];
    arr.splice(idx, 1);
    _activePackagesCache = arr;
    _rerenderList(kind);
  }

  function resetToDefault(kind) {
    if (!window.confirm('Reset naar de fabrieksinstellingen? Niet-opgeslagen wijzigingen gaan verloren.')) return;
    _activePackagesCache = kind === 'b2c' ? defaultB2CPackages() : defaultB2BPackages();
    _rerenderList(kind);
    toast('Defaults geladen. Druk Opslaan om te activeren.');
  }

  function _rerenderList(kind) {
    var list = document.getElementById('pp-pkg-list');
    if (!list) return;
    list.innerHTML = _activePackagesCache.map(function (p, i) { return renderPackageRow(i, p, kind); }).join('');
  }

  // ════════════════════════════════════════════════════════════════════
  // 3. BOOST PRODUCTS EDITOR (3 post-boost tiers: starter/groei/premium)
  // ════════════════════════════════════════════════════════════════════
  var _activeBoostCache = null;

  async function renderAdminBoostProducts() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Boost-producten laden...</div></div>';

    try {
      var settings = await loadSettings();
      var defaults = defaultBoostProducts();
      var current = Object.assign({}, defaults, settings.boost_packages || {});
      _activeBoostCache = JSON.parse(JSON.stringify(current));

      var tiers = ['starter', 'groei', 'premium'];
      main.innerHTML =
        commonHeader('Post-boost producten') +
          '<p class="bp-sub">Beheer de 3 boost-tiers die gebruikers kunnen kiezen om hun post te promoten. Prijs in centen.</p>' +
          '<div id="pp-boost-list" class="pp-pkg-list">' +
            tiers.map(function (t) {
              var p = current[t] || {};
              return '<div class="pp-pkg-row" data-tier="' + t + '" data-testid="boost-product-' + t + '">' +
                '<h3 class="pp-pkg-titel">' + esc(t.charAt(0).toUpperCase() + t.slice(1)) + '</h3>' +
                '<div class="pp-pkg-grid">' +
                  boostField('Naam',           t, 'naam',         p.naam || '',         'text') +
                  boostField('Duur (uur)',     t, 'uur',          p.uur || 0,           'number') +
                  boostField('Prijs (cents)',  t, 'prijs_cents',  p.prijs_cents || 0,   'number') +
                  boostField('Weight (ranking)', t, 'weight',     p.weight || 1,        'number-step') +
                  boostField('Badge (emoji)',  t, 'badge',        p.badge || '',        'text') +
                  boostField('Kleur (hex)',    t, 'kleur',        p.kleur || '',        'text') +
                '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="pp-pkg-actions">' +
            '<button class="bp-btn bp-btn-ghost" onclick="PP_AdminPackages.resetBoostToDefault()" data-testid="boost-reset">Reset naar defaults</button>' +
            '<button class="bp-btn bp-btn-primair" onclick="PP_AdminPackages.saveBoostProducts()" data-testid="boost-save">Opslaan</button>' +
          '</div>' +
        '</div>';
    } catch (e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div class="bp-empty-titel">Fout</div><div>' + esc(e.message || '') + '</div></div></div>';
    }
  }

  function boostField(label, tier, name, val, kind) {
    var step = kind === 'number-step' ? ' step="0.1"' : '';
    var type = (kind === 'number' || kind === 'number-step') ? 'number' : 'text';
    return '<label class="pp-pkg-field"><span>' + esc(label) + '</span>' +
      '<input type="' + type + '"' + step + ' data-tier="' + esc(tier) + '" data-field="' + esc(name) + '" value="' + esc(val) + '" data-testid="boost-' + esc(tier) + '-' + esc(name) + '">' +
    '</label>';
  }

  async function saveBoostProducts() {
    if (!isAdmin()) { toast('Geen rechten', true); return; }
    var list = document.getElementById('pp-boost-list');
    if (!list) return;
    var obj = {};
    list.querySelectorAll('.pp-pkg-row').forEach(function (row) {
      var tier = row.getAttribute('data-tier');
      obj[tier] = {};
      row.querySelectorAll('[data-field]').forEach(function (input) {
        var name = input.getAttribute('data-field');
        var v = input.value;
        if (input.type === 'number') v = v === '' ? 0 : Number(v);
        obj[tier][name] = v;
      });
    });
    try {
      var oldSettings = await loadSettings();
      await db().collection('admin_settings').doc('global').set({
        boost_packages:            obj,
        boost_packages_updated_at: fv() ? fv().serverTimestamp() : new Date().toISOString(),
        boost_packages_updated_by: uid() || 'unknown'
      }, { merge: true });
      logAdminAction('boost_products_update', 'boost_packages', oldSettings.boost_packages || null, obj);
      toast('Boost-producten opgeslagen');
      _activeBoostCache = obj;
    } catch (e) {
      toast('Fout: ' + (e.message || e), true);
    }
  }

  function resetBoostToDefault() {
    if (!window.confirm('Reset boost-producten naar defaults?')) return;
    _activeBoostCache = defaultBoostProducts();
    renderAdminBoostProducts();
    toast('Defaults geladen. Druk Opslaan om te activeren.');
  }

  // ════════════════════════════════════════════════════════════════════
  // 4. ROUTE REGISTRATIE + NAV INJECTIE
  // ════════════════════════════════════════════════════════════════════
  function registerRoutes() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_admin_pkg_wrapped) return;
    window.DY._pp_admin_pkg_wrapped = true;
    var origToon = window.DY.toonPagina;
    window.DY.toonPagina = function (pagina) {
      if (ROUTES.indexOf(pagina) !== -1) {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        if (pagina === 'admin_dashboard')      return renderAdminDashboard();
        if (pagina === 'admin_b2c_packages')   return renderPackagesEditor('b2c');
        if (pagina === 'admin_b2b_packages')   return renderPackagesEditor('b2b');
        if (pagina === 'admin_boost_products') return renderAdminBoostProducts();
      }
      return origToon.apply(this, arguments);
    };
    // Bootstrap: ?pagina=admin_xxx
    try {
      var qs = new URLSearchParams(window.location.search);
      var p = qs.get('pagina');
      if (p && ROUTES.indexOf(p) !== -1) window.DY.navigeer(p);
    } catch (e) {}
  }

  // Voeg admin-tabs toe aan bestaande .pp-admin-nav (gemaakt door pp-admin-ext-v1.js).
  // We injecteren extra knoppen ZONDER bestaande te verwijderen.
  function injectExtraAdminTabs() {
    try {
      var allAdminPages = ['admin_brands','admin_campagnes','admin_campagne_diagnose','admin_inkomsten',
                            'admin_wallet','admin_payments','admin_placements','admin_premium'].concat(ROUTES);
      if (allAdminPages.indexOf(window.DY && window.DY.pagina) === -1) return;
      var nav = document.querySelector('.pp-admin-nav');
      if (!nav) return;
      if (nav.querySelector('[data-pp-admin-pkg]')) return; // al geïnjecteerd
      var current = window.DY.pagina;
      var extras = [
        { id: 'admin_dashboard',       label: 'Dashboard'     },
        { id: 'admin_b2c_packages',    label: 'B2C pakketten' },
        { id: 'admin_b2b_packages',    label: 'B2B pakketten' },
        { id: 'admin_boost_products',  label: 'Boost producten' }
      ];
      extras.forEach(function (it) {
        var btn = document.createElement('button');
        btn.className = 'pp-admin-nav-btn' + (it.id === current ? ' on' : '');
        btn.setAttribute('data-pp-admin-pkg', '1');
        btn.setAttribute('data-testid', 'pp-nav-' + it.id);
        btn.textContent = it.label;
        btn.onclick = function () { window.DY.navigeer(it.id); };
        nav.appendChild(btn);
      });
    } catch (e) {}
  }

  // ────── STYLES (één keer injecteren) ──────
  function injectStyles() {
    if (document.getElementById('pp-admin-pkg-styles')) return;
    var css =
      '.pp-admin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin:18px 0 24px}' +
      '.pp-admin-stat{padding:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(212,145,10,0.18);border-radius:12px}' +
      '.pp-admin-stat-label{font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:rgba(245,233,216,0.65);font-weight:600;margin-bottom:6px}' +
      '.pp-admin-stat-num{font-size:28px;font-weight:700;color:#d4910a;line-height:1.1}' +
      '.pp-admin-stat-sub{font-size:12px;color:rgba(245,233,216,0.55);margin-top:4px}' +
      '.pp-admin-quick{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}' +
      '.pp-pkg-list{display:flex;flex-direction:column;gap:14px;margin:18px 0}' +
      '.pp-pkg-row{padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(212,145,10,0.2);border-radius:12px}' +
      '.pp-pkg-titel{margin:0 0 10px;font-size:15px;color:#d4910a;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}' +
      '.pp-pkg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:10px}' +
      '.pp-pkg-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:rgba(245,233,216,0.75)}' +
      '.pp-pkg-field-full{grid-column:1/-1}' +
      '.pp-pkg-field span{font-weight:600;letter-spacing:0.02em}' +
      '.pp-pkg-field input,.pp-pkg-field textarea{padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.25);color:#f5e9d8;font-family:inherit;font-size:14px;width:100%;box-sizing:border-box}' +
      '.pp-pkg-field input:focus,.pp-pkg-field textarea:focus{outline:none;border-color:#d4910a}' +
      '.pp-pkg-flags{display:flex;flex-wrap:wrap;gap:14px;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05)}' +
      '.pp-pkg-toggle{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:rgba(245,233,216,0.85);cursor:pointer}' +
      '.pp-pkg-toggle input{margin:0}' +
      '.pp-pkg-del{margin-left:auto;color:#e87a7a;border-color:rgba(232,122,122,0.3)}' +
      '.pp-pkg-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07)}' +
      '@media (max-width:480px){' +
        '.pp-pkg-grid{grid-template-columns:1fr}' +
        '.pp-admin-grid{grid-template-columns:1fr}' +
      '}';
    var style = document.createElement('style');
    style.id = 'pp-admin-pkg-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    registerRoutes();
    var obs = new MutationObserver(injectExtraAdminTabs);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectExtraAdminTabs, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 150);
  }

  window.PP_AdminPackages = {
    renderAdminDashboard:    renderAdminDashboard,
    renderPackagesEditor:    renderPackagesEditor,
    renderAdminBoostProducts: renderAdminBoostProducts,
    savePackages:            savePackages,
    saveBoostProducts:       saveBoostProducts,
    addPackage:              addPackage,
    removePackage:           removePackage,
    resetToDefault:          resetToDefault,
    resetBoostToDefault:     resetBoostToDefault,
    VERSION: '1.0.0'
  };
})();
