/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Phase 4 (v1.1.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Community "Gedragen door de community" + Reviews sectie voor de
 * publieke merkenprofiel pagina.
 *
 * User choices (fork handoff):
 *   1c) Community bron = posts + feed_posts (union, gededupliceerd)
 *   2c) Merk-koppeling = brandId + taggedBrands + productIds -> brand_products
 *   3a) Reviews scope  = per merk (aggregate)
 *   4b) Paginatie      = 9 community + 5 reviews met "Toon meer"
 *
 * Fallback: leeg → uitnodigings-empty-state. Puur additief. Rendert NA
 * de product-grid (sectie 8 en 9 van de PRD).
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandFase4Init) return;
  window.__ppBrandFase4Init = true;

  var COMM_PAGE      = 9;   // items zichtbaar bij eerste render
  var COMM_STEP      = 9;   // extra items per "Toon meer" click
  var COMM_MAX_TOTAL = 60;  // totale plafond dat we uit Firestore trekken
  var REV_PAGE       = 5;
  var REV_STEP       = 5;
  var REV_MAX_TOTAL  = 40;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-fase4]', m); } catch (_) {} }
  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }
  function currentUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (_) { return null; } }
  function toast(msg, isErr) { try { if (window.DY && DY.toast) return DY.toast(msg, isErr); } catch (_) {} }

  function fmtDate(ts) {
    try {
      var d = ts && ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
      if (!d || isNaN(d.getTime())) return '';
      var day = String(d.getDate()).padStart(2, '0');
      var mnd = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
      return day + ' ' + mnd[d.getMonth()] + ' ' + d.getFullYear();
    } catch (_) { return ''; }
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '0';
    n = Number(n);
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  function safeMillis(ts) {
    try {
      if (!ts) return 0;
      if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
      if (ts instanceof Date) return ts.getTime();
      if (typeof ts === 'number') return ts;
      var d = new Date(ts);
      return isNaN(d.getTime()) ? 0 : d.getTime();
    } catch (_) { return 0; }
  }

  function injectCss() {
    if (document.getElementById('pp-brand-fase4-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-fase4-css';
    s.textContent = [
      // Sectie kop
      '.pp-bp-sec{margin:26px 0 8px}',
      '.pp-bp-sec-hdr{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 14px;flex-wrap:wrap}',
      '.pp-bp-sec-titel{font:400 clamp(1.05rem,2.4vw,1.35rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0;letter-spacing:-.01em}',
      '.pp-bp-sec-titel-count{font-size:0.65em;color:rgba(252,248,239,0.5);margin-left:6px;font-family:"DM Sans",sans-serif;font-weight:400}',
      '.pp-bp-sec-acties{display:inline-flex;gap:6px;flex-shrink:0}',
      '.pp-bp-sec-btn{background:transparent;border:1px solid rgba(212,145,10,0.4);border-radius:999px;color:#f0b340;padding:6px 12px;font:600 12px/1 "DM Sans",sans-serif;cursor:pointer;transition:all 0.18s ease;font-family:inherit}',
      '.pp-bp-sec-btn:hover{background:rgba(212,145,10,0.12);transform:translateY(-1px)}',
      // Rating badge in reviews header
      '.pp-bp-rev-avg{display:inline-flex;align-items:center;gap:8px;margin-left:10px;padding:4px 10px;border-radius:999px;background:rgba(212,145,10,0.14);border:1px solid rgba(212,145,10,0.32)}',
      '.pp-bp-rev-avg-nr{font:700 13px/1 "DM Sans",sans-serif;color:#f0b340}',
      '.pp-bp-rev-avg-star{color:#f0b340;font-size:13px;line-height:1}',
      // Community grid
      '.pp-bp-comm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
      '@media(min-width:640px){.pp-bp-comm-grid{grid-template-columns:repeat(3,1fr);gap:10px}}',
      '@media(min-width:1024px){.pp-bp-comm-grid{grid-template-columns:repeat(3,1fr)}}',
      '.pp-bp-comm-item{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#1a140c,#0f0c08);cursor:pointer;transition:transform 0.18s ease;display:block;text-decoration:none;color:inherit}',
      '.pp-bp-comm-item:hover{transform:scale(1.02)}',
      '.pp-bp-comm-item img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pp-bp-comm-item-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7),transparent 45%);padding:6px 8px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;opacity:1;transition:opacity 0.18s ease}',
      '.pp-bp-comm-stats{display:flex;gap:10px;font:600 11px/1 "DM Sans",sans-serif}',
      '.pp-bp-comm-stats svg{width:11px;height:11px;vertical-align:middle;margin-right:3px}',
      '.pp-bp-comm-user{font:600 10.5px/1.15 "DM Sans",sans-serif;color:rgba(255,255,255,0.9);margin-bottom:4px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}',
      // Load more wrapper
      '.pp-bp-more-wrap{display:flex;justify-content:center;margin-top:14px}',
      '.pp-bp-more-btn{background:rgba(212,145,10,0.08);border:1px solid rgba(212,145,10,0.4);border-radius:999px;color:#f0b340;padding:8px 18px;font:600 12.5px/1 "DM Sans",sans-serif;cursor:pointer;transition:all 0.18s ease;font-family:inherit}',
      '.pp-bp-more-btn:hover{background:rgba(212,145,10,0.16);transform:translateY(-1px)}',
      '.pp-bp-more-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none}',
      // Reviews
      '.pp-bp-rev-lijst{display:grid;grid-template-columns:1fr;gap:12px}',
      '@media(min-width:768px){.pp-bp-rev-lijst{grid-template-columns:repeat(2,1fr)}}',
      '.pp-bp-rev{padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:12px}',
      '.pp-bp-rev-hdr{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
      '.pp-bp-rev-avatar{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08;display:inline-flex;align-items:center;justify-content:center;font:700 12.5px/1 "DM Sans",sans-serif;overflow:hidden}',
      '.pp-bp-rev-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}',
      '.pp-bp-rev-user{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.pp-bp-rev-naam{font:600 13px/1.2 "DM Sans",sans-serif;color:#fcf8ef;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.pp-bp-rev-badge-ver{display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;background:rgba(31,124,32,0.18);color:#8ee888;font:700 9px/1 "DM Sans",sans-serif;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(31,124,32,0.35)}',
      '.pp-bp-rev-datum{font:400 11px/1 "DM Sans",sans-serif;color:rgba(252,248,239,0.5)}',
      '.pp-bp-rev-sterren{color:#f0b340;font:600 13px/1 "DM Sans",sans-serif;letter-spacing:.02em;white-space:nowrap}',
      '.pp-bp-rev-sterren-leeg{color:rgba(245,236,224,0.18)}',
      '.pp-bp-rev-tekst{font:400 13px/1.55 "DM Sans",sans-serif;color:rgba(252,248,239,0.82);margin:0;word-break:break-word;white-space:pre-line}',
      '.pp-bp-rev-fotos{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
      '.pp-bp-rev-foto{width:56px;height:56px;border-radius:8px;overflow:hidden;background:#0f0c08;cursor:pointer;display:block}',
      '.pp-bp-rev-foto img{width:100%;height:100%;object-fit:cover}',
      // Empty state
      '.pp-bp-empty{padding:24px 20px;background:rgba(255,255,255,0.02);border:1px dashed rgba(245,236,224,0.14);border-radius:12px;text-align:center;color:rgba(245,236,224,0.62);font:400 13.5px/1.5 "DM Sans",sans-serif}',
      '.pp-bp-empty strong{color:#fcf8ef;display:block;margin-bottom:4px;font-weight:600}',
      // Modal (review form)
      '.pp-bp-mod-ov{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
      '.pp-bp-mod{background:linear-gradient(155deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.28);border-radius:16px;padding:22px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto}',
      '.pp-bp-mod h3{font:400 1.25rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 6px}',
      '.pp-bp-mod p.bp-sub{margin:0 0 16px;color:rgba(252,248,239,0.6);font-size:13px}',
      '.pp-bp-mod-rating{display:inline-flex;gap:6px;margin-bottom:14px}',
      '.pp-bp-mod-ster{cursor:pointer;font-size:28px;line-height:1;color:rgba(245,236,224,0.22);transition:color 0.15s;user-select:none}',
      '.pp-bp-mod-ster[data-active="true"]{color:#f0b340}',
      '.pp-bp-mod .bp-veld{margin-bottom:12px;display:block}',
      '.pp-bp-mod .bp-veld > span{display:block;margin-bottom:4px;font:600 12px/1.2 "DM Sans",sans-serif;color:rgba(252,248,239,0.7)}',
      '.pp-bp-mod .bp-veld input,.pp-bp-mod .bp-veld textarea{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(245,236,224,0.12);border-radius:8px;padding:9px 11px;color:#fcf8ef;font:400 13.5px/1.4 "DM Sans",sans-serif;font-family:inherit;box-sizing:border-box}',
      '.pp-bp-mod .bp-veld textarea{resize:vertical;min-height:88px}',
      '.pp-bp-mod .bp-veld input:focus,.pp-bp-mod .bp-veld textarea:focus{outline:none;border-color:#d4910a}',
      '.pp-bp-mod-acties{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid rgba(245,236,224,0.08);flex-wrap:wrap}',
      '.pp-bp-mod .bp-btn{padding:9px 16px;border-radius:999px;font:600 13px/1 "DM Sans",sans-serif;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:all 0.15s ease}',
      '.pp-bp-mod .bp-btn-ghost{background:transparent;border-color:rgba(245,236,224,0.14);color:rgba(252,248,239,0.72)}',
      '.pp-bp-mod .bp-btn-ghost:hover{background:rgba(255,255,255,0.04)}',
      '.pp-bp-mod .bp-btn-primair{background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08}',
      '.pp-bp-mod .bp-btn-primair:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(212,145,10,0.35)}',
      '.pp-bp-mod .bp-btn:disabled{opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none}'
    ].join('');
    document.head.appendChild(s);
  }

  // Sterren HTML (5 sterren, gevuld obv rating)
  function starsHtml(rating) {
    var r = Math.round(Math.max(0, Math.min(5, Number(rating) || 0)));
    var full = '★★★★★'.slice(0, r);
    var empty = '★★★★★'.slice(0, 5 - r);
    return '<span class="pp-bp-rev-sterren">' + full + '<span class="pp-bp-rev-sterren-leeg">' + empty + '</span></span>';
  }

  // Community post kaart
  function buildCommItem(post) {
    var img = post.thumbnail || post.image || post.foto || (Array.isArray(post.fotos) && post.fotos[0]) || (Array.isArray(post.images) && post.images[0]) || '';
    var likes = post.likes || post.likeCount || 0;
    var reacties = post.reacties || post.reactieCount || post.commentCount || 0;
    var user = post.userNaam || post.userName || post.naam || '';
    var pid = post._id || post.id || '';
    var src = post._src || 'posts';
    var heart = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    var chat = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    return '<a class="pp-bp-comm-item" href="javascript:void(0)" data-post-id="' + esc(pid) + '" data-src="' + esc(src) + '" data-testid="pp-bp-comm-' + esc(pid) + '">' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '') +
      '<div class="pp-bp-comm-item-overlay">' +
        (user ? '<div class="pp-bp-comm-user">' + esc(user) + '</div>' : '') +
        '<div class="pp-bp-comm-stats">' +
          '<span>' + heart + fmtNum(likes) + '</span>' +
          '<span>' + chat + fmtNum(reacties) + '</span>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  // Review kaart
  function buildRev(r) {
    var naam = r.userNaam || r.userName || r.naam || 'Anoniem';
    var initials = String(naam).split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase();
    var avatar = r.userFoto || r.userAvatar || '';
    var isVer = r.geverifieerdeAankoop === true || r.verified === true;
    var datum = fmtDate(r.ts || r.timestamp || r.createdAt);
    var rating = r.rating || r.sterren || 0;
    var tekst = r.tekst || r.text || r.review || '';
    var fotos = Array.isArray(r.fotos) ? r.fotos.filter(Boolean) : (Array.isArray(r.images) ? r.images.filter(Boolean) : []);
    var fotosHtml = fotos.length ? '<div class="pp-bp-rev-fotos">' + fotos.slice(0, 4).map(function (f) {
      return '<a class="pp-bp-rev-foto" href="' + esc(f) + '" target="_blank" rel="noopener"><img src="' + esc(f) + '" alt="" loading="lazy"></a>';
    }).join('') + '</div>' : '';
    return '<div class="pp-bp-rev" data-testid="pp-bp-rev-' + esc(r._id || r.id || '') + '">' +
      '<div class="pp-bp-rev-hdr">' +
        '<div class="pp-bp-rev-avatar">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : esc(initials || '?')) + '</div>' +
        '<div class="pp-bp-rev-user">' +
          '<div class="pp-bp-rev-naam">' + esc(naam) + (isVer ? '<span class="pp-bp-rev-badge-ver">Geverifieerde aankoop</span>' : '') + '</div>' +
          (datum ? '<div class="pp-bp-rev-datum">' + esc(datum) + '</div>' : '') +
        '</div>' +
        starsHtml(rating) +
      '</div>' +
      (tekst ? '<p class="pp-bp-rev-tekst">' + esc(tekst) + '</p>' : '') +
      fotosHtml +
    '</div>';
  }

  // Empty states
  function commEmpty() {
    return '<div class="pp-bp-empty" data-testid="pp-bp-comm-empty">' +
      '<strong>Nog geen community posts</strong>' +
      'Wees de eerste die dit merk in een outfit tagt om hier te verschijnen.' +
    '</div>';
  }
  function revEmpty(canReview) {
    return '<div class="pp-bp-empty" data-testid="pp-bp-rev-empty">' +
      '<strong>Nog geen reviews</strong>' +
      (canReview ? 'Wees de eerste die dit merk beoordeelt.' : 'Log in om als eerste een review te schrijven.') +
    '</div>';
  }

  // ─── Insert sectie: NA de product-grid (sectie 8 en 9 volgens PRD) ────
  // Robuuste anchor-placement: fase4-community vóór fase4-reviews, beide na .bp-prod-grid
  function insertSection(sectionEl, kind) {
    var page = document.querySelector('.bp-page');
    if (!page || !sectionEl) return;

    // Vaste volgorde: [grid] -> [community] -> [reviews]
    if (kind === 'community') {
      var revExisting = page.querySelector('#pp-bp-reviews');
      if (revExisting && revExisting.parentNode) {
        revExisting.parentNode.insertBefore(sectionEl, revExisting);
        return;
      }
      var grid = page.querySelector('.bp-prod-grid');
      if (grid && grid.parentNode) {
        grid.parentNode.insertBefore(sectionEl, grid.nextSibling);
        return;
      }
      page.appendChild(sectionEl);
      return;
    }

    if (kind === 'reviews') {
      var comm = page.querySelector('#pp-bp-community');
      if (comm && comm.parentNode) {
        comm.parentNode.insertBefore(sectionEl, comm.nextSibling);
        return;
      }
      var grid2 = page.querySelector('.bp-prod-grid');
      if (grid2 && grid2.parentNode) {
        grid2.parentNode.insertBefore(sectionEl, grid2.nextSibling);
        return;
      }
      page.appendChild(sectionEl);
      return;
    }

    page.appendChild(sectionEl);
  }

  // ─── Community: union query van posts + feed_posts, met product-lookup fallback
  //   (User choice 1c + 2c)
  //   Doet parallel:
  //     A) posts.where(taggedBrands, array-contains, brandId)
  //     B) posts.where(brandId==brandId)
  //     C) feed_posts.where(taggedBrands, array-contains, brandId)
  //     D) feed_posts.where(brandId==brandId)
  //     E) brand_products (brandId) -> productIds -> posts.where(productIds, array-contains-any, chunks)
  //   Alle results gededupliceerd op id, gesorteerd op ts desc, gelimiteerd tot COMM_MAX_TOTAL
  function loadCommunity(brandId) {
    var d = db();
    if (!d || !brandId) return Promise.resolve([]);

    function safeGet(promise, source) {
      return promise.then(function (snap) {
        var arr = [];
        if (snap && snap.forEach) snap.forEach(function (doc) {
          var data = doc.data() || {};
          data._id = doc.id;
          data._src = source;
          arr.push(data);
        });
        return arr;
      }).catch(function (err) {
        log(source + ' query fail: ' + (err && err.message));
        return [];
      });
    }

    var perQueryLimit = 20;
    var qs = [];

    // A + B: posts collection
    qs.push(safeGet(
      d.collection('posts').where('taggedBrands', 'array-contains', brandId).limit(perQueryLimit).get(),
      'posts'
    ));
    qs.push(safeGet(
      d.collection('posts').where('brandId', '==', brandId).limit(perQueryLimit).get(),
      'posts'
    ));
    // C + D: feed_posts collection
    qs.push(safeGet(
      d.collection('feed_posts').where('taggedBrands', 'array-contains', brandId).limit(perQueryLimit).get(),
      'feed_posts'
    ));
    qs.push(safeGet(
      d.collection('feed_posts').where('brandId', '==', brandId).limit(perQueryLimit).get(),
      'feed_posts'
    ));

    // E: product-lookup fallback — resolve brand_products -> productIds -> posts.productIds array-contains-any
    var productLookup = d.collection('brand_products')
      .where('brandId', '==', brandId)
      .where('status', '==', 'actief')
      .limit(30).get()
      .then(function (snap) {
        if (!snap || snap.empty) return [];
        var pids = [];
        snap.forEach(function (doc) { pids.push(doc.id); });
        if (!pids.length) return [];
        // array-contains-any accepteert max 10 elementen
        var chunk = pids.slice(0, 10);
        var arr1 = safeGet(
          d.collection('posts').where('productIds', 'array-contains-any', chunk).limit(perQueryLimit).get(),
          'posts'
        );
        var arr2 = safeGet(
          d.collection('feed_posts').where('productIds', 'array-contains-any', chunk).limit(perQueryLimit).get(),
          'feed_posts'
        );
        return Promise.all([arr1, arr2]).then(function (r) { return r[0].concat(r[1]); });
      })
      .catch(function (err) {
        log('product-lookup fallback fail: ' + (err && err.message));
        return [];
      });
    qs.push(productLookup);

    return Promise.all(qs).then(function (results) {
      var seen = Object.create(null);
      var merged = [];
      for (var i = 0; i < results.length; i++) {
        var arr = results[i] || [];
        for (var j = 0; j < arr.length; j++) {
          var item = arr[j];
          if (!item || !item._id) continue;
          // Verberg posts zonder afbeelding (community sectie is visueel-first)
          var hasImg = item.thumbnail || item.image || item.foto ||
                       (Array.isArray(item.fotos) && item.fotos.length) ||
                       (Array.isArray(item.images) && item.images.length);
          if (!hasImg) continue;
          // Verberg verborgen / gemodereerde posts
          if (item.verborgen === true || item.status === 'hidden') continue;
          var key = item._src + ':' + item._id;
          if (seen[key]) continue;
          seen[key] = true;
          merged.push(item);
        }
      }
      merged.sort(function (a, b) { return safeMillis(b.ts || b.timestamp || b.createdAt) - safeMillis(a.ts || a.timestamp || a.createdAt); });
      return merged.slice(0, COMM_MAX_TOTAL);
    });
  }

  function renderCommunity(brandId) {
    if (document.getElementById('pp-bp-community')) return;
    injectCss();
    loadCommunity(brandId).then(function (posts) {
      var section = document.createElement('section');
      section.id = 'pp-bp-community';
      section.className = 'pp-bp-sec';
      section.setAttribute('data-testid', 'pp-bp-community');

      var totaal = posts.length;
      var initial = posts.slice(0, COMM_PAGE);
      var body;
      if (!totaal) {
        body = commEmpty();
      } else {
        body = '<div class="pp-bp-comm-grid" data-testid="pp-bp-comm-grid">' + initial.map(buildCommItem).join('') + '</div>';
        if (totaal > COMM_PAGE) {
          body += '<div class="pp-bp-more-wrap"><button type="button" class="pp-bp-more-btn" data-role="comm-more" data-testid="pp-bp-comm-more">Toon meer</button></div>';
        }
      }
      section.innerHTML =
        '<div class="pp-bp-sec-hdr">' +
          '<h2 class="pp-bp-sec-titel">Gedragen door de community' +
            (totaal ? '<span class="pp-bp-sec-titel-count">(' + totaal + ')</span>' : '') +
          '</h2>' +
        '</div>' + body;
      insertSection(section, 'community');

      // "Toon meer" logica — voeg batches toe
      var shown = initial.length;
      section.addEventListener('click', function (e) {
        var it = e.target && e.target.closest && e.target.closest('.pp-bp-comm-item[data-post-id]');
        if (it) {
          var pid = it.getAttribute('data-post-id');
          try {
            if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('post_detail', { postId: pid });
            else if (window.DY && typeof DY.openPost === 'function') DY.openPost(pid);
            else location.hash = '#post/' + pid;
          } catch (_) {}
          return;
        }
        var more = e.target && e.target.closest && e.target.closest('[data-role="comm-more"]');
        if (more) {
          var next = posts.slice(shown, shown + COMM_STEP);
          if (!next.length) return;
          var grid = section.querySelector('.pp-bp-comm-grid');
          if (grid) grid.insertAdjacentHTML('beforeend', next.map(buildCommItem).join(''));
          shown += next.length;
          if (shown >= totaal) {
            var wrap = more.parentNode;
            if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
          }
        }
      });
    }).catch(function (err) { log('community render fail: ' + (err && err.message)); });
  }

  // ─── Reviews: aggregate per merk (3a) ─────────────────────────────────
  function loadReviews(brandId) {
    var d = db();
    if (!d || !brandId) return Promise.resolve([]);
    // Probeer eerst met orderBy ts desc; als index-error -> fallback zonder orderBy
    return d.collection('reviews')
      .where('brandId', '==', brandId)
      .orderBy('ts', 'desc')
      .limit(REV_MAX_TOTAL).get()
      .then(function (snap) {
        var arr = [];
        if (snap && snap.forEach) snap.forEach(function (doc) {
          arr.push(Object.assign({ _id: doc.id }, doc.data() || {}));
        });
        return arr;
      })
      .catch(function (err) {
        log('reviews orderBy fail, fallback: ' + (err && err.message));
        return d.collection('reviews').where('brandId', '==', brandId).limit(REV_MAX_TOTAL).get()
          .then(function (snap) {
            var arr = [];
            if (snap && snap.forEach) snap.forEach(function (doc) {
              arr.push(Object.assign({ _id: doc.id }, doc.data() || {}));
            });
            // Client-side sort desc op ts
            arr.sort(function (a, b) { return safeMillis(b.ts || b.timestamp || b.createdAt) - safeMillis(a.ts || a.timestamp || a.createdAt); });
            return arr;
          })
          .catch(function (e2) { log('reviews fallback fail: ' + (e2 && e2.message)); return []; });
      });
  }

  function computeAvg(reviews) {
    if (!reviews || !reviews.length) return null;
    var sum = 0, n = 0;
    for (var i = 0; i < reviews.length; i++) {
      var r = Number(reviews[i].rating || reviews[i].sterren);
      if (r > 0) { sum += r; n++; }
    }
    if (!n) return null;
    return Math.round((sum / n) * 10) / 10;
  }

  function renderReviews(brandId) {
    if (document.getElementById('pp-bp-reviews')) return;
    injectCss();
    loadReviews(brandId).then(function (reviews) {
      var section = document.createElement('section');
      section.id = 'pp-bp-reviews';
      section.className = 'pp-bp-sec';
      section.setAttribute('data-testid', 'pp-bp-reviews');
      var canReview = !!currentUid();
      var actiesHtml = '<button class="pp-bp-sec-btn" type="button" data-role="write-review" data-testid="pp-bp-rev-write">Schrijf review</button>';
      var totaal = reviews.length;
      var initial = reviews.slice(0, REV_PAGE);
      var avg = computeAvg(reviews);
      var avgHtml = (avg != null) ? '<span class="pp-bp-rev-avg" data-testid="pp-bp-rev-avg"><span class="pp-bp-rev-avg-star">★</span><span class="pp-bp-rev-avg-nr">' + avg.toFixed(1).replace('.', ',') + '</span></span>' : '';

      var body;
      if (!totaal) {
        body = revEmpty(canReview);
      } else {
        body = '<div class="pp-bp-rev-lijst" data-testid="pp-bp-rev-lijst">' + initial.map(buildRev).join('') + '</div>';
        if (totaal > REV_PAGE) {
          body += '<div class="pp-bp-more-wrap"><button type="button" class="pp-bp-more-btn" data-role="rev-more" data-testid="pp-bp-rev-more">Toon meer</button></div>';
        }
      }
      section.innerHTML =
        '<div class="pp-bp-sec-hdr">' +
          '<h2 class="pp-bp-sec-titel">Reviews' +
            (totaal ? '<span class="pp-bp-sec-titel-count">(' + totaal + ')</span>' : '') +
            avgHtml +
          '</h2>' +
          '<div class="pp-bp-sec-acties">' + actiesHtml + '</div>' +
        '</div>' + body;
      insertSection(section, 'reviews');

      var shown = initial.length;
      section.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('[data-role="write-review"]');
        if (b) { openReviewModal(brandId); return; }
        var more = e.target && e.target.closest && e.target.closest('[data-role="rev-more"]');
        if (more) {
          var next = reviews.slice(shown, shown + REV_STEP);
          if (!next.length) return;
          var lijst = section.querySelector('.pp-bp-rev-lijst');
          if (lijst) lijst.insertAdjacentHTML('beforeend', next.map(buildRev).join(''));
          shown += next.length;
          if (shown >= totaal) {
            var wrap = more.parentNode;
            if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
          }
        }
      });
    }).catch(function (err) { log('reviews render fail: ' + (err && err.message)); });
  }

  // ─── Review modal ────────────────────────────────────────────────────
  function openReviewModal(brandId) {
    var uid = currentUid();
    if (!uid) {
      toast('Log in om een review te schrijven', true);
      try { if (window.DY && DY.toonLogin) DY.toonLogin(); } catch (_) {}
      return;
    }
    if (document.getElementById('pp-bp-rev-modal')) return;
    var ov = document.createElement('div');
    ov.id = 'pp-bp-rev-modal';
    ov.className = 'pp-bp-mod-ov';
    ov.innerHTML =
      '<div class="pp-bp-mod" data-testid="pp-bp-rev-modal">' +
        '<h3>Schrijf een review</h3>' +
        '<p class="bp-sub">Deel je ervaring met dit merk om andere klanten te helpen.</p>' +
        '<div class="pp-bp-mod-rating" data-role="rating" data-value="0" data-testid="pp-bp-rev-modal-rating">' +
          '<span class="pp-bp-mod-ster" data-star="1">★</span>' +
          '<span class="pp-bp-mod-ster" data-star="2">★</span>' +
          '<span class="pp-bp-mod-ster" data-star="3">★</span>' +
          '<span class="pp-bp-mod-ster" data-star="4">★</span>' +
          '<span class="pp-bp-mod-ster" data-star="5">★</span>' +
        '</div>' +
        '<label class="bp-veld"><span>Jouw naam (zichtbaar)</span>' +
          '<input type="text" name="user-naam" maxlength="60" data-testid="pp-bp-rev-modal-naam" value="' + esc((window.DY && DY.user && (DY.user.displayName || DY.user.naam)) || '') + '">' +
        '</label>' +
        '<label class="bp-veld"><span>Jouw ervaring</span>' +
          '<textarea name="tekst" rows="4" maxlength="1000" placeholder="Wat vond je van dit merk?" data-testid="pp-bp-rev-modal-tekst"></textarea>' +
        '</label>' +
        '<div class="pp-bp-mod-err" data-role="err" data-testid="pp-bp-rev-modal-err" style="display:none;margin:4px 0 0;padding:8px 10px;border-radius:8px;background:rgba(242,140,140,0.10);border:1px solid rgba(242,140,140,0.35);color:#f28c8c;font:500 12.5px/1.4 \'DM Sans\',sans-serif"></div>' +
        '<div class="pp-bp-mod-acties">' +
          '<button type="button" class="bp-btn bp-btn-ghost" data-role="cancel" data-testid="pp-bp-rev-modal-cancel">Annuleren</button>' +
          '<button type="button" class="bp-btn bp-btn-primair" data-role="submit" data-testid="pp-bp-rev-modal-submit">Plaats review</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    // Rating clicks
    var ratingEl = ov.querySelector('[data-role="rating"]');
    ratingEl.addEventListener('click', function (e) {
      var st = e.target && e.target.closest && e.target.closest('.pp-bp-mod-ster');
      if (!st) return;
      var v = parseInt(st.getAttribute('data-star'), 10);
      ratingEl.setAttribute('data-value', String(v));
      var sterren = ratingEl.querySelectorAll('.pp-bp-mod-ster');
      for (var i = 0; i < sterren.length; i++) {
        sterren[i].setAttribute('data-active', i < v ? 'true' : 'false');
      }
    });
    // Cancel / backdrop
    ov.addEventListener('click', function (e) {
      if (e.target === ov || (e.target.getAttribute && e.target.getAttribute('data-role') === 'cancel')) {
        ov.parentNode && ov.parentNode.removeChild(ov);
      }
    });
    // ESC key
    var escHandler = function (e) {
      if (e.key === 'Escape') {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    // Submit
    ov.querySelector('[data-role="submit"]').addEventListener('click', function () {
      var errEl = ov.querySelector('[data-role="err"]');
      function showErr(msg) {
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        toast(msg, true);
      }
      function clearErr() { if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; } }
      clearErr();
      var rating = parseInt(ratingEl.getAttribute('data-value'), 10) || 0;
      if (rating < 1) { showErr('Kies eerst een aantal sterren.'); return; }
      var naamEl = ov.querySelector('[name="user-naam"]');
      var tekstEl = ov.querySelector('[name="tekst"]');
      var tekst = (tekstEl.value || '').trim();
      if (tekst.length < 3) { showErr('Review moet minimaal 3 tekens bevatten.'); return; }
      var u = currentUid();
      var d = db();
      if (!u || !d) { showErr('Niet ingelogd of database offline.'); return; }
      var submitBtn = ov.querySelector('[data-role="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Bezig...';
      var payload = {
        userId: u,
        brandId: brandId,
        rating: rating,
        tekst: tekst,
        userNaam: (naamEl.value || '').trim() || 'Anoniem',
        ts: (window.firebase && firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.serverTimestamp && firebase.firestore.FieldValue.serverTimestamp()) || new Date(),
        status: 'actief'
      };
      d.collection('reviews').add(payload)
        .then(function () {
          toast('Bedankt voor je review!');
          if (ov.parentNode) ov.parentNode.removeChild(ov);
          document.removeEventListener('keydown', escHandler);
          // Herlaad reviews sectie
          var revSec = document.getElementById('pp-bp-reviews');
          if (revSec && revSec.parentNode) revSec.parentNode.removeChild(revSec);
          renderReviews(brandId);
        })
        .catch(function (err) {
          log('submit review error: ' + (err && err.message));
          showErr('Kon review niet plaatsen: ' + (err && err.message ? err.message : 'onbekend'));
          submitBtn.disabled = false;
          submitBtn.textContent = 'Plaats review';
        });
    });
  }

  // ─── Init ────────────────────────────────────────────────────────────
  function enhanceFase4() {
    var page = document.querySelector('.bp-page');
    if (!page) return;
    if (page.dataset.ppFase4 === '1') return;
    var hero = page.querySelector('.bp-merk-hero');
    if (!hero) return;
    var brandId = '';
    try { brandId = window.__ppCurrentBrandId || ''; } catch (_) {}
    if (!brandId) return;
    page.dataset.ppFase4 = '1';
    injectCss();
    renderCommunity(brandId);
    renderReviews(brandId);
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { enhanceFase4(); } catch (e) { log('enhance error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { enhanceFase4(); } catch (_) {} }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandFase4 = { VERSION: '1.1.0', enhance: enhanceFase4, openReview: openReviewModal };
})();
