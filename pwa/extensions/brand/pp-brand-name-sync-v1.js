/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Name Sync (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Fixt 1 P0 issue:
 *
 *  - Wanneer een merk z'n bedrijfsnaam wijzigt in `/brand_profiel`, blijft
 *    de oude naam zichtbaar op /uitgelicht (en in product-overzicht).
 *    Oorzaak: `campaigns/{cid}.brandNaam` en `brand_products/{pid}.brandNaam`
 *    zijn gecachede string-velden die NIET cascaden bij brand-profiel save.
 *
 * Fix: client-side hydration via MutationObserver. Bij elke render van
 *      `.pp-uitg-kaart` / `.pp-uitg-prod-kaart` halen we de live naam uit
 *      `brands/{brandId}.naam` (TTL=2 min) en vervangen we de tekst in
 *      `.pp-uitg-merk` / `.pp-uitg-prod-brand` als deze afwijkt.
 *
 * Geen legacy rewrites. Geen wijziging aan pp-feedtabs-v1.js of brand-portal.
 *
 * Public API:
 *   PP_BrandNameSync.brandNameFor(brandId) Promise<string|null>
 *   PP_BrandNameSync.refresh(brandId)      invalidate cache + retrigger
 *   PP_BrandNameSync.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandNameSyncInit) return;
  window.__ppBrandNameSyncInit = true;

  var TAG = '[brand-name-sync]';
  var NAME_CACHE = {};       // brandId → { naam: string|null, ts: number }
  var TTL_MS = 2 * 60 * 1000; // 2 minuten kort genoeg voor verse naam, lang genoeg om reads te beperken

  function db() {
    return (window.firebase && firebase.firestore) ? firebase.firestore() : null;
  }

  // ────────── BRAND NAAM RESOLVER ──────────
  function brandNameFor(brandId) {
    if (!brandId) return Promise.resolve(null);
    var nu = Date.now();
    var cached = NAME_CACHE[brandId];
    if (cached && (nu - cached.ts) < TTL_MS) {
      return Promise.resolve(cached.naam);
    }
    var d = db();
    if (!d) return Promise.resolve(null);
    return d.collection('brands').doc(brandId).get()
      .then(function (snap) {
        var naam = null;
        if (snap.exists) {
          var data = snap.data() || {};
          if (data.naam && typeof data.naam === 'string') naam = data.naam.trim();
        }
        NAME_CACHE[brandId] = { naam: naam, ts: nu };
        return naam;
      })
      .catch(function () {
        NAME_CACHE[brandId] = { naam: null, ts: nu };
        return null;
      });
  }

  function refresh(brandId) {
    if (brandId) {
      delete NAME_CACHE[brandId];
    } else {
      NAME_CACHE = {};
    }
    scanAndPatch(true);
  }

  // ────────── BRANDID EXTRACTIE ──────────
  // Campagne-kaart: onclick="PP_FeedTabs.openCamp('cid','bid')" → 2e arg
  function extractBrandIdFromCard(card) {
    try {
      var attr = card.getAttribute('data-brand-id');
      if (attr) return attr;
      var onclick = card.getAttribute('onclick') || '';
      var m = onclick.match(/openCamp\('[^']*','([^']*)'/);
      if (m && m[1]) return m[1];
    } catch (_) {}
    return null;
  }

  // Product-kaart: heeft geen brandId in DOM. We lezen brand_products/{pid}.brandId
  // alleen 1× per kaart (gecached).
  var PRODUCT_BRAND_CACHE = {}; // productId → brandId|null
  function resolveProductBrandId(productId) {
    if (!productId) return Promise.resolve(null);
    if (PRODUCT_BRAND_CACHE.hasOwnProperty(productId)) {
      return Promise.resolve(PRODUCT_BRAND_CACHE[productId]);
    }
    var d = db();
    if (!d) return Promise.resolve(null);
    return d.collection('brand_products').doc(productId).get()
      .then(function (snap) {
        var bid = null;
        if (snap.exists) {
          var data = snap.data() || {};
          if (data.brandId && typeof data.brandId === 'string') bid = data.brandId;
        }
        PRODUCT_BRAND_CACHE[productId] = bid;
        return bid;
      })
      .catch(function () {
        PRODUCT_BRAND_CACHE[productId] = null;
        return null;
      });
  }

  // ────────── DOM PATCHER ──────────
  function updateTextNode(el, naam) {
    if (!el || !naam) return;
    var current = (el.textContent || '').trim();
    if (current === naam) return; // niks te doen
    el.textContent = naam;
  }

  function patchCampaignCards(force) {
    var sel = force
      ? '.pp-uitg-kaart'
      : '.pp-uitg-kaart:not([data-pp-name-synced])';
    var cards = document.querySelectorAll(sel);
    Array.prototype.forEach.call(cards, function (card) {
      try {
        var brandId = extractBrandIdFromCard(card);
        if (!brandId) return;
        card.setAttribute('data-pp-name-synced', '1');
        var merkEl = card.querySelector('.pp-uitg-merk');
        if (!merkEl) return;
        brandNameFor(brandId).then(function (naam) {
          if (!naam) return; // geen live naam → behoud cached value
          updateTextNode(merkEl, naam);
        });
      } catch (_) {}
    });
  }

  function patchProductCards(force) {
    var sel = force
      ? '.pp-uitg-prod-kaart'
      : '.pp-uitg-prod-kaart:not([data-pp-name-synced])';
    var cards = document.querySelectorAll(sel);
    Array.prototype.forEach.call(cards, function (card) {
      try {
        var testid = card.getAttribute('data-testid') || '';
        // format: pp-uitg-prod-<pid>
        var m = testid.match(/^pp-uitg-prod-(.+)$/);
        if (!m || !m[1]) return;
        var pid = m[1];
        card.setAttribute('data-pp-name-synced', '1');
        var brandEl = card.querySelector('.pp-uitg-prod-brand');
        if (!brandEl) return;
        resolveProductBrandId(pid).then(function (bid) {
          if (!bid) return;
          brandNameFor(bid).then(function (naam) {
            if (!naam) return;
            updateTextNode(brandEl, naam);
          });
        });
      } catch (_) {}
    });
  }

  function scanAndPatch(force) {
    try {
      patchCampaignCards(!!force);
      patchProductCards(!!force);
    } catch (e) {
      try { console.warn(TAG, 'scan failed:', e); } catch (_) {}
    }
  }

  // ────────── INIT ──────────
  function init() {
    // Initial pass na korte vertraging zodat eerste render compleet is
    setTimeout(function () { scanAndPatch(false); }, 400);

    // Observe nieuwe kaarten die later worden gerendered
    var obs = new MutationObserver(function () {
      scanAndPatch(false);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Indien gebruiker terugkeert naar tab/pagina → refresh
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        // Forceer hydratie opnieuw zonder cache te legen laat TTL bepalen
        scanAndPatch(true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandNameSync = {
    brandNameFor: brandNameFor,
    refresh:      refresh,
    VERSION:      '1.0.0'
  };
})();
