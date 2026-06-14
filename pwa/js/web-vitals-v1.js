// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Web Vitals v1 (non-invasief)
//
// Captured Core Web Vitals via PerformanceObserver en logt batched
// naar Firestore `kai_events`. Pure browser API's, geen externe lib.
//
// Metrics:
//   - LCP  (Largest Contentful Paint)  → element render speed
//   - INP  (Interaction to Next Paint) → input latency
//   - CLS  (Cumulative Layout Shift)   → layout stability
//   - FCP  (First Contentful Paint)
//   - TTFB (Time to First Byte)
//
// Batching:
//   - Bewaart laatste waardes in window.DY.vitals.current
//   - Schrijft op `visibilitychange → hidden` en op `pagehide`
//     (= one-shot beacon per sessie, niet per metric)
//
// Veiligheid:
//   - Werkt zonder Firebase (slaat alleen lokaal op)
//   - try/catch om elke observer (oude browsers crashen niet)
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  /* global firebase */

  if (window.__ppVitalsInit) return;
  window.__ppVitalsInit = true;

  var current = {
    lcp:  null,
    inp:  null,
    cls:  0,
    fcp:  null,
    ttfb: null,
    nav:  null,
    sent: false
  };

  function safeObserve(type, cb, opts) {
    try {
      if (!('PerformanceObserver' in window)) return null;
      var po = new PerformanceObserver(function(list) {
        try { cb(list.getEntries()); } catch (e) { /* noop */ }
      });
      po.observe(opts || { type: type, buffered: true });
      return po;
    } catch (e) { return null; }
  }

  // ── TTFB + FCP uit navigation/paint timing ──
  try {
    var navEntries = performance.getEntriesByType('navigation');
    if (navEntries && navEntries[0]) {
      var n = navEntries[0];
      current.ttfb = Math.round(n.responseStart - n.requestStart);
      current.nav  = Math.round(n.domContentLoadedEventEnd);
    }
    var paints = performance.getEntriesByType('paint');
    for (var i = 0; i < paints.length; i++) {
      if (paints[i].name === 'first-contentful-paint') {
        current.fcp = Math.round(paints[i].startTime);
      }
    }
  } catch (e) { /* noop */ }

  // ── LCP ──
  safeObserve('largest-contentful-paint', function(entries) {
    var last = entries[entries.length - 1];
    if (last) current.lcp = Math.round(last.renderTime || last.loadTime || last.startTime);
  });

  // ── CLS ──
  // Spec: alleen layout shifts zonder recent user input mogen
  // gecumuleerd worden in een 5s/1s session-window. Voor hier doen
  // we de simpele cumulatieve variant - accuraat genoeg voor logging.
  safeObserve('layout-shift', function(entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e.hadRecentInput) current.cls += e.value;
    }
    current.cls = Math.round(current.cls * 1000) / 1000;
  });

  // ── INP (max event duration) ──
  // Niet de officiële p98 implementatie van web-vitals lib, maar een
  // pragmatische "max recent interaction" - onthult slechtste latency.
  var maxInp = 0;
  safeObserve('event', function(entries) {
    for (var i = 0; i < entries.length; i++) {
      var d = entries[i].duration;
      if (d > maxInp) {
        maxInp = d;
        current.inp = Math.round(d);
      }
    }
  }, { type: 'event', buffered: true, durationThreshold: 40 });

  // ── Verzenden ──
  function sendBeacon() {
    if (current.sent) return;
    current.sent = true;
    var payload = {
      eventType: 'web_vitals',
      lcp:  current.lcp,
      inp:  current.inp,
      cls:  current.cls,
      fcp:  current.fcp,
      ttfb: current.ttfb,
      nav:  current.nav,
      ua:   (navigator.userAgent || '').slice(0, 200),
      url:  (location.pathname + location.search).slice(0, 200),
      vp:   window.innerWidth + 'x' + window.innerHeight,
      online: navigator.onLine
    };
    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        var user = (firebase.auth && firebase.auth().currentUser) || null;
        payload.userId = user ? user.uid : 'anon';
        payload.ts = firebase.firestore.FieldValue.serverTimestamp();
        firebase.firestore().collection('kai_events').add(payload).catch(function() { /* noop */ });
      }
    } catch (e) { /* noop */ }

    // Console fallback voor debug
    try { console.debug('[web-vitals]', payload); } catch (e) { /* noop */ }

    // Dispatch custom event voor andere scripts (bv. dashboard)
    try { window.dispatchEvent(new CustomEvent('dy:web-vitals', { detail: payload })); } catch (e) { /* noop */ }
  }

  // Beacon op page hide (= meest betrouwbaar moment)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') sendBeacon();
  });
  window.addEventListener('pagehide', sendBeacon);

  // Backup: 12s na load voor lange sessies waar gebruiker tab niet sluit
  setTimeout(sendBeacon, 12000);

  // Public API
  window.DY = window.DY || {};
  window.DY.vitals = {
    current:  function() { return Object.assign({}, current); },
    flush:    sendBeacon,
    isSent:   function() { return current.sent; }
  };
})();
