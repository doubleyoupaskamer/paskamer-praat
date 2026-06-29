/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Wallet Isolation Guard (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING wrapper. Maakt de scheiding tussen Merken (B2B) en Klant
 * (B2C) wallet/topup flows EXPLICIET en HARD afdwingbaar zonder bestaande
 * code te wijzigen.
 *
 * Regels:
 *   • Merken wallet (PP_Wallet, route 'wallet'):
 *       Toegestane topup-bedragen = {25, 50, 100, 250}
 *       Saldo-veld = users/{uid}.wallet_balance
 *       Source-tag voor coming-soon router = 'b2b'
 *
 *   • Klant wallet (PP_B2CWallet, route 'b2c_wallet'):
 *       Toegestane topup-bedragen = {5, 10, 15, 25, 50}
 *       Saldo-veld = users/{uid}.b2c_wallet_balance
 *       Source-tag = 'b2c'
 *
 * Wat dit script doet:
 *   1. Wrapt PP_Wallet.topup(amount) en gooit een toast + audit-warn bij
 *      een bedrag dat NIET in de B2B-set zit (voorkomt dat per ongeluk
 *      een €5 B2C-bedrag via de merken-checkout glipt).
 *   2. Wrapt PP_B2CWallet.topup(amount) analoog voor B2C.
 *   3. Wrapt PP_TopupComingSoon.show(ctx) zodat een ontbrekende ctx.source
 *      altijd een veilige default krijgt (op basis van huidige route).
 *   4. Publiceert window.__ppBrandWalletAudit voor diagnostics.
 *
 * Geen UI-rendering, geen route-overrides. Pure defensive guard.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandWalletIsolationInit) return;
  window.__ppBrandWalletIsolationInit = true;

  var TAG = '[brand-wallet-isolation]';
  var AUDIT_MAX = 50;
  window.__ppBrandWalletAudit = window.__ppBrandWalletAudit || [];

  var B2B_ALLOWED = { 25: 1, 50: 1, 100: 1, 250: 1 };
  var B2C_ALLOWED = { 5: 1, 10: 1, 15: 1, 25: 1, 50: 1 };

  function audit(entry) {
    try {
      entry.ts = new Date().toISOString();
      window.__ppBrandWalletAudit.push(entry);
      if (window.__ppBrandWalletAudit.length > AUDIT_MAX) {
        window.__ppBrandWalletAudit.splice(0, window.__ppBrandWalletAudit.length - AUDIT_MAX);
      }
    } catch (_) {}
  }

  function toast(msg, err) {
    try {
      if (window.DY && typeof window.DY.toast === 'function') {
        window.DY.toast(msg, !!err);
      }
    } catch (_) {}
  }

  function wrapB2B() {
    if (!window.PP_Wallet || typeof PP_Wallet.topup !== 'function') return false;
    if (PP_Wallet.__isolationWrapped) return true;
    var orig = PP_Wallet.topup;
    PP_Wallet.__isolationWrapped = true;
    PP_Wallet.__origTopup = orig;
    PP_Wallet.topup = function (amount) {
      var amt = Number(amount);
      if (!B2B_ALLOWED[amt]) {
        audit({
          wallet: 'b2b',
          decision: 'blocked:invalid-amount',
          amount: amt,
          reason: 'Merken-wallet accepteert alleen €25, €50, €100 of €250'
        });
        try { console.warn(TAG, 'B2B blocked invalid amount:', amt); } catch (_) {}
        toast('Ongeldig bedrag voor merken-wallet. Kies €25, €50, €100 of €250.', true);
        return;
      }
      audit({ wallet: 'b2b', decision: 'allow', amount: amt });
      return orig.call(PP_Wallet, amount);
    };
    return true;
  }

  function wrapB2C() {
    if (!window.PP_B2CWallet || typeof PP_B2CWallet.topup !== 'function') return false;
    if (PP_B2CWallet.__isolationWrapped) return true;
    var orig = PP_B2CWallet.topup;
    PP_B2CWallet.__isolationWrapped = true;
    PP_B2CWallet.__origTopup = orig;
    PP_B2CWallet.topup = function (amount) {
      var amt = Number(amount);
      if (!B2C_ALLOWED[amt]) {
        audit({
          wallet: 'b2c',
          decision: 'blocked:invalid-amount',
          amount: amt,
          reason: 'Klant-wallet accepteert alleen €5, €10, €15, €25 of €50'
        });
        try { console.warn(TAG, 'B2C blocked invalid amount:', amt); } catch (_) {}
        toast('Ongeldig bedrag voor klant-wallet. Kies €5, €10, €15, €25 of €50.', true);
        return;
      }
      audit({ wallet: 'b2c', decision: 'allow', amount: amt });
      return orig.call(PP_B2CWallet, amount);
    };
    return true;
  }

  function wrapComingSoon() {
    // Zorgt dat ctx.source altijd ingevuld is. Voorkomt route-mismatch in
    // pp-topup-modal-router (waar source bepaalt of premium-gate geldt).
    if (!window.PP_TopupComingSoon || typeof PP_TopupComingSoon.show !== 'function') return false;
    if (PP_TopupComingSoon.__isolationWrapped) return true;
    var orig = PP_TopupComingSoon.show;
    PP_TopupComingSoon.__isolationWrapped = true;
    PP_TopupComingSoon.show = function (ctx) {
      ctx = ctx || {};
      if (!ctx.source) {
        // Bepaal source op basis van huidige route
        try {
          var pagina = (window.DY && window.DY.pagina) || '';
          if (pagina === 'wallet' || /^brand_/.test(pagina)) {
            ctx.source = 'b2b';
          } else {
            ctx.source = 'b2c';
          }
        } catch (_) { ctx.source = 'b2c'; }
        audit({ event: 'source-defaulted', source: ctx.source, pagina: (window.DY && window.DY.pagina) || '' });
      }
      return orig.call(PP_TopupComingSoon, ctx);
    };
    return true;
  }

  function init() {
    var b2b = wrapB2B();
    var b2c = wrapB2C();
    var cs  = wrapComingSoon();
    if (b2b && b2c && cs) return;
    // Polling: wallet modules kunnen later geladen worden via defer
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var done =
        (PP_Wallet ? wrapB2B() : false) &&
        (PP_B2CWallet ? wrapB2C() : false) &&
        (PP_TopupComingSoon ? wrapComingSoon() : false);
      if (done || tries > 40) clearInterval(iv);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }

  window.PP_BrandWalletIsolation = {
    VERSION: '1.0.0',
    audit: function () { return (window.__ppBrandWalletAudit || []).slice(); },
    clearAudit: function () { window.__ppBrandWalletAudit = []; },
    B2B_ALLOWED: B2B_ALLOWED,
    B2C_ALLOWED: B2C_ALLOWED
  };
})();
