/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Analytics Live Data (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module.
 *
 * Doel: de brand-analytics pagina (`/brand_analytics`) toont nu altijd 0
 *       voor Impressies/Clicks omdat `campaigns.impressies/clicks` velden
 *       nooit ge-aggregeerd worden vanuit `events`. Dit module wrapt
 *       `BP.renderAnalytics` zonder de legacy code aan te raken en patcht
 *       de DOM na-render met LIVE cijfers:
 *
 *        • Impr. per campagne — uit events waar campaignId === d.id
 *        • Kliks per campagne — uit events met type=campaign_click
 *        • Likes — sum van `brand_products.likes[uid]` per merk
 *        • Actie — knop "Bekijk live →" naar campagne-detail
 *
 *       Bovendien voegt het 1 nieuwe stat-tegel toe (Totaal likes) en 2
 *       nieuwe kolommen (Likes, Actie) aan de tabel — zonder de legacy
 *       kolommen te raken.
 *
 * Public API:
 *   PP_BrandAnalytics.refresh()
 *   PP_BrandAnalytics.VERSION
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandAnalyticsInit) return;
  window.__ppBrandAnalyticsInit = true;

  var TAG = '[brand-analytics]';

  function db() { return window.firebase && firebase.firestore && firebase.firestore(); }
  function uid() { return (window.DY && DY.user && DY.user.uid) || null; }
  function fmtNum(n) { return (n || 0).toLocaleString('nl-NL'); }

  // ────────── ENGAGEMENT LOADER ──────────
  async function loadBrandEngagement(brandUid, campaignIds) {
    var perCamp = {};       // campId → { impr, click }
    var brandTotalLikes = 0;
    campaignIds.forEach(function (cid) { perCamp[cid] = { impr: 0, click: 0 }; });

    // 1) events filtered op brandId — minimaliseert reads via brandId where-clause
    try {
      var d = db();
      if (!d || !brandUid) return { perCamp: perCamp, likes: 0 };
      var evSnap = await d.collection('events')
        .where('brandId', '==', brandUid)
        .limit(2000).get();
      evSnap.forEach(function (ev) {
        var e = ev.data() || {};
        var cid = e.campaignId;
        if (!cid || !perCamp[cid]) return;
        if (e.type === 'impression') perCamp[cid].impr++;
        else if (e.type === 'campaign_click') perCamp[cid].click++;
      });
    } catch (e) {
      try { console.warn(TAG, 'events fetch:', e && e.code); } catch (_) {}
    }

    // 2) likes uit brand_products
    try {
      var d2 = db();
      if (d2 && brandUid) {
        var prodSnap = await d2.collection('brand_products')
          .where('brandId', '==', brandUid)
          .limit(200).get();
        prodSnap.forEach(function (pd) {
          var p = pd.data() || {};
          var likesObj = (p.likes && typeof p.likes === 'object') ? p.likes : {};
          brandTotalLikes += Object.keys(likesObj).length;
        });
      }
    } catch (e) {
      try { console.warn(TAG, 'products fetch:', e && e.code); } catch (_) {}
    }

    return { perCamp: perCamp, likes: brandTotalLikes };
  }

  // ────────── DOM PATCHER ──────────
  function patchStats(totals) {
    var main = document.getElementById('dy-main');
    if (!main) return;
    var grid = main.querySelector('.bp-stat-grid');
    if (!grid) return;
    if (grid.querySelector('[data-testid="pp-ba-likes-stat"]')) return; // al gepatcht

    // Update bestaande Impressies / Clicks tegels (1e en 2e tegel)
    var tiles = grid.querySelectorAll('.bp-stat-kaart');
    if (tiles[0]) {
      var n0 = tiles[0].querySelector('.bp-stat-num');
      if (n0) n0.textContent = fmtNum(totals.impr);
    }
    if (tiles[1]) {
      var n1 = tiles[1].querySelector('.bp-stat-num');
      if (n1) n1.textContent = fmtNum(totals.click);
    }
    if (tiles[2]) {
      var ctrEl = tiles[2].querySelector('.bp-stat-num');
      var ctr = totals.impr > 0 ? ((totals.click / totals.impr) * 100).toFixed(2) + '%' : '-';
      if (ctrEl) ctrEl.textContent = ctr;
    }

    // Likes-tegel toevoegen
    var likesTile = document.createElement('div');
    likesTile.className = 'bp-stat-kaart';
    likesTile.setAttribute('data-testid', 'pp-ba-likes-stat');
    likesTile.innerHTML =
      '<span class="bp-stat-num">' + fmtNum(totals.likes) + '</span>' +
      '<span class="bp-stat-lbl">Likes</span>';
    grid.appendChild(likesTile);
  }

  function patchTable(perCamp, analyticsRows) {
    var main = document.getElementById('dy-main');
    if (!main) return;
    var table = main.querySelector('.bp-tabel');
    if (!table) return;

    // 1) Voeg "Likes" en "Actie" headers toe (eenmalig)
    var theadRow = table.querySelector('thead tr');
    if (theadRow && !theadRow.querySelector('[data-testid="pp-ba-th-likes"]')) {
      var thLikes = document.createElement('th');
      thLikes.setAttribute('data-testid', 'pp-ba-th-likes');
      thLikes.textContent = 'Likes';
      var thAction = document.createElement('th');
      thAction.setAttribute('data-testid', 'pp-ba-th-action');
      thAction.textContent = 'Actie';
      theadRow.appendChild(thLikes);
      theadRow.appendChild(thAction);
    }

    // 2) Patch impr/click cellen + voeg likes & actie toe per rij
    var rows = table.querySelectorAll('tbody tr');
    Array.prototype.forEach.call(rows, function (tr, idx) {
      var rowData = analyticsRows[idx];
      if (!rowData || !rowData.id) return;
      var live = perCamp[rowData.id] || { impr: 0, click: 0 };
      var tds = tr.querySelectorAll('td');
      // Legacy kolomvolgorde: [Campagne, Status, Impressies, Clicks, CTR, Spend, ROAS]
      if (tds[2]) tds[2].textContent = fmtNum(live.impr);
      if (tds[3]) tds[3].textContent = fmtNum(live.click);
      if (tds[4]) {
        var ctr = live.impr > 0 ? ((live.click / live.impr) * 100).toFixed(2) + '%' : '-';
        tds[4].textContent = ctr;
      }

      // Voeg Likes + Actie toe als nog niet aanwezig
      if (!tr.querySelector('[data-testid^="pp-ba-likes-cell-"]')) {
        var tdLikes = document.createElement('td');
        tdLikes.setAttribute('data-testid', 'pp-ba-likes-cell-' + rowData.id);
        // Likes zijn brand-niveau, niet campaign-niveau. Toon — als indicator.
        tdLikes.textContent = '—';
        tdLikes.title = 'Likes worden geaggregeerd op merk-niveau (zie stat-tegel boven)';
        tdLikes.style.textAlign = 'center';
        tdLikes.style.color = '#9b8775';
        tr.appendChild(tdLikes);

        var tdAction = document.createElement('td');
        tdAction.setAttribute('data-testid', 'pp-ba-action-cell-' + rowData.id);
        tdAction.innerHTML =
          '<button class="bp-btn bp-btn-ghost" ' +
            'onclick="window.DY.brandPortal && DY.brandPortal.bekijkCampagneDetail && DY.brandPortal.bekijkCampagneDetail(\'' + rowData.id + '\')" ' +
            'data-testid="pp-ba-action-btn-' + rowData.id + '">Bekijk →</button>';
        tr.appendChild(tdAction);
      }
    });
  }

  // ────────── WRAPPER ──────────
  async function enhance() {
    try {
      var BP = window.DY && window.DY.brandPortal;
      if (!BP) return;
      var brandUid = uid();
      if (!brandUid) return;
      var rows = BP._analyticsRows || [];
      var campIds = rows.map(function (r) { return r.id; }).filter(Boolean);
      if (!campIds.length) return;

      var data = await loadBrandEngagement(brandUid, campIds);

      // Totals
      var totals = { impr: 0, click: 0, likes: data.likes };
      campIds.forEach(function (cid) {
        var pc = data.perCamp[cid] || { impr: 0, click: 0 };
        totals.impr += pc.impr;
        totals.click += pc.click;
      });

      patchStats(totals);
      patchTable(data.perCamp, rows);

      // Sla totals + perCamp op voor CSV-export hook (toekomst)
      BP._ppLiveAnalytics = { totals: totals, perCamp: data.perCamp };
    } catch (e) {
      try { console.warn(TAG, 'enhance failed:', e); } catch (_) {}
    }
  }

  // ────────── INIT (BP.renderAnalytics wrappen) ──────────
  function tryWrap() {
    var BP = window.DY && window.DY.brandPortal;
    if (!BP || !BP.renderAnalytics) { setTimeout(tryWrap, 250); return; }
    if (BP.__ppAnalyticsWrapped) return;
    BP.__ppAnalyticsWrapped = true;
    var orig = BP.renderAnalytics;
    BP.renderAnalytics = async function () {
      var result = await orig.apply(this, arguments);
      // Wacht 1 tick zodat DOM volledig is gerendered
      setTimeout(enhance, 80);
      return result;
    };
    try { console.log(TAG, 'BP.renderAnalytics wrapped'); } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryWrap);
  } else {
    setTimeout(tryWrap, 100);
  }

  window.PP_BrandAnalytics = {
    refresh: enhance,
    VERSION: '1.0.0'
  };
})();
