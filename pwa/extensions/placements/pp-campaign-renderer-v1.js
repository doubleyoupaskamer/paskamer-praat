/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Universele Campagne Renderer (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Final fix voor campagne-zichtbaarheid:
 *  1. Subscribet 1x op live campaigns (real-time updates)
 *  2. Bij elke pagina-render: injecteer campagne-strip in juiste container
 *  3. Werkt voor alle plaatsingen: feed, stories, outfit_review, ai_assist, similar_items
 *  4. Backward compat: campagnes zonder plaatsingen → default 'feed'
 *  5. Robust: silent fallback bij rules-error, geen UI crash
 *
 * Routes → placement mapping:
 *   feed, home           → 'feed'
 *   merken               → 'feed'
 *   stories              → 'stories'
 *   outfit_review        → 'outfit_review'
 *   ai_assist, ai_chat   → 'ai_assist'
 *   similar              → 'similar_items'
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var _liveCampaigns = [];
  var _unsubscribe = null;
  var _imprBatched = {};

  function esc(s) { var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }
  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }

  // v1.0.11 PRIVACY: respect GDPR analytics-consent.
  // Geen UID in tracking events tenzij user expliciet consent.analytics=true heeft gegeven.
  // Default: anonieme impressions/clicks (uid=null) - voldoende voor ad-billing op placement-level.
  function _trackingUid() {
    try {
      var prof = window.DY && window.DY.profile;
      var hasConsent = prof && prof.consent && prof.consent.analytics === true;
      if (!hasConsent) return null;
      return (window.firebase.auth().currentUser || {}).uid || null;
    } catch (e) { return null; }
  }

  function routeToPlacement(pagina) {
    if (pagina === 'feed' || pagina === 'home' || pagina === 'merken') return 'feed';
    if (pagina === 'stories') return 'stories';
    if (pagina === 'outfit_review' || pagina === 'review') return 'outfit_review';
    if (pagina === 'ai_assist' || pagina === 'ai_chat' || pagina === 'kleuren_ai') return 'ai_assist';
    if (pagina === 'similar' || pagina === 'vergelijk') return 'similar_items';
    return null;
  }

  function getActiveForPlacement(plac) {
    var nuTs = Date.now();
    return _liveCampaigns.filter(function(c) {
      var p = c.plaatsingen || [];
      if (!p.length) p = ['feed']; // legacy
      if (p.indexOf(plac) === -1) return false;
      var startMs = (c.startDatum && c.startDatum.toMillis) ? c.startDatum.toMillis() : null;
      var eindMs  = (c.eindDatum && c.eindDatum.toMillis) ? c.eindDatum.toMillis() : null;
      // startDatum blijft strikt: voorkom premature rendering
      if (startMs && nuTs < startMs) return false;
      // v1.0.12 (29-jun-2026): eindDatum is SOFT — status === 'live' is supreme.
      // De backend (status-transitie worker) hoort campagnes naar 'completed' /
      // 'paused' te zetten zodra budget op is OF eindDatum verstreken is.
      // Als status nog 'live' is, heeft de klant betaald voor zichtbaarheid:
      // we tonen het. Zo nee, dan was de transitie-worker stuk — niet onze
      // verantwoordelijkheid om gebruikers betalend product te ontnemen.
      if (eindMs && nuTs > eindMs && c.status !== 'live') return false;
      return true;
    });
  }

  function renderCard(c) {
    var initialen = esc((c.brandNaam || '?').slice(0,2).toUpperCase());
    var msg = esc(c.boodschap || c.naam || '');
    return '<a class="bp-campagne-kaart" href="javascript:void(0)" ' +
      'onclick="PP_CampaignRenderer.click(\'' + esc(c._id) + '\',\'' + esc(c.brandId||'') + '\')" ' +
      'data-testid="pp-camp-' + esc(c._id) + '">' +
      '<div class="bp-campagne-logo">' + initialen + '</div>' +
      '<div class="bp-campagne-info">' +
        '<div class="bp-campagne-merk">' + esc(c.brandNaam || 'Merk') + '</div>' +
        '<div class="bp-campagne-msg">' + msg + '</div>' +
      '</div>' +
      '<span class="bp-campagne-tag">Gesponsord</span>' +
    '</a>';
  }

  function injectStrip(placement, container, label) {
    if (!container) return;
    if (container.querySelector('.pp-campaign-strip-' + placement)) return; // al gerenderd
    var actief = getActiveForPlacement(placement);
    if (!actief.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'pp-campaign-strip pp-campaign-strip-' + placement + ' bp-campagne-feed';
    wrap.setAttribute('data-testid', 'pp-camp-strip-' + placement);
    wrap.innerHTML =
      '<div class="bp-campagne-header">' +
        '<span class="bp-header-eyebrow">' + esc(label || 'Uitgelicht') + '</span>' +
        '<h2 class="bp-campagne-h2">Voor jou geselecteerd</h2>' +
      '</div>' +
      '<div class="bp-campagne-strip">' + actief.map(renderCard).join('') + '</div>';
    // Insert at top of container
    container.insertBefore(wrap, container.firstChild);
    // Track impressions
    actief.forEach(function(c) {
      var k = placement + ':' + c._id;
      if (_imprBatched[k]) return;
      _imprBatched[k] = true;
      try {
        db().collection('events').add({
          type: 'impression', subtype: 'campaign',
          campaignId: c._id, brandId: c.brandId || null,
          plaatsing: placement,
          uid: _trackingUid(),
          ts: window.firebase.firestore.FieldValue.serverTimestamp(),
          processed: false
        }).catch(function(){});
      } catch(e) {}
    });
  }

  function tryInject() {
    if (!_liveCampaigns.length) return;
    var pagina = window.DY && window.DY.pagina;
    var placement = routeToPlacement(pagina);
    if (!placement) return;
    // v1.0.13 (29-jun-2026): feed-placement opnieuw HELEMAAL overgeslagen.
    // Gebruiker wil GEEN campagnes/gesponsorde posts bovenaan de standaard
    // feed-pagina — alleen op de Uitgelicht-tab (pp-feedtabs-v1.js) en op
    // /merken (legacy bp-campagne-feed). Andere placements (stories,
    // review, ai_assist, similar_items) blijven gewoon werken.
    if (placement === 'feed') return;
    var main = document.getElementById('dy-main');
    if (!main) return;
    injectStrip(placement, main, 'Aangeboden');
  }

  function subscribe() {
    if (_unsubscribe) return;
    try {
      _unsubscribe = db().collection('campaigns')
        .where('status', '==', 'live').limit(50)
        .onSnapshot(function(snap) {
          _liveCampaigns = [];
          snap.forEach(function(d) {
            var c = d.data();
            c._id = d.id;
            _liveCampaigns.push(c);
          });
          try { console.log('[pp-renderer] live campaigns:', _liveCampaigns.length); } catch(_){}
          tryInject();
        }, function(err) {
          // Rules-error voor anoniem? Probeer eenmalige .get() als fallback
          try { console.warn('[pp-renderer] subscribe failed, trying one-time get:', err && err.code); } catch(_){}
          db().collection('campaigns').where('status', '==', 'live').limit(50).get()
            .then(function(snap) {
              _liveCampaigns = [];
              snap.forEach(function(d) {
                var c = d.data(); c._id = d.id; _liveCampaigns.push(c);
              });
              tryInject();
            }).catch(function(){});
        });
    } catch(e) {}
  }

  function click(campaignId, brandId) {
    try {
      db().collection('events').add({
        type: 'campaign_click', campaignId: campaignId,
        brandId: brandId || null, plaatsing: routeToPlacement(window.DY && window.DY.pagina),
        uid: _trackingUid(),
        ts: window.firebase.firestore.FieldValue.serverTimestamp(), processed: false
      }).catch(function(){});
    } catch(e) {}
    if (brandId && window.DY && window.DY.brandPortal && window.DY.brandPortal.toonMerkDetail) {
      window.DY.brandPortal.toonMerkDetail(brandId);
    }
  }

  function init() {
    if (!window.firebase || !window.firebase.firestore) {
      setTimeout(init, 300);
      return;
    }
    subscribe();
    // Mutation observer voor nieuwe pagina-rendering
    var obs = new MutationObserver(function() { tryInject(); });
    obs.observe(document.body, { childList: true, subtree: true });
    // Initial try
    tryInject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  window.PP_CampaignRenderer = {
    click: click,
    refresh: function() { _imprBatched = {}; tryInject(); },
    getLive: function() { return _liveCampaigns.slice(); }
  };
})();
