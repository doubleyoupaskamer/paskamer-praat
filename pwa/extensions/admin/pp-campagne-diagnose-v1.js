/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Admin Campaign Diagnose Tool (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Doel: snel zien WAAROM campagnes wel/niet renderen op publieke views.
 *
 * Route: /?pagina=admin_campagne_diagnose
 *
 * Toont per campagne:
 *   - status, plaatsingen array, start/eind datum
 *   - rendert in feed? (status==live + plaatsing 'feed' + binnen datum)
 *   - rendert in admin? (alleen status==live)
 *
 * Geeft admin actie-knoppen:
 *   - "Repareer plaatsingen": vul plaatsingen=['feed'] in voor campagnes zonder
 *   - "Live zetten": status=review → status=live (alleen admin)
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // v1.2.0: laatste render-data buffer voor CSV-export
  var _lastExportRows = [];

  function esc(s) { var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }
  function isAdmin() { return !!(window.DY && window.DY._isAdmin && window.DY._isAdmin()); }
  function db() { return window.firebase.firestore(); }

  function fmtDate(ts) {
    if (!ts) return '-';
    if (ts.toDate) return ts.toDate().toLocaleString('nl-NL');
    return String(ts).slice(0,19);
  }

  // ────────── CSV EXPORT (v1.2.0) ──────────
  // CSV format: NL-conventie (komma's in getallen geen probleem → ; separator).
  // Strings quoted met dubbele quotes, embedded " worden verdubbeld.
  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    if (/[";\n\r]/.test(s) || s.indexOf(';') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function buildCSV(rows) {
    // v1.4.0: hiërarchisch — per campagne 1 TOTAAL-rij + 5 placement-rijen
    var headers = ['Campagne','Merk','Status','Plaatsing','Start','Eind',
                   'Rendert_in_feed','Impressies','Kliks','CTR_%','Likes','CampagneId','BrandId'];
    var lines = [headers.join(';')];

    rows.forEach(function (r) {
      // Skip de "hulp-velden" entries — alleen echte data
      if (!r.Campagne) return;
      var totImpr = r.Impressies || 0;
      var totClick = r.Kliks || 0;
      var ctrTot = totImpr > 0 ? ((totClick / totImpr) * 100).toFixed(2) : '0.00';

      // 1) TOTAAL-rij voor de campagne
      lines.push([
        csvCell(r.Campagne), csvCell(r.Merk), csvCell(r.Status),
        csvCell('TOTAAL'),
        csvCell(r.Start), csvCell(r.Eind), csvCell(r.Rendert_in_feed),
        totImpr, totClick, ctrTot, (r.Likes || 0),
        csvCell(r.CampagneId), csvCell(r.BrandId)
      ].join(';'));

      // 2) Per-placement rijen (alleen voor placements die in c.plaatsingen staan OF die events hebben)
      var plcOrder = ['feed','stories','outfit_review','ai_assist','similar_items'];
      var plcArr = r._plaatsingenArr || [];
      var byPlc = r._byPlc || {};
      plcOrder.forEach(function (plc) {
        var pc = byPlc[plc] || { impr: 0, click: 0 };
        var heeftPlaatsing = plcArr.indexOf(plc) !== -1;
        // Alleen meenemen als de campagne deze plaatsing heeft gekocht OF data heeft
        if (!heeftPlaatsing && pc.impr === 0 && pc.click === 0) return;
        var ctr = pc.impr > 0 ? ((pc.click / pc.impr) * 100).toFixed(2) : '0.00';
        lines.push([
          csvCell(r.Campagne), csvCell(r.Merk), csvCell(r.Status),
          csvCell(plc),
          csvCell(r.Start), csvCell(r.Eind), csvCell(r.Rendert_in_feed),
          pc.impr, pc.click, ctr, '',
          csvCell(r.CampagneId), csvCell(r.BrandId)
        ].join(';'));
      });
    });

    // BOM voor Excel UTF-8 compat
    return '\ufeff' + lines.join('\r\n');
  }

  function exportCSV(campaignId) {
    try {
      if (!_lastExportRows.length) {
        if (window.DY && DY.toast) DY.toast('Geen data om te exporteren — laad eerst de diagnose.');
        return;
      }
      // Optioneel: filter op 1 specifieke campagne
      var rows = campaignId
        ? _lastExportRows.filter(function (r) { return r.CampagneId === campaignId; })
        : _lastExportRows;

      if (!rows.length) {
        if (window.DY && DY.toast) DY.toast('Geen data voor deze campagne.');
        return;
      }

      var csv = buildCSV(rows);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var nu = new Date();
      var stamp = nu.getFullYear() + '-' +
                  String(nu.getMonth()+1).padStart(2,'0') + '-' +
                  String(nu.getDate()).padStart(2,'0') + '_' +
                  String(nu.getHours()).padStart(2,'0') + String(nu.getMinutes()).padStart(2,'0');
      var label = campaignId
        ? (rows[0].Campagne || campaignId).replace(/[^a-z0-9\-]/gi, '_').toLowerCase()
        : 'alle_campagnes';
      var fname = 'campagne_diagnose_' + label + '_' + stamp + '.csv';
      var a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (_) {}
        try { URL.revokeObjectURL(url); } catch (_) {}
      }, 100);
      if (window.DY && DY.toast) DY.toast('CSV geëxporteerd (' + rows.length + ' campagne(s) × 1 totaal + placements).');
    } catch (e) {
      try { alert('Export fout: ' + e.message); } catch (_) {}
    }
  }

  // ────────── ENGAGEMENT AGGREGATIE (v1.1.0) ──────────
  // Aggregeert events en likes per merk/campagne. Failure-tolerant: bij
  // rules-error of geen data → 0-tellers, geen crash.
  async function loadEngagementMaps(campaignDocs) {
    var byCampId = {};   // campId → { impr, click, byPlc:{plc:{impr,click}} }
    var byBrandId = {};  // brandId → { impr, click, likes, byPlc:{plc:{impr,click}} }

    function emptyPlcMap() {
      return {
        feed:           { impr: 0, click: 0 },
        stories:        { impr: 0, click: 0 },
        outfit_review:  { impr: 0, click: 0 },
        ai_assist:      { impr: 0, click: 0 },
        similar_items:  { impr: 0, click: 0 }
      };
    }

    // Init kortere structuur per campagne
    campaignDocs.forEach(function (d) {
      byCampId[d.id] = { impr: 0, click: 0, byPlc: emptyPlcMap() };
      var c = d.data();
      if (c.brandId) {
        byBrandId[c.brandId] = byBrandId[c.brandId] ||
          { impr: 0, click: 0, likes: 0, byPlc: emptyPlcMap() };
      }
    });

    // 1) events ophalen (laatste 1000, dichts genoeg voor admin-overzicht)
    try {
      var evSnap = await db().collection('events').limit(1000).get();
      evSnap.forEach(function (ev) {
        var e = ev.data() || {};
        var cid = e.campaignId || null;
        var bid = e.brandId || null;
        var plc = e.plaatsing || null;
        if (cid && byCampId[cid]) {
          if (e.type === 'impression') byCampId[cid].impr++;
          else if (e.type === 'campaign_click') byCampId[cid].click++;
          if (plc && byCampId[cid].byPlc[plc]) {
            if (e.type === 'impression') byCampId[cid].byPlc[plc].impr++;
            else if (e.type === 'campaign_click') byCampId[cid].byPlc[plc].click++;
          }
        }
        if (bid && byBrandId[bid]) {
          if (e.type === 'impression') byBrandId[bid].impr++;
          else if (e.type === 'campaign_click') byBrandId[bid].click++;
          if (plc && byBrandId[bid].byPlc[plc]) {
            if (e.type === 'impression') byBrandId[bid].byPlc[plc].impr++;
            else if (e.type === 'campaign_click') byBrandId[bid].byPlc[plc].click++;
          }
        }
      });
    } catch (_) {}

    // 2) likes ophalen uit brand_products (sponsored cards likes-map)
    try {
      var brandIds = Object.keys(byBrandId);
      if (brandIds.length) {
        var prodSnap = await db().collection('brand_products').limit(500).get();
        prodSnap.forEach(function (pd) {
          var p = pd.data() || {};
          if (!p.brandId || !byBrandId[p.brandId]) return;
          var likesObj = (p.likes && typeof p.likes === 'object') ? p.likes : {};
          byBrandId[p.brandId].likes += Object.keys(likesObj).length;
        });
      }
    } catch (_) {}

    return { byCampId: byCampId, byBrandId: byBrandId };
  }

  async function render() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Diagnose laden...</div></div>';
    if (!isAdmin()) { window.DY.navigeer('feed'); return; }

    try {
      var snap = await db().collection('campaigns').limit(500).get();
      var campaignDocs = [];
      snap.forEach(function (d) { campaignDocs.push(d); });

      // v1.1.0: engagement-maps parallel laden — niet-blocking, fallback naar 0
      var engagement = await loadEngagementMaps(campaignDocs);

      var rows = [];
      var stats = { total: 0, live: 0, review: 0, concept: 0, paused: 0, other: 0,
                    geen_plaatsingen: 0, feed_actief: 0, binnen_window: 0,
                    totaal_impr: 0, totaal_click: 0, totaal_likes: 0 };
      var nuTs = Date.now();
      _lastExportRows = []; // reset export-buffer

      campaignDocs.forEach(function(d) {
        var c = d.data();
        stats.total++;
        if (c.status === 'live') stats.live++;
        else if (c.status === 'review') stats.review++;
        else if (c.status === 'concept') stats.concept++;
        else if (c.status === 'paused') stats.paused++;
        else stats.other++;

        var plaats = c.plaatsingen || [];
        if (!plaats.length) stats.geen_plaatsingen++;
        if (plaats.indexOf('feed') !== -1) stats.feed_actief++;

        var startMs = (c.startDatum && c.startDatum.toMillis) ? c.startDatum.toMillis() : null;
        var eindMs  = (c.eindDatum  && c.eindDatum.toMillis)  ? c.eindDatum.toMillis()  : null;
        var inWindow = (!startMs || nuTs >= startMs) && (!eindMs || nuTs <= eindMs);
        if (inWindow) stats.binnen_window++;

        // v1.0.12: status='live' is supreme. eindDatum is soft — backend
        // hoort transitie te doen. Als status nog live is, rendert het.
        var statusLive = (c.status === 'live');
        var heeftFeed = (plaats.indexOf('feed') !== -1 || !plaats.length);
        var startMsOk = (!startMs || nuTs >= startMs);
        var rendersInFeed = statusLive && heeftFeed && startMsOk;

        // v1.1.0: engagement-cijfers
        var ecamp = engagement.byCampId[d.id] || { impr: 0, click: 0 };
        var ebrand = (c.brandId && engagement.byBrandId[c.brandId]) || { impr: 0, click: 0, likes: 0 };
        var totImpr = ecamp.impr; // campagne-niveau is preciezer
        var totClick = ecamp.click;
        var totLikes = ebrand.likes; // likes zijn merk-niveau (sponsored products)
        stats.totaal_impr += totImpr;
        stats.totaal_click += totClick;
        stats.totaal_likes += totLikes;

        // v1.2.0: bewaar voor CSV-export
        _lastExportRows.push({
          Campagne: c.naam || c.brandNaam || d.id.slice(0,8),
          Merk: c.brandNaam || '',
          Status: c.status || '',
          Plaatsing: 'ALLE',
          Plaatsingen: plaats.length ? plaats.join(',') : '',
          Start: fmtDate(c.startDatum),
          Eind: fmtDate(c.eindDatum),
          Rendert_in_feed: rendersInFeed ? 'ja' : 'nee',
          Impressies: totImpr,
          Kliks: totClick,
          Likes: totLikes,
          CampagneId: d.id,
          BrandId: c.brandId || '',
          // hulp-velden (worden niet in CSV opgenomen):
          _plaatsingenArr: plaats,
          _byPlc: ecamp.byPlc || {}
        });

        rows.push(
          '<tr data-testid="diag-camp-' + esc(d.id) + '">' +
            '<td>' + esc(c.naam || c.brandNaam || d.id.slice(0,8)) + '</td>' +
            '<td>' + esc(c.brandNaam || '-') + '</td>' +
            '<td><span class="bp-badge bp-badge-' + esc(c.status||'?') + '">' + esc(c.status||'?') + '</span></td>' +
            '<td>' + esc(plaats.length ? plaats.join(',') : '- (legacy)') + '</td>' +
            '<td>' + esc(fmtDate(c.startDatum)) + '</td>' +
            '<td>' + esc(fmtDate(c.eindDatum)) + '</td>' +
            '<td>' + (rendersInFeed ? '✅ ja' : '❌ nee') + '</td>' +
            '<td data-testid="diag-impr-' + esc(d.id) + '" style="text-align:right">' + totImpr + '</td>' +
            '<td data-testid="diag-click-' + esc(d.id) + '" style="text-align:right">' + totClick + '</td>' +
            '<td data-testid="diag-likes-' + esc(d.id) + '" style="text-align:right">' + totLikes + '</td>' +
            '<td>' +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_Diag.exportCSV(\'' + esc(d.id) + '\')" data-testid="diag-export-camp-' + esc(d.id) + '" title="Download totaaloverzicht voor deze campagne">📥</button>' +
              (!plaats.length
                ? '<button class="bp-btn bp-btn-ghost" onclick="PP_Diag.fixPlacements(\'' + esc(d.id) + '\')" data-testid="diag-fix-' + esc(d.id) + '">+ feed</button>'
                : '') +
              (c.status === 'review' || c.status === 'concept'
                ? '<button class="bp-btn bp-btn-ghost" onclick="PP_Diag.goLive(\'' + esc(d.id) + '\')" data-testid="diag-live-' + esc(d.id) + '">→ Live</button>'
                : '') +
            '</td>' +
          '</tr>'
        );
      });

      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'admin_campagnes\')">&larr; Admin</button>' +
          '<h1>Campagne diagnose</h1>' +
          '<p class="bp-sub">Live debug-overzicht: zie WAAROM campagnes wel/niet renderen op publieke views.</p>' +
          '<div class="pp-diag-export-bar" style="margin:10px 0 18px">' +
            '<button class="bp-btn bp-btn-ghost" onclick="PP_Diag.exportCSV()" data-testid="diag-export-csv">📥 Export totaal overzicht (alle campagnes × alle plaatsingen)</button>' +
          '</div>' +

          '<div class="bp-stat-grid" style="margin-top:16px">' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Totaal</div><div class="bp-stat-num">' + stats.total + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Live</div><div class="bp-stat-num">' + stats.live + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">In review</div><div class="bp-stat-num">' + stats.review + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Concept</div><div class="bp-stat-num">' + stats.concept + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Zonder plaatsingen</div><div class="bp-stat-num">' + stats.geen_plaatsingen + '</div></div>' +
            '<div class="bp-stat-kaart"><div class="bp-stat-label">Feed-actief</div><div class="bp-stat-num">' + stats.feed_actief + '</div></div>' +
            '<div class="bp-stat-kaart" data-testid="diag-stat-impr"><div class="bp-stat-label">Totaal impressies</div><div class="bp-stat-num">' + stats.totaal_impr + '</div></div>' +
            '<div class="bp-stat-kaart" data-testid="diag-stat-click"><div class="bp-stat-label">Totaal kliks</div><div class="bp-stat-num">' + stats.totaal_click + '</div></div>' +
            '<div class="bp-stat-kaart" data-testid="diag-stat-likes"><div class="bp-stat-label">Totaal likes</div><div class="bp-stat-num">' + stats.totaal_likes + '</div></div>' +
          '</div>' +

          '<div class="bp-tabel-scroll" style="margin-top:18px">' +
            '<table class="bp-tabel"><thead><tr>' +
              '<th>Campagne</th><th>Merk</th><th>Status</th><th>Plaatsingen</th>' +
              '<th>Start</th><th>Eind</th><th>Rendert in feed?</th>' +
              '<th style="text-align:right">Impr.</th>' +
              '<th style="text-align:right">Kliks</th>' +
              '<th style="text-align:right">Likes</th>' +
              '<th>Actie</th>' +
            '</tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
          '</div>' +
        '</div>';
    } catch(e) {
      main.innerHTML = '<div class="bp-page"><div class="bp-empty"><div class="bp-empty-titel">Fout</div><div>' + esc(e.message) + '</div></div></div>';
    }
  }

  async function fixPlacements(campId) {
    try {
      await db().collection('campaigns').doc(campId).update({ plaatsingen: ['feed'] });
      if (window.DY && window.DY.toast) window.DY.toast('plaatsingen=[feed] gezet');
      render();
    } catch(e) {
      alert('Fout: ' + e.message);
    }
  }

  async function goLive(campId) {
    if (!confirm('Campagne live zetten (status=live)?')) return;
    try {
      await db().collection('campaigns').doc(campId).update({
        status: 'live',
        moderatedBy: (window.DY.user || {}).uid || 'admin',
        moderatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (window.DY && window.DY.toast) window.DY.toast('Campagne is live');
      render();
    } catch(e) {
      alert('Fout: ' + e.message);
    }
  }

  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_diag_wrapped) return;
    window.DY._pp_diag_wrapped = true;
    var orig = window.DY.toonPagina;
    window.DY.toonPagina = function(pagina) {
      if (pagina === 'admin_campagne_diagnose') {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        return render();
      }
      return orig.apply(this, arguments);
    };
    // v1.0.6: Fix bootstrap race - als URL al deze route bevat, force-render
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('pagina') === 'admin_campagne_diagnose') {
        window.DY.navigeer('admin_campagne_diagnose');
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerRoute);
  } else {
    setTimeout(registerRoute, 100);
  }

  window.PP_Diag = { render: render, fixPlacements: fixPlacements, goLive: goLive, exportCSV: exportCSV };
})();
