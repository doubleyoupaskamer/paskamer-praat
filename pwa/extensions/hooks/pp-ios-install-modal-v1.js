/* PASKAMER PRAAT - iOS "Voeg toe aan beginscherm" Modal (v1.0.0)
 *
 * Vervangt op iOS de legacy a2hs-prompt visueel met een volledig
 * responsive, safe-area-bewuste modal die 2-staps flow gebruikt:
 *   1. Instructie lezen
 *   2. "Volgende" → deel-knop guidance (pijl-highlight naar Safari toolbar)
 *
 * Werkt additief. Onderdrukt legacy iOS render via een guard en toont
 * eigen modal. Alle andere platforms (Android beforeinstallprompt,
 * desktop) blijven werken zoals altijd via legacy a2hs-prompt-v1.js.
 */
(function () {
  'use strict';

  var MODAL_ID = 'pp-ios-install-modal';
  var STORAGE_KEY = 'pp_ios_install_dismissed';

  function isIOS() {
    var ua = navigator.userAgent || '';
    var isiPad = /iPad/.test(ua) || (ua.indexOf('Mac') > -1 && 'ontouchend' in document);
    return /iPhone|iPod/.test(ua) || isiPad;
  }
  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
             window.navigator.standalone === true;
    } catch (_) { return false; }
  }
  function isDontShowAgain() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }

  function build() {
    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'pp-iim-backdrop pp-modal-top';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'pp-iim-titel');
    wrap.setAttribute('data-testid', 'pp-ios-install-modal');
    wrap.innerHTML =
      '<div class="pp-iim-card" role="document" data-step="1">' +
        '<button type="button" class="pp-iim-close" data-role="close" aria-label="Sluiten" data-testid="pp-iim-close">&times;</button>' +
        '<div class="pp-iim-icon" aria-hidden="true">' +
          '<div class="pp-iim-logo">W</div>' +
        '</div>' +
        '<div class="pp-iim-step pp-iim-step-1" data-testid="pp-iim-step-1">' +
          '<h2 class="pp-iim-titel" id="pp-iim-titel">Voeg toe aan beginscherm</h2>' +
          '<p class="pp-iim-sub">Voor de complete app-ervaring op je iPhone.</p>' +
          '<ol class="pp-iim-lijst">' +
            '<li><span class="pp-iim-nr">1</span><span>Tik op de <strong>Delen-knop</strong> onderaan Safari <svg class="pp-iim-share-ico" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2l4 4h-3v10h-2V6H8l4-4zM5 12v8h14v-8h-2v6H7v-6H5z"/></svg></span></li>' +
            '<li><span class="pp-iim-nr">2</span><span>Kies <strong>&ldquo;Zet op beginscherm&rdquo;</strong></span></li>' +
            '<li><span class="pp-iim-nr">3</span><span>Tik op <strong>Voeg toe</strong></span></li>' +
          '</ol>' +
          '<label class="pp-iim-remember">' +
            '<input type="checkbox" data-role="dsa" data-testid="pp-iim-dsa">' +
            '<span>Niet meer tonen</span>' +
          '</label>' +
          '<div class="pp-iim-acties">' +
            '<button type="button" class="pp-iim-btn pp-iim-btn-ghost" data-role="close" data-testid="pp-iim-later">Later</button>' +
            '<button type="button" class="pp-iim-btn pp-iim-btn-primair" data-role="next" data-testid="pp-iim-next">Volgende</button>' +
          '</div>' +
        '</div>' +
        '<div class="pp-iim-step pp-iim-step-2" data-testid="pp-iim-step-2" hidden>' +
          '<div class="pp-iim-hint">' +
            '<svg viewBox="0 0 24 24" width="42" height="42" fill="currentColor" aria-hidden="true"><path d="M12 2l4 4h-3v10h-2V6H8l4-4zM5 12v8h14v-8h-2v6H7v-6H5z"/></svg>' +
          '</div>' +
          '<h2 class="pp-iim-titel">Open het Deelmenu</h2>' +
          '<p class="pp-iim-sub">Tik nu op de <strong>Delen-knop</strong> onderaan Safari (het vierkantje met een pijltje omhoog) en kies daarna <strong>&ldquo;Zet op beginscherm&rdquo;</strong>.</p>' +
          '<div class="pp-iim-arrow" aria-hidden="true">' +
            '<svg viewBox="0 0 40 80" width="34" height="68"><path d="M20 4 L20 60 M8 48 L20 60 L32 48" stroke="currentColor" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '<span class="pp-iim-arrow-label">Delen-knop</span>' +
          '</div>' +
          '<div class="pp-iim-acties">' +
            '<button type="button" class="pp-iim-btn pp-iim-btn-ghost" data-role="back" data-testid="pp-iim-back">Terug</button>' +
            '<button type="button" class="pp-iim-btn pp-iim-btn-primair" data-role="close" data-testid="pp-iim-done">Klaar</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      var role = t && t.getAttribute && t.getAttribute('data-role');
      if (!role) {
        // check parent (voor SVG-children)
        var closest = t && t.closest && t.closest('[data-role]');
        if (closest) role = closest.getAttribute('data-role');
      }
      if (!role && t === wrap) role = 'close';
      if (role === 'next') {
        var card = wrap.querySelector('.pp-iim-card');
        card.setAttribute('data-step', '2');
        wrap.querySelector('.pp-iim-step-1').hidden = true;
        wrap.querySelector('.pp-iim-step-2').hidden = false;
      } else if (role === 'back') {
        var card2 = wrap.querySelector('.pp-iim-card');
        card2.setAttribute('data-step', '1');
        wrap.querySelector('.pp-iim-step-1').hidden = false;
        wrap.querySelector('.pp-iim-step-2').hidden = true;
      } else if (role === 'close') {
        var dsa = wrap.querySelector('[data-role="dsa"]');
        if (dsa && dsa.checked) {
          try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
        }
        remove();
      }
    });
    return wrap;
  }

  function remove() {
    var el = document.getElementById(MODAL_ID);
    if (!el) return;
    el.classList.add('pp-iim-uit');
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 240);
  }

  function show() {
    if (document.getElementById(MODAL_ID)) return;
    if (isStandalone()) return;
    if (!isIOS()) return;
    if (isDontShowAgain()) return;
    var m = build();
    document.body.appendChild(m);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { m.classList.add('pp-iim-in'); });
    });
  }

  // Onderdruk legacy iOS a2hs render als die opduikt (visueel vervangen).
  function suppressLegacy() {
    var legacy = document.getElementById('dy-a2hs-prompt');
    if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
  }

  function schedule() {
    if (!isIOS()) return;
    if (isStandalone()) return;
    if (isDontShowAgain()) return;
    setTimeout(function () {
      suppressLegacy();
      show();
      // Blijf legacy onderdrukken als hij later door timing wordt gerenderd
      var mo = new MutationObserver(function () { suppressLegacy(); });
      mo.observe(document.body, { childList: true });
      setTimeout(function () { try { mo.disconnect(); } catch (_) {} }, 30000);
    }, 3500); // na aanmeld-overlay + giveaway
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }

  window.PP_IOSInstall = {
    VERSION: '1.0.0',
    show: show,
    forceShow: function () { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} remove(); show(); }
  };
})();
