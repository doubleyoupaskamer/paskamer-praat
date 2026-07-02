/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT — SEO Auto-Schema (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Injecteert automatisch JSON-LD structured data per pagina-type,
 * gericht op maximale CTR-lift via Google Rich Results:
 *
 *   - Homepage (feed)         → WebSite + Organization + SearchAction
 *   - Merken lijst            → CollectionPage + ItemList (top merken)
 *   - Merk detail (brand_detail) → Al gedekt door Fase 6 (skip)
 *   - Product detail          → Product + Offer + AggregateRating
 *   - Post detail             → Article + Author + ImageObject
 *   - Live sessies            → Event schema
 *   - Reviews pagina          → Review lijst
 *   - Legal/voorwaarden       → WebPage schema
 *   - Elke pagina             → BreadcrumbList (afgeleid van hash/nav)
 *
 * Verpakt in <script type="application/ld+json" id="pp-seo-<type>">
 * zodat elke schema afzonderlijk herkenbaar en vervangbaar is.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppSeoAutoInit) return;
  window.__ppSeoAutoInit = true;

  var SITE_URL   = 'https://paskamerpraat.nl';
  var SITE_NAAM  = 'Paskamer Praat';
  var ORG_LOGO   = SITE_URL + '/pwa-icon-512x512.png';
  var DEFAULT_OG = SITE_URL + '/hero-model.png';

  var STATE = { lastPage: null, appliedIds: [] };

  function log(m) { try { console.log('[pp-seo-auto]', m); } catch (_) {} }
  function db()  { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }

  function currentPage() {
    try {
      var dy = window.DY && (DY.pagina || DY.page);
      if (dy) return String(dy);
      var m = location.hash.match(/#([a-z_]+)/i);
      if (m) return m[1];
      var u = new URLSearchParams(location.search);
      var p = u.get('pagina') || u.get('page');
      return p || 'feed';
    } catch (_) { return 'feed'; }
  }

  function upsertLd(id, obj) {
    var existing = document.getElementById(id);
    if (existing) existing.parentNode.removeChild(existing);
    var sc = document.createElement('script');
    sc.type = 'application/ld+json';
    sc.id = id;
    sc.textContent = JSON.stringify(obj, function (k, v) { return v === undefined ? undefined : v; });
    document.head.appendChild(sc);
    if (STATE.appliedIds.indexOf(id) < 0) STATE.appliedIds.push(id);
  }

  function removeLd(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    var idx = STATE.appliedIds.indexOf(id);
    if (idx >= 0) STATE.appliedIds.splice(idx, 1);
  }

  function clearAllApplied() {
    STATE.appliedIds.slice().forEach(removeLd);
  }

  // ─── Base: WebSite + Organization (op elke pagina) ──────────────────
  function applyBaseSchemas() {
    upsertLd('pp-seo-website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': SITE_URL + '#website',
      'name': SITE_NAAM,
      'url': SITE_URL,
      'description': 'Community & marketplace voor Tall en Plus Size mode.',
      'inLanguage': 'nl-NL',
      'potentialAction': {
        '@type': 'SearchAction',
        'target': {
          '@type': 'EntryPoint',
          'urlTemplate': SITE_URL + '/?pagina=zoeken&q={search_term_string}'
        },
        'query-input': 'required name=search_term_string'
      }
    });

    upsertLd('pp-seo-org', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': SITE_URL + '#organization',
      'name': SITE_NAAM,
      'url': SITE_URL,
      'logo': ORG_LOGO,
      'sameAs': [
        'https://instagram.com/paskamerpraat',
        'https://tiktok.com/@paskamerpraat',
        'https://facebook.com/paskamerpraat'
      ],
      'contactPoint': {
        '@type': 'ContactPoint',
        'contactType': 'customer support',
        'availableLanguage': ['Dutch', 'English']
      }
    });
  }

  // ─── Breadcrumb (bij elke pagina, afgeleid van nav-stack) ───────────
  function applyBreadcrumb(page) {
    var trail = [{ name: 'Home', url: SITE_URL + '/?pagina=feed' }];
    var friendlyName = {
      feed: 'Home', merken: 'Merken', brand_detail: 'Merkprofiel',
      product_detail: 'Product', post_detail: 'Post',
      live: 'Live', profiel: 'Profiel', wallet: 'Wallet',
      instellingen: 'Instellingen', voorwaarden: 'Voorwaarden',
      zoeken: 'Zoeken', reviews: 'Reviews', challenges: 'Challenges',
      berichten: 'Berichten', notificaties: 'Notificaties'
    };
    if (page && page !== 'feed' && friendlyName[page]) {
      trail.push({ name: friendlyName[page], url: SITE_URL + '/?pagina=' + page });
    }
    if (trail.length < 2) return; // Alleen op subpagina's

    upsertLd('pp-seo-breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': trail.map(function (n, i) {
        return {
          '@type': 'ListItem',
          'position': i + 1,
          'name': n.name,
          'item': n.url
        };
      })
    });
  }

  // ─── Product detail schema ──────────────────────────────────────────
  function applyProduct(productId) {
    var d = db();
    if (!d || !productId) return;
    d.collection('brand_products').doc(productId).get().then(function (snap) {
      if (!snap || !snap.exists) return;
      var p = snap.data() || {};
      var naam = p.naam || p.titel || 'Product';
      var afb = p.foto || (Array.isArray(p.fotos) && p.fotos[0]) || DEFAULT_OG;
      var prijs = Number(p.prijs || p.price || 0);
      var brandNaam = p.brandNaam || p.merk || '';
      var descr = p.beschrijving || p.description || (brandNaam + ' — ' + naam);
      var canon = SITE_URL + '/?pagina=product_detail&id=' + productId;

      var obj = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        '@id': canon + '#product',
        'name': naam,
        'description': descr.slice(0, 300),
        'image': afb,
        'url': canon,
        'brand': brandNaam ? { '@type': 'Brand', 'name': brandNaam } : undefined
      };
      if (prijs > 0) {
        obj.offers = {
          '@type': 'Offer',
          'url': canon,
          'priceCurrency': 'EUR',
          'price': prijs.toFixed(2),
          'availability': p.status === 'uitverkocht' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          'itemCondition': 'https://schema.org/NewCondition'
        };
      }
      if (p.rating && p.reviewCount) {
        obj.aggregateRating = {
          '@type': 'AggregateRating',
          'ratingValue': Number(p.rating),
          'reviewCount': Number(p.reviewCount),
          'bestRating': 5, 'worstRating': 1
        };
      }
      upsertLd('pp-seo-product', obj);
    }).catch(function (err) { log('product schema err: ' + (err && err.message)); });
  }

  // ─── Post / Article schema ──────────────────────────────────────────
  function applyArticle(postId) {
    var d = db();
    if (!d || !postId) return;
    // Probeer eerst feed_posts, dan posts
    var canon = SITE_URL + '/?pagina=post_detail&id=' + postId;
    var load = d.collection('feed_posts').doc(postId).get().then(function (s) {
      if (s && s.exists) return { id: postId, src: 'feed_posts', data: s.data() };
      return d.collection('posts').doc(postId).get().then(function (s2) {
        return s2 && s2.exists ? { id: postId, src: 'posts', data: s2.data() } : null;
      });
    });
    load.then(function (r) {
      if (!r) return;
      var p = r.data || {};
      var img = p.thumbnail || p.image || p.foto || (Array.isArray(p.fotos) && p.fotos[0]) || DEFAULT_OG;
      var titel = p.titel || p.title || (p.tekst ? String(p.tekst).slice(0, 60) : 'Post');
      var author = p.userNaam || p.userName || 'Community';
      var ts = p.ts && p.ts.toDate ? p.ts.toDate().toISOString() : new Date().toISOString();
      upsertLd('pp-seo-article', {
        '@context': 'https://schema.org',
        '@type': 'Article',
        '@id': canon + '#article',
        'headline': titel,
        'image': img,
        'datePublished': ts,
        'dateModified': ts,
        'author': { '@type': 'Person', 'name': author },
        'publisher': { '@type': 'Organization', 'name': SITE_NAAM, 'logo': { '@type': 'ImageObject', 'url': ORG_LOGO } },
        'mainEntityOfPage': { '@type': 'WebPage', '@id': canon }
      });
    }).catch(function (err) { log('article schema err: ' + (err && err.message)); });
  }

  // ─── Live session Event schema ──────────────────────────────────────
  function applyLive() {
    var d = db();
    if (!d) return;
    // Neem eerstvolgende geplande live sessie
    d.collection('live_sessions').where('status', 'in', ['scheduled', 'live']).limit(1).get().then(function (snap) {
      if (!snap || snap.empty) return;
      var doc = snap.docs[0];
      var e = doc.data() || {};
      var canon = SITE_URL + '/?pagina=live';
      var start = e.geplandOp && e.geplandOp.toDate ? e.geplandOp.toDate().toISOString() : (e.startTime || new Date().toISOString());
      upsertLd('pp-seo-event', {
        '@context': 'https://schema.org',
        '@type': 'Event',
        '@id': canon + '#event-' + doc.id,
        'name': e.titel || 'Paskamer Praat Live',
        'startDate': start,
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OnlineEventAttendanceMode',
        'location': { '@type': 'VirtualLocation', 'url': canon },
        'image': e.thumbnail || DEFAULT_OG,
        'description': e.beschrijving || 'Live modeshow op Paskamer Praat',
        'organizer': { '@type': 'Organization', 'name': SITE_NAAM, 'url': SITE_URL }
      });
    }).catch(function (err) { log('event schema err: ' + (err && err.message)); });
  }

  // ─── Merken lijst → CollectionPage + ItemList ───────────────────────
  function applyMerkenLijst() {
    var d = db();
    if (!d) return;
    d.collection('brands').where('status', '==', 'approved').orderBy('volgers', 'desc').limit(10).get().then(function (snap) {
      var items = [];
      if (snap && snap.forEach) snap.forEach(function (doc) {
        var b = doc.data() || {};
        items.push({
          '@type': 'ListItem',
          'position': items.length + 1,
          'url': SITE_URL + '/?pagina=brand_detail&merk=' + doc.id,
          'name': b.naam || 'Merk'
        });
      });
      if (!items.length) return;
      upsertLd('pp-seo-merken-lijst', {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': SITE_URL + '/?pagina=merken#collection',
        'name': 'Onze merkpartners',
        'description': 'Exclusieve merken voor Tall & Plus Size — geselecteerd door Paskamer Praat.',
        'url': SITE_URL + '/?pagina=merken',
        'mainEntity': { '@type': 'ItemList', 'itemListElement': items }
      });
    }).catch(function (err) { log('merken schema err: ' + (err && err.message)); });
  }

  // ─── Legal / voorwaarden ────────────────────────────────────────────
  function applyLegal(page) {
    var titel = page === 'voorwaarden' ? 'Algemene voorwaarden' : 'Info';
    upsertLd('pp-seo-webpage', {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': SITE_URL + '/?pagina=' + page,
      'name': titel + ' — Paskamer Praat',
      'url': SITE_URL + '/?pagina=' + page,
      'inLanguage': 'nl-NL',
      'isPartOf': { '@id': SITE_URL + '#website' }
    });
  }

  // ─── FAQPage schema (voor voorwaarden / privacy_center) ─────────────
  function applyFaqIfPresent() {
    // Zoek in DOM naar accordion-achtige structuren (<details>) en bouw FAQPage
    var details = document.querySelectorAll('.bp-page details, .dy-page details, main details');
    if (!details || details.length < 2) return;
    var faqs = [];
    for (var i = 0; i < Math.min(details.length, 20); i++) {
      var s = details[i].querySelector('summary');
      var body = details[i].querySelector('div, p');
      if (!s || !body) continue;
      var q = String(s.textContent || '').trim();
      var a = String(body.textContent || '').trim();
      if (!q || !a) continue;
      faqs.push({
        '@type': 'Question', 'name': q.slice(0, 150),
        'acceptedAnswer': { '@type': 'Answer', 'text': a.slice(0, 500) }
      });
    }
    if (!faqs.length) return;
    upsertLd('pp-seo-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': faqs
    });
  }

  // ─── Router: pas schemas toe obv pagina-type ────────────────────────
  function routeSchemas() {
    var page = currentPage();
    if (page === STATE.lastPage) return;
    STATE.lastPage = page;

    // Reset alle eerder geïnjecteerde schemas (behalve base)
    ['pp-seo-product', 'pp-seo-article', 'pp-seo-event', 'pp-seo-merken-lijst',
     'pp-seo-webpage', 'pp-seo-faq', 'pp-seo-breadcrumb'].forEach(removeLd);

    // Base op elke pagina
    applyBaseSchemas();

    // Breadcrumb voor subpagina's
    applyBreadcrumb(page);

    switch (page) {
      case 'feed':
      case 'home':
        // Alleen base — WebSite + Organization
        break;
      case 'merken':
        applyMerkenLijst();
        break;
      case 'brand_detail':
      case 'merken_detail':
        // Gedekt door Fase 6 (pp-brand-profile-fase6-seo-v1.js)
        break;
      case 'product_detail':
      case 'detail':
        var pid = getUrlId('id') || getUrlId('product');
        if (pid) applyProduct(pid);
        break;
      case 'post_detail':
        var postId = getUrlId('id') || getUrlId('post');
        if (postId) applyArticle(postId);
        break;
      case 'live':
        applyLive();
        break;
      case 'voorwaarden':
      case 'privacy_center':
        applyLegal(page);
        setTimeout(applyFaqIfPresent, 1200);
        break;
    }
  }

  function getUrlId(key) {
    try {
      var u = new URLSearchParams(location.search);
      var v = u.get(key);
      if (v) return v;
      var m = location.hash.match(new RegExp(key + '[=/](\\w+)'));
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }

  function init() {
    routeSchemas();
    window.addEventListener('hashchange', function () { setTimeout(routeSchemas, 300); });
    window.addEventListener('popstate', function () { setTimeout(routeSchemas, 300); });
    // Ook trigger op DY.navigeer calls (via MutationObserver op body page-attribute)
    var lastPage = currentPage();
    setInterval(function () {
      var p = currentPage();
      if (p !== lastPage) { lastPage = p; routeSchemas(); }
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_SeoAuto = {
    VERSION: '1.0.0',
    reapply: routeSchemas,
    getApplied: function () { return STATE.appliedIds.slice(); }
  };
})();
