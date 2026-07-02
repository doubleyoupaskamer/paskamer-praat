/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Phase 3 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Extends de klant-facing merkenprofiel pagina met:
 *
 *   1. UITGELICHTE CAMPAGNE (sectie 4) — banner boven producten:
 *      - Leest van campaigns collection: brandId + status=live, één actief
 *      - Toont: banner, titel, beschrijving, kortingslabel, CTA, einddatum
 *      - Countdown timer als einddatum in toekomst
 *      - Klik opent c.url in nieuw tabblad + tracking event
 *
 *   2. UITGELICHTE COLLECTIES (sectie 5) — collectie-grid onder campagne:
 *      - Leest van brand.collecties[] array (indien aanwezig)
 *      - Toont: afbeelding, titel, beschrijving, aantal producten, CTA
 *      - Klik filtert product-grid op collectie (Fase 2 integratie) of
 *        opent collectie.url extern
 *
 * Fallback: geen data → sectie verborgen. Puur additief.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandFase3Init) return;
  window.__ppBrandFase3Init = true;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-fase3]', m); } catch (_) {} }

  function injectCss() {
    if (document.getElementById('pp-brand-fase3-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-fase3-css';
    s.textContent = [
      // Campagne banner
      '.pp-bp-camp{position:relative;margin:22px 0 6px;padding:0;border-radius:16px;overflow:hidden;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.28);cursor:pointer;transition:transform 0.18s ease,border-color 0.18s ease}',
      '.pp-bp-camp:hover{transform:translateY(-2px);border-color:#d4910a}',
      '.pp-bp-camp-inner{display:flex;flex-direction:column;gap:0;min-height:140px}',
      '@media(min-width:640px){.pp-bp-camp-inner{flex-direction:row;align-items:stretch}}',
      '.pp-bp-camp-bg{position:relative;flex:1;min-height:120px;background:linear-gradient(135deg,rgba(212,145,10,0.2),rgba(20,16,12,0.6))}',
      '.pp-bp-camp-bg img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;position:absolute;inset:0}',
      '@media(min-width:640px){.pp-bp-camp-bg{flex:0 0 40%;min-height:0}}',
      '.pp-bp-camp-body{flex:1;padding:18px 20px;display:flex;flex-direction:column;justify-content:center;gap:8px;position:relative}',
      '.pp-bp-camp-korting{display:inline-flex;padding:4px 10px;border-radius:999px;background:rgba(220,38,38,0.95);color:#fff2f2;font:700 10.5px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;align-self:flex-start}',
      '.pp-bp-camp-titel{font:400 clamp(1.05rem,2.4vw,1.35rem)/1.25 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0;letter-spacing:-.01em}',
      '.pp-bp-camp-tekst{font:400 .85rem/1.5 "DM Sans",sans-serif;color:rgba(252,248,239,0.78);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.pp-bp-camp-cta{display:inline-flex;align-items:center;gap:5px;margin-top:2px;font:600 12.5px/1 "DM Sans",sans-serif;color:#d4910a;letter-spacing:.02em;align-self:flex-start}',
      '.pp-bp-camp-countdown{display:inline-flex;gap:6px;margin-top:6px;font:600 11px/1 "DM Sans",sans-serif;letter-spacing:.05em;color:rgba(252,248,239,0.72)}',
      '.pp-bp-camp-countdown span{display:inline-flex;flex-direction:column;align-items:center;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:6px;min-width:38px;border:1px solid rgba(245,236,224,0.08)}',
      '.pp-bp-camp-countdown span strong{font:700 15px/1 "DM Sans",sans-serif;color:#fcf8ef}',
      '.pp-bp-camp-countdown span small{font-size:9px;text-transform:uppercase;letter-spacing:.10em;color:rgba(245,236,224,0.55);margin-top:2px}',
      // Collecties sectie
      '.pp-bp-collecties{margin:26px 0 8px}',
      '.pp-bp-collecties-titel{font:400 clamp(1.05rem,2.4vw,1.35rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 12px;letter-spacing:-.01em}',
      '.pp-bp-coll-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}',
      '@media(min-width:600px){.pp-bp-coll-grid{grid-template-columns:repeat(3,1fr);gap:14px}}',
      '@media(min-width:1024px){.pp-bp-coll-grid{grid-template-columns:repeat(4,1fr)}}',
      '.pp-bp-coll-kaart{position:relative;display:flex;flex-direction:column;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;transition:transform 0.18s ease,border-color 0.18s ease;cursor:pointer}',
      '.pp-bp-coll-kaart:hover{transform:translateY(-2px);border-color:#d4910a}',
      '.pp-bp-coll-img{aspect-ratio:4/3;background:linear-gradient(135deg,#1a140c,#0f0c08);position:relative;overflow:hidden}',
      '.pp-bp-coll-img img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pp-bp-coll-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:3px}',
      '.pp-bp-coll-titel{font:600 13px/1.3 "DM Sans",sans-serif;color:#fcf8ef;margin:0}',
      '.pp-bp-coll-tekst{font:400 11.5px/1.4 "DM Sans",sans-serif;color:rgba(252,248,239,0.65);margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.pp-bp-coll-meta{font:500 10.5px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#d4910a;margin-top:4px}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Countdown timer ─────────────────────────────────────────────────
  function startCountdown(el, endTs) {
    function tick() {
      if (!el || !el.isConnected) return;
      var now = Date.now();
      var diff = endTs - now;
      if (diff <= 0) { el.innerHTML = '<span><strong>0</strong><small>Verlopen</small></span>'; return; }
      var days = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins = Math.floor((diff % 3600000) / 60000);
      var secs = Math.floor((diff % 60000) / 1000);
      el.innerHTML =
        '<span><strong>' + days + '</strong><small>Dagen</small></span>' +
        '<span><strong>' + hours + '</strong><small>Uur</small></span>' +
        '<span><strong>' + mins + '</strong><small>Min</small></span>' +
        '<span><strong>' + secs + '</strong><small>Sec</small></span>';
      setTimeout(tick, 1000);
    }
    tick();
  }

  // ─── Bouw campagne blok ──────────────────────────────────────────────
  function buildCampBlok(c) {
    var korting = c.kortingLabel || c.discount || '';
    var titel = c.naam || c.titel || '';
    var tekst = c.boodschap || c.beschrijving || '';
    var url = c.url || c.landingUrl || '';
    var eindTs = null;
    try {
      if (c.eindDatum && c.eindDatum.toMillis) eindTs = c.eindDatum.toMillis();
      else if (c.eindDatum instanceof Date) eindTs = c.eindDatum.getTime();
      else if (typeof c.eindDatum === 'number') eindTs = c.eindDatum;
    } catch (_) {}
    var showCountdown = eindTs && eindTs > Date.now();
    var bannerImg = c.banner || c.afbeelding || '';
    var html = '<a class="pp-bp-camp" href="' + esc(url || 'javascript:void(0)') + '"' +
      (url ? ' target="_blank" rel="noopener nofollow"' : '') +
      ' data-testid="pp-bp-camp" data-camp-id="' + esc(c._id || c.id || '') + '">' +
      '<div class="pp-bp-camp-inner">' +
        '<div class="pp-bp-camp-bg">' +
          (bannerImg ? '<img src="' + esc(bannerImg) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '') +
        '</div>' +
        '<div class="pp-bp-camp-body">' +
          (korting ? '<span class="pp-bp-camp-korting" data-testid="pp-bp-camp-korting">' + esc(korting) + '</span>' : '') +
          (titel ? '<h3 class="pp-bp-camp-titel">' + esc(titel) + '</h3>' : '') +
          (tekst ? '<p class="pp-bp-camp-tekst">' + esc(tekst) + '</p>' : '') +
          (url ? '<span class="pp-bp-camp-cta">Bekijken →</span>' : '') +
          (showCountdown ? '<div class="pp-bp-camp-countdown" data-testid="pp-bp-camp-countdown" data-end="' + eindTs + '"></div>' : '') +
        '</div>' +
      '</div>' +
    '</a>';
    return html;
  }

  // ─── Bouw collecties blok ────────────────────────────────────────────
  function buildCollectiesBlok(collecties) {
    var items = (Array.isArray(collecties) ? collecties : []).filter(function (c) {
      return c && typeof c === 'object' && (c.titel || c.naam);
    });
    if (!items.length) return '';
    var cardsHtml = items.map(function (c) {
      var img = c.afbeelding || c.image || '';
      var titel = c.titel || c.naam || '';
      var tekst = c.beschrijving || '';
      var aantal = (typeof c.aantal === 'number' && c.aantal > 0) ? c.aantal : null;
      var url = c.url || '';
      var attrs = url
        ? 'href="' + esc(url) + '" target="_blank" rel="noopener nofollow"'
        : 'href="javascript:void(0)"';
      return '<a class="pp-bp-coll-kaart" ' + attrs + ' data-testid="pp-bp-coll-' + esc(c.slug || titel.slice(0, 20)) + '">' +
        '<div class="pp-bp-coll-img">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : '') + '</div>' +
        '<div class="pp-bp-coll-body">' +
          '<div class="pp-bp-coll-titel">' + esc(titel) + '</div>' +
          (tekst ? '<div class="pp-bp-coll-tekst">' + esc(tekst) + '</div>' : '') +
          (aantal != null ? '<div class="pp-bp-coll-meta">' + aantal + ' producten</div>' : '') +
        '</div>' +
      '</a>';
    }).join('');
    return '<section class="pp-bp-collecties" data-testid="pp-bp-collecties">' +
      '<h2 class="pp-bp-collecties-titel">Uitgelichte collecties</h2>' +
      '<div class="pp-bp-coll-grid">' + cardsHtml + '</div>' +
    '</section>';
  }

  // ─── Injectie ─────────────────────────────────────────────────────────
  function enhanceFase3() {
    var page = document.querySelector('.bp-page');
    if (!page) return;
    if (page.dataset.ppFase3 === '1') return;
    var hero = page.querySelector('.bp-merk-hero');
    if (!hero) return; // wacht tot hero rendered is
    page.dataset.ppFase3 = '1';
    injectCss();

    var brandId = '';
    try { brandId = window.__ppCurrentBrandId || ''; } catch (_) {}
    if (!brandId) return;

    var d = (window.DY && DY.db) || null;
    if (!d) return;

    // Async: campagne (1 live campagne voor deze brand)
    d.collection('campaigns')
      .where('brandId', '==', brandId)
      .where('status', '==', 'live')
      .limit(1).get()
      .then(function (snap) {
        if (!snap || snap.empty) return;
        var doc = snap.docs[0];
        var c = doc.data() || {};
        c._id = doc.id;
        var html = buildCampBlok(c);
        if (!html) return;
        var frag = document.createElement('div');
        frag.innerHTML = html;
        var el = frag.firstChild;
        // Positie: DIRECT NA "Over het merk" (indien aanwezig), anders vóór filters/grid
        var over = page.querySelector('.pp-bp-over');
        if (el && over && over.parentNode) {
          over.parentNode.insertBefore(el, over.nextSibling);
        } else {
          var filters = page.querySelector('.pp-bp-filters');
          var grid = page.querySelector('.bp-prod-grid');
          var anchor = filters || grid;
          if (el && anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
        }
        // Start countdown timer
        var cd = el.querySelector('.pp-bp-camp-countdown');
        if (cd) {
          var endTs = parseInt(cd.getAttribute('data-end'), 10);
          if (endTs > 0) startCountdown(cd, endTs);
        }
      })
      .catch(function (err) { log('campagne load error: ' + (err && err.message)); });

    // Async: collecties uit brand.collecties[]
    d.collection('brands').doc(brandId).get()
      .then(function (snap) {
        if (!snap || !snap.exists) return;
        var b = snap.data() || {};
        var collecties = b.collecties || b.uitgelichteCollecties || [];
        var html = buildCollectiesBlok(collecties);
        if (!html) return;
        var frag = document.createElement('div');
        frag.innerHTML = html;
        var el = frag.firstChild;
        // Positie: NA campagne-banner indien aanwezig, anders NA "Over het merk", anders vóór filters/grid
        var camp = page.querySelector('.pp-bp-camp');
        var over = page.querySelector('.pp-bp-over');
        if (el && camp && camp.parentNode) {
          camp.parentNode.insertBefore(el, camp.nextSibling);
        } else if (el && over && over.parentNode) {
          over.parentNode.insertBefore(el, over.nextSibling);
        } else {
          var filters = page.querySelector('.pp-bp-filters');
          var grid = page.querySelector('.bp-prod-grid');
          var anchor = filters || grid;
          if (el && anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
        }
      })
      .catch(function (err) { log('collecties load error: ' + (err && err.message)); });
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { enhanceFase3(); } catch (e) { log('enhance error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { enhanceFase3(); } catch (_) {} }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandFase3 = { VERSION: '1.0.0', enhance: enhanceFase3 };
})();
