/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Feed Tabs Restructure (v2.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Verbergt "Trending" en "Mijn posts" knoppen.
 * Voegt nieuwe "Uitgelicht" tab toe (campagnes + gesponsorde merken).
 * Werkt additief - geen wijzigingen in legacy pwa-v463-*.js.
 *
 * Tabs (na restructure):
 *   1. Ontdek ⭐        (data-filter="recent")     - bestaand
 *   2. Mijn postuur     (data-filter="vergelijk")  - bestaand
 *   3. Uitgelicht       (data-filter="uitgelicht") - NIEUW
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var STYLE_ID = 'pp-feedtabs-style';
  var GRID_ID = 'pp-uitgelicht-grid';
  var TAB_ATTR = '[data-filter="uitgelicht"]';

  // ── CSS injectie (eenmalig) - dark theme matching brand portal ──────
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      // v60.1.70: definitieve fix - gebruik NATURAL page scroll, niet
      // internal container scroll. Forceer body/html scroll én laat
      // #dy-main als gewone block met visible overflow renderen.
      'html:has(.dy-main.pp-uitgelicht-modus),' +
      'body:has(.dy-main.pp-uitgelicht-modus){' +
        'overflow-y:auto !important;' +
        'overflow-x:hidden !important;' +
        'height:auto !important;' +
        'min-height:100vh !important;' +
        'max-height:none !important' +
      '}' +
      '.dy-main.pp-uitgelicht-modus{' +
        'display:block !important;' +
        'overflow:visible !important;' +
        'height:auto !important;' +
        'min-height:auto !important;' +
        'max-height:none !important;' +
        'scroll-snap-type:none !important;' +
        'padding-bottom:160px !important;' +
        'position:relative !important' +
      '}' +
      '.dy-main.pp-uitgelicht-modus > #dy-verhalen,' +
      '.dy-main.pp-uitgelicht-modus > #dy-feed-sentinel,' +
      '.dy-main.pp-uitgelicht-modus > .dy-welkom-banner,' +
      '.dy-main.pp-uitgelicht-modus > .dy-fit-prompt{display:none !important}' +
      '.dy-main.pp-uitgelicht-modus > #dy-stories-row,' +
      '.dy-main.pp-uitgelicht-modus > #dy-feed-nav-strip,' +
      '.dy-main.pp-uitgelicht-modus > #dy-feed-filters{display:flex !important;flex-shrink:0 !important}' +
      '#pp-uitgelicht-grid{' +
        'padding:24px 16px 60px;' +
        'animation:ppUitgFadeIn .3s ease;' +
        'color:#fcf8ef;' +
        'width:100%;' +
        'max-width:1100px;' +
        'margin:0 auto;' +
        'box-sizing:border-box' +
      '}' +
      '@keyframes ppUitgFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '.pp-uitg-header{padding:8px 4px 18px;border-bottom:1px solid rgba(252,248,239,.10);margin-bottom:16px}' +
      '.pp-uitg-eyebrow{display:inline-block;font:600 11px/1 "DM Sans",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d4910a;margin-bottom:6px}' +
      '.pp-uitg-titel{font:400 clamp(1.25rem,3.5vw,1.6rem)/1.2 "DM Serif Display","Cormorant Garamond",Georgia,serif;color:#fcf8ef;margin:0;letter-spacing:-.01em}' +
      '.pp-uitg-list{display:grid;grid-template-columns:1fr;gap:12px}' +
      '@media(min-width:600px){.pp-uitg-list{grid-template-columns:repeat(2,1fr);gap:14px}}' +
      '@media(min-width:1024px){.pp-uitg-list{grid-template-columns:repeat(3,1fr);gap:16px}}' +
      '.pp-uitg-kaart{' +
        'display:flex;align-items:flex-start;gap:12px;padding:16px;' +
        'background:linear-gradient(135deg,rgba(212,145,10,.10) 0%,rgba(255,255,255,.04) 100%);' +
        'border:1px solid rgba(212,145,10,.28);border-radius:14px;text-decoration:none;color:#fcf8ef;' +
        'position:relative;transition:transform .15s ease,border-color .15s ease;' +
        'cursor:pointer;min-height:96px;' +
        '-webkit-tap-highlight-color:transparent' +
      '}' +
      '.pp-uitg-kaart:hover,.pp-uitg-kaart:focus-visible,.pp-uitg-kaart:active{transform:translateY(-1px);border-color:#d4910a;outline:none}' +
      '.pp-uitg-logo{flex-shrink:0;width:44px;height:44px;border-radius:10px;' +
        'background:rgba(255,255,255,.08);color:#d4910a;display:flex;align-items:center;justify-content:center;' +
        'font:700 15px/1 "DM Sans",sans-serif;letter-spacing:.02em}' +
      '.pp-uitg-info{flex:1;min-width:0;padding-right:84px}' +
      '.pp-uitg-merk{font:700 .92rem/1.25 "DM Sans",sans-serif;color:#fcf8ef;margin-bottom:4px;letter-spacing:-.005em;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pp-uitg-msg{font:400 .85rem/1.4 "DM Sans",sans-serif;color:rgba(252,248,239,.78);' +
        'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}' +
      '.pp-uitg-tag{position:absolute;top:12px;right:14px;font:600 9px/1 "DM Sans",sans-serif;letter-spacing:.08em;' +
        'text-transform:uppercase;color:rgba(212,145,10,.95);background:rgba(212,145,10,.12);' +
        'padding:5px 9px;border-radius:100px;white-space:nowrap}' +
      '.pp-uitg-cta{display:inline-block;margin-top:8px;font:600 .78rem/1 "DM Sans",sans-serif;color:#d4910a;letter-spacing:.02em}' +
      '.pp-uitg-leeg{text-align:center;padding:60px 20px;color:rgba(252,248,239,.65)}' +
      '.pp-uitg-leeg h3{font:400 1.3rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 8px}' +
      '.pp-uitg-leeg p{font:400 14px/1.5 "DM Sans",sans-serif;margin:0 auto;max-width:340px;color:rgba(252,248,239,.6)}' +
      '.pp-uitg-loader{text-align:center;padding:60px 20px;color:rgba(252,248,239,.55);font:500 13px/1 "DM Sans",sans-serif}' +
      // ── v60.1.69: Product-overview grid (brand_products) ──────────────
      '.pp-uitg-feed-header{padding:32px 4px 14px;margin-top:24px;border-bottom:1px solid rgba(252,248,239,.10);margin-bottom:18px}' +
      '.pp-uitg-feed-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}' +
      '@media(min-width:600px){.pp-uitg-feed-grid{grid-template-columns:repeat(3,1fr);gap:14px}}' +
      '@media(min-width:1024px){.pp-uitg-feed-grid{grid-template-columns:repeat(4,1fr);gap:16px}}' +
      '@media(min-width:1400px){.pp-uitg-feed-grid{grid-template-columns:repeat(5,1fr)}}' +
      '.pp-uitg-prod-kaart{display:flex;flex-direction:column;background:rgba(255,255,255,.03);border:1px solid rgba(252,248,239,.08);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s ease,border-color .15s ease;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.pp-uitg-prod-kaart:hover,.pp-uitg-prod-kaart:focus-visible{transform:translateY(-2px);border-color:rgba(212,145,10,.4);outline:none}' +
      '.pp-uitg-prod-img{aspect-ratio:3/4;background:#0f0c08;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}' +
      '.pp-uitg-prod-img img{width:100%;height:100%;object-fit:contain;display:block}' +
      '.pp-uitg-prod-noimg{font-size:32px;color:rgba(252,248,239,.3);background:linear-gradient(135deg,rgba(212,145,10,.06),rgba(255,255,255,.02))}' +
      '.pp-uitg-prod-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:3px}' +
      '.pp-uitg-prod-brand{font:600 .68rem/1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#d4910a;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.pp-uitg-prod-titel{font:500 .82rem/1.3 "DM Sans",sans-serif;color:#fcf8ef;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.1em}' +
      '.pp-uitg-prod-prijs{font:700 .88rem/1 "DM Sans",sans-serif;color:#fcf8ef;margin-top:4px}';
    document.head.appendChild(s);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // ── Stap 1: verberg alleen "Mijn posts", voeg Uitgelicht toe ────────
  // (Trending blijft zichtbaar - user koos voor 4-tab structuur)
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

    // Voeg Uitgelicht tab toe (idempotent), als 2e tab (na "Ontdek")
    if (!bar.querySelector(TAB_ATTR)) {
      var btn = document.createElement('button');
      btn.className = 'dy-filter';
      btn.setAttribute('data-filter', 'uitgelicht');
      btn.setAttribute('data-testid', 'feed-tab-uitgelicht');
      btn.textContent = 'Uitgelicht 📣';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        handleUitgelichtClick(btn);
      });
      // v60.1.96: Uitgelicht NA Ontdek. Volgorde:
      // Ontdek -> Uitgelicht -> Trending -> Mijn postuur
      var ontdek = bar.querySelector('[data-filter="recent"]');
      if (ontdek && ontdek.nextSibling) {
        bar.insertBefore(btn, ontdek.nextSibling);
      } else if (ontdek) {
        bar.appendChild(btn);
      } else {
        bar.appendChild(btn);
      }
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
    // v60.1.70: verwijder body/html class
    document.documentElement.classList.remove('pp-uitgelicht-active');
    document.body.classList.remove('pp-uitgelicht-active');
  }

  // ── Stap 3: handler voor Uitgelicht tab klik ────────────────────────
  // v60.1.66: stabiele oplossing - verbergt scroll-snap feed-reel
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
    } else if (main) {
      main.classList.add('pp-uitgelicht-modus');
    }
    // v60.1.70: ook body+html classes voor browsers zonder :has() support
    document.documentElement.classList.add('pp-uitgelicht-active');
    document.body.classList.add('pp-uitgelicht-active');

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
    // v60.1.162 (2026-02-23): Client-side datum-filter VERWIJDERD.
    // De Firestore query (regel 272) filtert al op status='live'. De
    // backend brand-autocomplete-worker beheert de status-transities
    // (live → completed wanneer eindDatum verstrijkt). Dubbele client-
    // filter verbergt onterecht campagnes met null/string/Date dates
    // i.p.v. Firestore Timestamps.
    // Behouden voor diagnostics: log hoeveel campagnes zijn ontvangen.
    var actief = (camps || []).filter(function (c) {
      return c && c.status === 'live';
    });
    try {
      console.log('[pp-feedtabs] uitgelicht render:', {
        ontvangen: (camps || []).length,
        actief: actief.length,
        ids: actief.map(function (c) { return c._id; })
      });
    } catch (_) {}

    // Render partner-grid + feed-overview in 1 pagina
    var html =
      '<div class="pp-uitg-header">' +
        '<span class="pp-uitg-eyebrow">Uitgelicht</span>' +
        '<h2 class="pp-uitg-titel">Gesponsord door onze partners</h2>' +
      '</div>';

    if (actief.length) {
      html += '<div class="pp-uitg-list">';
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
    } else {
      html +=
        '<div class="pp-uitg-leeg" data-testid="pp-uitg-leeg">' +
          '<p>Nog geen actieve partner-campagnes. Hieronder zie je de community feed.</p>' +
        '</div>';
    }

    // ── v60.1.69: producten-overview onder de partner-grid ──────────────
    html +=
      '<div class="pp-uitg-feed-header">' +
        '<span class="pp-uitg-eyebrow">Shop</span>' +
        '<h2 class="pp-uitg-titel">Producten van onze partners</h2>' +
      '</div>' +
      '<div id="pp-uitg-feed-grid" class="pp-uitg-feed-grid" data-testid="pp-uitg-prod-grid">' +
        '<div class="pp-uitg-loader">Producten laden…</div>' +
      '</div>';

    grid.innerHTML = html;
    loadProductenOverview();
  }

  // ── Producten van actieve partners - query brand_products collection ──
  function loadProductenOverview() {
    var container = document.getElementById('pp-uitg-feed-grid');
    if (!container) return;
    var db = window.firebase && firebase.firestore ? firebase.firestore() : null;
    if (!db) { paintProductenOverview(container, []); return; }
    db.collection('brand_products')
      .where('status', '==', 'actief')
      .limit(36).get()
      .then(function(snap) {
        var items = [];
        snap.forEach(function(d) {
          var p = d.data();
          p._id = d.id;
          items.push(p);
        });
        paintProductenOverview(container, items);
      })
      .catch(function(err) {
        console.warn('[uitgelicht] brand_products query faalde:', err && err.code);
        paintProductenOverview(container, []);
      });
  }

  function _fmtEuro(p) {
    if (p == null || p === '') return '';
    var n = Number(String(p).replace(',', '.'));
    if (!isFinite(n)) return esc(String(p));
    return '€ ' + n.toFixed(2).replace('.', ',');
  }

  function paintProductenOverview(container, items) {
    if (!container) return;
    if (!items || !items.length) {
      container.innerHTML =
        '<div class="pp-uitg-leeg" style="grid-column:1/-1">' +
          '<p>Nog geen producten beschikbaar - partners voegen binnenkort hun collectie toe.</p>' +
        '</div>';
      return;
    }
    var html = '';
    items.forEach(function(p) {
      var img = (p.afbeeldingen && p.afbeeldingen[0]) || '';
      var titel = esc(p.titel || 'Product');
      var brand = esc(p.brandNaam || '');
      var url = esc(p.url || 'javascript:void(0)');
      var prijs = _fmtEuro(p.prijs);
      var pid = esc(p._id || '');
      html +=
        '<a class="pp-uitg-prod-kaart" ' +
          'href="' + url + '" ' +
          (url.indexOf('http') === 0 ? 'target="_blank" rel="noopener nofollow"' : '') + ' ' +
          'data-testid="pp-uitg-prod-' + pid + '" ' +
          'onclick="PP_FeedTabs.trackProd(\'' + pid + '\')">' +
          (img
            ? '<div class="pp-uitg-prod-img"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></div>'
            : '<div class="pp-uitg-prod-img pp-uitg-prod-noimg">👜</div>') +
          '<div class="pp-uitg-prod-body">' +
            (brand ? '<div class="pp-uitg-prod-brand">' + brand + '</div>' : '') +
            '<div class="pp-uitg-prod-titel">' + titel + '</div>' +
            (prijs ? '<div class="pp-uitg-prod-prijs">' + prijs + '</div>' : '') +
          '</div>' +
        '</a>';
    });
    container.innerHTML = html;
  }

  function trackProductClick(id) {
    try {
      if (window.DY && DY.brandPortal && DY.brandPortal._trackClick) {
        DY.brandPortal._trackClick(id);
      }
    } catch(_) {}
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
    trackProd: trackProductClick,
    renderUitgelicht: renderUitgelicht
  };
})();
