// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Lazy Images v1 (non-invasief)
// Voegt native `loading="lazy"` toe aan alle <img> die het nog niet
// hebben, en upgrade `data-src` / `data-srcset` placeholders met een
// IntersectionObserver.
//
// • Werkt op bestaande images en op alle nieuwe images die later via
//   DOM-mutaties worden toegevoegd (feed-reel, modals, hub-popovers).
// • Slaat de hero image en images met `data-eager="1"` over.
// • Faalt veilig terug naar onmiddellijk swappen als IntersectionObserver
//   niet bestaat (oude browsers).
// • Raakt pwa-v463-*.js NIET aan.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var ATTR_FLAG = 'data-lazy-init';
  var HERO_SELECTOR = '.dy-hero img, [data-hero] img, img[data-eager="1"]';

  function shouldSkip(img) {
    if (!img || img.getAttribute(ATTR_FLAG)) return true;
    // Hero/LCP images niet lazy maken
    if (img.matches(HERO_SELECTOR)) return true;
    // Decoderen al klaar of zichtbaar? laat staan
    if (img.complete && img.naturalWidth > 0 && !img.dataset.src) return true;
    return false;
  }

  function setLazyAttrs(img) {
    if (shouldSkip(img)) return;
    img.setAttribute(ATTR_FLAG, '1');
    try {
      if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    } catch (e) { /* noop */ }
  }

  function swapDataSrc(img) {
    var src = img.getAttribute('data-src');
    var srcset = img.getAttribute('data-srcset');
    if (src && !img.getAttribute('src')) {
      img.setAttribute('src', src);
      img.removeAttribute('data-src');
    }
    if (srcset && !img.getAttribute('srcset')) {
      img.setAttribute('srcset', srcset);
      img.removeAttribute('data-srcset');
    }
  }

  var observer = null;
  if ('IntersectionObserver' in window) {
    try {
      observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            var img = entry.target;
            swapDataSrc(img);
            observer.unobserve(img);
          }
        });
      }, { rootMargin: '200px 0px', threshold: 0.01 });
    } catch (e) { observer = null; }
  }

  function processImage(img) {
    if (!img || img.tagName !== 'IMG') return;
    setLazyAttrs(img);
    if (img.getAttribute('data-src') || img.getAttribute('data-srcset')) {
      if (observer) {
        try { observer.observe(img); } catch (e) { swapDataSrc(img); }
      } else {
        swapDataSrc(img);
      }
    }
  }

  function scanAll(root) {
    try {
      var imgs = (root || document).querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) processImage(imgs[i]);
    } catch (e) { /* noop */ }
  }

  // Observe DOM mutaties zodat nieuw geinjecteerde feed-cards ook lazy worden
  function startMutationObserver() {
    if (!('MutationObserver' in window)) return;
    try {
      var mo = new MutationObserver(function(records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (!n || n.nodeType !== 1) continue;
            if (n.tagName === 'IMG') processImage(n);
            else if (n.querySelectorAll) {
              var sub = n.querySelectorAll('img');
              for (var k = 0; k < sub.length; k++) processImage(sub[k]);
            }
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
})();
