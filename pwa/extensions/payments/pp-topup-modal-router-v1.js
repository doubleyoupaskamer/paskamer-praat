/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Topup Modal Router (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING WRAPPER rond `PP_TopupComingSoon.show(ctx)`.
 *
 * Probleem:
 *   Klik op "Saldo opwaarderen" (B2B/B2C) → toont generieke
 *   "Binnenkort beschikbaar" popup voor IEDEREEN (ook gasten / niet-premium).
 *   UX-flow verbroken, context verloren.
 *
 * Fix-strategie (additief, geen wijzigingen aan bestaande wallet-code):
 *   - Wrap `PP_TopupComingSoon.show(ctx)` zodat eerst auth/premium-state
 *     gecontroleerd wordt voordat de coming-soon popup verschijnt.
 *
 *   Routing:
 *     1) Niet ingelogd        → DY.toonLoginPrompt(reden)  (auth/signup sheet)
 *     2) Ingelogd, niet premium → PP_Premium.openUpgrade()  (upgrade modal)
 *     3) Premium              → originele PP_TopupComingSoon.show(ctx)
 *                                 (= huidige wallet top-up flow)
 *
 *   Failures vallen terug op de originele coming-soon popup (veiligste state).
 *   Geen page reloads, geen redirects, geen routing changes.
 *
 * Debug:
 *   - window.__ppTopupAudit (laatste 50 routings)
 *   - console.log met prefix [topup-router]
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppTopupRouterInit) return;
  window.__ppTopupRouterInit = true;

  var TAG = '[topup-router]';
  var AUDIT_MAX = 50;
  window.__ppTopupAudit = window.__ppTopupAudit || [];

  function audit(entry) {
    try {
      entry.ts = new Date().toISOString();
      window.__ppTopupAudit.push(entry);
      if (window.__ppTopupAudit.length > AUDIT_MAX) {
        window.__ppTopupAudit.splice(0, window.__ppTopupAudit.length - AUDIT_MAX);
      }
      try { console.log(TAG, entry.decision || 'event', entry); } catch (_) {}
    } catch (_) {}
  }

  function getAuthUser() {
    try {
      if (window.firebase && window.firebase.auth) {
        return window.firebase.auth().currentUser || null;
      }
    } catch (_) {}
    return null;
  }

  function reasonFor(ctx) {
    var src = (ctx && ctx.source) || '';
    if (src === 'b2b') {
      return 'Log in als merk om je merken-wallet op te waarderen.';
    }
    return 'Log in om je wallet op te waarderen en posts te boosten.';
  }

  function openAuthSheet(ctx) {
    try {
      if (window.DY && typeof DY.toonLoginPrompt === 'function') {
        DY.toonLoginPrompt(reasonFor(ctx));
        return true;
      }
    } catch (e) {
      try { console.warn(TAG, 'auth-modal-failed', e); } catch (_) {}
    }
    return false;
  }

  function openPremiumUpgrade() {
    try {
      if (window.PP_Premium && typeof PP_Premium.openUpgrade === 'function') {
        PP_Premium.openUpgrade();
        return true;
      }
      if (window.DY && window.DY.premium && typeof DY.premium.openUpgrade === 'function') {
        DY.premium.openUpgrade();
        return true;
      }
    } catch (e) {
      try { console.warn(TAG, 'premium-modal-failed', e); } catch (_) {}
    }
    return false;
  }

  function checkPremium() {
    // Async premium-check via bestaande API. Faalt veilig (false) bij offline.
    try {
      if (window.PP_Premium && typeof PP_Premium.status === 'function') {
        return PP_Premium.status().then(function (s) {
          return !!(s && s.is_premium);
        }).catch(function () { return false; });
      }
      if (window.DY && window.DY.premium && typeof DY.premium.status === 'function') {
        return DY.premium.status().then(function (s) {
          return !!(s && s.is_premium);
        }).catch(function () { return false; });
      }
    } catch (_) {}
    return Promise.resolve(false);
  }

  function isB2BBrandContext(ctx) {
    // B2B merken-wallet: bedrijfs/merk-account. Premium-tier geldt
    // hier niet (merken hebben hun eigen pakketten-flow), dus
    // alleen auth-check toepassen, geen premium-gate.
    var src = ctx && ctx.source;
    return src === 'b2b';
  }

  function ensureOriginalShow() {
    // Wacht tot de originele PP_TopupComingSoon.show beschikbaar is
    // voordat we wrappen. Tijdens defer-loading kan deze nog ontbreken.
    if (!window.PP_TopupComingSoon || typeof PP_TopupComingSoon.show !== 'function') {
      return false;
    }
    if (PP_TopupComingSoon.__routed) return true;

    var orig = PP_TopupComingSoon.show;
    PP_TopupComingSoon.__routed = true;
    PP_TopupComingSoon.__origShow = orig;

    PP_TopupComingSoon.show = function (ctx) {
      ctx = ctx || {};
      var src = ctx.source || 'unknown';

      // ── Stap 1: Auth-check ────────────────────────────────
      var user = getAuthUser();
      if (!user) {
        var openedAuth = openAuthSheet(ctx);
        audit({
          source: src,
          decision: openedAuth ? 'route:auth-modal' : 'fallback:original-coming-soon',
          reason: 'not_logged_in',
          ctx: { naam: ctx.naam, prijs: ctx.prijs }
        });
        if (openedAuth) return true;
        // Fallback: original popup (nooit een blank screen)
        return orig.call(PP_TopupComingSoon, ctx);
      }

      // ── Stap 2: B2B merken-wallet → geen premium-gate ─────
      if (isB2BBrandContext(ctx)) {
        audit({
          source: src,
          decision: 'route:original-coming-soon',
          reason: 'b2b_brand_authenticated',
          uid: user.uid,
          ctx: { naam: ctx.naam, prijs: ctx.prijs }
        });
        return orig.call(PP_TopupComingSoon, ctx);
      }

      // ── Stap 3: B2C → Premium-check ───────────────────────
      checkPremium().then(function (isPrem) {
        if (isPrem) {
          audit({
            source: src,
            decision: 'route:original-coming-soon',
            reason: 'b2c_premium_user',
            uid: user.uid,
            ctx: { naam: ctx.naam, prijs: ctx.prijs }
          });
          orig.call(PP_TopupComingSoon, ctx);
          return;
        }
        var openedPremium = openPremiumUpgrade();
        audit({
          source: src,
          decision: openedPremium ? 'route:premium-upgrade-modal' : 'fallback:original-coming-soon',
          reason: 'b2c_not_premium',
          uid: user.uid,
          ctx: { naam: ctx.naam, prijs: ctx.prijs }
        });
        if (!openedPremium) {
          // Veilige fallback: original popup
          orig.call(PP_TopupComingSoon, ctx);
        }
      }).catch(function (e) {
        // Onverwachte fout → veiligste state: original popup
        audit({
          source: src,
          decision: 'fallback:original-coming-soon',
          reason: 'premium_check_error',
          error: (e && (e.message || e.code)) || String(e),
          ctx: { naam: ctx.naam, prijs: ctx.prijs }
        });
        try { orig.call(PP_TopupComingSoon, ctx); } catch (_) {}
      });

      return true;
    };

    try { console.log(TAG, 'wrapped PP_TopupComingSoon.show'); } catch (_) {}
    return true;
  }

  // ── Wacht tot defer-scripts geladen zijn ─────────────────────────
  function init() {
    if (ensureOriginalShow()) return;
    // Polling fallback: PP_TopupComingSoon kan iets later beschikbaar zijn
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (ensureOriginalShow() || tries > 40) clearInterval(iv);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public diagnostic API ────────────────────────────────────────
  window.PP_TopupRouter = {
    VERSION: '1.0.0',
    audit: function () { return (window.__ppTopupAudit || []).slice(); },
    clearAudit: function () { window.__ppTopupAudit = []; },
    isWrapped: function () {
      return !!(window.PP_TopupComingSoon && PP_TopupComingSoon.__routed);
    }
  };
})();
