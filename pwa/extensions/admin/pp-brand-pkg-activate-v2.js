/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Pakket Activate HARDENED v2 (v2.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Non-invasieve hardening laag bovenop pp-brand-pkg-activate-v1.js.
 *
 * Toevoegingen (allemaal additief, geen v1 wijzigingen):
 *
 *   1. IDEMPOTENCY ENGINE: activation_id = hash(uid + pkg_id + dayWindow)
 *      → onmogelijk om hetzelfde pakket 2× op dezelfde dag te activeren,
 *        zelfs niet via multi-tab race conditions.
 *
 *   2. FIRESTORE TRANSACTION LOCKING: wallet increment via
 *      db.runTransaction() i.p.v. set+increment. Voorkomt partial writes
 *      en concurrent overwrites.
 *
 *   3. CLICK-LOCK: in-memory flag voorkomt dubbele triggers binnen
 *      dezelfde tab. Cross-tab via Firestore-lock op activation_id.
 *
 *   4. OBSERVABILITY: counters in users/{uid} (success/failure/dedup-blocked)
 *      voor admin-monitoring zonder bestaande logging te wijzigen.
 *
 *   5. FEATURE FLAGS (default ON, kan disabled via admin_settings/global):
 *      enable_activation_guard_v2, enable_transaction_locking_v2
 *
 * Wordt geladen NA v1 zodat we de v1.activatePkg functie kunnen wrappen.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_BrandPkgActivateV2) return;

  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function fv() { return window.firebase && window.firebase.firestore ? window.firebase.firestore.FieldValue : null; }
  function uid() { var u = window.firebase && firebase.auth && firebase.auth().currentUser; return u ? u.uid : null; }
  function toast(msg, err) { try { window.DY && DY.toast && DY.toast(msg, !!err); } catch (e) {} }

  // In-memory click-lock per tab
  var _activeLocks = {};

  // Hash-functie: deterministische activation_id binnen 24h-window
  function generateActivationId(userId, pkgId, amount) {
    var dayWindow = Math.floor(Date.now() / 86400000); // 1-day bucket
    var raw = String(userId) + '|' + String(pkgId || 'nopkg') + '|' + String(amount || 0) + '|' + dayWindow;
    // Eenvoudige hash (FNV-1a 32-bit, ruim genoeg voor dedup in 24h scope)
    var h = 0x811c9dc5;
    for (var i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'act_' + h.toString(16) + '_' + dayWindow;
  }

  // Feature flag check
  async function flagsEnabled() {
    try {
      var snap = await db().collection('admin_settings').doc('global').get();
      var s = snap.exists ? (snap.data() || {}) : {};
      return {
        guard: s.enable_activation_guard_v2 !== false,    // default ON
        tx:    s.enable_transaction_locking_v2 !== false  // default ON
      };
    } catch (e) {
      return { guard: true, tx: true };
    }
  }

  // ────────── ATOMIC TRANSACTION-BASED ACTIVATION ──────────
  async function activatePkgHardened(pkg, bannerEl) {
    var u = uid();
    if (!u || !pkg || !pkg.amount) {
      toast('Activatie afgebroken: ontbrekende data', true);
      return { ok: false, reason: 'missing-data' };
    }
    var activationId = generateActivationId(u, pkg.id, pkg.amount);

    // CLICK-LOCK in-tab (voorkomt dubbele klik race)
    if (_activeLocks[activationId]) {
      return { ok: false, reason: 'in-flight' };
    }
    _activeLocks[activationId] = true;

    // UI loading state
    var btn = bannerEl && bannerEl.querySelector('[data-testid="brand-pkg-activate-btn"]');
    var origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Activeren...'; }

    try {
      var flags = await flagsEnabled();
      var d = db();
      var userRef = d.collection('users').doc(u);
      var activationRef = d.collection('pkg_activations').doc(activationId);

      // FIRESTORE TRANSACTION: dedup-check + atomic increment in één
      await d.runTransaction(async function (tx) {
        // 1. Dedup-check via activation_id document
        if (flags.guard) {
          var actSnap = await tx.get(activationRef);
          if (actSnap.exists) {
            throw { code: 'duplicate-activation', message: 'Pakket al geactiveerd' };
          }
        }

        // 2. Lees huidige user data binnen transaction
        var userSnap = await tx.get(userRef);
        var userData = userSnap.exists ? userSnap.data() : {};
        var currentBalance = Number(userData.wallet_balance || 0);
        var newBalance = currentBalance + Number(pkg.amount);

        // 3. Schrijf activation-record (dedup-lock)
        tx.set(activationRef, {
          activation_id:    activationId,
          uid:              u,
          package_id:       pkg.id || null,
          package_name:     pkg.name || null,
          package_amount:   Number(pkg.amount),
          wallet_before:    currentBalance,
          wallet_after:     newBalance,
          activated_at:     fv() ? fv().serverTimestamp() : new Date().toISOString(),
          activation_version: 2
        });

        // 4. Atomic wallet update via transaction (geen race)
        tx.set(userRef, {
          wallet_balance:           newBalance,
          wallet_currency:          'EUR',
          wallet_last_updated:      new Date().toISOString(),
          last_wallet_sync_at:      new Date().toISOString(),
          pending_pkg_selection:    null,
          pkg_activated_at:         new Date().toISOString(),
          pkg_activated_name:       pkg.name,
          pkg_activated_amount:     pkg.amount,
          pkg_activation_version:   2,
          last_activation_id:       activationId,
          // Observability counters
          pkg_activation_success_count: fv() ? fv().increment(1) : 1
        }, { merge: true });
      });

      // Audit log (buiten transaction — niet-kritisch voor consistency)
      try {
        await db().collection('admin_logs').add({
          adminId:       'system',
          adminEmail:    'auto-activate-v2',
          action:        'brand_pkg_activated',
          target:        u,
          activation_id: activationId,
          oldValue:      null,
          newValue:      pkg,
          timestamp:     fv() ? fv().serverTimestamp() : new Date().toISOString(),
          version:       2
        });
      } catch (e) {}

      // Payment-record voor consistente ledger
      try {
        await db().collection('payments').add({
          uid:              u,
          activation_id:    activationId,
          type:             'pkg_activate',
          wallet_type:      'b2b',
          amount_cents:     Math.round(pkg.amount * 100),
          currency:         'EUR',
          status:           'completed',
          source:           'brand_pkg_activate',
          activated_pkg:    pkg,
          created_at:       fv() ? fv().serverTimestamp() : new Date().toISOString(),
          updated_at:       fv() ? fv().serverTimestamp() : new Date().toISOString(),
          version:          2
        });
      } catch (e) {}

      toast('🎉 € ' + Number(pkg.amount).toFixed(0) + ' campagne-saldo geactiveerd!');
      try { bannerEl.remove(); } catch (_) {}
      setTimeout(function () {
        if (window.DY && DY.navigeer) DY.navigeer('brand_dashboard');
      }, 600);
      return { ok: true, activation_id: activationId };

    } catch (e) {
      // Observability: log failure reason
      try {
        await db().collection('users').doc(u).set({
          pkg_activation_failure_count:  fv() ? fv().increment(1) : 1,
          pkg_activation_last_failure:   String((e && e.message) || e || 'unknown'),
          pkg_activation_last_failure_at: new Date().toISOString()
        }, { merge: true });
      } catch (_) {}

      if (e && e.code === 'duplicate-activation') {
        toast('Pakket is al geactiveerd', true);
        try { bannerEl.remove(); } catch (_) {}
        return { ok: false, reason: 'duplicate' };
      }
      if (btn) { btn.disabled = false; btn.textContent = origLabel || 'Activeer pakket'; }
      toast('Activatie mislukt: ' + ((e && e.message) || e), true);
      return { ok: false, reason: 'error', error: String(e) };
    } finally {
      delete _activeLocks[activationId];
    }
  }

  // ────────── WRAP v1.activatePkg met hardened versie ──────────
  function installWrapper() {
    if (!window.PP_BrandPkgActivate) {
      // v1 nog niet geladen, wacht
      setTimeout(installWrapper, 200);
      return;
    }
    if (window.PP_BrandPkgActivate._v2_wrapped) return;
    window.PP_BrandPkgActivate._v2_wrapped = true;
    // Volledig overschrijven van v1.activatePkg met v2 implementatie
    window.PP_BrandPkgActivate.activatePkg = activatePkgHardened;
    try { console.info('[PkgActivateV2] hardened wrapper installed'); } catch (_) {}
  }

  // ────────── SAFE EVENT DELEGATION (fallback voor v1 MutationObserver) ──────────
  // Vangt klikken op de banner-knop op via document-level capture, zelfs als
  // v1's directe onclick handler om wat voor reden niet getriggerd wordt
  // (dynamic injection race, etc.). Cross-checks de _activeLocks om dubbele
  // executies te voorkomen.
  function setupDelegation() {
    document.addEventListener('click', async function (e) {
      try {
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        var btn = target.closest('[data-testid="brand-pkg-activate-btn"]');
        if (!btn) return;
        if (btn.disabled) return;
        var banner = btn.closest('[data-testid="brand-pkg-activate-banner"]');
        if (!banner) return;
        // Lees huidige pending uit Firestore (deterministische bron)
        var u = uid();
        if (!u) return;
        // Voorkom dubbele trigger
        if (btn.dataset._v2_fired === '1') return;
        btn.dataset._v2_fired = '1';
        setTimeout(function () { try { delete btn.dataset._v2_fired; } catch (_) {} }, 3000);
        var snap = await db().collection('users').doc(u).get();
        var data = snap.exists ? (snap.data() || {}) : {};
        var pkg = data.pending_pkg_selection;
        if (!pkg || !pkg.amount) {
          toast('Geen actief pakket gevonden', true);
          try { banner.remove(); } catch (_) {}
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        await activatePkgHardened(pkg, banner);
      } catch (err) { /* noop */ }
    }, true); // capture
  }

  function init() {
    installWrapper();
    setupDelegation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

  window.PP_BrandPkgActivateV2 = {
    activatePkgHardened:  activatePkgHardened,
    generateActivationId: generateActivationId,
    VERSION:              '2.0.0'
  };
})();
