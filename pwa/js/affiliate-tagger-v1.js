// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Affiliate Auto-Tagger v1 (non-invasief)
//
// Detecteert outbound links naar webshops, voegt jouw affiliate-tag toe
// en logt clicks naar Firestore collection `kai_events`.
//
// Configuratie via `window.DY.affiliateConfig` (override aan begin van
// pwa-v463 of in eigen script):
//   {
//     enabled: true,
//     networks: {
//       'zalando.nl':       { param: 'wmc',      value: 'XYZ.51._' },
//       'bol.com':          { param: 'Referrer', value: 'PASKAMERPRAAT' },
//       'aboutyou.nl':      { param: 'tdmc',     value: 'PASKAMER' },
//       'wehkamp.nl':       { param: 'utm_source', value: 'paskamerpraat' },
//       'hm.com':           { param: 'utm_source', value: 'paskamerpraat' },
//       'asos.com':         { param: 'affid',    value: '12345' },
//     }
//   }
//
// Werkt op:
//   - klik op <a> naar bekend netwerk
//   - links die later via MutationObserver in feed-cards verschijnen
//
// Veiligheid:
//   - Voegt nooit een tag toe als die al aanwezig is (idempotent)
//   - Bewaart originele href als `data-pp-href-original`
//   - Geeft nooit een error - silent log op problemen
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  /* global firebase */

  if (window.__ppAffiliateInit) return;
  window.__ppAffiliateInit = true;

  // ── Default config - overschrijfbaar via DY.affiliateConfig ──
  var defaultConfig = {
    enabled: true,
    networks: {
      'zalando.nl':    { param: 'wmc',         value: 'PASKAMERPRAAT' },
      'zalando.com':   { param: 'wmc',         value: 'PASKAMERPRAAT' },
      'bol.com':       { param: 'Referrer',    value: 'PASKAMERPRAAT' },
      'aboutyou.nl':   { param: 'tdmc',        value: 'PASKAMERPRAAT' },
      'aboutyou.com':  { param: 'tdmc',        value: 'PASKAMERPRAAT' },
      'wehkamp.nl':    { param: 'utm_source',  value: 'paskamerpraat' },
      'hm.com':        { param: 'utm_source',  value: 'paskamerpraat' },
      'asos.com':      { param: 'affid',       value: 'paskamerpraat' },
      'omoda.nl':      { param: 'utm_source',  value: 'paskamerpraat' },
      'sacha.nl':      { param: 'utm_source',  value: 'paskamerpraat' },
      'zara.com':      { param: 'utm_source',  value: 'paskamerpraat' }
    }
  };

  function getConfig() {
    var custom = (window.DY && window.DY.affiliateConfig) || {};
    var merged = Object.assign({}, defaultConfig, custom);
    merged.networks = Object.assign({}, defaultConfig.networks, custom.networks || {});
    return merged;
  }

  function matchNetwork(host, networks) {
    host = (host || '').toLowerCase().replace(/^www\./, '');
    for (var key in networks) {
      if (Object.prototype.hasOwnProperty.call(networks, key)) {
        if (host === key || host.endsWith('.' + key)) return networks[key];
      }
    }
    return null;
  }

  function tagUrl(url, network) {
    try {
      var u = new URL(url);
      if (u.searchParams.get(network.param) === network.value) return url; // al getagd
      u.searchParams.set(network.param, network.value);
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function processLink(a) {
    if (!a || a.tagName !== 'A' || !a.href) return;
    if (a.getAttribute('data-pp-affiliate') === '1') return;
    var cfg = getConfig();
    if (!cfg.enabled) return;
    var host;
    try { host = new URL(a.href).hostname; } catch (e) { return; }
    var net = matchNetwork(host, cfg.networks);
    if (!net) return;
    var newUrl = tagUrl(a.href, net);
    if (newUrl !== a.href) {
      a.setAttribute('data-pp-href-original', a.href);
      a.href = newUrl;
    }
    a.setAttribute('data-pp-affiliate', '1');
    a.setAttribute('data-pp-network', host.replace(/^www\./, ''));
  }

  function scanAll(root) {
    try {
      var links = (root || document).querySelectorAll('a[href^="http"]:not([data-pp-affiliate])');
      for (var i = 0; i < links.length; i++) processLink(links[i]);
    } catch (e) { /* noop */ }
  }

  // ── Click logging naar Firestore kai_events ──
  function logAffiliateClick(network, url) {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      var db = firebase.firestore();
      var user = (firebase.auth && firebase.auth().currentUser) || null;
      db.collection('kai_events').add({
        eventType: 'affiliate_click',
        network: network,
        url:     (url || '').slice(0, 500),
        userId:  user ? user.uid : 'anon',
        ts:      firebase.firestore.FieldValue.serverTimestamp()
      }).catch(function() { /* noop */ });
    } catch (e) { /* noop */ }
  }

  // Vang clicks via event delegation (geen per-link listener)
  document.addEventListener('click', function(ev) {
    var t = ev.target;
    while (t && t !== document) {
      if (t.tagName === 'A' && t.getAttribute('data-pp-affiliate') === '1') {
        logAffiliateClick(t.getAttribute('data-pp-network') || 'unknown', t.href);
        break;
      }
      t = t.parentNode;
    }
  }, true);

  // ── MutationObserver voor dynamische feed cards ──
  function startMutationObserver() {
    if (!('MutationObserver' in window)) return;
    try {
      var mo = new MutationObserver(function(records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (!n || n.nodeType !== 1) continue;
            if (n.tagName === 'A') processLink(n);
            else if (n.querySelectorAll) scanAll(n);
          }
        }
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* noop */ }
  }

  function init() {
    scanAll(document);
    startMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.affiliate = {
    rescan:  function() { scanAll(document); },
    process: processLink,
    config:  getConfig,
    networks: function() { return Object.keys(getConfig().networks); }
  };
})();
