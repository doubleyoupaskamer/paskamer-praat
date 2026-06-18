/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Merken Pakketten Public View (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Publieke pakketten-pagina binnen het merkenportaal die de B2B campagne-
 * pakketten toont in dezelfde card-layout als de bestaande brand-portal
 * pagina's. Leest dezelfde data-bron als de admin editor (admin_b2b_packages):
 *
 *   Firestore: admin_settings/global.b2b_packages
 *
 * Route: 'merken_pakketten'
 * Inject: tab-link in bestaande brand-portal admin nav + CTA in landing.
 *
 * NIETS gewijzigd aan bestaande brand-portal, admin editor of betalingen.
 * Read-only voor merken; bewerken alleen via admin_b2b_packages route.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_MerkenPakketten) return;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function uid() { var u = window.firebase && firebase.auth && firebase.auth().currentUser; return u ? u.uid : null; }
  function isAdmin() { return !!(window.DY && window.DY._isAdmin && window.DY._isAdmin()); }

  // Default fallback (zelfde als admin editor)
  var DEFAULT_B2B = [
    { id: 'starter-25',   name: 'Starter Campagne',  amount: 25,  description: 'Voor merken die hun zichtbaarheid binnen Paskamerpraat willen testen.', expectedImpact: 'Beperkte testronde voor één campagne of placement.',         active: true, popular: false },
    { id: 'groei-50',     name: 'Groei Campagne',    amount: 50,  description: 'Voor merken die meer impact willen maken binnen de community.',         expectedImpact: 'Meer campagne-impressies en ruimte voor A/B-testing.',       active: true, popular: true  },
    { id: 'pro-100',      name: 'Pro Campagne',      amount: 100, description: 'Voor merken die structureel zichtbaar willen zijn.',                    expectedImpact: 'Sterke aanwezigheid en hogere kans op brand-recognition.',   active: true, popular: false },
    { id: 'ultimate-250', name: 'Ultimate Campagne', amount: 250, description: 'Voor merken die maximale zichtbaarheid willen binnen Paskamerpraat.',    expectedImpact: 'Maximale campagne-impact en langlopende zichtbaarheid.',     active: true, popular: false }
  ];

  async function loadPackages() {
    try {
      var snap = await db().collection('admin_settings').doc('global').get();
      var data = snap.exists ? (snap.data() || {}) : {};
      if (Array.isArray(data.b2b_packages) && data.b2b_packages.length) {
        return data.b2b_packages.filter(function (p) { return p && p.active !== false; });
      }
    } catch (e) {}
    return DEFAULT_B2B.filter(function (p) { return p.active; });
  }

  async function renderPakketten() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.style.background = '#0a0806';
    main.style.paddingBottom = '90px';
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Pakketten laden...</div></div>';

    var pkgs = await loadPackages();
    var loggedIn = !!uid();
    var admin = isAdmin();

    var cards = pkgs.map(function (p) {
      var popular = !!p.popular;
      return (
        '<article class="pp-b2c-pkg-card' + (popular ? ' pp-b2c-pkg-popular' : '') + '" data-testid="merk-pkg-' + esc(p.id || ('amt-' + p.amount)) + '">' +
          (popular ? '<div class="pp-b2c-pkg-badge">Populair</div>' : '') +
          '<header class="pp-b2c-pkg-head">' +
            '<h3 class="pp-b2c-pkg-naam">' + esc(p.name || ('€ ' + p.amount)) + '</h3>' +
            '<div class="pp-b2c-pkg-prijs">€ ' + Number(p.amount || 0).toFixed(0) + '</div>' +
          '</header>' +
          (p.description ? '<p class="pp-b2c-pkg-beschr">' + esc(p.description) + '</p>' : '') +
          (p.expectedImpact ?
            '<div class="pp-b2c-pkg-verwacht">' +
              '<span class="pp-b2c-pkg-verwacht-label">Verwachting</span>' +
              '<span class="pp-b2c-pkg-verwacht-tekst">' + esc(p.expectedImpact) + '</span>' +
            '</div>' : '') +
          '<button class="bp-btn bp-btn-primair pp-b2c-pkg-cta" ' +
            'onclick="' + (loggedIn ? 'window.DY.navigeer(\'merken\')' : 'window.DY.navigeer(\'merken_aanmelden\')') + '" ' +
            'data-testid="merk-pkg-cta-' + esc(p.id) + '">' +
            (loggedIn ? 'Naar merkenportaal' : 'Aanmelden als merk') +
          '</button>' +
        '</article>'
      );
    }).join('');

    main.innerHTML =
      '<div class="bp-page">' +
        '<button class="bp-back" onclick="window.DY.navigeer(\'merken\')" data-testid="merk-pkg-back">&larr; Merkenportaal</button>' +
        '<div class="bp-wallet-hero">' +
          '<span class="bp-header-eyebrow">Voor merken</span>' +
          '<h1>Campagne-pakketten</h1>' +
          '<p class="bp-sub">Kies het pakket dat past bij je doelen. Saldo wordt gebruikt voor advertenties, placements en boosts binnen Paskamerpraat.</p>' +
        '</div>' +
        '<div class="pp-b2c-pkg-grid" data-testid="merk-pkg-grid">' + cards + '</div>' +
        '<p class="pp-b2c-disclosure" data-testid="merk-pkg-disclosure">' +
          'Campagne-saldo wordt gebruikt voor placements, advertenties en boosts binnen Paskamerpraat. ' +
          'Het daadwerkelijke bereik kan verschillen afhankelijk van campagne-instellingen, doelgroep en interactie van community-leden.' +
        '</p>' +
        (admin ?
          '<div style="margin-top:18px"><button class="bp-btn bp-btn-ghost" onclick="window.DY.navigeer(\'admin_b2b_packages\')" data-testid="merk-pkg-admin-edit">Pakketten beheren (admin)</button></div>' : '') +
      '</div>';
  }

  // Route registratie
  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_merken_pkg_wrapped) return;
    window.DY._pp_merken_pkg_wrapped = true;
    var orig = window.DY.toonPagina;
    window.DY.toonPagina = function (pagina) {
      if (pagina === 'merken_pakketten') {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        return renderPakketten();
      }
      return orig.apply(this, arguments);
    };
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('pagina') === 'merken_pakketten') window.DY.navigeer('merken_pakketten');
    } catch (e) {}
  }

  // CTA-knop "Bekijk pakketten" in brand-portal merken-landing modal
  function injectLandingCTA() {
    try {
      // Modal-headerblok met "Samenwerken met Paskamerpraat" → voeg knop toe in actie-balk
      var headers = document.querySelectorAll('h1, h2, h3');
      headers.forEach(function (h) {
        if (h.dataset && h.dataset._pp_pkgcta) return;
        if ((h.textContent || '').toLowerCase().indexOf('samenwerken met paskamerpraat') === -1) return;
        // Zoek de bp-page container
        var page = h.closest('.bp-page') || h.parentNode;
        if (!page) return;
        if (page.querySelector('[data-testid="merk-landing-pkg-cta"]')) return;
        var btn = document.createElement('button');
        btn.className = 'bp-btn bp-btn-primair';
        btn.style.cssText = 'margin-top:12px;display:inline-flex;align-items:center;gap:6px';
        btn.setAttribute('data-testid', 'merk-landing-pkg-cta');
        btn.textContent = 'Bekijk campagne-pakketten';
        btn.onclick = function () { window.DY.navigeer('merken_pakketten'); };
        h.dataset._pp_pkgcta = '1';
        // Plaats na de header
        if (h.nextSibling) h.parentNode.insertBefore(btn, h.nextSibling);
        else h.parentNode.appendChild(btn);
      });
    } catch (e) {}
  }

  function init() {
    registerRoute();
    var obs = new MutationObserver(injectLandingCTA);
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectLandingCTA, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  window.PP_MerkenPakketten = {
    renderPakketten: renderPakketten,
    loadPackages:    loadPackages,
    VERSION:         '1.0.0'
  };
})();
