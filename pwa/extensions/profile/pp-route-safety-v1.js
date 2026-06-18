/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Route Safety + Pre-selected Pakket (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Twee defensieve lagen voor stabiele navigatie:
 *
 * 1. Catch-all route guard:
 *    - Onbekende pagina-keys (resultaat van type-fouten, deprecated links)
 *      → fallback naar 'feed' (of 'home' voor anonieme bezoekers).
 *    - Loggt naar console.warn voor audit-trail.
 *
 * 2. Pre-selected pakket flow:
 *    - "Aanmelden als merk" knoppen op pakket-kaarten slaan pakket-ID op
 *      in localStorage `dy_selected_pkg`.
 *    - Bij rendering van merken_aanmelden detecteren we de selectie en
 *      tonen een banner met de gekozen pakket-naam + prijs.
 *    - Banner blijft 15 minuten geldig; daarna automatisch verwijderd.
 *
 * Volledig additief — bestaande routes/state/handlers ongewijzigd.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_RouteSafety) return;

  // BEKENDE ROUTES (whitelist) - alle routes die in de app gebruikt worden
  var KNOWN_ROUTES = {
    feed:1, home:1, login:1, registreer:1, wachtwoord_vergeten:1,
    profiel:1, gebruiker:1, kleuren_ai:1, detail:1, challenge_detail:1,
    challenges:1, mijn_garderobe:1, weekly_stylist:1, wat_te_dragen:1,
    notificaties:1, gesprekken:1, gesprek_detail:1, instellingen:1,
    voorwaarden:1, privacybeleid:1, privacy:1,
    wallet:1, b2c_wallet:1, premium:1, premium_status:1, betaling_resultaat:1,
    merken:1, merken_aanmelden:1, merken_dashboard:1, merken_login:1,
    merken_producten:1, merken_campagnes:1, merken_pakketten:1, brand_pending:1,
    admin_brands:1, admin_campagnes:1, admin_campagne_diagnose:1,
    admin_inkomsten:1, admin_wallet:1, admin_payments:1, admin_placements:1,
    admin_premium:1, admin_dashboard:1, admin_b2c_packages:1,
    admin_b2b_packages:1, admin_boost_products:1,
    brand_dashboard:1
  };

  var SELECTED_PKG_KEY = 'dy_selected_pkg';
  var SELECTED_PKG_TTL = 15 * 60 * 1000; // 15 minuten

  // ────────── PAKKET-SELECTIE OPSLAG ──────────
  function setSelectedPkg(pkg) {
    try {
      var payload = { id: pkg.id || '', name: pkg.name || '', amount: pkg.amount || 0, ts: Date.now() };
      localStorage.setItem(SELECTED_PKG_KEY, JSON.stringify(payload));
    } catch (e) {}
  }
  function getSelectedPkg() {
    try {
      var raw = localStorage.getItem(SELECTED_PKG_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.ts || (Date.now() - p.ts) > SELECTED_PKG_TTL) {
        localStorage.removeItem(SELECTED_PKG_KEY);
        return null;
      }
      return p;
    } catch (e) { return null; }
  }
  function clearSelectedPkg() {
    try { localStorage.removeItem(SELECTED_PKG_KEY); } catch (e) {}
  }

  // ────────── CATCH-ALL ROUTE GUARD ──────────
  function wrapNavigeer() {
    if (!window.DY || typeof window.DY.navigeer !== 'function') return;
    if (window.DY._pp_route_safety_wrapped) return;
    window.DY._pp_route_safety_wrapped = true;
    var orig = window.DY.navigeer;
    window.DY.navigeer = function (pagina) {
      try {
        if (pagina && typeof pagina === 'string' && !KNOWN_ROUTES[pagina]) {
          try { console.warn('[RouteSafety] unknown route:', pagina, '→ fallback to feed'); } catch (_) {}
          var fb = (window.DY && DY.user) ? 'feed' : 'home';
          return orig.call(this, fb);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }

  // ────────── PAKKET-BANNER in merken_aanmelden ──────────
  function injectAanmeldenBanner() {
    try {
      if (!window.DY || DY.pagina !== 'merken_aanmelden') return;
      var pkg = getSelectedPkg();
      if (!pkg) return;
      var main = document.getElementById('dy-main');
      if (!main) return;
      if (main.querySelector('[data-testid="merk-aanmelden-pkg-banner"]')) return;
      var page = main.querySelector('.bp-page, form, section') || main;
      var banner = document.createElement('div');
      banner.setAttribute('data-testid', 'merk-aanmelden-pkg-banner');
      banner.style.cssText =
        'margin:14px 0;padding:14px;background:rgba(212,145,10,0.08);' +
        'border:1px solid rgba(212,145,10,0.35);border-radius:12px;' +
        'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
      banner.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#d4910a;font-weight:600;margin-bottom:2px">Gekozen pakket</div>' +
          '<div style="font-weight:600;font-size:15px">' + escapeHtml(pkg.name || 'Campagne pakket') + ' &middot; € ' + Number(pkg.amount || 0).toFixed(0) + '</div>' +
          '<div style="font-size:12px;opacity:0.7;margin-top:2px">Na goedkeuring kun je dit pakket direct activeren in het merkenportaal.</div>' +
        '</div>' +
        '<button type="button" class="bp-btn bp-btn-ghost" data-testid="merk-aanmelden-pkg-clear" style="flex-shrink:0">Anders kiezen</button>';
      // Plaats bovenaan de page
      if (page.firstChild) page.insertBefore(banner, page.firstChild);
      else page.appendChild(banner);
      var clearBtn = banner.querySelector('[data-testid="merk-aanmelden-pkg-clear"]');
      if (clearBtn) clearBtn.onclick = function () {
        clearSelectedPkg();
        if (window.DY && DY.navigeer) DY.navigeer('merken_pakketten');
      };
    } catch (e) {}
  }

  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // ────────── HOOK pakket-kaarten "Aanmelden als merk" knoppen ──────────
  // Op merken_pakketten pagina: wanneer een niet-ingelogde user op de CTA klikt,
  // bewaar het gekozen pakket vóór de navigatie naar merken_aanmelden.
  function hookPakketCTAs() {
    try {
      if (!window.DY || DY.pagina !== 'merken_pakketten') return;
      var cards = document.querySelectorAll('article.pp-b2c-pkg-card');
      cards.forEach(function (card) {
        if (card.dataset._pp_hooked) return;
        var cta = card.querySelector('button.pp-b2c-pkg-cta, [data-testid^="merk-pkg-cta-"]');
        if (!cta) return;
        var titel = card.querySelector('.pp-b2c-pkg-naam');
        var prijs = card.querySelector('.pp-b2c-pkg-prijs');
        var id = (card.getAttribute('data-testid') || '').replace(/^merk-pkg-/, '');
        var name = titel ? titel.textContent.trim() : '';
        var amount = prijs ? Number((prijs.textContent || '').replace(/[^0-9.]/g, '')) || 0 : 0;
        var origClick = cta.onclick;
        cta.addEventListener('click', function () {
          setSelectedPkg({ id: id, name: name, amount: amount });
        }, true); // capture phase, vóór origClick
        card.dataset._pp_hooked = '1';
      });
    } catch (e) {}
  }

  function init() {
    wrapNavigeer();
    var obs = new MutationObserver(function () {
      injectAanmeldenBanner();
      hookPakketCTAs();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { injectAanmeldenBanner(); hookPakketCTAs(); }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 150);
  }

  window.PP_RouteSafety = {
    setSelectedPkg:   setSelectedPkg,
    getSelectedPkg:   getSelectedPkg,
    clearSelectedPkg: clearSelectedPkg,
    KNOWN_ROUTES:     KNOWN_ROUTES,
    VERSION:          '1.0.0'
  };
})();
