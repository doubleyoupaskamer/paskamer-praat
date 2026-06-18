/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Pakket Activatie (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Auto-credit flow voor B2B campagne-pakketten:
 *
 *   1. Op merken_pakketten pagina: bij click "Aanmelden als merk" wordt
 *      het gekozen pakket persistent opgeslagen in users/{uid}.pending_pkg_selection
 *      (overleeft sessions, in tegenstelling tot localStorage).
 *
 *   2. Op brand_dashboard (na admin-approval): banner detecteert pending
 *      selectie en toont "Activeer je pakket" CTA met pakket-naam + €.
 *
 *   3. Klik → Firestore atomic increment van wallet_balance + clear
 *      pending_pkg_selection + log naar admin_logs als "brand_pkg_activated".
 *      Toont succes-toast en herlaadt dashboard.
 *
 * NIETS gewijzigd aan brand-portal core, brand-approval flow of bestaande
 * wallet-betaalflow.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_BrandPkgActivate) return;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function fv() { return window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue : null; }
  function uid() { var u = window.firebase && firebase.auth && firebase.auth().currentUser; return u ? u.uid : null; }
  function toast(msg, err) { try { window.DY && DY.toast && DY.toast(msg, !!err); } catch (e) {} }

  // ────── 1. PERSIST pakket-keuze in Firestore bij CTA-klik ──────
  function hookPakketCTAs() {
    try {
      if (!window.DY || DY.pagina !== 'merken_pakketten') return;
      var cards = document.querySelectorAll('article.pp-b2c-pkg-card');
      cards.forEach(function (card) {
        if (card.dataset._pp_brand_hooked) return;
        var cta = card.querySelector('button.pp-b2c-pkg-cta, [data-testid^="merk-pkg-cta-"]');
        if (!cta) return;
        var titel = card.querySelector('.pp-b2c-pkg-naam');
        var prijs = card.querySelector('.pp-b2c-pkg-prijs');
        var id = (card.getAttribute('data-testid') || '').replace(/^merk-pkg-/, '');
        var name = titel ? titel.textContent.trim() : '';
        var amount = prijs ? Number((prijs.textContent || '').replace(/[^0-9.]/g, '')) || 0 : 0;
        cta.addEventListener('click', function () {
          var u = uid();
          if (!u || !amount) return;
          try {
            db().collection('users').doc(u).set({
              pending_pkg_selection: { id: id, name: name, amount: amount },
              pending_pkg_selection_at: fv() ? fv().serverTimestamp() : new Date().toISOString()
            }, { merge: true });
          } catch (e) {}
        }, true);
        card.dataset._pp_brand_hooked = '1';
      });
    } catch (e) {}
  }

  // ────── 2. ACTIVATIE banner op brand_dashboard ──────
  async function checkAndShowBanner() {
    try {
      if (!window.DY || DY.pagina !== 'brand_dashboard') return;
      var u = uid();
      if (!u) return;
      var main = document.getElementById('dy-main');
      if (!main) return;
      if (main.querySelector('[data-testid="brand-pkg-activate-banner"]')) return;

      var snap = await db().collection('users').doc(u).get();
      var data = snap.exists ? (snap.data() || {}) : {};
      var pending = data.pending_pkg_selection;
      if (!pending || !pending.amount) return;
      // Skip als al geactiveerd in laatste 24h (idempotentie-safety)
      if (data.pkg_activated_at && (Date.now() - new Date(data.pkg_activated_at).getTime() < 86400000)) return;

      var banner = document.createElement('div');
      banner.setAttribute('data-testid', 'brand-pkg-activate-banner');
      banner.style.cssText =
        'margin:14px 0;padding:16px;background:linear-gradient(135deg,rgba(212,145,10,0.15),rgba(212,145,10,0.05));' +
        'border:1px solid rgba(212,145,10,0.45);border-radius:12px;' +
        'display:flex;align-items:center;gap:14px;flex-wrap:wrap';
      banner.innerHTML =
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#d4910a;font-weight:700;margin-bottom:4px">🎉 Welkom bij Doubleyou</div>' +
          '<div style="font-weight:600;font-size:16px;margin-bottom:2px">Activeer je ' + esc(pending.name) + '</div>' +
          '<div style="font-size:13px;opacity:0.8">Klik om € ' + Number(pending.amount).toFixed(0) + ' campagne-saldo toe te voegen aan je wallet en direct te starten.</div>' +
        '</div>' +
        '<button type="button" class="bp-btn bp-btn-primair" data-testid="brand-pkg-activate-btn" style="flex-shrink:0;min-width:160px">Activeer pakket</button>';
      var content = main.querySelector('.bp-page') || main;
      if (content.firstChild) content.insertBefore(banner, content.firstChild);
      else content.appendChild(banner);

      banner.querySelector('[data-testid="brand-pkg-activate-btn"]').onclick = async function () {
        await activatePkg(pending, banner);
      };
    } catch (e) {}
  }

  async function activatePkg(pkg, bannerEl) {
    try {
      var u = uid();
      if (!u || !pkg || !pkg.amount) return;
      // Disable knop tijdens activatie
      var btn = bannerEl && bannerEl.querySelector('[data-testid="brand-pkg-activate-btn"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Bezig...'; }

      // Atomic credit + clear pending + log activatie-timestamp
      var inc = fv() ? fv().increment(pkg.amount) : pkg.amount;
      await db().collection('users').doc(u).set({
        wallet_balance:        inc,
        wallet_currency:       'EUR',
        wallet_last_updated:   new Date().toISOString(),
        pending_pkg_selection: null,
        pkg_activated_at:      new Date().toISOString(),
        pkg_activated_name:    pkg.name,
        pkg_activated_amount:  pkg.amount
      }, { merge: true });

      // Audit log
      try {
        await db().collection('admin_logs').add({
          adminId:    'system',
          adminEmail: 'auto-activate',
          action:     'brand_pkg_activated',
          target:     u,
          oldValue:   null,
          newValue:   pkg,
          timestamp:  fv() ? fv().serverTimestamp() : new Date().toISOString()
        });
      } catch (e) {}

      // Payment audit-record voor consistentie met andere wallet-flows
      try {
        await db().collection('payments').add({
          uid:                u,
          type:               'pkg_activate',
          wallet_type:        'b2b',
          amount_cents:       Math.round(pkg.amount * 100),
          currency:           'EUR',
          status:             'completed',
          source:             'brand_pkg_activate',
          shopify_order_id:   null,
          created_at:         fv() ? fv().serverTimestamp() : new Date().toISOString(),
          updated_at:         fv() ? fv().serverTimestamp() : new Date().toISOString(),
          activated_pkg:      pkg
        });
      } catch (e) {}

      toast('🎉 € ' + Number(pkg.amount).toFixed(0) + ' campagne-saldo geactiveerd!');
      try { bannerEl.remove(); } catch (_) {}
      // Forceer dashboard re-render
      setTimeout(function () {
        if (window.DY && DY.navigeer) DY.navigeer('brand_dashboard');
      }, 600);
    } catch (e) {
      toast('Activatie mislukt: ' + (e.message || e), true);
    }
  }

  function init() {
    var obs = new MutationObserver(function () {
      hookPakketCTAs();
      checkAndShowBanner();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { hookPakketCTAs(); checkAndShowBanner(); }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  window.PP_BrandPkgActivate = {
    checkAndShowBanner: checkAndShowBanner,
    activatePkg:        activatePkg,
    VERSION:            '1.0.0'
  };
})();
