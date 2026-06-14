/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat — Feed Tabs Restructure (v2.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Verbergt "Trending" en "Mijn posts" knoppen.
 * Voegt nieuwe "Uitgelicht" tab toe (campagnes + gesponsorde merken).
 * Werkt additief — geen wijzigingen in legacy pwa-v463-*.js.
 *
 * Tabs (na restructure):
 *   1. Ontdek ⭐        (data-filter="recent")     — bestaand
 *   2. Mijn postuur     (data-filter="vergelijk")  — bestaand
 *   3. Uitgelicht       (data-filter="uitgelicht") — NIEUW
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var STYLE_ID = 'pp-feedtabs-style';
  var GRID_ID = 'pp-uitgelicht-grid';
  var TAB_ATTR = '[data-filter="uitgelicht"]';

  // ── CSS injectie (eenmalig) — dark theme matching brand portal ──────
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      // v60.1.66: forceer normale scroll wanneer Uitgelicht actief is
      '.dy-main.pp-uitgelicht-modus{display:block !important;overflow-y:auto !important;height:auto !important;min-height:100vh;scroll-snap-type:none !important;padding-bottom:120px}' +
      '.dy-main.pp-uitgelicht-modus #dy-stories-row,.dy-main.pp-uitgelicht-modus #dy-feed-nav-strip,.dy-main.pp-uitgelicht-modus #dy-feed-filters{display:flex}' +
      '#pp-uitgelicht-grid{padding:20px 16px 90px;animation:ppUitgFadeIn .3s ease;color:#fcf8ef;width:100%;box-sizing:border-box}' +
      '@keyframes ppUitgFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '.pp-uitg-header{padding:8px 4px 18px;border-bottom:1px solid rgba(252,248,239,.10);margin-bottom:16px}' +
      '.pp-uitg-eyebrow{display:inline-block;font:600 11px/1 "DM Sans",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d4910a;margin-bottom:6px}' +
      '.pp-uitg-titel{font:400 1.4rem/1.2 "DM Serif Display","Cormorant Garamond",Georgia,serif;color:#fcf8ef;margin:0;letter-spacing:-.01em}' +
      '.pp-uitg-list{display:grid;grid-template-columns:1fr;gap:12px}' +
      '@media(min-width:600px){.pp-uitg-list{grid-template-columns:repeat(2,1fr)}}' +
      '@media(min-width:1024px){.pp-uitg-list{grid-template-columns:repeat(3,1fr)}}' +
      '.pp-uitg-kaart{display:flex;align-items:center;gap:12px;padding:14px 16px;' +
        'background:linear-gradient(135deg,rgba(212,145,10,.10) 0%,rgba(255,255,255,.04) 100%);' +
        'border:1px solid rgba(212,145,10,.28);border-radius:14px;text-decoration:none;color:#fcf8ef;' +
        'position:relative;transition:transform .15s ease,border-color .15s ease;cursor:pointer;min-height:76px}' +
      '.pp-uitg-kaart:hover,.pp-uitg-kaart:focus-visible{transform:translateY(-1px);border-color:#d4910a;outline:none}' +
      '.pp-uitg-logo{flex-shrink:0;width:44px;height:44px;border-radius:10px;' +
        'background:rgba(255,255,255,.08);color:#d4910a;display:flex;align-items:center;justify-content:center;' +
        'font:700 15px/1 "DM Sans",sans-serif;letter-spacing:.02em}' +
      '.pp-uitg-info{flex:1;min-width:0;padding-right:80px}' +
      '.pp-uitg-merk{font:700 .9rem/1.25 "DM Sans",sans-serif;color:#fcf8ef;margin-bottom:3px;letter-spacing:-.005em;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pp-uitg-msg{font:400 .85rem/1.35 "DM Sans",sans-serif;color:rgba(252,248,239,.78);' +
        'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.pp-uitg-tag{position:absolute;top:10px;right:12px;font:600 9px/1 "DM Sans",sans-serif;letter-spacing:.08em;' +
        'text-transform:uppercase;color:rgba(212,145,10,.95);background:rgba(212,145,10,.12);' +
        'padding:5px 9px;border-radius:100px}' +
      '.pp-uitg-cta{display:block;margin-top:6px;font:600 .76rem/1 "DM Sans",sans-serif;color:#d4910a;letter-spacing:.02em}' +
      '.pp-uitg-leeg{text-align:center;padding:48px 20px;color:rgba(252,248,239,.65)}' +
      '.pp-uitg-leeg h3{font:400 1.3rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 8px}' +
      '.pp-uitg-leeg p{font:400 14px/1.5 "DM Sans",sans-serif;margin:0 auto;max-width:340px;color:rgba(252,248,239,.6)}' +
      '.pp-uitg-loader{text-align:center;padding:40px 20px;color:rgba(252,248,239,.55);font:500 13px/1 "DM Sans",sans-serif}';
    document.head.appendChild(s);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // ── Stap 1: verberg alleen "Mijn posts", voeg Uitgelicht toe ────────
  // (Trending blijft zichtbaar — user koos voor 4-tab structuur)
  function setupFilters() {
    var bar = document.getElementById('dy-feed-filters');
    if (!bar) return false;

    // Verberg ALLEEN Mijn posts (Trending blijft staan)
    var mijnPosts = bar.querySelector('[data-filter="mijn"]');
    if (mijnPosts && mijnPosts.style.display !== 'none') {
      mijnPosts.style.display = 'none';
      mijnPosts.setAttribute('data-pp-hidden', 'mijn');
    }
    // Als Trending eerder verborgen was (oudere versie): herstel
    var trending = bar.querySelector('[data-filter="populair"]');
    if (trending && trending.getAttribute('data-pp-hidden') === 'trending') {
      trending.style.display = '';
      trending.removeAttribute('data-pp-hidden');
    }

    // Voeg Uitgelicht tab toe (idempotent)
    if (!bar.querySelector(TAB_ATTR)) {
      var btn = document.createElement('button');
      btn.className = 'dy-filter';
      btn.setAttribute('data-filter', 'uitgelicht');
      btn.setAttribute('data-testid', 'feed-tab-uitgelicht');
      btn.textContent = 'Uitgelicht';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        handleUitgelichtClick(btn);
      });
      bar.appendChild(btn);
    }
    return true;
  }

  // ── Stap 2: wrap DY.setFilter zodat onze state reset bij andere tabs ─
  function wrapSetFilter() {
    if (!window.DY || typeof DY.setFilter !== 'function') return false;
    if (DY._ppSetFilterWrapped) return true;
    var orig = DY.setFilter;
    DY._ppSetFilterWrapped = true;
    DY._ppSetFilterOrig = orig; // v60.1.65: expose origineel voor Uitgelicht
    DY.setFilter = function(filter, btn) {
      // Reset Uitgelicht-state
      restoreNormalFeed();
      return orig.call(this, filter, btn);
    };
    return true;
  }

  function restoreNormalFeed() {
    var bar = document.getElementById('dy-feed-filters');
    if (bar) {
      var ub = bar.querySelector(TAB_ATTR);
      if (ub) { ub.classList.remove('active'); ub.classList.remove('actief'); }
    }
    var grid = document.getElementById(GRID_ID);
    if (grid && grid.parentNode) grid.parentNode.removeChild(grid);
    var verhalen = document.getElementById('dy-verhalen');
    if (verhalen) verhalen.style.display = '';
    var sentinel = document.getElementById('dy-feed-sentinel');
    if (sentinel) sentinel.style.display = '';
    // v60.1.66: herstel feed-actief class
    var main = document.getElementById('dy-main');
    if (main && main.classList.contains('pp-uitgelicht-modus')) {
      main.classList.remove('pp-uitgelicht-modus');
      main.classList.add('dy-feed-actief');
    }
  }

  // ── Stap 3: handler voor Uitgelicht tab klik ────────────────────────
  // v60.1.66: stabiele oplossing — verbergt scroll-snap feed-reel
  // (incompatibel met grid-layout) en toont partner-grid in eigen
  // scrollbare container. Klik op kaart → opent merk-detail (full feed
  // filtered to that brand via PP_CampaignRenderer.click).
  function handleUitgelichtClick(btn) {
    var bar = document.getElementById('dy-feed-filters');
    if (bar) {
      bar.querySelectorAll('.dy-filter').forEach(function(b) {
        b.classList.remove('active');
        b.classList.remove('actief');
      });
    }
    btn.classList.add('active');
    btn.classList.add('actief');

    // Verberg scroll-snap reel + sentinel (anders breekt layout)
    var verhalen = document.getElementById('dy-verhalen');
    if (verhalen) verhalen.style.display = 'none';
    var sentinel = document.getElementById('dy-feed-sentinel');
    if (sentinel) sentinel.style.display = 'none';

    // Tijdelijk feed-actief class uitschakelen voor normale scroll
    var main = document.getElementById('dy-main');
    if (main && main.classList.contains('dy-feed-actief')) {
      main.classList.add('pp-uitgelicht-modus');
      main.classList.remove('dy-feed-actief');
    }

    renderUitgelicht();
  }

  // ── Stap 4: render Uitgelicht grid ──────────────────────────────────
  function renderUitgelicht() {
    var existing = document.getElementById(GRID_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var main = document.getElementById('dy-main');
    if (!main) return;

    var grid = document.createElement('div');
    grid.id = GRID_ID;
    grid.setAttribute('data-testid', 'pp-uitgelicht-grid');
    grid.innerHTML = '<div class="pp-uitg-loader">Uitgelichte campagnes laden…</div>';

    // Insert na #dy-feed-filters
    var filters = document.getElementById('dy-feed-filters');
    if (filters && filters.parentNode) {
      filters.parentNode.insertBefore(grid, filters.nextSibling);
    } else {
      main.appendChild(grid);
    }

    // Probeer eerst de cache van de Universal Renderer
    var camps = [];
    try {
      if (window.PP_CampaignRenderer && typeof PP_CampaignRenderer.getLive === 'function') {
        camps = PP_CampaignRenderer.getLive() || [];
      }
    } catch(_) {}

    if (camps.length) {
      paintUitgelicht(grid, camps);
      return;
    }

    // Fallback: directe Firestore .get() (werkt ook voor anoniem)
    var db = window.firebase && firebase.firestore ? firebase.firestore() : null;
    if (!db) { paintUitgelicht(grid, []); return; }

    db.collection('campaigns').where('status', '==', 'live').limit(50).get()
      .then(function(snap) {
        var list = [];
        snap.forEach(function(d) { var c = d.data(); c._id = d.id; list.push(c); });
        paintUitgelicht(grid, list);
      })
      .catch(function() { paintUitgelicht(grid, []); });
  }

  function paintUitgelicht(grid, camps) {
    if (!grid) return;
    if (!camps || !camps.length) {
      grid.innerHTML =
        '<div class="pp-uitg-leeg" data-testid="pp-uitg-leeg">' +
          '<h3>Nog niets uitgelicht</h3>' +
          '<p>Hier verschijnen binnenkort gesponsorde merken en campagnes. Kom snel terug!</p>' +
        '</div>';
      return;
    }
    // Filter actieve campagnes (binnen start/eind datum)
    var nu = Date.now();
    var actief = camps.filter(function(c) {
      var startMs = (c.startDatum && c.startDatum.toMillis) ? c.startDatum.toMillis() : null;
      var eindMs  = (c.eindDatum  && c.eindDatum.toMillis)  ? c.eindDatum.toMillis()  : null;
      if (startMs && nu < startMs) return false;
      if (eindMs && nu > eindMs) return false;
      return true;
    });
    if (!actief.length) {
      paintUitgelicht(grid, []);
      return;
    }
    var html =
      '<div class="pp-uitg-header">' +
        '<span class="pp-uitg-eyebrow">Uitgelicht</span>' +
        '<h2 class="pp-uitg-titel">Gesponsord door onze partners</h2>' +
      '</div>' +
      '<div class="pp-uitg-list">';
    actief.forEach(function(c) {
      var ini = esc((c.brandNaam || '?').slice(0, 2).toUpperCase());
      var msg = esc(c.boodschap || c.naam || '');
      var cid = esc(c._id || '');
      var bid = esc(c.brandId || '');
      html +=
        '<a class="pp-uitg-kaart" href="javascript:void(0)" ' +
          'data-testid="pp-uitg-' + cid + '" ' +
          'onclick="PP_FeedTabs.openCamp(\'' + cid + '\',\'' + bid + '\')">' +
          '<div class="pp-uitg-logo">' + ini + '</div>' +
          '<div class="pp-uitg-info">' +
            '<div class="pp-uitg-merk">' + esc(c.brandNaam || 'Merk') + '</div>' +
            '<div class="pp-uitg-msg">' + msg + '</div>' +
            '<span class="pp-uitg-cta">Bekijk merk →</span>' +
          '</div>' +
          '<span class="pp-uitg-tag">Gesponsord</span>' +
        '</a>';
    });
    html += '</div>';
    grid.innerHTML = html;
  }

  function openCamp(id, brandId) {
    try {
      if (window.PP_CampaignRenderer && PP_CampaignRenderer.click) {
        PP_CampaignRenderer.click(id, brandId);
      } else if (brandId && window.DY && DY.brandPortal && DY.brandPortal.toonMerkDetail) {
        DY.brandPortal.toonMerkDetail(brandId);
      }
    } catch(_) {}
  }

  // ── Init + MutationObserver (legacy re-renders feed bij navigatie) ──
  var _debounce = null;
  function tryAll() {
    ensureStyle();
    setupFilters();
    wrapSetFilter();
  }
  function scheduleTry() {
    if (_debounce) return;
    _debounce = setTimeout(function() { _debounce = null; tryAll(); }, 150);
  }

  function init() {
    ensureStyle();
    tryAll();
    var obs = new MutationObserver(function(muts) {
      // Alleen reageren als er nieuwe nodes zijn toegevoegd (geen recursie)
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) {
          scheduleTry();
          return;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Extra fallback voor late legacy boot
    setTimeout(tryAll, 1200);
    setTimeout(tryAll, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 600);
  }

  window.PP_FeedTabs = {
    refresh: tryAll,
    openCamp: openCamp,
    renderUitgelicht: renderUitgelicht
  };
})();
