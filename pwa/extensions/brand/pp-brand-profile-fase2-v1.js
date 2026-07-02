/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Phase 2 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Extends de klant-facing merkenprofiel pagina (BP.toonMerkDetail met
 * enhancements uit pp-brand-profile-v1.js) met:
 *
 *   1. FILTER-BAR boven de product-grid
 *      - Alles, Nieuw, Populair, Sale, Dames, Heren
 *      - Categorieën: Jurken, Broeken, Shirts, Jassen, Schoenen, Accessoires
 *      - Filters combineren (AND-logica op categorie + status)
 *      - Filters gebaseerd op velden: p.nieuw, p.populair, p.sale,
 *        p.voor (dames/heren/unisex), p.categorie (jurk/broek/etc)
 *
 *   2. PRODUCTKAART BADGES + ENHANCEMENTS (via CSS-overlay + DOM injectie)
 *      - Nieuw badge (p.nieuw === true)
 *      - Populair badge (p.populair === true)
 *      - Sale/kortingsbadge (p.originelePrijs > p.prijs → percentage)
 *      - Beoordeling (p.rating) + aantal reviews (p.reviewCount) onderaan
 *      - Voorraadstatus (p.voorraadStatus): "Bijna op" / "Uitverkocht"
 *      - Klik behoud bestaande routing (opent p.url in nieuw tabblad)
 *
 * Puur additief: geen wijzigingen aan brand-portal-v1.js of Firestore
 * schema. Alle nieuwe product-velden zijn optioneel; fallback = verbergen.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandFase2Init) return;
  window.__ppBrandFase2Init = true;

  var FILTERS = [
    { key: 'all',         label: 'Alles',        icon: '' },
    { key: 'nieuw',       label: 'Nieuw',        icon: '' },
    { key: 'populair',    label: 'Populair',     icon: '' },
    { key: 'sale',        label: 'Sale',         icon: '' },
    { key: 'dames',       label: 'Dames',        icon: '' },
    { key: 'heren',       label: 'Heren',        icon: '' },
    { key: 'jurken',      label: 'Jurken',       icon: '' },
    { key: 'broeken',     label: 'Broeken',      icon: '' },
    { key: 'shirts',      label: 'Shirts',       icon: '' },
    { key: 'jassen',      label: 'Jassen',       icon: '' },
    { key: 'schoenen',    label: 'Schoenen',     icon: '' },
    { key: 'accessoires', label: 'Accessoires',  icon: '' }
  ];

  var STATUS_FILTERS = ['nieuw', 'populair', 'sale'];
  var GENDER_FILTERS = ['dames', 'heren'];
  var CATEGORY_FILTERS = ['jurken', 'broeken', 'shirts', 'jassen', 'schoenen', 'accessoires'];

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-fase2]', m); } catch (_) {} }

  var activeFilter = 'all';
  var productCache = null; // { id: {data} }

  function injectCss() {
    if (document.getElementById('pp-brand-fase2-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-fase2-css';
    s.textContent = [
      // Filter bar
      '.pp-bp-filters{display:flex;gap:6px;overflow-x:auto;padding:6px 2px 12px;margin:22px 0 14px;scrollbar-width:thin;-webkit-overflow-scrolling:touch;border-bottom:1px solid rgba(245,236,224,0.06)}',
      '.pp-bp-filters::-webkit-scrollbar{height:4px}.pp-bp-filters::-webkit-scrollbar-thumb{background:rgba(212,145,10,0.35);border-radius:4px}',
      '.pp-bp-filter-btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:999px;background:transparent;border:1px solid rgba(245,236,224,0.14);color:rgba(245,236,224,0.72);font:600 12.5px/1 "DM Sans",sans-serif;letter-spacing:.02em;cursor:pointer;transition:all 0.18s ease;font-family:inherit;white-space:nowrap;-webkit-tap-highlight-color:transparent}',
      '.pp-bp-filter-btn:hover{border-color:rgba(212,145,10,0.5);color:#f0b340;background:rgba(212,145,10,0.06)}',
      '.pp-bp-filter-btn[data-active="true"]{background:linear-gradient(135deg,#f0b340,#d4910a);color:#0f0c08;border-color:#d4910a}',
      // Product card enhancements — overlay style
      '.bp-prod-kaart{position:relative}',
      '.pp-bp-prod-badges{position:absolute;top:8px;left:8px;z-index:2;display:flex;flex-direction:column;gap:4px;pointer-events:none}',
      '.pp-bp-prod-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font:700 9.5px/1.1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,0.25)}',
      '.pp-bp-prod-badge-nieuw{background:rgba(41,120,203,0.95);color:#f0f9ff}',
      '.pp-bp-prod-badge-populair{background:linear-gradient(135deg,#f0b340,#d4910a);color:#0f0c08}',
      '.pp-bp-prod-badge-sale{background:rgba(220,38,38,0.95);color:#fff2f2}',
      // Favoriet-hart rechtsboven
      '.pp-bp-prod-fav{position:absolute;top:8px;right:8px;z-index:2;width:30px;height:30px;padding:0;border-radius:999px;background:rgba(20,16,12,0.72);border:1px solid rgba(245,236,224,0.14);color:rgba(245,236,224,0.75);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.18s ease;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}',
      '.pp-bp-prod-fav:hover{color:#f28c8c;border-color:#f28c8c;transform:scale(1.05)}',
      '.pp-bp-prod-fav[data-active="true"]{color:#f28c8c;background:rgba(220,38,38,0.15);border-color:#f28c8c}',
      '.pp-bp-prod-fav svg{width:14px;height:14px}',
      // Rating + reviews onder titel
      '.pp-bp-prod-rating{display:inline-flex;align-items:center;gap:4px;margin-top:2px;font:500 11.5px/1 "DM Sans",sans-serif;color:rgba(245,236,224,0.7)}',
      '.pp-bp-prod-rating svg{width:11px;height:11px;color:#f0b340}',
      // Voorraadstatus
      '.pp-bp-prod-voorraad{margin-top:3px;font:600 10px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f0b340}',
      '.pp-bp-prod-voorraad[data-status="uitverkocht"]{color:rgba(245,236,224,0.4)}',
      // Kortingsprijs
      '.pp-bp-prod-prijs-oud{text-decoration:line-through;color:rgba(245,236,224,0.4);font-weight:400;margin-right:6px;font-size:0.85em}',
      // Verborgen kaarten (via filter)
      '.bp-prod-kaart[data-pp-hidden="1"]{display:none !important}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Detect product data via Firestore (cache per brandId) ───────────
  function loadProducts(brandId) {
    return new Promise(function (resolve) {
      try {
        var d = (window.DY && DY.db) || null;
        if (!d || !brandId) return resolve({});
        d.collection('brand_products')
          .where('brandId', '==', brandId)
          .where('status', '==', 'actief')
          .limit(100).get()
          .then(function (snap) {
            var map = {};
            if (snap && snap.forEach) {
              snap.forEach(function (doc) { map[doc.id] = doc.data() || {}; });
            }
            resolve(map);
          })
          .catch(function (err) { log('load products error: ' + (err && err.message)); resolve({}); });
      } catch (_) { resolve({}); }
    });
  }

  // ─── Bepaal of product matcht met huidige filter ─────────────────────
  function productMatches(p, filter) {
    if (!p || !filter || filter === 'all') return true;
    if (STATUS_FILTERS.indexOf(filter) !== -1) {
      // nieuw / populair / sale
      if (filter === 'nieuw') return p.nieuw === true;
      if (filter === 'populair') return p.populair === true;
      if (filter === 'sale') return (typeof p.originelePrijs === 'number' && typeof p.prijs === 'number' && p.originelePrijs > p.prijs) || p.sale === true;
    }
    if (GENDER_FILTERS.indexOf(filter) !== -1) {
      var voor = (p.voor || p.doelgroep || '').toLowerCase();
      return voor.indexOf(filter) !== -1;
    }
    if (CATEGORY_FILTERS.indexOf(filter) !== -1) {
      var cat = (p.categorie || p.type || '').toLowerCase();
      // Map singular to plural: jurken → jurk, broeken → broek
      var mapping = { jurken: ['jurk','dress'], broeken: ['broek','pants'], shirts: ['shirt','top','blouse'], jassen: ['jas','coat','jacket'], schoenen: ['schoen','shoe','sneaker'], accessoires: ['accessoire','tas','sieraad','riem'] };
      var alts = mapping[filter] || [filter];
      for (var i = 0; i < alts.length; i++) {
        if (cat.indexOf(alts[i]) !== -1) return true;
      }
      return false;
    }
    return true;
  }

  // ─── Apply filter to product grid ─────────────────────────────────────
  function applyFilter(filter) {
    activeFilter = filter;
    var grid = document.querySelector('.bp-page .bp-prod-grid');
    if (!grid) return;
    var cards = grid.querySelectorAll('.bp-prod-kaart[data-testid^="brand-product-"]');
    var visible = 0;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var testid = card.getAttribute('data-testid') || '';
      var pid = testid.replace('brand-product-', '');
      var p = (productCache && productCache[pid]) || {};
      var show = productMatches(p, filter);
      if (show) {
        card.removeAttribute('data-pp-hidden');
        visible++;
      } else {
        card.setAttribute('data-pp-hidden', '1');
      }
    }
    // Update active filter button state
    var bar = document.querySelector('.pp-bp-filters');
    if (bar) {
      var btns = bar.querySelectorAll('.pp-bp-filter-btn');
      for (var b = 0; b < btns.length; b++) {
        btns[b].setAttribute('data-active', btns[b].getAttribute('data-filter') === filter ? 'true' : 'false');
      }
    }
    // Empty state
    var empty = document.getElementById('pp-bp-filter-empty');
    if (visible === 0 && !empty) {
      var e = document.createElement('div');
      e.id = 'pp-bp-filter-empty';
      e.setAttribute('data-testid', 'pp-bp-filter-empty');
      e.style.cssText = 'text-align:center;padding:36px 20px;color:rgba(245,236,224,0.55);font:400 14px/1.5 "DM Sans",sans-serif;grid-column:1/-1';
      e.textContent = 'Geen producten in deze filter. Kies "Alles" om alle producten te zien.';
      grid.appendChild(e);
    } else if (empty && visible > 0) {
      empty.parentNode.removeChild(empty);
    }
  }

  // ─── Build filter bar ────────────────────────────────────────────────
  function buildFilterBar() {
    var html = '<div class="pp-bp-filters" role="tablist" data-testid="pp-bp-filters">';
    FILTERS.forEach(function (f) {
      var active = (f.key === activeFilter) ? 'true' : 'false';
      html += '<button type="button" class="pp-bp-filter-btn" data-filter="' + esc(f.key) + '" data-active="' + active + '" data-testid="pp-bp-filter-' + esc(f.key) + '">' + esc(f.label) + '</button>';
    });
    html += '</div>';
    return html;
  }

  // ─── Enhance product cards (badges, favoriet, rating) ────────────────
  function enhanceCards() {
    var grid = document.querySelector('.bp-page .bp-prod-grid');
    if (!grid || !productCache) return;
    var cards = grid.querySelectorAll('.bp-prod-kaart[data-testid^="brand-product-"]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.dataset.ppEnhanced === '1') continue;
      card.dataset.ppEnhanced = '1';
      var testid = card.getAttribute('data-testid') || '';
      var pid = testid.replace('brand-product-', '');
      var p = productCache[pid] || {};
      // 1. Badges overlay
      var badgesHtml = '';
      var isSale = (typeof p.originelePrijs === 'number' && typeof p.prijs === 'number' && p.originelePrijs > p.prijs) || p.sale === true;
      if (p.nieuw === true) badgesHtml += '<span class="pp-bp-prod-badge pp-bp-prod-badge-nieuw" data-testid="pp-bp-badge-nieuw-' + esc(pid) + '">Nieuw</span>';
      if (p.populair === true) badgesHtml += '<span class="pp-bp-prod-badge pp-bp-prod-badge-populair" data-testid="pp-bp-badge-populair-' + esc(pid) + '">Populair</span>';
      if (isSale) {
        var discount = '';
        if (typeof p.originelePrijs === 'number' && typeof p.prijs === 'number' && p.originelePrijs > 0) {
          discount = Math.round(((p.originelePrijs - p.prijs) / p.originelePrijs) * 100) + '%';
        }
        badgesHtml += '<span class="pp-bp-prod-badge pp-bp-prod-badge-sale" data-testid="pp-bp-badge-sale-' + esc(pid) + '">' + (discount ? '-' + discount : 'Sale') + '</span>';
      }
      if (badgesHtml) {
        var b = document.createElement('div');
        b.className = 'pp-bp-prod-badges';
        b.innerHTML = badgesHtml;
        // Insert into image container
        var imgWrap = card.querySelector('.bp-prod-img');
        if (imgWrap) imgWrap.appendChild(b);
        else card.appendChild(b);
      }
      // 2. Favoriet-knop (client-side toggle, opt-in als firebase user)
      var favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = 'pp-bp-prod-fav';
      favBtn.setAttribute('data-testid', 'pp-bp-fav-' + pid);
      favBtn.setAttribute('data-product-id', pid);
      favBtn.setAttribute('aria-label', 'Voeg toe aan favorieten');
      favBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      favBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var btn = this;
        var active = btn.getAttribute('data-active') === 'true';
        btn.setAttribute('data-active', active ? 'false' : 'true');
        btn.setAttribute('aria-label', active ? 'Voeg toe aan favorieten' : 'Verwijder uit favorieten');
        try { toggleFav(btn.getAttribute('data-product-id'), !active); } catch (_) {}
      });
      var imgWrap2 = card.querySelector('.bp-prod-img');
      if (imgWrap2) imgWrap2.appendChild(favBtn);
      // Init favoriet-state uit localStorage
      try {
        var favs = getLocalFavs();
        if (favs[pid]) favBtn.setAttribute('data-active', 'true');
      } catch (_) {}
      // 3. Kortingsprijs display: als origineelPrijs > prijs → toon oude prijs doorgestreept
      if (isSale && typeof p.originelePrijs === 'number' && typeof p.prijs === 'number' && p.originelePrijs > p.prijs) {
        var prijsEl = card.querySelector('.bp-prod-prijs');
        if (prijsEl && !prijsEl.querySelector('.pp-bp-prod-prijs-oud')) {
          var oldPrice = document.createElement('span');
          oldPrice.className = 'pp-bp-prod-prijs-oud';
          oldPrice.textContent = '€' + Number(p.originelePrijs).toFixed(2).replace('.', ',');
          prijsEl.insertBefore(oldPrice, prijsEl.firstChild);
        }
      }
      // 4. Rating + reviews
      if (typeof p.rating === 'number' && p.rating > 0) {
        var titelEl = card.querySelector('.bp-prod-titel');
        if (titelEl && !card.querySelector('.pp-bp-prod-rating')) {
          var rating = document.createElement('div');
          rating.className = 'pp-bp-prod-rating';
          rating.setAttribute('data-testid', 'pp-bp-rating-' + pid);
          rating.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' +
            Number(p.rating).toFixed(1) + (typeof p.reviewCount === 'number' && p.reviewCount > 0 ? ' <span style="opacity:.65">(' + p.reviewCount + ')</span>' : '');
          titelEl.parentNode.insertBefore(rating, titelEl.nextSibling);
        }
      }
      // 5. Voorraadstatus
      if (p.voorraadStatus === 'bijnaOp' || p.voorraadStatus === 'uitverkocht') {
        var stat = document.createElement('div');
        stat.className = 'pp-bp-prod-voorraad';
        stat.setAttribute('data-status', p.voorraadStatus === 'uitverkocht' ? 'uitverkocht' : 'bijnaOp');
        stat.setAttribute('data-testid', 'pp-bp-voorraad-' + pid);
        stat.textContent = p.voorraadStatus === 'uitverkocht' ? 'Uitverkocht' : 'Bijna op!';
        var last = card.querySelector('.bp-prod-prijs') || card.lastElementChild;
        if (last) last.parentNode.insertBefore(stat, last.nextSibling);
        else card.appendChild(stat);
      }
    }
  }

  function getLocalFavs() {
    try { return JSON.parse(localStorage.getItem('pp-bp-favs') || '{}') || {}; } catch (_) { return {}; }
  }
  function toggleFav(pid, on) {
    if (!pid) return;
    var favs = getLocalFavs();
    if (on) favs[pid] = Date.now();
    else delete favs[pid];
    try { localStorage.setItem('pp-bp-favs', JSON.stringify(favs)); } catch (_) {}
  }

  // ─── Injectie: filter bar + card enhance ─────────────────────────────
  function enhanceFase2() {
    var grid = document.querySelector('.bp-page .bp-prod-grid');
    if (!grid) return;
    if (grid.dataset.ppFase2 === '1') { enhanceCards(); return; }
    grid.dataset.ppFase2 = '1';
    injectCss();

    // Bepaal brandId
    var brandId = '';
    try { brandId = window.__ppCurrentBrandId || ''; } catch (_) {}
    if (!brandId) return; // zonder brandId kunnen we geen product-data ophalen

    // Bouw filter bar en plaats NA campagne/over-blok (indien aanwezig), boven collecties/grid
    var bar = document.createElement('div');
    bar.innerHTML = buildFilterBar();
    var barEl = bar.firstChild;
    if (barEl) {
      var camp = document.querySelector('.bp-page .pp-bp-camp');
      var over = document.querySelector('.bp-page .pp-bp-over');
      var anchorAfter = camp || over;
      if (anchorAfter && anchorAfter.parentNode) {
        anchorAfter.parentNode.insertBefore(barEl, anchorAfter.nextSibling);
      } else {
        var coll = document.querySelector('.bp-page .pp-bp-collecties');
        var before = coll || grid;
        if (before.parentNode) before.parentNode.insertBefore(barEl, before);
      }
    }

    // Delegated click voor filter buttons
    if (barEl) {
      barEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.pp-bp-filter-btn');
        if (!btn) return;
        applyFilter(btn.getAttribute('data-filter') || 'all');
      });
    }

    // Load producten async, dan enhance
    loadProducts(brandId).then(function (cache) {
      productCache = cache;
      enhanceCards();
      applyFilter(activeFilter);
    });
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { enhanceFase2(); } catch (e) { log('enhance error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { enhanceFase2(); } catch (_) {} }, 700);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandFase2 = { VERSION: '1.0.0', enhance: enhanceFase2, applyFilter: applyFilter };
})();
