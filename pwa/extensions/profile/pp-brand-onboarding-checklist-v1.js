/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand Onboarding Checklist (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additive widget. Injecteert een korte progress-strip in
 * het brand_dashboard zonder de bestaande render-logica te wijzigen.
 *
 * 4 stappen (volgorde):
 *   1. Profiel        → brand.logo && brand.omschrijving aanwezig
 *   2. Producten      → minstens 1 doc in brand_products waar brandId == uid
 *   3. Eerste campagne → minstens 1 doc in campaigns waar brandId == uid
 *   4. Wallet opgeladen → users/{uid}.wallet_balance > 0
 *
 * Werking:
 *   - MutationObserver kijkt naar dy-main wijzigingen.
 *   - Bij detectie van een brand_dashboard render (DY.pagina === 'brand_dashboard')
 *     wordt de widget eenmaal geïnjecteerd tussen header en stat-grid.
 *   - Klik op een open stap → navigeert naar de juiste sub-pagina.
 *   - Klik op een afgeronde stap = no-op (visueel ✓).
 *
 * Geen overrides, geen route-mutaties. Pure DOM-injectie + Firestore reads.
 *
 * Debug:
 *   - window.__ppOnboardingChecklist (laatste state)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandOnboardingChecklistInit) return;
  window.__ppBrandOnboardingChecklistInit = true;

  var TAG = '[brand-onboarding-checklist]';
  var INJECTED_FLAG = 'data-pp-onboarding-injected';
  var WIDGET_TESTID = 'brand-dash-onboarding';

  // ────────── HELPERS ──────────
  function uid() { return (window.DY && window.DY.user && window.DY.user.uid) || null; }
  function db()  { return (window.firebase && window.firebase.firestore) ? window.firebase.firestore() : null; }
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function isBrandDashboard() {
    return !!(window.DY && window.DY.pagina === 'brand_dashboard');
  }

  // ────────── STATE-CHECKS ──────────
  async function evaluateSteps() {
    var u = uid();
    var d = db();
    var state = {
      profiel:   false,
      producten: false,
      campagne:  false,
      wallet:    false
    };
    if (!u || !d) return state;

    var brandPromise = d.collection('brands').doc(u).get()
      .then(function (snap) {
        if (!snap.exists) return;
        var b = snap.data() || {};
        // Profiel compleet = logo aanwezig EN korte omschrijving ingevuld.
        // (naam/contact/website/categorie zijn al verplicht bij registratie.)
        if (b.logo && b.omschrijving && String(b.omschrijving).trim().length > 0) {
          state.profiel = true;
        }
      }).catch(function () {});

    var productsPromise = d.collection('brand_products')
      .where('brandId', '==', u).limit(1).get()
      .then(function (snap) { state.producten = !snap.empty; })
      .catch(function () {});

    var campaignsPromise = d.collection('campaigns')
      .where('brandId', '==', u).limit(1).get()
      .then(function (snap) { state.campagne = !snap.empty; })
      .catch(function () {});

    var walletPromise = d.collection('users').doc(u).get()
      .then(function (snap) {
        if (!snap.exists) return;
        var bal = Number((snap.data() || {}).wallet_balance || 0);
        state.wallet = bal > 0;
      }).catch(function () {});

    await Promise.all([brandPromise, productsPromise, campaignsPromise, walletPromise]);
    return state;
  }

  // ────────── RENDER ──────────
  function buildWidget(state) {
    var steps = [
      { key: 'profiel',   label: 'Profiel',         hint: 'Logo & omschrijving',  route: function () { window.DY.navigeer('brand_profiel'); } },
      { key: 'producten', label: 'Producten',       hint: 'Voeg je eerste toe',   route: function () { window.DY.navigeer('brand_producten'); } },
      { key: 'campagne',  label: 'Eerste campagne', hint: 'Plan & start',         route: function () { window.DY.navigeer('brand_campagnes'); } },
      { key: 'wallet',    label: 'Wallet opgeladen', hint: '€25 / €50 / €100 / €250', route: function () {
        // v1.1.0 (2026-02-23): Gebruik PP_Wallet.openWallet() direct-render
        // bypass (v60.1.159). DY.navigeer('wallet') werd geabsorbeerd door
        // brand-portal _renderLock guard waardoor user stale B2C-state zag.
        try {
          if (window.PP_Wallet && typeof PP_Wallet.openWallet === 'function') {
            PP_Wallet.openWallet();
            return;
          }
        } catch (_) {}
        try { if (window.DY && DY.brandPortal) DY.brandPortal._renderLock = false; } catch (_) {}
        if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('wallet');
      } }
    ];
    var doneCount = steps.filter(function (s) { return !!state[s.key]; }).length;
    var pct = Math.round((doneCount / steps.length) * 100);
    var allDone = doneCount === steps.length;

    var container = document.createElement('div');
    container.className = 'pp-onboarding-card';
    container.setAttribute('data-testid', WIDGET_TESTID);
    container.setAttribute(INJECTED_FLAG, '1');

    var titel = allDone
      ? 'Onboarding compleet — je bent klaar om te schalen.'
      : 'Maak je merkprofiel compleet';
    var sub = allDone
      ? 'Alle stappen afgerond. Je kunt nu volop campagnes draaien.'
      : doneCount + ' van ' + steps.length + ' stappen voltooid.';

    var html =
      '<div class="pp-onboarding-head">' +
        '<div class="pp-onboarding-head-text">' +
          '<span class="pp-onboarding-eyebrow">Onboarding</span>' +
          '<h3 class="pp-onboarding-titel">' + esc(titel) + '</h3>' +
          '<p class="pp-onboarding-sub">' + esc(sub) + '</p>' +
        '</div>' +
        '<div class="pp-onboarding-progress" aria-label="' + pct + '% voltooid" data-testid="onb-progress">' +
          '<svg viewBox="0 0 36 36" width="56" height="56">' +
            '<path class="pp-onboarding-track" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31z" />' +
            '<path class="pp-onboarding-bar" stroke-dasharray="' + (pct * 0.974) + ',97.4" d="M18 2.5a15.5 15.5 0 1 1 0 31 15.5 15.5 0 0 1 0-31z" />' +
          '</svg>' +
          '<span class="pp-onboarding-pct">' + pct + '%</span>' +
        '</div>' +
      '</div>' +
      '<ol class="pp-onboarding-steps">' +
        steps.map(function (s) {
          var done = !!state[s.key];
          return (
            '<li class="pp-onboarding-step ' + (done ? 'done' : 'open') + '" data-step="' + s.key + '" data-testid="onb-step-' + s.key + '">' +
              '<button type="button" class="pp-onboarding-step-btn" ' +
                (done ? 'aria-label="' + esc(s.label) + ' voltooid"' : 'data-testid="onb-go-' + s.key + '"') + '>' +
                '<span class="pp-onboarding-mark">' + (done ? '✓' : '○') + '</span>' +
                '<span class="pp-onboarding-step-text">' +
                  '<strong>' + esc(s.label) + '</strong>' +
                  '<span class="pp-onboarding-step-hint">' + esc(s.hint) + '</span>' +
                '</span>' +
                (done ? '' : '<span class="pp-onboarding-arrow">→</span>') +
              '</button>' +
            '</li>'
          );
        }).join('') +
      '</ol>';

    container.innerHTML = html;

    // Wire click handlers (alleen voor open stappen)
    steps.forEach(function (s) {
      if (state[s.key]) return;
      var btn = container.querySelector('[data-step="' + s.key + '"] .pp-onboarding-step-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          try { s.route(); } catch (e) {
            try { console.warn(TAG, 'route-failed', s.key, e); } catch (_) {}
          }
        });
      }
    });

    return container;
  }

  // ────────── INJECTION ──────────
  function injectIfNeeded() {
    if (!isBrandDashboard()) return;
    var main = document.getElementById('dy-main');
    if (!main) return;
    var page = main.querySelector('.bp-page');
    if (!page) return;
    if (page.querySelector('[' + INJECTED_FLAG + ']')) return; // al geïnjecteerd
    var statGrid = page.querySelector('.bp-stat-grid');
    if (!statGrid) return; // wacht tot stat-grid gerenderd is

    // Toon eerst een placeholder (skeleton) → wissel daarna in met data
    var placeholder = document.createElement('div');
    placeholder.className = 'pp-onboarding-card pp-onboarding-skeleton';
    placeholder.setAttribute('data-testid', WIDGET_TESTID + '-loading');
    placeholder.setAttribute(INJECTED_FLAG, 'pending');
    placeholder.innerHTML =
      '<div class="pp-onboarding-head">' +
        '<div class="pp-onboarding-head-text">' +
          '<span class="pp-onboarding-eyebrow">Onboarding</span>' +
          '<h3 class="pp-onboarding-titel">Voortgang laden…</h3>' +
        '</div>' +
      '</div>';
    statGrid.parentNode.insertBefore(placeholder, statGrid);

    evaluateSteps().then(function (state) {
      window.__ppOnboardingChecklist = state;
      try {
        var widget = buildWidget(state);
        if (placeholder.parentNode) {
          placeholder.parentNode.replaceChild(widget, placeholder);
        }
      } catch (e) {
        try { console.warn(TAG, 'render-failed', e); } catch (_) {}
        // Veiligheidsval: verwijder placeholder als render faalt
        if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      }
    }).catch(function (e) {
      try { console.warn(TAG, 'evaluate-failed', e); } catch (_) {}
      if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
    });
  }

  // ────────── INIT ──────────
  function init() {
    var obs = new MutationObserver(function () {
      try { injectIfNeeded(); } catch (e) {}
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectIfNeeded, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandOnboarding = {
    VERSION: '1.1.0',
    evaluate: evaluateSteps,
    refresh: function () {
      // Force re-render door bestaande widget te verwijderen
      try {
        var el = document.querySelector('[' + INJECTED_FLAG + ']');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        injectIfNeeded();
      } catch (_) {}
    }
  };
})();
