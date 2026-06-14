// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Custom Add-to-Home-Screen Prompt v1 (non-invasief)
//
// Vervangt de browser default install hint met een eigen, on-brand
// bottom-sheet "Installeer Doubleyou".
//
// Gedrag:
//   - Android/Desktop: vangt `beforeinstallprompt`, prevent default,
//     toont eigen banner met "Installeer" knop die `prompt()` aanroept.
//   - iOS (geen beforeinstallprompt): toont instructie modal met de
//     iOS share-stappen ("Tik op delen → Voeg toe aan beginscherm").
//   - Onthoudt dismiss in localStorage 14 dagen.
//   - Toont niet als app al gestart als PWA (standalone display mode).
//   - Niet vóór 8s op de site (vermijdt prompt-spam bij eerste klik).
//
// Werkt naast bestaande inline `<install banner>` in index.html - als
// die al actief is, doet deze script niets dubbel.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppA2HSInit) return;
  window.__ppA2HSInit = true;

  var DISMISS_KEY  = 'dy_a2hs_dismissed_at';
  var DISMISS_DAYS = 14;
  var SHOW_DELAY   = 8000;
  var HOST_ID  = 'dy-a2hs-prompt';
  var STYLE_ID = 'dy-a2hs-style';

  function isStandalone() {
    // v60.1: gebruik gedeelde detectie als beschikbaar (index.html script
    // initialiseert window.DY.isAppInstalled).
    try {
      if (window.DY && typeof window.DY.isAppInstalled === 'function') {
        return window.DY.isAppInstalled();
      }
    } catch (e) { /* noop */ }
    // Fallback: comprehensive matchMedia checks voor Samsung/Android/iOS/Desktop.
    // Samsung Internet rapporteert geïnstalleerde PWA's regelmatig als
    // 'minimal-ui' of 'fullscreen' i.p.v. 'standalone' - dus alle modes checken.
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
    } catch(e) {}
    if (window.navigator && window.navigator.standalone === true) return true;
    try {
      if (document.referrer && document.referrer.indexOf('android-app://') === 0) return true;
      if (localStorage.getItem('dy_pwa_geinstalleerd') === '1') return true;
    } catch(e) {}
    return false;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function recentlyDismissed() {
    try {
      var v = localStorage.getItem(DISMISS_KEY);
      if (!v) return false;
      var diff = (Date.now() - parseInt(v, 10)) / (1000 * 60 * 60 * 24);
      return diff < DISMISS_DAYS;
    } catch (e) { return false; }
  }

  function markDismissed() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* noop */ }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + HOST_ID + '{',
      '  position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0) + 100px);',
      '  transform:translate(-50%,32px);opacity:0;pointer-events:none;',
      '  background:#1e1a0f;color:#fefcf5;border-radius:18px;padding:16px 18px;',
      '  width:min(460px, 92vw);z-index:2147483643;box-shadow:0 18px 44px rgba(0,0,0,.42);',
      '  border:1px solid rgba(254,252,245,.14);',
      '  font:500 14px/1.45 "DM Sans","Inter",system-ui,sans-serif;',
      '  transition:opacity .3s ease, transform .3s cubic-bezier(.23,1,.32,1);',
      '}',
      '#' + HOST_ID + '.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}',
      '#' + HOST_ID + ' .head{display:flex;align-items:center;gap:12px;margin-bottom:8px}',
      '#' + HOST_ID + ' .icon{',
      '  width:42px;height:42px;flex:none;border-radius:11px;',
      '  background:linear-gradient(135deg,#c89b3c,#a47c28);display:grid;place-items:center;',
      '  color:#1e1a0f;font:700 22px serif',
      '}',
      '#' + HOST_ID + ' .title{font-weight:700;font-size:15px;line-height:1.2}',
      '#' + HOST_ID + ' .sub{color:rgba(254,252,245,.66);font-size:12px;margin-top:2px}',
      '#' + HOST_ID + ' .body{color:rgba(254,252,245,.86);font-size:13px;margin:8px 0 12px}',
      '#' + HOST_ID + ' .actions{display:flex;gap:8px;justify-content:flex-end}',
      '#' + HOST_ID + ' button{',
      '  border:0;padding:9px 16px;border-radius:999px;cursor:pointer;',
      '  font:600 13px "DM Sans",inherit;-webkit-tap-highlight-color:transparent;',
      '}',
      '#' + HOST_ID + ' .primary{background:#c89b3c;color:#1e1a0f}',
      '#' + HOST_ID + ' .primary:hover{background:#d8aa48}',
      '#' + HOST_ID + ' .ghost{background:transparent;color:rgba(254,252,245,.7);border:1px solid rgba(254,252,245,.2)}',
      '#' + HOST_ID + ' .ghost:hover{background:rgba(254,252,245,.08)}',
      '#' + HOST_ID + ' ol{margin:8px 0 12px 22px;padding:0;color:rgba(254,252,245,.86);font-size:13px}',
      '#' + HOST_ID + ' ol li{margin:4px 0}',
      '@media (prefers-reduced-motion: reduce){#' + HOST_ID + '{transition:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildShell() {
    injectStyles();
    var el = document.createElement('div');
    el.id = HOST_ID;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'dy-a2hs-title');
    document.body.appendChild(el);
    return el;
  }

  function showAndroidPrompt(deferredEvent) {
    if (recentlyDismissed() || isStandalone()) return;
    // v60.1: voorkom dubbel-prompt - als de inline install-banner al
    // zichtbaar is in DOM, niet ook nog een eigen sheet tonen.
    var inlineBanner = document.getElementById('dy-install-banner');
    if (inlineBanner && inlineBanner.style && inlineBanner.style.display === 'flex') return;
    var el = buildShell();
    el.innerHTML =
      '<div class="head">' +
        '<div class="icon">W</div>' +
        '<div><div class="title" id="dy-a2hs-title">Installeer Doubleyou</div>' +
        '<div class="sub">Sneller laden, offline & meldingen</div></div>' +
      '</div>' +
      '<div class="body">Voeg toe aan je startscherm voor de échte app-ervaring.</div>' +
      '<div class="actions">' +
        '<button type="button" class="ghost" data-act="dismiss">Niet nu</button>' +
        '<button type="button" class="primary" data-act="install">Installeer</button>' +
      '</div>';
    el.querySelector('[data-act="dismiss"]').addEventListener('click', function() {
      markDismissed(); hide(el);
    });
    el.querySelector('[data-act="install"]').addEventListener('click', function() {
      try {
        deferredEvent.prompt();
        deferredEvent.userChoice.then(function(choice) {
          markDismissed();
          try { window.dispatchEvent(new CustomEvent('dy:a2hs-choice', { detail: choice })); } catch (e) { /* noop */ }
          hide(el);
        }).catch(function() { hide(el); });
      } catch (e) { hide(el); }
    });
    requestAnimationFrame(function() { el.classList.add('show'); });
  }

  function showIosInstructions() {
    if (recentlyDismissed() || isStandalone()) return;
    // v60.1: voorkom dat deze overlay de inline install-banner blokkeert
    // op iOS - de inline banner heeft een eigen "Hoe?" knop met alert().
    // Als de inline banner zichtbaar is (of binnenkort wordt getoond), niet
    // overlappen.
    try {
      if (localStorage.getItem('dy_install_v3')) return;        // permanent dismissed
      if (sessionStorage.getItem('dy_install_sess_v3')) return; // sessie dismissed
    } catch(e) {}
    var inlineBanner = document.getElementById('dy-install-banner');
    if (inlineBanner && inlineBanner.style && inlineBanner.style.display === 'flex') return;
    var el = buildShell();
    el.innerHTML =
      '<div class="head">' +
        '<div class="icon">W</div>' +
        '<div><div class="title" id="dy-a2hs-title">Voeg toe aan beginscherm</div>' +
        '<div class="sub">Voor de app-ervaring op iOS</div></div>' +
      '</div>' +
      '<ol>' +
        '<li>Tik op het <strong>Delen</strong>-pictogram onderin Safari</li>' +
        '<li>Kies <strong>"Voeg toe aan beginscherm"</strong></li>' +
        '<li>Tik op <strong>Voeg toe</strong></li>' +
      '</ol>' +
      '<div class="actions">' +
        '<button type="button" class="ghost" data-act="dismiss">Sluiten</button>' +
      '</div>';
    el.querySelector('[data-act="dismiss"]').addEventListener('click', function() {
      markDismissed(); hide(el);
    });
    requestAnimationFrame(function() { el.classList.add('show'); });
  }

  function hide(el) {
    if (!el) el = document.getElementById(HOST_ID);
    if (!el) return;
    el.classList.remove('show');
    setTimeout(function() { try { el.remove(); } catch (e) { /* noop */ } }, 400);
  }

  // Vang Android/Desktop install event
  var deferredA2HS = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    // v60.1: als de app al geïnstalleerd is (Samsung kan dit event soms
    // foutief firen terwijl de PWA al draait), NEGEER en mark als installed.
    if (isStandalone()) {
      try { localStorage.setItem('dy_pwa_geinstalleerd', '1'); } catch(_){}
      return;
    }
    try { e.preventDefault(); } catch (er) { /* noop */ }
    deferredA2HS = e;
    setTimeout(function() {
      if (deferredA2HS && !isStandalone()) showAndroidPrompt(deferredA2HS);
    }, SHOW_DELAY);
  });

  // iOS: geen event, dus na delay zelf instructies tonen
  function maybeShowIos() {
    if (!isIOS() || isStandalone() || recentlyDismissed()) return;
    setTimeout(showIosInstructions, SHOW_DELAY);
  }

  // Reset dismiss als app daadwerkelijk geïnstalleerd is
  window.addEventListener('appinstalled', function() {
    markDismissed(); // verberg toekomstige prompts
    // v60.1: zet ook permanent installed-flag zodat Samsung Internet
    // ook na herstart van de PWA herkent dat hij geïnstalleerd is.
    try { localStorage.setItem('dy_pwa_geinstalleerd', '1'); } catch(_){}
    try { localStorage.setItem('dy_install_v3', '1'); } catch(_){}
    var el = document.getElementById(HOST_ID); if (el) hide(el);
    // Verberg ook de inline install-banner
    var inline = document.getElementById('dy-install-banner');
    if (inline) inline.style.display = 'none';
    try { window.dispatchEvent(new CustomEvent('dy:a2hs-installed')); } catch (e) { /* noop */ }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeShowIos);
  } else {
    maybeShowIos();
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.a2hs = {
    forceShow: function() {
      if (deferredA2HS) showAndroidPrompt(deferredA2HS);
      else if (isIOS()) showIosInstructions();
    },
    resetDismiss: function() {
      try { localStorage.removeItem(DISMISS_KEY); } catch (e) { /* noop */ }
    },
    canPromptAndroid: function() { return !!deferredA2HS; },
    isStandalone: isStandalone
  };
})();
