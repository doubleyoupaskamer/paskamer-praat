/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT — SEO Audit Widget (v1.0.0)  [ADMIN-ONLY]
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Client-side audit tool voor structured data / Rich Results:
 *   - Scant alle <script type="application/ld+json"> op de huidige pagina
 *   - Valideert types + verplichte velden per schema-type
 *   - Toont een health-matrix per schema
 *   - Genereert 1-click "Test in Google Rich Results" links
 *   - Batch-mode: haal top merken/producten op en lijst hun canonical URLs
 *     met directe Rich-Results-Test knoppen
 *
 * Trigger: `?seo-audit=1` in URL OF `Ctrl+Alt+S` toets combo.
 * Toegang: alleen zichtbaar voor admin (UID check via admin_access).
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppSeoAuditInit) return;
  window.__ppSeoAuditInit = true;

  var GRT_URL = 'https://search.google.com/test/rich-results?url=';
  var ADMIN_HARDCODED_UID = 'ahtVa6qvFheIy3yDVpDXCz2INwq1';

  var REQUIRED_FIELDS = {
    'Organization': ['name', 'url'],
    'WebSite':      ['name', 'url'],
    'Brand':        ['name'],
    'Product':      ['name', 'image', 'description'],
    'Offer':        ['price', 'priceCurrency'],
    'AggregateRating': ['ratingValue', 'reviewCount'],
    'Review':       ['author', 'reviewRating'],
    'Article':      ['headline', 'image', 'datePublished', 'author'],
    'Event':        ['name', 'startDate', 'location'],
    'BreadcrumbList': ['itemListElement'],
    'FAQPage':      ['mainEntity'],
    'CollectionPage': ['name', 'url'],
    'WebPage':      ['name', 'url']
  };

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function db()  { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }
  function currentUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (_) { return null; } }

  function isAdminSync() {
    var uid = currentUid();
    return uid === ADMIN_HARDCODED_UID;
  }

  function isAdminAsync() {
    return new Promise(function (resolve) {
      var uid = currentUid();
      if (!uid) return resolve(false);
      if (uid === ADMIN_HARDCODED_UID) return resolve(true);
      var d = db();
      if (!d) return resolve(false);
      d.collection('admin_access').doc(uid).get()
        .then(function (s) { resolve(s && s.exists); })
        .catch(function () { resolve(false); });
    });
  }

  // ─── Parse alle JSON-LD op de pagina ────────────────────────────────
  function scanJsonLd() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    var found = [];
    for (var i = 0; i < scripts.length; i++) {
      var el = scripts[i];
      var raw = el.textContent || '';
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (e) {
        found.push({ id: el.id || '(zonder id)', ok: false, error: 'Ongeldige JSON: ' + e.message, raw: raw.slice(0, 200) });
        continue;
      }
      var items = parsed && parsed['@graph'] ? parsed['@graph'] : [parsed];
      items.forEach(function (item, idx) {
        var type = item['@type'] || 'Unknown';
        var typeName = Array.isArray(type) ? type[0] : type;
        var required = REQUIRED_FIELDS[typeName] || [];
        var missing = required.filter(function (f) { return item[f] == null || item[f] === ''; });
        found.push({
          id: (el.id || '(zonder id)') + (items.length > 1 ? ' [' + idx + ']' : ''),
          type: typeName,
          ok: missing.length === 0,
          missing: missing,
          data: item
        });
      });
    }
    return found;
  }

  // ─── Zoek meta tag health ───────────────────────────────────────────
  function scanMeta() {
    var out = {};
    var keys = [
      { sel: 'title', label: 'title', maxLen: 70 },
      { sel: 'meta[name="description"]', attr: 'content', label: 'description', maxLen: 160, minLen: 60 },
      { sel: 'meta[property="og:title"]', attr: 'content', label: 'og:title' },
      { sel: 'meta[property="og:description"]', attr: 'content', label: 'og:description' },
      { sel: 'meta[property="og:image"]', attr: 'content', label: 'og:image' },
      { sel: 'meta[property="og:url"]', attr: 'content', label: 'og:url' },
      { sel: 'meta[name="twitter:card"]', attr: 'content', label: 'twitter:card' },
      { sel: 'link[rel="canonical"]', attr: 'href', label: 'canonical' }
    ];
    keys.forEach(function (k) {
      var el = document.querySelector(k.sel);
      var val = el ? (k.attr ? el.getAttribute(k.attr) : el.textContent) : null;
      var warn = [];
      if (!val) warn.push('ontbreekt');
      else {
        if (k.maxLen && val.length > k.maxLen) warn.push('te lang (' + val.length + '/' + k.maxLen + ')');
        if (k.minLen && val.length < k.minLen) warn.push('te kort (' + val.length + '<' + k.minLen + ')');
      }
      out[k.label] = { value: val || null, ok: warn.length === 0, warnings: warn };
    });
    return out;
  }

  // ─── Render widget ──────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('pp-seo-audit-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-seo-audit-css';
    s.textContent = [
      '#pp-seo-audit{position:fixed;top:12px;right:12px;bottom:12px;width:min(520px,95vw);z-index:99999;background:linear-gradient(155deg,#0f0c08,#1a140c);border:1px solid #d4910a;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.6);color:#fcf8ef;font:400 13px/1.5 "DM Sans",system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column}',
      '#pp-seo-audit .hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(212,145,10,0.28);background:rgba(212,145,10,0.06)}',
      '#pp-seo-audit .hdr h2{margin:0;font:400 1.05rem/1 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef}',
      '#pp-seo-audit .hdr .tabs{display:flex;gap:6px;margin-left:12px}',
      '#pp-seo-audit .hdr .tab{background:transparent;border:1px solid rgba(212,145,10,0.32);color:#d4910a;border-radius:999px;padding:5px 11px;font:600 11.5px/1 "DM Sans",sans-serif;cursor:pointer;font-family:inherit}',
      '#pp-seo-audit .hdr .tab[data-active="true"]{background:rgba(212,145,10,0.16)}',
      '#pp-seo-audit .hdr .x{background:transparent;border:none;color:#f0b340;cursor:pointer;font:600 18px/1 sans-serif;padding:0 6px}',
      '#pp-seo-audit .body{flex:1;overflow-y:auto;padding:14px 18px}',
      '#pp-seo-audit .item{margin-bottom:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:10px}',
      '#pp-seo-audit .item[data-ok="true"]{border-color:rgba(31,124,32,0.5)}',
      '#pp-seo-audit .item[data-ok="false"]{border-color:rgba(242,140,140,0.5)}',
      '#pp-seo-audit .item-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '#pp-seo-audit .item-type{font:600 12.5px/1 "DM Sans",sans-serif}',
      '#pp-seo-audit .item-status{font:700 10px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px}',
      '#pp-seo-audit .item-status[data-ok="true"]{background:rgba(31,124,32,0.16);color:#8ee888;border:1px solid rgba(31,124,32,0.4)}',
      '#pp-seo-audit .item-status[data-ok="false"]{background:rgba(242,140,140,0.14);color:#f28c8c;border:1px solid rgba(242,140,140,0.4)}',
      '#pp-seo-audit .item-detail{margin-top:6px;font:400 11.5px/1.5 "DM Sans",sans-serif;color:rgba(252,248,239,0.72);word-break:break-word}',
      '#pp-seo-audit .item-detail b{color:#f0b340}',
      '#pp-seo-audit .test-btn{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08;border:none;border-radius:999px;padding:6px 12px;font:700 11.5px/1 "DM Sans",sans-serif;cursor:pointer;text-decoration:none;font-family:inherit;margin-top:8px}',
      '#pp-seo-audit .test-btn:hover{transform:translateY(-1px)}',
      '#pp-seo-audit .batch-item{display:flex;gap:8px;align-items:center;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px}',
      '#pp-seo-audit .batch-item .name{flex:1;font:600 12px/1.3 "DM Sans",sans-serif}',
      '#pp-seo-audit .batch-item .url{font:400 10px/1.2 "DM Sans",sans-serif;color:rgba(252,248,239,0.5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '#pp-seo-audit-toggle{position:fixed;bottom:16px;right:16px;z-index:99998;background:#d4910a;color:#0f0c08;border:none;border-radius:999px;padding:9px 14px;font:700 12px/1 "DM Sans",sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.4)}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildJsonLdView(items) {
    if (!items.length) return '<p class="item-detail">Geen JSON-LD schemas gevonden op deze pagina.</p>';
    return items.map(function (it) {
      var detail = '';
      if (it.error) detail = '<b>JSON parse error:</b> ' + esc(it.error);
      else if (it.missing && it.missing.length) detail = '<b>Ontbrekende velden:</b> ' + esc(it.missing.join(', '));
      else detail = 'Alle verplichte velden aanwezig.';
      return '<div class="item" data-ok="' + (it.ok ? 'true' : 'false') + '">' +
        '<div class="item-hdr">' +
          '<span class="item-type">' + esc(it.type || 'Unknown') + ' <small style="opacity:.5">· ' + esc(it.id) + '</small></span>' +
          '<span class="item-status" data-ok="' + (it.ok ? 'true' : 'false') + '">' + (it.ok ? 'OK' : 'FIX') + '</span>' +
        '</div>' +
        '<div class="item-detail">' + detail + '</div>' +
      '</div>';
    }).join('');
  }

  function buildMetaView(meta) {
    return Object.keys(meta).map(function (k) {
      var m = meta[k];
      var detail = m.value ? esc(String(m.value).slice(0, 200)) : '<i style="opacity:.6">ontbreekt</i>';
      if (m.warnings.length) detail += '<br><b style="color:#f0b340">' + esc(m.warnings.join(', ')) + '</b>';
      return '<div class="item" data-ok="' + (m.ok ? 'true' : 'false') + '">' +
        '<div class="item-hdr">' +
          '<span class="item-type">' + esc(k) + '</span>' +
          '<span class="item-status" data-ok="' + (m.ok ? 'true' : 'false') + '">' + (m.ok ? 'OK' : 'FIX') + '</span>' +
        '</div>' +
        '<div class="item-detail">' + detail + '</div>' +
      '</div>';
    }).join('');
  }

  function buildTestBtn(url, label) {
    var target = GRT_URL + encodeURIComponent(url);
    return '<a class="test-btn" href="' + esc(target) + '" target="_blank" rel="noopener" data-testid="pp-seo-audit-test-' + esc(label || 'url') + '">🔍 ' + esc(label || 'Test in Google Rich Results') + '</a>';
  }

  function currentPageUrl() {
    return location.origin + location.pathname + location.search;
  }

  // Batch mode: haal top merken + producten op
  function loadBatch() {
    var d = db();
    if (!d) return Promise.resolve({ brands: [], products: [] });
    var brandsP = d.collection('brands').where('status', '==', 'approved').orderBy('volgers', 'desc').limit(10).get()
      .then(function (s) {
        var arr = [];
        s.forEach(function (doc) {
          var b = doc.data() || {};
          arr.push({ id: doc.id, naam: b.naam || 'Merk', url: location.origin + '/?pagina=brand_detail&merk=' + doc.id });
        });
        return arr;
      }).catch(function () { return []; });
    var productsP = d.collection('brand_products').where('status', '==', 'actief').limit(10).get()
      .then(function (s) {
        var arr = [];
        s.forEach(function (doc) {
          var p = doc.data() || {};
          arr.push({ id: doc.id, naam: p.naam || p.titel || 'Product', url: location.origin + '/?pagina=product_detail&id=' + doc.id });
        });
        return arr;
      }).catch(function () { return []; });
    return Promise.all([brandsP, productsP]).then(function (r) { return { brands: r[0], products: r[1] }; });
  }

  function buildBatchView(batch) {
    var html = '<h3 style="font:400 1rem/1.2 \'DM Serif Display\',serif;margin:8px 0 10px;color:#f0b340">Top 10 merken</h3>';
    if (!batch.brands.length) html += '<p class="item-detail">Geen merken opgehaald.</p>';
    html += batch.brands.map(function (b) {
      return '<div class="batch-item"><div style="flex:1;min-width:0"><div class="name">' + esc(b.naam) + '</div><div class="url">' + esc(b.url) + '</div></div>' + buildTestBtn(b.url, 'Test') + '</div>';
    }).join('');
    html += '<h3 style="font:400 1rem/1.2 \'DM Serif Display\',serif;margin:18px 0 10px;color:#f0b340">Top 10 producten</h3>';
    if (!batch.products.length) html += '<p class="item-detail">Geen producten opgehaald.</p>';
    html += batch.products.map(function (p) {
      return '<div class="batch-item"><div style="flex:1;min-width:0"><div class="name">' + esc(p.naam) + '</div><div class="url">' + esc(p.url) + '</div></div>' + buildTestBtn(p.url, 'Test') + '</div>';
    }).join('');
    return html;
  }

  // ─── Widget UI ──────────────────────────────────────────────────────
  function openWidget() {
    if (document.getElementById('pp-seo-audit')) return;
    injectCss();
    var w = document.createElement('div');
    w.id = 'pp-seo-audit';
    w.setAttribute('data-testid', 'pp-seo-audit-widget');
    w.innerHTML =
      '<div class="hdr">' +
        '<h2>SEO Audit</h2>' +
        '<div class="tabs">' +
          '<button class="tab" data-role="tab" data-tab="page" data-active="true" data-testid="pp-seo-audit-tab-page">Huidige pagina</button>' +
          '<button class="tab" data-role="tab" data-tab="meta" data-testid="pp-seo-audit-tab-meta">Meta tags</button>' +
          '<button class="tab" data-role="tab" data-tab="batch" data-testid="pp-seo-audit-tab-batch">Batch test</button>' +
        '</div>' +
        '<button class="x" data-role="close" data-testid="pp-seo-audit-close">✕</button>' +
      '</div>' +
      '<div class="body" data-role="body"><em>Laden…</em></div>';
    document.body.appendChild(w);

    var body = w.querySelector('[data-role="body"]');
    var currentTab = 'page';
    var batchCache = null;

    function renderTab(tab) {
      currentTab = tab;
      w.querySelectorAll('[data-role="tab"]').forEach(function (t) {
        t.setAttribute('data-active', t.getAttribute('data-tab') === tab ? 'true' : 'false');
      });
      if (tab === 'page') {
        var items = scanJsonLd();
        var summary = items.length + ' schemas · ' + items.filter(function (i) { return i.ok; }).length + ' OK · ' + items.filter(function (i) { return !i.ok; }).length + ' fixen nodig';
        body.innerHTML = '<div class="item-detail" style="margin-bottom:12px">' + esc(summary) + '</div>' +
          buildTestBtn(currentPageUrl(), 'Test huidige URL in Rich Results') +
          '<div style="margin-top:14px">' + buildJsonLdView(items) + '</div>';
      } else if (tab === 'meta') {
        var meta = scanMeta();
        var okC = 0, tot = 0;
        Object.keys(meta).forEach(function (k) { tot++; if (meta[k].ok) okC++; });
        body.innerHTML = '<div class="item-detail" style="margin-bottom:12px">' + esc(okC + '/' + tot + ' meta tags OK') + '</div>' +
          buildMetaView(meta);
      } else if (tab === 'batch') {
        if (batchCache) { body.innerHTML = buildBatchView(batchCache); return; }
        body.innerHTML = '<em>Laden top merken + producten…</em>';
        loadBatch().then(function (b) { batchCache = b; if (currentTab === 'batch') body.innerHTML = buildBatchView(b); });
      }
    }

    w.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-role]');
      if (!t) return;
      if (t.getAttribute('data-role') === 'close') { w.parentNode.removeChild(w); return; }
      if (t.getAttribute('data-role') === 'tab') { renderTab(t.getAttribute('data-tab')); }
    });

    renderTab('page');
  }

  function ensureToggleButton() {
    if (document.getElementById('pp-seo-audit-toggle')) return;
    injectCss();
    var b = document.createElement('button');
    b.id = 'pp-seo-audit-toggle';
    b.setAttribute('data-testid', 'pp-seo-audit-toggle');
    b.textContent = '🔍 SEO';
    b.title = 'SEO Audit openen (Ctrl+Alt+S)';
    b.addEventListener('click', openWidget);
    document.body.appendChild(b);
  }

  // ─── Init: alleen als admin ─────────────────────────────────────────
  function init() {
    // Keyboard shortcut Ctrl+Alt+S (werkt ook zonder admin? nee — check admin)
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
        isAdminAsync().then(function (ok) { if (ok) openWidget(); });
      }
    });
    // URL query trigger
    try {
      var u = new URLSearchParams(location.search);
      if (u.get('seo-audit') === '1') {
        isAdminAsync().then(function (ok) { if (ok) { ensureToggleButton(); openWidget(); } });
      }
    } catch (_) {}
    // Auto-toggle button voor admin: verschijnt zodra DY.user bekend is
    var attempts = 0;
    var iv = setInterval(function () {
      attempts++;
      if (attempts > 60) { clearInterval(iv); return; }
      if (isAdminSync()) {
        clearInterval(iv);
        ensureToggleButton();
        return;
      }
      isAdminAsync().then(function (ok) {
        if (ok) { clearInterval(iv); ensureToggleButton(); }
      });
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_SeoAudit = {
    VERSION: '1.0.0',
    open: openWidget,
    scan: scanJsonLd,
    scanMeta: scanMeta
  };
})();
