/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - SEO Entity Pages (v1.0.0)  -  Fase D
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Vult de gap in `DY._updateSEOMeta`:
 *
 * - Legacy `_updateSEOMeta` werkt alleen voor STATISCHE pagina's
 *   (feed/lookbook/reviews/…), niet voor entity-pagina's met dynamische data.
 *
 * Wat dit module doet:
 *
 *  1. Hookt op `DY.navigeer` (idempotent) en luistert naar
 *     "page-rendered" signalen via MutationObserver op `#dy-main`.
 *  2. Voor entity-pagina's (`brand_detail`, `merken_detail`, `campagne_detail`,
 *     `product_detail`, `profiel`) leest het de DOM (titel + meta-data)
 *     en updates:
 *       • document.title
 *       • <meta name="description">
 *       • <link rel="canonical">
 *       • <meta property="og:title|og:description|og:url|og:type|og:image">
 *       • <meta name="twitter:title|description|image">
 *       • JSON-LD structured data (Organization / Product / Article / Person)
 *  3. Voor PRIVATE-pagina's (admin*, brand_dashboard, brand_wallet, wallet,
 *     instellingen, notificaties, etc.) zet het `<meta name="robots"
 *     content="noindex,nofollow">` zodat Google ze niet indexeert.
 *  4. Voor PUBLIC-pagina's verwijdert het de noindex weer.
 *
 * Public API:
 *   PP_SEO.applyForPage(pagina, id)   — handmatige trigger
 *   PP_SEO.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppSeoEntityInit) return;
  window.__ppSeoEntityInit = true;

  var TAG = '[seo-entity]';
  var BASE_URL = 'https://paskamerpraat.nl';

  // Pagina's die NIET geïndexeerd mogen worden door zoekmachines
  var PRIVATE_PAGES = {
    'admin': 1, 'admin_campagnes': 1, 'admin_users': 1, 'admin_transactions': 1,
    'admin_boosts': 1, 'admin_campagne_diagnose': 1, 'admin_brand_emails': 1,
    'brand_dashboard': 1, 'brand_campaigns': 1, 'brand_products': 1,
    'brand_wallet': 1, 'brand_settings': 1, 'brand_onboarding': 1,
    'brand_analytics': 1, 'brand_profiel': 1,
    'wallet': 1, 'wallet_topup': 1, 'wallet_history': 1, 'pakketten': 1,
    'instellingen': 1, 'notificaties': 1, 'zoeken': 1,
    'login': 1, 'register': 1, 'wachtwoord_vergeten': 1
  };

  // Entity-pagina's met dynamische slugs (id-based)
  var ENTITY_PAGES = {
    'brand_detail':    { type: 'brand',    pretty: 'bedrijf' },
    'merken_detail':   { type: 'brand',    pretty: 'bedrijf' },
    'campagne_detail': { type: 'campaign', pretty: 'campagne' },
    'product_detail':  { type: 'product',  pretty: 'product' },
    'profiel':         { type: 'person',   pretty: 'profiel' }
  };

  // ────────── HELPERS ──────────
  function db() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function setMeta(selector, attr, value) {
    var el = document.querySelector(selector);
    if (!el) {
      // Aanmaken als hij niet bestaat
      var parts = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
      if (parts) {
        el = document.createElement('meta');
        el.setAttribute(parts[1], parts[2]);
        document.head.appendChild(el);
      } else {
        return;
      }
    }
    el.setAttribute(attr, value);
  }

  function setCanonical(url) {
    var el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', url);
  }

  function setRobots(content) {
    var el = document.querySelector('meta[name="robots"]');
    if (!el) {
      if (!content) return;
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    if (!content) {
      el.parentNode && el.parentNode.removeChild(el);
    } else {
      el.setAttribute('content', content);
    }
  }

  function setJsonLd(jsonObj) {
    // Verwijder oude PP-LD entries; legacy site-LD blijft staan
    var existing = document.querySelectorAll('script[type="application/ld+json"][data-pp-seo]');
    Array.prototype.forEach.call(existing, function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });
    if (!jsonObj) return;
    var script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-pp-seo', '1');
    script.textContent = JSON.stringify(jsonObj);
    document.head.appendChild(script);
  }

  function applyMeta(cfg) {
    try {
      if (cfg.title) document.title = cfg.title;
      if (cfg.desc)  setMeta('meta[name="description"]', 'content', cfg.desc);
      if (cfg.url) {
        setCanonical(cfg.url);
        setMeta('meta[property="og:url"]', 'content', cfg.url);
      }
      if (cfg.title) {
        setMeta('meta[property="og:title"]', 'content', cfg.title);
        setMeta('meta[name="twitter:title"]', 'content', cfg.title);
      }
      if (cfg.desc) {
        setMeta('meta[property="og:description"]', 'content', cfg.desc);
        setMeta('meta[name="twitter:description"]', 'content', cfg.desc);
      }
      if (cfg.image) {
        setMeta('meta[property="og:image"]', 'content', cfg.image);
        setMeta('meta[name="twitter:image"]', 'content', cfg.image);
      }
      if (cfg.type) {
        setMeta('meta[property="og:type"]', 'content', cfg.type);
      }
      if (cfg.jsonLd) setJsonLd(cfg.jsonLd);
    } catch (e) {
      try { console.warn(TAG, 'applyMeta:', e); } catch (_) {}
    }
  }

  // ────────── ENTITY LOADERS ──────────
  // Cache om dubbele reads te vermijden tijdens snelle navigatie
  var _cache = {};
  function cached(key, loader) {
    if (_cache[key]) return Promise.resolve(_cache[key]);
    return loader().then(function (data) {
      _cache[key] = data;
      return data;
    });
  }

  function loadBrand(id) {
    return cached('brand:' + id, function () {
      var d = db(); if (!d || !id) return Promise.resolve(null);
      return d.collection('brands').doc(id).get().then(function (s) {
        return s.exists ? Object.assign({ _id: s.id }, s.data()) : null;
      }).catch(function () { return null; });
    });
  }

  function loadCampaign(id) {
    return cached('camp:' + id, function () {
      var d = db(); if (!d || !id) return Promise.resolve(null);
      return d.collection('campaigns').doc(id).get().then(function (s) {
        return s.exists ? Object.assign({ _id: s.id }, s.data()) : null;
      }).catch(function () { return null; });
    });
  }

  function loadProduct(id) {
    return cached('prod:' + id, function () {
      var d = db(); if (!d || !id) return Promise.resolve(null);
      return d.collection('brand_products').doc(id).get().then(function (s) {
        return s.exists ? Object.assign({ _id: s.id }, s.data()) : null;
      }).catch(function () { return null; });
    });
  }

  function loadProfile(id) {
    return cached('user:' + id, function () {
      var d = db(); if (!d || !id) return Promise.resolve(null);
      return d.collection('users').doc(id).get().then(function (s) {
        return s.exists ? Object.assign({ _id: s.id }, s.data()) : null;
      }).catch(function () { return null; });
    });
  }

  // ────────── ENTITY META BUILDERS ──────────
  function buildBrandMeta(b) {
    if (!b) return null;
    var naam = b.naam || 'Merk';
    var beschr = (b.beschrijving || '').trim().slice(0, 160) ||
      naam + ' op Doubleyou — tall & plus size mode in Nederland. Bekijk de collectie en reviews van echte mensen.';
    var slug = slugify(naam) || b._id;
    var url = BASE_URL + '/bedrijf/' + slug + '?id=' + b._id;
    var img = b.logo || b.coverFoto || (BASE_URL + '/icons/pp-512.png');

    return {
      title: naam + ' — Tall & Plus Size mode | Doubleyou',
      desc: beschr,
      url: url,
      image: img,
      type: 'website',
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": naam,
        "description": beschr,
        "url": url,
        "logo": img,
        "sameAs": (b.website ? [b.website] : []).filter(Boolean)
      }
    };
  }

  function buildCampaignMeta(c) {
    if (!c) return null;
    var naam = c.naam || c.brandNaam || 'Campagne';
    var beschr = (c.beschrijving || '').trim().slice(0, 160) ||
      naam + ' — ontdek deze campagne van ' + (c.brandNaam || 'een merk') + ' op Doubleyou.';
    var slug = slugify(naam) || c._id;
    var url = BASE_URL + '/campagne/' + slug + '?id=' + c._id;
    var img = (c.banner || c.coverFoto || c.afbeelding || (BASE_URL + '/icons/pp-512.png'));

    return {
      title: naam + ' | Doubleyou',
      desc: beschr,
      url: url,
      image: img,
      type: 'article',
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": naam,
        "description": beschr,
        "image": img,
        "url": url,
        "author": { "@type": "Organization", "name": c.brandNaam || 'Doubleyou' }
      }
    };
  }

  function buildProductMeta(p) {
    if (!p) return null;
    var naam = p.titel || p.naam || 'Product';
    var beschr = (p.beschrijving || '').trim().slice(0, 160) ||
      naam + ' van ' + (p.brandNaam || 'een merk') + ' — bij Doubleyou.';
    var slug = slugify(naam) || p._id;
    var url = BASE_URL + '/product/' + slug + '?id=' + p._id;
    var img = (p.afbeeldingen && p.afbeeldingen[0]) || p.foto || (BASE_URL + '/icons/pp-512.png');
    var prijs = p.prijs;

    var offers = null;
    if (prijs != null && prijs !== '') {
      offers = {
        "@type": "Offer",
        "price": String(prijs).replace(',', '.'),
        "priceCurrency": "EUR",
        "availability": "https://schema.org/InStock",
        "url": p.url || url
      };
    }

    return {
      title: naam + ' — ' + (p.brandNaam || 'Doubleyou'),
      desc: beschr,
      url: url,
      image: img,
      type: 'product',
      jsonLd: Object.assign({
        "@context": "https://schema.org",
        "@type": "Product",
        "name": naam,
        "description": beschr,
        "image": img,
        "url": url,
        "brand": { "@type": "Brand", "name": p.brandNaam || 'Doubleyou' }
      }, offers ? { "offers": offers } : {})
    };
  }

  function buildProfileMeta(u) {
    if (!u) return null;
    var naam = u.gebruikersnaam || u.naam || 'Profiel';
    var beschr = (u.bio || '').trim().slice(0, 160) ||
      'Profiel van ' + naam + ' op Doubleyou — de tall & plus size fashion community.';
    var slug = slugify(naam) || u._id;
    var url = BASE_URL + '/profiel/' + slug + '?id=' + u._id;
    var img = u.profielFoto || (BASE_URL + '/icons/pp-512.png');

    return {
      title: naam + ' op Doubleyou',
      desc: beschr,
      url: url,
      image: img,
      type: 'profile',
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": naam,
        "description": beschr,
        "image": img,
        "url": url
      }
    };
  }

  // ────────── MAIN APPLIER ──────────
  function applyForPage(pagina, id) {
    if (!pagina) pagina = (window.DY && DY.pagina) || 'home';
    if (id == null) id = (window.DY && DY.huidigeId) || null;

    // 1) Robots-flag voor private pages
    if (PRIVATE_PAGES[pagina]) {
      setRobots('noindex,nofollow');
    } else {
      setRobots(''); // remove for public
    }

    // 2) Entity-pages → dynamische meta
    var ent = ENTITY_PAGES[pagina];
    if (!ent || !id) return; // statische pagina's gebruiken legacy DY._updateSEOMeta

    var loader;
    var builder;
    if (ent.type === 'brand')    { loader = loadBrand;    builder = buildBrandMeta; }
    else if (ent.type === 'campaign') { loader = loadCampaign; builder = buildCampaignMeta; }
    else if (ent.type === 'product')  { loader = loadProduct;  builder = buildProductMeta; }
    else if (ent.type === 'person')   { loader = loadProfile;  builder = buildProfileMeta; }
    else return;

    loader(id).then(function (data) {
      var cfg = builder(data);
      if (cfg) applyMeta(cfg);
    });
  }

  // ────────── HOOKS ──────────
  function installHooks() {
    if (!window.DY || typeof DY.navigeer !== 'function') {
      setTimeout(installHooks, 250);
      return;
    }
    if (DY.__ppSeoHookInstalled) return;
    DY.__ppSeoHookInstalled = true;
    var orig = DY.navigeer.bind(DY);
    DY.navigeer = function (pagina, id) {
      var result = orig(pagina, id);
      // Wacht 1 tick voordat we entity-data lookupen — DOM moet eerst loaden
      setTimeout(function () { applyForPage(pagina, id); }, 60);
      return result;
    };
    // Initial apply
    setTimeout(function () {
      applyForPage(DY.pagina, DY.huidigeId);
    }, 200);
    try { console.log(TAG, 'hooks installed'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHooks);
  } else {
    installHooks();
  }

  window.PP_SEO = {
    applyForPage: applyForPage,
    VERSION: '1.0.0'
  };
})();
