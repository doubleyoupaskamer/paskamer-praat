/* ═════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Viewport Observer (v1.0.0)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Zet CSS custom properties op :root zodat CSS altijd de ECHTE viewport
 * kent, ook op iOS Safari waar 100vh de URL-bar meerekent.
 *
 * Properties:
 *   --pp-vh       (percent van window.innerHeight * 0.01, dynamische)
 *   --pp-vh-s     (small viewport: URL-bar zichtbaar)
 *   --pp-vh-l     (large viewport: URL-bar verborgen)
 *   --pp-vw       (window.innerWidth * 0.01)
 *   --pp-orient   ("portrait" | "landscape")
 *   --pp-standalone ("1" | "0")
 *
 * Additief: breekt niets, werkt naast dvh/svh/lvh (die als hoofdunit
 * gebruikt worden). Als browser dvh niet snapt, valt CSS terug op
 * calc(var(--pp-vh) * 100).
 *
 * Dispatch event `pp:viewport-change` bij resize/orientationchange
 * zodat legacy scripts kunnen reageren.
 * ═════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_ViewportObserver) return;

  var root = document.documentElement;
  var lastW = 0, lastH = 0, lastOrient = null;
  var _tickPending = false;

  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             window.navigator.standalone === true;
    } catch (_) { return false; }
  }

  function updateProps() {
    var w = window.innerWidth  || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    if (w === lastW && h === lastH) return;

    var vh = h * 0.01;
    var vw = w * 0.01;
    root.style.setProperty('--pp-vh',  vh + 'px');
    root.style.setProperty('--pp-vw',  vw + 'px');

    // small (URL-bar zichtbaar) en large (URL-bar verborgen) benaderen
    // door visualViewport waar mogelijk, anders innerHeight fallback.
    try {
      if (window.visualViewport) {
        var vvh = window.visualViewport.height * 0.01;
        root.style.setProperty('--pp-vh-s', vvh + 'px');
        root.style.setProperty('--pp-vh-l', vh  + 'px');
      } else {
        root.style.setProperty('--pp-vh-s', vh + 'px');
        root.style.setProperty('--pp-vh-l', vh + 'px');
      }
    } catch (_) {
      root.style.setProperty('--pp-vh-s', vh + 'px');
      root.style.setProperty('--pp-vh-l', vh + 'px');
    }

    var orient = (w > h) ? 'landscape' : 'portrait';
    if (orient !== lastOrient) {
      root.setAttribute('data-pp-orient', orient);
      root.style.setProperty('--pp-orient', '"' + orient + '"');
      lastOrient = orient;
    }
    root.setAttribute('data-pp-standalone', isStandalone() ? '1' : '0');

    lastW = w;
    lastH = h;

    try {
      window.dispatchEvent(new CustomEvent('pp:viewport-change', {
        detail: { width: w, height: h, orientation: orient, standalone: isStandalone() }
      }));
    } catch (_) {}
  }

  function scheduleUpdate() {
    if (_tickPending) return;
    _tickPending = true;
    requestAnimationFrame(function () {
      _tickPending = false;
      updateProps();
    });
  }

  // Initial + subsequent
  updateProps();
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleUpdate, { passive: true });
    window.visualViewport.addEventListener('scroll', scheduleUpdate, { passive: true });
  }
  // iOS: bij focus/blur op inputs kan viewport wijzigen door keyboard
  document.addEventListener('focusin',  scheduleUpdate);
  document.addEventListener('focusout', scheduleUpdate);
  // PWA display-mode swap
  try {
    var mq = window.matchMedia('(display-mode: standalone)');
    if (mq.addEventListener) mq.addEventListener('change', scheduleUpdate);
    else if (mq.addListener) mq.addListener(scheduleUpdate);
  } catch (_) {}

  window.PP_ViewportObserver = {
    VERSION: '1.0.0',
    update:  updateProps,
    get: function () {
      return {
        width:  window.innerWidth,
        height: window.innerHeight,
        orient: root.getAttribute('data-pp-orient'),
        standalone: root.getAttribute('data-pp-standalone') === '1'
      };
    }
  };
})();
