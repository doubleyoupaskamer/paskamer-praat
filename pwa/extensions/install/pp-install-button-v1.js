/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Manual Install Button (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Voegt een ALTIJD-aanwezige "Installeer app" knop toe in het profiel-
 * menu. Werkt onafhankelijk van automatische popup-detectie zodat de
 * gebruiker altijd zelf de installatie kan triggeren.
 *
 * Gedrag per platform:
 *   - Android/Desktop met beforeinstallprompt → roept `prompt()` aan
 *   - iOS Safari → toont instructie-modal (Delen → Voeg toe aan beginscherm)
 *   - Geïnstalleerd → toont "App geïnstalleerd" badge i.p.v. knop
 *
 * NIETS gewijzigd aan bestaande popup-systemen of install-manager. Deze
 * knop is een PARALLEL ingang die gebruikers expliciet kunnen kiezen.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_InstallButton) return;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function isStandalone() {
    try { return !!(window.PP_InstallManager && PP_InstallManager.isInstalled()); } catch (e) {}
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (e) {}
    if (window.navigator && window.navigator.standalone === true) return true;
    return false;
  }

  // Vang beforeinstallprompt (DELEN met andere scripts niet preventDefault)
  var _deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    _deferred = e;
  });
  window.addEventListener('appinstalled', function () {
    _deferred = null;
    var knop = document.getElementById('pp-install-manual-btn');
    if (knop) knop.style.display = 'none';
  });

  function showIOSInstructions() {
    var existing = document.getElementById('pp-install-ios-modal');
    if (existing) try { existing.remove(); } catch (_) {}
    var ov = document.createElement('div');
    ov.id = 'pp-install-ios-modal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('data-testid', 'install-ios-modal');
    ov.style.cssText =
      'position:fixed;inset:0;background:rgba(10,8,6,0.8);backdrop-filter:blur(6px);' +
      'z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#1e1a0f;border:1px solid rgba(212,145,10,0.4);' +
        'border-radius:16px;max-width:380px;width:100%;padding:24px;color:#fefcf5;' +
        'font-family:DM Sans,system-ui,sans-serif">' +
        '<h2 style="margin:0 0 12px;color:#c89b3c;font-size:18px">Voeg Doubleyou toe aan je beginscherm</h2>' +
        '<p style="margin:0 0 14px;font-size:14px;color:rgba(254,252,245,0.8)">Voor de échte app-ervaring op je iPhone of iPad:</p>' +
        '<ol style="margin:0 0 16px 22px;padding:0;font-size:14px;line-height:1.6">' +
          '<li>Tik op het <strong>Delen</strong>-pictogram (vierkant met pijl) onderin Safari</li>' +
          '<li>Scrol omlaag en kies <strong>"Voeg toe aan beginscherm"</strong></li>' +
          '<li>Tik op <strong>Voeg toe</strong> rechtsboven</li>' +
        '</ol>' +
        '<button type="button" style="width:100%;padding:11px;background:#c89b3c;color:#1e1a0f;' +
          'border:0;border-radius:10px;font-weight:600;cursor:pointer" data-testid="install-ios-close">Begrepen</button>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) try { ov.remove(); } catch (_) {} });
    ov.querySelector('[data-testid="install-ios-close"]').addEventListener('click', function () {
      try { ov.remove(); } catch (_) {}
    });
  }

  function triggerInstall() {
    if (isIOS()) { showIOSInstructions(); return; }
    if (_deferred && typeof _deferred.prompt === 'function') {
      try {
        _deferred.prompt();
        _deferred.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') {
            if (window.PP_InstallManager && PP_InstallManager.markInstalled) {
              PP_InstallManager.markInstalled();
            }
          }
        }).catch(function () {});
      } catch (e) {}
      _deferred = null;
    } else {
      // Geen deferred event beschikbaar → handleiding tonen
      showFallbackInstructions();
    }
  }

  function showFallbackInstructions() {
    var ua = navigator.userAgent || '';
    var msg;
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) {
      msg = 'Open het Chrome menu (⋮) → kies "Installeer Doubleyou" of "App installeren".';
    } else if (/Edg/i.test(ua)) {
      msg = 'Open het Edge menu (⋯) → Apps → "Deze site installeren als app".';
    } else if (/Firefox/i.test(ua)) {
      msg = 'Firefox ondersteunt installatie momenteel beperkt. Probeer Chrome of Edge voor de beste ervaring.';
    } else {
      msg = 'Open het browsermenu en kies "Toevoegen aan startscherm" of "App installeren".';
    }
    try { window.alert(msg); } catch (e) {}
  }

  // ───────── INJECTIE in profiel-menu ─────────
  function injecteerKnop() {
    try {
      var main = document.getElementById('dy-main');
      if (!main) return;
      // Inject ALLEEN op profielpagina (.dy-profiel-acties is enkel daar aanwezig).
      // We checken zowel DY.pagina als de DOM zodat re-renders/race-conditions
      // niet voor stuck-state zorgen.
      var acties = main.querySelector('.dy-profiel-acties');
      if (!acties) return;
      if (main.querySelector('#pp-install-manual-btn')) return;
      // Skip ALLEEN als app gegarandeerd geïnstalleerd is via display-mode.
      // localStorage-flag NIET vertrouwen want kan stale zijn.
      try {
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if (window.matchMedia('(display-mode: minimal-ui)').matches) return;
        if (window.matchMedia('(display-mode: fullscreen)').matches) return;
      } catch (e) {}
      if (window.navigator && window.navigator.standalone === true) return;

      var knop = document.createElement('button');
      knop.id = 'pp-install-manual-btn';
      knop.className = 'dy-btn dy-btn-ghost';
      knop.style.cssText = 'justify-content:flex-start;gap:8px;width:100%';
      knop.setAttribute('data-testid', 'install-app-btn');
      var label = isIOS() ? 'Voeg toe aan beginscherm' : 'Installeer Doubleyou app';
      knop.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
          '<polyline points="7 10 12 15 17 10"/>' +
          '<line x1="12" y1="15" x2="12" y2="3"/>' +
        '</svg>' + esc(label);
      knop.onclick = function () { triggerInstall(); };
      // Plaats bovenaan acties
      acties.insertBefore(knop, acties.firstChild);
    } catch (e) {}
  }

  function init() {
    var obs = new MutationObserver(injecteerKnop);
    obs.observe(document.body, { childList: true, subtree: true });
    injecteerKnop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  window.PP_InstallButton = {
    trigger:     triggerInstall,
    hasDeferred: function () { return !!_deferred; },
    VERSION:     '1.0.0'
  };
})();
