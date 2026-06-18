/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Profile Nav Fix (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Reparatie voor stuck navigation buttons na herhaalde navigatie. Bekende
 * symptomen die hiermee worden opgelost:
 *
 *   - "Merkenportaal" klik werkt niet meer na 2e bezoek
 *   - "Mijn Wallet" klik werkt niet meer na 2e bezoek
 *   - "Voorwaarden" / "Privacybeleid" klik niet responsief na navigatie
 *   - Profile actie-knoppen worden inert na page-wissel
 *
 * Root causes die dit script veilig adresseert (zonder bestaande flows
 * te wijzigen):
 *
 *   1. `DY.navigeer` early-return guard wanneer pagina === DY.pagina
 *      faalt bij race-condities → user-clicks worden gemarkeerd zodat
 *      ze altijd doorgaan.
 *
 *   2. Brand-portal `_renderLock` blijft soms hangen → reset oude lock
 *      indien ouder dan 3 seconden.
 *
 *   3. Stale modal-overlays blokkeren clicks via pointer-events →
 *      cleanup van weesoverlays bij elke navigatie.
 *
 *   4. `_laatstGerenderd` cache voorkomt re-render → reset bij user-
 *      initiated nav naar dezelfde pagina.
 *
 * GEEN aanpassingen aan: routes, businesslogica, wallets, premium,
 * merkenportaal logica, of UI. Puur defensief.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window._pp_nav_fix_applied) return;
  window._pp_nav_fix_applied = true;

  var LOG_PREFIX = '[NavFix]';

  // ────────── 1. WACHT op DY.navigeer ──────────
  function waitForDY(cb, tries) {
    tries = tries || 0;
    if (window.DY && typeof window.DY.navigeer === 'function') return cb();
    if (tries > 80) return;
    setTimeout(function () { waitForDY(cb, tries + 1); }, 50);
  }

  // ────────── 2. STALE OVERLAY CLEANUP ──────────
  // Verwijder weesoverlays die pointer-events kunnen blokkeren bij
  // navigatie. Veilig: targets alleen onze eigen overlay-IDs.
  function cleanupStaleOverlays() {
    try {
      var overlayIds = ['pp-topup-cs-overlay'];
      overlayIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          try { el.remove(); } catch (_) {}
        }
      });
      // Reset eventueel stuck body overflow
      if (document.body.style.overflow === 'hidden') {
        // Alleen resetten als er geen actief modaal aanwezig is
        var anyModal = document.querySelector(
          '.dy-modal-overlay:not(.verborgen), [data-modal-active="true"], .pp-topup-cs-overlay'
        );
        if (!anyModal) document.body.style.overflow = '';
      }
    } catch (e) { /* noop */ }
  }

  // ────────── 3. RENDER-LOCK RESCUE ──────────
  // Brand-portal kan _renderLock stuck laten bij rendering-fouten.
  // Auto-release als de lock langer dan 3s actief is voor élke nav-call.
  function rescueRenderLock() {
    try {
      var BP = window.DY && window.DY.brandPortal;
      if (!BP) return;
      var nu = Date.now();
      if (BP._renderLock && (nu - (BP._renderLockAt || 0)) > 3000) {
        BP._renderLock = false;
        BP._renderLockAt = 0;
      }
      // Sticky deeplink heeft 5s TTL maar kan eerder gewist worden
      if (BP._deeplink && (nu - (BP._deeplinkAt || 0)) > 5000) {
        BP._deeplink = null;
        BP._deeplinkAt = 0;
      }
    } catch (e) { /* noop */ }
  }

  // ────────── 4. POINTER-EVENTS HEALER ──────────
  // Defensief: zorg dat .dy-profiel-acties knoppen altijd klikbaar zijn.
  function healPointerEvents() {
    try {
      var nodes = document.querySelectorAll('.dy-profiel-acties button, .dy-profiel-hero-acties button');
      nodes.forEach(function (el) {
        if (el.style.pointerEvents === 'none') el.style.pointerEvents = '';
        if (el.disabled && !el.hasAttribute('data-keep-disabled')) {
          el.disabled = false;
        }
      });
    } catch (e) { /* noop */ }
  }

  // ────────── 5. NAV-EVENT GLOBAL DELEGATOR (failsafe) ──────────
  // Voor het geval een onclick-listener kwijt is geraakt door een
  // re-render, vangen we klikken op profielknoppen op via event-
  // delegatie en sturen ze naar de juiste DY.navigeer route.
  function setupGlobalDelegator() {
    document.addEventListener('click', function (e) {
      try {
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        // Zoek dichtstbijzijnde profielknop met testid of id
        var btn = target.closest(
          '#bp-profiel-knop, #pp-b2c-wallet-knop, ' +
          '[data-testid="brand-portal-menu-btn"], ' +
          '[data-testid="b2c-wallet-menu-btn"]'
        );
        if (!btn) return;
        // Voor we doorgaan: cleanup stale state
        cleanupStaleOverlays();
        rescueRenderLock();
        // Markeer als user-intent → bypass early-return guards
        try {
          window.DY._userNavIntent = true;
          window.DY._forceRender = true;
        } catch (_) {}
        // Als de onclick listener is verdwenen, voer fallback uit
        // (we wachten 50ms; als knop dan nog niet heeft genavigeerd,
        //  zelf navigeren naar passende route)
        var prevPagina = (window.DY && window.DY.pagina) || null;
        setTimeout(function () {
          try {
            if (!window.DY) return;
            if (window.DY.pagina !== prevPagina) return; // navigatie is reeds gestart
            // Fallback navigatie op basis van knop-ID
            if (btn.id === 'bp-profiel-knop' && window.DY.brandPortal && window.DY.brandPortal.openPortaal) {
              window.DY.brandPortal.openPortaal();
            } else if (btn.id === 'pp-b2c-wallet-knop' && window.DY.navigeer) {
              window.DY.navigeer('b2c_wallet');
            }
          } catch (_) {}
        }, 60);
      } catch (err) { /* noop */ }
    }, true); // capture phase
  }

  // ────────── 6. NAVIGEER WRAPPER ──────────
  // Wrap DY.navigeer LAST zodat we de outermost layer zijn. Bij elke
  // call: cleanup stale state. Als de call voortkomt uit user-intent
  // én pagina === DY.pagina, reset DY.pagina/laatstGerenderd zodat
  // de early-return guard niet blokkeert.
  function wrapNavigeer() {
    var origNavigeer = window.DY.navigeer;
    window.DY.navigeer = function (pagina) {
      try {
        cleanupStaleOverlays();
        rescueRenderLock();
        healPointerEvents();

        // User-initiated navigatie naar zelfde pagina → force re-render
        var userIntent = !!window.DY._userNavIntent;
        if (userIntent && pagina && window.DY.pagina === pagina &&
            pagina !== 'feed' && pagina !== 'detail') {
          window.DY.pagina = null;
          window.DY._laatstGerenderd = null;
          window.DY._forceRender = true;
        }
        // Reset intent-vlag direct na gebruik
        window.DY._userNavIntent = false;
      } catch (e) { /* noop */ }
      return origNavigeer.apply(this, arguments);
    };
  }

  // ────────── INITIALISATIE ──────────
  waitForDY(function () {
    try {
      wrapNavigeer();
      setupGlobalDelegator();
      // Defensieve heal-cyclus elke 1500ms (zeer goedkoop)
      setInterval(function () {
        rescueRenderLock();
        healPointerEvents();
      }, 1500);
      try { console.info(LOG_PREFIX, 'v1.0.0 actief'); } catch (_) {}
    } catch (e) {
      try { console.warn(LOG_PREFIX, 'init faalde:', e); } catch (_) {}
    }
  });

  window.PP_NavFix = {
    cleanupStaleOverlays: cleanupStaleOverlays,
    rescueRenderLock:     rescueRenderLock,
    healPointerEvents:    healPointerEvents,
    VERSION: '1.0.0'
  };
})();
