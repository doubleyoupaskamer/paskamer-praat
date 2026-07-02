/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Phase 6 (v1.0.0) — SEO Overrides
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Injecteert SEO overrides voor de publieke merkenprofiel pagina:
 *
 *   - <title>
 *   - <meta name="description">
 *   - <meta name="keywords">
 *   - Open Graph tags (og:title, og:description, og:image, og:url, og:type)
 *   - Twitter card tags
 *   - JSON-LD structured data (Organization + Brand schema)
 *
 * Bron: `brand.seo` object met velden:
 *   { title, description, keywords, ogImage, canonicalUrl }
 *
 * Fallbacks: brand.naam | brand.slogan | brand.beschrijving | brand.logo
 *
 * Restore: bij navigatie weg van brand page (hashchange / popstate)
 * worden originele meta tags hersteld uit een one-time snapshot.
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandFase6Init) return;
  window.__ppBrandFase6Init = true;

  var META_KEYS = [
    { sel: 'title',                       attr: null },
    { sel: 'meta[name="description"]',    attr: 'content' },
    { sel: 'meta[name="keywords"]',       attr: 'content' },
    { sel: 'meta[property="og:title"]',   attr: 'content' },
    { sel: 'meta[property="og:description"]', attr: 'content' },
    { sel: 'meta[property="og:image"]',   attr: 'content' },
    { sel: 'meta[property="og:url"]',     attr: 'content' },
    { sel: 'meta[property="og:type"]',    attr: 'content' },
    { sel: 'meta[name="twitter:title"]',  attr: 'content' },
    { sel: 'meta[name="twitter:description"]', attr: 'content' },
    { sel: 'meta[name="twitter:image"]',  attr: 'content' },
    { sel: 'link[rel="canonical"]',       attr: 'href' }
  ];

  var LD_ID = 'pp-brand-seo-jsonld';
  var STATE = { snapshot: null, active: false, lastBrandId: null };

  function log(m) { try { console.log('[pp-brand-fase6]', m); } catch (_) {} }
  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }

  function firstOf() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  function truncate(s, n) {
    if (!s) return '';
    s = String(s).trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
  }

  // Snapshot huidige waarden zodat we ze bij navigatie kunnen herstellen
  function takeSnapshot() {
    if (STATE.snapshot) return;
    var snap = {};
    for (var i = 0; i < META_KEYS.length; i++) {
      var mk = META_KEYS[i];
      var el = document.querySelector(mk.sel);
      if (!el) { snap[mk.sel] = null; continue; }
      snap[mk.sel] = mk.attr ? el.getAttribute(mk.attr) : el.textContent;
    }
    STATE.snapshot = snap;
  }

  function upsertMeta(sel, attr, value) {
    var el = document.querySelector(sel);
    if (!el) {
      if (sel === 'title') {
        el = document.createElement('title');
        document.head.appendChild(el);
      } else if (sel.indexOf('link[') === 0) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
      } else {
        el = document.createElement('meta');
        // Parse selector zoals meta[name="..."] of meta[property="..."]
        var m = sel.match(/meta\[(\w+)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
    }
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  }

  function applyBrandSeo(b, brandId) {
    if (!b) return;
    takeSnapshot();
    var seo = b.seo || {};
    var naam = firstOf(b.naam, 'Merk');
    var slogan = firstOf(b.slogan);
    var beschrijving = firstOf(b.beschrijving, b.missie);
    var logo = firstOf(b.logo);
    var banner = firstOf(b.banner);

    // Compute values met fallbacks
    var titel = firstOf(seo.title, naam + (slogan ? ' — ' + slogan : '') + ' | Paskamer Praat');
    titel = truncate(titel, 70);
    var descr = firstOf(seo.description, slogan, beschrijving, naam + ' op Paskamer Praat: ontdek producten, collecties, reviews en community outfits.');
    descr = truncate(descr, 160);
    var keys = firstOf(seo.keywords, [naam, b.categorie, 'Paskamer Praat', 'mode', 'kleding'].filter(Boolean).join(', '));
    var ogImg = firstOf(seo.ogImage, banner, logo, 'https://paskamerpraat.nl/hero-model.png?v=60.1.202');
    var canon = firstOf(seo.canonicalUrl, (location.origin + location.pathname + '?merk=' + brandId));

    upsertMeta('title', null, titel);
    upsertMeta('meta[name="description"]', 'content', descr);
    upsertMeta('meta[name="keywords"]', 'content', keys);
    upsertMeta('meta[property="og:title"]', 'content', titel);
    upsertMeta('meta[property="og:description"]', 'content', descr);
    upsertMeta('meta[property="og:image"]', 'content', ogImg);
    upsertMeta('meta[property="og:url"]', 'content', canon);
    upsertMeta('meta[property="og:type"]', 'content', 'website');
    upsertMeta('meta[name="twitter:title"]', 'content', titel);
    upsertMeta('meta[name="twitter:description"]', 'content', descr);
    upsertMeta('meta[name="twitter:image"]', 'content', ogImg);
    upsertMeta('link[rel="canonical"]', 'href', canon);

    // JSON-LD structured data (Organization + Brand schema, combineerbaar)
    var ld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': canon + '#organization',
          'name': naam,
          'url': canon,
          'logo': logo || undefined,
          'description': descr,
          'sameAs': collectSameAs(b)
        },
        {
          '@type': 'Brand',
          '@id': canon + '#brand',
          'name': naam,
          'logo': logo || undefined,
          'description': slogan || descr,
          'url': canon
        }
      ]
    };
    // Voeg AggregateRating toe als reviewCount + rating aanwezig
    if (b.rating && b.reviewCount && Number(b.reviewCount) > 0) {
      ld['@graph'][1].aggregateRating = {
        '@type': 'AggregateRating',
        'ratingValue': Number(b.rating),
        'reviewCount': Number(b.reviewCount),
        'bestRating': 5,
        'worstRating': 1
      };
    }
    // Voeg contactPoint toe als contact.email of contact.telefoon aanwezig
    if (b.contact && (b.contact.email || b.contact.telefoon || b.contact.tel)) {
      ld['@graph'][0].contactPoint = {
        '@type': 'ContactPoint',
        'contactType': 'customer support',
        'email': b.contact.email || undefined,
        'telephone': b.contact.telefoon || b.contact.tel || undefined
      };
    }

    var existing = document.getElementById(LD_ID);
    if (existing) existing.parentNode.removeChild(existing);
    var sc = document.createElement('script');
    sc.type = 'application/ld+json';
    sc.id = LD_ID;
    sc.textContent = JSON.stringify(ld, function (k, v) { return v === undefined ? undefined : v; });
    document.head.appendChild(sc);

    STATE.active = true;
    STATE.lastBrandId = brandId;
  }

  function collectSameAs(b) {
    var out = [];
    var s = b.socials || {};
    var normalise = {
      instagram: 'https://instagram.com/',
      tiktok:    'https://tiktok.com/@',
      pinterest: 'https://pinterest.com/',
      facebook:  'https://facebook.com/',
      youtube:   'https://youtube.com/',
      x:         'https://x.com/'
    };
    Object.keys(normalise).forEach(function (k) {
      var raw = s[k];
      if (!raw) return;
      raw = String(raw).trim();
      if (/^https?:\/\//i.test(raw)) { out.push(raw); return; }
      out.push(normalise[k] + raw.replace(/^@/, '').replace(/^\/+/, ''));
    });
    if (b.website) out.push(b.website);
    return out;
  }

  function restoreSnapshot() {
    if (!STATE.snapshot || !STATE.active) return;
    for (var i = 0; i < META_KEYS.length; i++) {
      var mk = META_KEYS[i];
      var val = STATE.snapshot[mk.sel];
      if (val == null) continue;
      var el = document.querySelector(mk.sel);
      if (!el) continue;
      if (mk.attr) el.setAttribute(mk.attr, val);
      else el.textContent = val;
    }
    var ld = document.getElementById(LD_ID);
    if (ld && ld.parentNode) ld.parentNode.removeChild(ld);
    STATE.active = false;
    STATE.lastBrandId = null;
  }

  // ─── Detect brand page en trigger apply ─────────────────────────────
  function detectAndApply() {
    var brandId = '';
    try { brandId = window.__ppCurrentBrandId || ''; } catch (_) {}
    var onBrandPage = !!document.querySelector('.bp-page .bp-merk-hero');

    if (onBrandPage && brandId) {
      if (STATE.active && STATE.lastBrandId === brandId) return; // al toegepast
      var d = db();
      if (!d) return;
      d.collection('brands').doc(brandId).get().then(function (snap) {
        if (!snap || !snap.exists) return;
        applyBrandSeo(snap.data() || {}, brandId);
      }).catch(function (err) { log('brand load: ' + (err && err.message)); });
      return;
    }

    if (!onBrandPage && STATE.active) {
      restoreSnapshot();
    }
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { detectAndApply(); } catch (e) { log('detect: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', function () { setTimeout(detectAndApply, 200); });
    window.addEventListener('popstate', function () { setTimeout(detectAndApply, 200); });
    setTimeout(function () { try { detectAndApply(); } catch (_) {} }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandFase6 = { VERSION: '1.0.0', apply: applyBrandSeo, restore: restoreSnapshot };
})();
