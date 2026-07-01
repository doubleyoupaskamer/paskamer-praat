/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Sponsored Products in Feed (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module.
 *
 * Doel: laat product-afbeeldingen van merken die hun campagne hebben
 *       BETAALD (campaigns.status='live' + plaatsingen bevat 'feed')
 *       mee-scrollen in de hoofd-feed (#dy-verhalen) als reguliere
 *       fullscreen reel-item, net als een normale feedpost. Geen header-
 *       strip bovenaan, geen "Aangeboden" rij gewoon in de feed-flow.
 *
 * Strategie:
 *  1. Subscribe op `campaigns` waar status='live' en plaatsingen bevat 'feed'
 *  2. Voor elk uniek brandId laad één-malig 5 actieve producten (cached)
 *  3. MutationObserver telt organische `.dy-reel-item`s; na elke ORGANIC_INTERVAL
 *     items wordt een gesponsord product geïnjecteerd (cyclisch)
 *  4. Render gebruikt EXACT dezelfde DOM-structuur als DY.verhaalKaart()
 *     zodat snap-scroll, IntersectionObservers (voor impressions/auto-play)
 *     en CSS-styling 1:1 werken
 *  5. Klik op kaart → opent product-URL (extern target=_blank) en logt
 *     campaign_click event
 *
 * Public API:
 *   PP_SponsoredProducts.refresh()            herlaadt producten/campagnes
 *   PP_SponsoredProducts.openProduct(pid,url,bid) handelt klik af
 *   PP_SponsoredProducts.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppSponsoredProductsInit) return;
  window.__ppSponsoredProductsInit = true;

  var TAG = '[sponsored-products]';
  var ORGANIC_INTERVAL = 5; // 1 gesponsord item per 5 organische posts
  var MAX_PRODUCTS_PER_BRAND = 5;
  var CACHE_TTL_MS = 5 * 60 * 1000;

  var _paidBrandIds = [];           // brandId[]
  var _sponsoredQueue = [];         // shuffled product cards data
  var _queueIdx = 0;
  var _imprBatched = {};            // dedupe impression tracking
  var _lastFetch = 0;
  var _fetchingPromise = null;
  var _observerInstalled = false;

  function db() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/'/g, '\\\'').replace(/"/g, '&quot;');
  }

  // ────────── DATA LOADING ──────────
  function fetchPaidProducts() {
    if (_fetchingPromise) return _fetchingPromise;
    var nu = Date.now();
    if ((nu - _lastFetch) < CACHE_TTL_MS && _sponsoredQueue.length) {
      return Promise.resolve(_sponsoredQueue);
    }
    var d = db();
    if (!d) return Promise.resolve([]);

    _fetchingPromise = d.collection('campaigns')
      .where('status', '==', 'live').limit(50).get()
      .then(function (snap) {
        var brandIds = {};
        snap.forEach(function (doc) {
          var c = doc.data();
          var plaats = c.plaatsingen || ['feed']; // legacy fallback
          if (plaats.indexOf('feed') === -1) return;
          // startDatum strikt; eindDatum soft (status='live' is supreme)
          var startMs = (c.startDatum && c.startDatum.toMillis) ? c.startDatum.toMillis() : null;
          if (startMs && nu < startMs) return;
          if (c.brandId) brandIds[c.brandId] = true;
        });
        _paidBrandIds = Object.keys(brandIds);
        if (!_paidBrandIds.length) {
          _sponsoredQueue = [];
          _lastFetch = nu;
          return _sponsoredQueue;
        }
        // Voor elk merk: laad max 5 actieve producten
        return Promise.all(_paidBrandIds.map(function (bid) {
          return d.collection('brand_products')
            .where('brandId', '==', bid)
            .where('status', '==', 'actief')
            .limit(MAX_PRODUCTS_PER_BRAND).get()
            .then(function (psnap) {
              var items = [];
              psnap.forEach(function (pdoc) {
                var p = pdoc.data();
                p._id = pdoc.id;
                if ((p.afbeeldingen && p.afbeeldingen.length) || p.foto) {
                  items.push(p);
                }
              });
              return items;
            })
            .catch(function () { return []; });
        })).then(function (perBrand) {
          var queue = [];
          perBrand.forEach(function (arr) { queue = queue.concat(arr); });
          // Eenvoudige shuffle voor variatie
          for (var i = queue.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = queue[i]; queue[i] = queue[j]; queue[j] = tmp;
          }
          _sponsoredQueue = queue;
          _queueIdx = 0;
          _lastFetch = nu;
          try { console.log(TAG, 'paid products loaded:', queue.length, 'from', _paidBrandIds.length, 'brand(s)'); } catch (_) {}
          return queue;
        });
      })
      .catch(function (err) {
        try { console.warn(TAG, 'fetch failed:', err && err.code); } catch (_) {}
        return [];
      })
      .then(function (q) {
        _fetchingPromise = null;
        return q;
      });

    return _fetchingPromise;
  }

  function nextProduct() {
    if (!_sponsoredQueue.length) return null;
    var p = _sponsoredQueue[_queueIdx % _sponsoredQueue.length];
    _queueIdx++;
    return p;
  }

  // ────────── CARD RENDERER ──────────
  function buildCard(p) {
    var img = (p.afbeeldingen && p.afbeeldingen[0]) || p.foto || '';
    var titel = p.titel || p.naam || 'Product';
    var prijs = p.prijs != null ? _fmtEuro(p.prijs) : '';
    var url = p.url || '';
    var brandNaam = p.brandNaam || 'Merk';
    var initials = brandNaam.slice(0, 2).toUpperCase();
    var pid = p._id || '';
    var bid = p.brandId || '';

    // ── Likes-state ophalen uit product-doc (legacy-compatible: likes map)
    var likesObj = (p.likes && typeof p.likes === 'object') ? p.likes : {};
    var likeCount = Object.keys(likesObj).length;
    var currentUid = null;
    try { currentUid = (window.firebase && firebase.auth().currentUser || {}).uid || null; } catch (_) {}
    var liked = !!(currentUid && likesObj[currentUid] === true);

    var el = document.createElement('div');
    el.className = 'dy-reel-item pp-sponsored-product';
    el.setAttribute('data-product-id', pid);
    el.setAttribute('data-brand-id', bid);
    el.setAttribute('data-testid', 'pp-sp-' + pid);
    el.dataset.docId = 'sp-' + pid; // simulate doc-id zodat scroll-signal observer hem oppikt

    var mediaBG = img
      ? '<img class="dy-reel-bg-blur" src="' + esc(img) + '" alt="" loading="lazy" decoding="async" aria-hidden="true">' +
        '<img class="dy-reel-bg-img-main" src="' + esc(img) + '" alt="" loading="lazy" decoding="async">'
      : '<div class="dy-reel-bg-kleur"></div>';

    el.innerHTML =
      '<div class="dy-reel-bg">' + mediaBG + '</div>' +
      '<div class="dy-reel-grad-top"></div>' +
      '<div class="dy-reel-grad-bot"></div>' +
      '<div class="dy-reel-content">' +
        '<div class="dy-reel-auteur">' +
          '<div class="dy-reel-avatar">' +
            '<div class="dy-reel-avatar-fallback" data-brand-id="' + esc(bid) + '">' + esc(initials) + '</div>' +
          '</div>' +
          '<div class="dy-reel-auteur-meta">' +
            '<span class="dy-reel-naam">' + esc(brandNaam) +
              ' <span class="pp-sp-badge" data-testid="pp-sp-badge">Gesponsord</span>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<h2 class="dy-reel-titel pp-sp-titel">' + esc(titel) + '</h2>' +
        (prijs ? '<p class="dy-reel-preview pp-sp-prijs">' + esc(prijs) + '</p>' : '') +
        '<span class="dy-reel-meer pp-sp-cta" ' +
          'onclick="event.stopPropagation();PP_SponsoredProducts.openProduct(\'' +
            escAttr(pid) + '\',\'' + escAttr(url) + '\',\'' + escAttr(bid) + '\')">Bekijk product →</span>' +
      '</div>' +
      // ── Action bar (like-knop, zelfde pattern als legacy verhaalKaart)
      '<div class="dy-reel-actions pp-sp-actions">' +
        '<button class="dy-reel-action-btn dy-reel-like' + (liked ? ' liked' : '') + '" ' +
          'data-testid="pp-sp-like-' + esc(pid) + '" ' +
          'onclick="event.stopPropagation();PP_SponsoredProducts.toggleLike(this,\'' + escAttr(pid) + '\')" ' +
          'aria-label="Like">' +
          '<svg class="dy-reel-action-icon" viewBox="0 0 24 24" fill="' + (liked ? 'currentColor' : 'none') + '" ' +
            'stroke="currentColor" stroke-width="2">' +
            '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
          '</svg>' +
          '<span class="dy-reel-action-count">' + (likeCount > 0 ? likeCount : '') + '</span>' +
        '</button>' +
      '</div>';

    // Klik op kaart-zelf opent ook product (maar niet op like/CTA)
    el.addEventListener('click', function (e) {
      if (e.target.closest('.pp-sp-cta')) return;
      if (e.target.closest('.dy-reel-actions')) return;
      openProduct(pid, url, bid);
    });

    // Hydrate brand logo via PP_NavContext indien beschikbaar
    try {
      if (window.PP_NavContext && PP_NavContext.brandLogoFor && bid) {
        PP_NavContext.brandLogoFor(bid).then(function (logoUrl) {
          if (!logoUrl) return;
          var avatarEl = el.querySelector('.dy-reel-avatar');
          if (!avatarEl) return;
          avatarEl.innerHTML = '<img class="dy-reel-avatar-img" src="' + esc(logoUrl) +
            '" alt="" loading="lazy" decoding="async">';
        });
      }
    } catch (_) {}

    return el;
  }

  function _fmtEuro(p) {
    if (p == null || p === '') return '';
    var n = Number(String(p).replace(',', '.'));
    if (!isFinite(n)) return String(p);
    return '€ ' + n.toFixed(2).replace('.', ',');
  }

  // ────────── INSERTION LOGIC ──────────
  // Tel organische items in #dy-verhalen; na elke ORGANIC_INTERVAL → injecteer
  // een sponsored item na het laatste organische item van die batch.
  function maybeInject() {
    if (!_sponsoredQueue.length) return;
    var container = document.getElementById('dy-verhalen');
    if (!container) return;
    // Alleen op /feed of /home
    var pagina = window.DY && window.DY.pagina;
    if (pagina && pagina !== 'feed' && pagina !== 'home') return;
    // v1.1.0: honoreer admin master kill-switch (Placements control → 'feed')
    try {
      if (window.PP_Placements && typeof PP_Placements.isPlacementActive === 'function') {
        if (!PP_Placements.isPlacementActive('feed')) return;
      }
    } catch (_) {}

    var organic = container.querySelectorAll('.dy-reel-item:not(.pp-sponsored-product):not(.dy-reel-empty):not([data-sp-anchor])');
    var organicArr = Array.prototype.slice.call(organic);
    if (organicArr.length < ORGANIC_INTERVAL) return;

    // Vind ankers waar we nog GEEN sponsored card achter hebben gehangen
    for (var i = ORGANIC_INTERVAL - 1; i < organicArr.length; i += ORGANIC_INTERVAL) {
      var anchor = organicArr[i];
      if (!anchor || anchor.hasAttribute('data-sp-anchor')) continue;
      anchor.setAttribute('data-sp-anchor', '1');
      var card = buildCard(nextProduct());
      if (!card) return;
      if (anchor.nextSibling) {
        anchor.parentNode.insertBefore(card, anchor.nextSibling);
      } else {
        anchor.parentNode.appendChild(card);
      }
      trackImpression(card);
    }
  }

  function trackImpression(card) {
    if (!card) return;
    var pid = card.getAttribute('data-product-id') || '';
    var bid = card.getAttribute('data-brand-id') || '';
    var key = 'sp:' + pid;
    if (_imprBatched[key]) return;
    _imprBatched[key] = true;
    var d = db();
    if (!d) return;
    try {
      d.collection('events').add({
        type: 'impression',
        subtype: 'sponsored_product',
        productId: pid,
        brandId: bid || null,
        plaatsing: 'feed',
        uid: null,
        ts: window.firebase.firestore.FieldValue.serverTimestamp(),
        processed: false
      }).catch(function () {});
    } catch (e) {}
  }

  function openProduct(pid, url, bid) {
    var d = db();
    if (d) {
      try {
        d.collection('events').add({
          type: 'campaign_click',
          subtype: 'sponsored_product',
          productId: pid || null,
          brandId: bid || null,
          plaatsing: 'feed',
          uid: null,
          ts: window.firebase.firestore.FieldValue.serverTimestamp(),
          processed: false
        }).catch(function () {});
      } catch (e) {}
    }
    if (url && url.indexOf('http') === 0) {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {
        window.location.href = url;
      }
    } else if (bid && window.DY && window.DY.brandPortal && window.DY.brandPortal.toonMerkDetail) {
      window.DY.brandPortal.toonMerkDetail(bid);
    }
  }

  // ────────── LIKE TOGGLE ──────────
  // Spiegelt DY.reelToggleLike logica maar tegen brand_products/{pid}.likes map.
  function toggleLike(btn, pid) {
    try {
      if (!window.DY || !DY.user) {
        if (DY && DY.toonLoginPrompt) DY.toonLoginPrompt('Like producten en steun je favoriete merken.');
        return;
      }
      var d = db();
      if (!d) return;
      var uid = DY.user.uid;
      var ref = d.collection('brand_products').doc(pid);
      var wasLiked = btn.classList.contains('liked');

      // Optimistic UI
      btn.classList.toggle('liked', !wasLiked);
      var icon = btn.querySelector('svg');
      var countEl = btn.querySelector('.dy-reel-action-count');
      if (icon) icon.setAttribute('fill', wasLiked ? 'none' : 'currentColor');
      btn.style.transform = 'scale(1.4)';
      setTimeout(function () { btn.style.transform = ''; }, 200);

      var update = {};
      update['likes.' + uid] = wasLiked
        ? window.firebase.firestore.FieldValue.delete()
        : true;
      ref.update(update).then(function () {
        return ref.get();
      }).then(function (snap) {
        if (snap && snap.exists) {
          var l = (snap.data() || {}).likes || {};
          var c = Object.keys(l).length;
          if (countEl) countEl.textContent = c > 0 ? c : '';
        }
      }).catch(function () {
        // Rollback bij rules-error
        btn.classList.toggle('liked', wasLiked);
        if (icon) icon.setAttribute('fill', wasLiked ? 'currentColor' : 'none');
      });
    } catch (e) {
      try { console.warn(TAG, 'toggleLike failed:', e); } catch (_) {}
    }
  }

  // ────────── CSS INJECTION ──────────
  function ensureCSS() {
    if (document.getElementById('pp-sp-style')) return;
    var s = document.createElement('style');
    s.id = 'pp-sp-style';
    s.textContent =
      '.pp-sp-badge{' +
        'display:inline-block;margin-left:6px;padding:2px 8px;' +
        'font:600 9px/1 "DM Sans",system-ui,sans-serif;letter-spacing:.12em;' +
        'text-transform:uppercase;color:#1a1208;background:#d4910a;' +
        'border-radius:99px;vertical-align:middle;' +
      '}' +
      '.pp-sp-titel{font-style:normal !important}' +
      '.pp-sp-prijs{font-weight:600;color:#fcf8ef}' +
      '.pp-sp-cta{cursor:pointer}';
      // v1.1.0: actiebar wordt NIET meer verborgen likes blijven zichtbaar
      // op gesponsorde posts (klant betaalt voor engagement).
    document.head.appendChild(s);
  }

  // ────────── INIT ──────────
  function init() {
    ensureCSS();

    // Eerste fetch + initial inject
    fetchPaidProducts().then(function () { maybeInject(); });

    if (_observerInstalled) return;
    _observerInstalled = true;

    // Observe nieuwe organische items die door legacy DY.toonVolgendeBatch worden
    // toegevoegd aan #dy-verhalen
    var obs = new MutationObserver(function (mutations) {
      var hasNewOrganic = false;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('dy-reel-item') &&
              !node.classList.contains('pp-sponsored-product')) {
            hasNewOrganic = true;
          }
        });
      });
      if (hasNewOrganic) maybeInject();
    });

    var trySetup = function () {
      var container = document.getElementById('dy-verhalen');
      if (container) {
        obs.observe(container, { childList: true });
        maybeInject();
      } else {
        setTimeout(trySetup, 500);
      }
    };
    trySetup();

    // Bij visibility-revisit: cache invalideren als TTL voorbij is
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        fetchPaidProducts();
      }
    });
  }

  function refresh() {
    _lastFetch = 0;
    _sponsoredQueue = [];
    _queueIdx = 0;
    fetchPaidProducts().then(function () {
      // Reset anchors zodat injectie opnieuw kan gebeuren met nieuwe queue
      var anchors = document.querySelectorAll('[data-sp-anchor]');
      Array.prototype.forEach.call(anchors, function (a) { a.removeAttribute('data-sp-anchor'); });
      // Verwijder bestaande sponsored cards
      var existing = document.querySelectorAll('.pp-sponsored-product');
      Array.prototype.forEach.call(existing, function (e) {
        if (e.parentNode) e.parentNode.removeChild(e);
      });
      maybeInject();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }

  window.PP_SponsoredProducts = {
    refresh: refresh,
    openProduct: openProduct,
    toggleLike: toggleLike,
    VERSION: '1.1.0'
  };
})();
