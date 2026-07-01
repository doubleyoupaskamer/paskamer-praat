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
 *        • Impr. per campagne uit events waar campaignId === d.id
 *        • Kliks per campagne uit events met type=campaign_click
 *        • Likes sum van `brand_products.likes[uid]` per merk
 *        • Actie knop "Bekijk live →" naar campagne-detail
 *
 *       Bovendien voegt het 1 nieuwe stat-tegel toe (Totaal likes) en 2
 *       nieuwe kolommen (Likes, Actie) aan de tabel zonder de legacy
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
  function uid() {
    // Robust: probeer firebase.auth eerst (DY.user kan lazy zijn op deze pagina)
    try {
      if (window.firebase && firebase.auth) {
        var u = firebase.auth().currentUser;
        if (u && u.uid) return u.uid;
      }
    } catch (_) {}
    return (window.DY && DY.user && DY.user.uid) || null;
  }
  function fmtNum(n) { return (n || 0).toLocaleString('nl-NL'); }

  // ────────── ENGAGEMENT LOADER ──────────
  function emptyPlcMap() {
    return {
      feed:           { impr: 0, click: 0 },
      stories:        { impr: 0, click: 0 },
      outfit_review:  { impr: 0, click: 0 },
      ai_assist:      { impr: 0, click: 0 },
      similar_items:  { impr: 0, click: 0 }
    };
  }

  async function loadBrandEngagement(brandUid, campaignIds) {
    var perCamp = {};       // campId → { impr, click, byPlc }
    // v1.2.0: brand-totals tellen ALLE brand-events (incl. sponsored_product
    // zonder campaignId) dat is de echte engagement voor het merk.
    var brandTotals = { impr: 0, click: 0, likes: 0, byPlc: emptyPlcMap() };
    campaignIds.forEach(function (cid) {
      perCamp[cid] = { impr: 0, click: 0, byPlc: emptyPlcMap() };
    });

    // 1) events filtered op brandId
    try {
      var d = db();
      if (!d || !brandUid) return { perCamp: perCamp, brandTotals: brandTotals };
      var evSnap = await d.collection('events')
        .where('brandId', '==', brandUid)
        .limit(2000).get();
      try { console.log(TAG, 'events for brand', brandUid, ':', evSnap.size); } catch (_) {}
      evSnap.forEach(function (ev) {
        var e = ev.data() || {};
        var etype = e.type;
        var cid = e.campaignId;
        var plc = e.plaatsing;

        // Brand-level totals alle brand-events tellen
        if (etype === 'impression') brandTotals.impr++;
        else if (etype === 'campaign_click') brandTotals.click++;
        if (plc && brandTotals.byPlc[plc]) {
          if (etype === 'impression') brandTotals.byPlc[plc].impr++;
          else if (etype === 'campaign_click') brandTotals.byPlc[plc].click++;
        }

        // Per-campaign alleen events met matching campaignId
        if (cid && perCamp[cid]) {
          if (etype === 'impression') perCamp[cid].impr++;
          else if (etype === 'campaign_click') perCamp[cid].click++;
          if (plc && perCamp[cid].byPlc[plc]) {
            if (etype === 'impression') perCamp[cid].byPlc[plc].impr++;
            else if (etype === 'campaign_click') perCamp[cid].byPlc[plc].click++;
          }
        }
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
          brandTotals.likes += Object.keys(likesObj).length;
        });
      }
    } catch (e) {
      try { console.warn(TAG, 'products fetch:', e && e.code); } catch (_) {}
    }

    return { perCamp: perCamp, brandTotals: brandTotals };
  }

  // ────────── PER-PLACEMENT CSV EXPORT ──────────
  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    if (/[";\n\r]/.test(s) || s.indexOf(';') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function exportCSV(placement) {
    try {
      var BP = window.DY && window.DY.brandPortal;
      if (!BP || !BP._ppLiveAnalytics) {
        if (BP && window.DY && DY.toast) DY.toast('Laad analytics eerst.');
        return;
      }
      var rows = BP._analyticsRows || [];
      var perCamp = BP._ppLiveAnalytics.perCamp || {};
      var headers = ['Campagne','Status','Plaatsing','Impressies','Kliks','CTR_%','CampagneId'];
      var lines = [headers.join(';')];
      var totalRows = 0;
      rows.forEach(function (r) {
        var live = perCamp[r.id] || { impr: 0, click: 0, byPlc: {} };
        if (placement) {
          var pc = (live.byPlc && live.byPlc[placement]) || { impr: 0, click: 0 };
          // Skip campagnes die deze placement niet gekocht hebben
          if ((r.plaatsingen || []).indexOf && r.plaatsingen.indexOf(placement) === -1) {
            // Als de array niet aanwezig is in _analyticsRows: alleen tonen als er events zijn
            if (!pc.impr && !pc.click) return;
          }
          var ctr = pc.impr > 0 ? ((pc.click / pc.impr) * 100).toFixed(2) : '0.00';
          lines.push([
            csvCell(r.naam || ''),
            csvCell(r.status || ''),
            csvCell(placement),
            pc.impr, pc.click, ctr,
            csvCell(r.id || '')
          ].join(';'));
          totalRows++;
        } else {
          var ctrAll = live.impr > 0 ? ((live.click / live.impr) * 100).toFixed(2) : '0.00';
          lines.push([
            csvCell(r.naam || ''),
            csvCell(r.status || ''),
            csvCell('ALLE'),
            live.impr, live.click, ctrAll,
            csvCell(r.id || '')
          ].join(';'));
          totalRows++;
        }
      });
      if (!totalRows) {
        if (window.DY && DY.toast) DY.toast('Geen data voor "' + (placement || 'alle') + '".');
        return;
      }
      var csv = '\ufeff' + lines.join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var nu = new Date();
      var stamp = nu.getFullYear() + '-' +
                  String(nu.getMonth()+1).padStart(2,'0') + '-' +
                  String(nu.getDate()).padStart(2,'0') + '_' +
                  String(nu.getHours()).padStart(2,'0') + String(nu.getMinutes()).padStart(2,'0');
      var brandName = (BP._brandCache && BP._brandCache.naam) || 'merk';
      var safeBrand = brandName.replace(/[^a-z0-9\-]/gi, '_').toLowerCase();
      var a = document.createElement('a');
      a.href = url;
      a.download = 'analytics_' + safeBrand + '_' + (placement || 'alle') + '_' + stamp + '.csv';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (_) {}
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 100);
      if (window.DY && DY.toast) DY.toast('CSV "' + (placement || 'alle') + '" geëxporteerd (' + totalRows + ' rijen).');
    } catch (e) {
      try { alert('Export fout: ' + e.message); } catch (_) {}
    }
  }

  function renderExportBar() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    var grid = main.querySelector('.bp-stat-grid');
    if (!grid) return;
    if (main.querySelector('[data-testid="pp-ba-export-bar"]')) return;
    var bar = document.createElement('div');
    bar.setAttribute('data-testid', 'pp-ba-export-bar');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 16px';
    bar.innerHTML =
      '<div style="font-size:13px;color:#9b8775;width:100%;margin-bottom:2px">📥 Download je rapport per plaatsing:</div>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV()" data-testid="pp-ba-exp-all">Alle</button>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV(\'feed\')" data-testid="pp-ba-exp-feed">Feed</button>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV(\'stories\')" data-testid="pp-ba-exp-stories">Stories</button>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV(\'outfit_review\')" data-testid="pp-ba-exp-review">Outfit review</button>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV(\'ai_assist\')" data-testid="pp-ba-exp-ai">AI assistent</button>' +
      '<button class="bp-btn bp-btn-ghost" onclick="PP_BrandAnalytics.exportCSV(\'similar_items\')" data-testid="pp-ba-exp-similar">Vergelijkbaar</button>';
    grid.parentNode.insertBefore(bar, grid.nextSibling);
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
        // Likes zijn brand-niveau, niet campaign-niveau. Toon als indicator.
        tdLikes.textContent = ' ';
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
      if (!brandUid) {
        try { console.warn(TAG, 'geen brandUid (firebase.auth + DY.user beide leeg)'); } catch (_) {}
        return;
      }
      var rows = BP._analyticsRows || [];
      var campIds = rows.map(function (r) { return r.id; }).filter(Boolean);

      try { console.log(TAG, 'enhance start brandUid=' + brandUid + ' campaigns=' + campIds.length); } catch (_) {}

      var data = await loadBrandEngagement(brandUid, campIds);

      // Brand-level totals (incl. sponsored_product events zonder campaignId)
      patchStats(data.brandTotals);
      patchTable(data.perCamp, rows);

      // Sla op voor CSV-export
      BP._ppLiveAnalytics = { totals: data.brandTotals, perCamp: data.perCamp };
      renderExportBar();
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
    exportCSV: exportCSV,
    VERSION: '1.1.0'
  };
})();
