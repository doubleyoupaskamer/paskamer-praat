/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Brand "Voltooid binnen 7 dagen" Badge (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * NON-BREAKING additieve module. Toekent en toont een achievement-badge
 * op het merkprofiel zodra alle 4 onboarding-stappen ✓ zijn binnen 7
 * dagen na registratie (brand.aangemaakt).
 *
 * Data model (nieuw veld, merge-write):
 *   brands/{uid}.onboarding_badge_7d = {
 *     awarded:    true,
 *     awarded_at: serverTimestamp,
 *     days_taken: number   // dagen tussen aangemaakt en awarded_at
 *   }
 *
 * Award-condities (alle drie waar):
 *   1. Alle 4 onboarding-stappen voltooid (profiel/producten/campagne/wallet)
 *   2. (now - brand.aangemaakt) ≤ 7 dagen (604.800.000 ms)
 *   3. Badge nog niet eerder uitgereikt (idempotent)
 *
 * Toont:
 *   - In brand_profiel: hero-strip onder <h1>Merkprofiel</h1>
 *   - In brand_dashboard: kleine pil in de header naast het brand-logo
 *
 * Geen overrides, geen route-mutaties. Pure DOM-injectie via MutationObserver
 * + Firestore lezen/schrijven met merge.
 *
 * Public API:
 *   PP_Brand7DaysBadge.evaluate()       → Promise<state>
 *   PP_Brand7DaysBadge.refresh()        → re-evalueer + re-render
 *   PP_Brand7DaysBadge.VERSION
 *
 * Debug:
 *   window.__ppBrand7dBadge (laatste state)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrand7DaysBadgeInit) return;
  window.__ppBrand7DaysBadgeInit = true;

  var TAG = '[brand-7d-badge]';
  var INJECTED_PROFILE_FLAG  = 'data-pp-7d-badge-profile';
  var INJECTED_DASH_FLAG     = 'data-pp-7d-badge-dash';
  var BADGE_TESTID_PROFILE   = 'brand-profiel-7d-badge';
  var BADGE_TESTID_DASH      = 'brand-dash-7d-badge';
  var SEVEN_DAYS_MS          = 7 * 24 * 60 * 60 * 1000;

  // ────────── HELPERS ──────────
  function uid() { return (window.DY && window.DY.user && window.DY.user.uid) || null; }
  function db()  { return (window.firebase && window.firebase.firestore) ? window.firebase.firestore() : null; }
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }
  function toMillis(ts) {
    try {
      if (!ts) return 0;
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') return new Date(ts).getTime() || 0;
      if (ts.seconds) return ts.seconds * 1000;
    } catch (_) {}
    return 0;
  }
  function fmtDate(ms) {
    try {
      return new Date(ms).toLocaleDateString('nl-NL', { year:'numeric', month:'short', day:'numeric' });
    } catch (_) { return ''; }
  }

  // ────────── ONBOARDING EVALUATIE ──────────
  // Hergebruik dezelfde checks als pp-brand-onboarding-checklist-v1.
  // Als die module beschikbaar is, vertrouwen we op zijn evaluate().
  async function evaluateOnboarding() {
    if (window.PP_BrandOnboarding && typeof PP_BrandOnboarding.evaluate === 'function') {
      try { return await PP_BrandOnboarding.evaluate(); } catch (_) {}
    }
    // Fallback inline-implementatie (defensief, bij race-condition tijdens load)
    var u = uid(), d = db();
    var state = { profiel:false, producten:false, campagne:false, wallet:false };
    if (!u || !d) return state;
    await Promise.all([
      d.collection('brands').doc(u).get().then(function (s) {
        if (!s.exists) return;
        var b = s.data() || {};
        if (b.logo && b.omschrijving && String(b.omschrijving).trim().length > 0) state.profiel = true;
      }).catch(function(){}),
      d.collection('brand_products').where('brandId','==',u).limit(1).get()
        .then(function (s) { state.producten = !s.empty; }).catch(function(){}),
      d.collection('campaigns').where('brandId','==',u).limit(1).get()
        .then(function (s) { state.campagne = !s.empty; }).catch(function(){}),
      d.collection('users').doc(u).get().then(function (s) {
        if (!s.exists) return;
        var bal = Number((s.data() || {}).wallet_balance || 0);
        state.wallet = bal > 0;
      }).catch(function(){})
    ]);
    return state;
  }

  // ────────── EVALUATE & AWARD ──────────
  // Returns: { eligible, awarded, days_taken, registered_at, badge }
  async function evaluateBadge() {
    var u = uid(), d = db();
    var out = {
      eligible:      false,
      awarded:       false,
      already:       false,
      days_taken:    null,
      registered_at: null,
      awarded_at:    null
    };
    if (!u || !d) return out;

    var brandSnap;
    try {
      brandSnap = await d.collection('brands').doc(u).get();
    } catch (e) {
      try { console.warn(TAG, 'brand-doc-failed', e); } catch (_) {}
      return out;
    }
    if (!brandSnap.exists) return out;
    var brand = brandSnap.data() || {};
    out.registered_at = toMillis(brand.aangemaakt);

    // Al eerder uitgereikt? → toon direct.
    if (brand.onboarding_badge_7d && brand.onboarding_badge_7d.awarded) {
      out.already    = true;
      out.awarded    = true;
      out.days_taken = Number(brand.onboarding_badge_7d.days_taken || 0);
      out.awarded_at = toMillis(brand.onboarding_badge_7d.awarded_at);
      return out;
    }

    // Geen registratiedatum? → niet auto-toekennen (defensief).
    if (!out.registered_at) return out;

    // Buiten 7-dagen-window? → niet meer eligible (badge niet meer haalbaar).
    var now = Date.now();
    var elapsed = now - out.registered_at;
    if (elapsed > SEVEN_DAYS_MS) return out;

    // Check onboarding-status.
    var steps = await evaluateOnboarding();
    var allDone = !!(steps.profiel && steps.producten && steps.campagne && steps.wallet);
    if (!allDone) return out;

    // ✅ Eligible & nog binnen window → toekennen (idempotent merge).
    out.eligible   = true;
    out.days_taken = Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));

    try {
      await d.collection('brands').doc(u).set({
        onboarding_badge_7d: {
          awarded:    true,
          awarded_at: firebase.firestore.FieldValue.serverTimestamp(),
          days_taken: out.days_taken
        }
      }, { merge: true });
      out.awarded    = true;
      out.awarded_at = now;
      try { console.log(TAG, 'badge awarded', { days_taken: out.days_taken }); } catch (_) {}
    } catch (e) {
      try { console.warn(TAG, 'award-write-failed', e); } catch (_) {}
    }
    return out;
  }

  // ────────── RENDER: profiel hero-strip ──────────
  function renderProfileBadge(state) {
    if (!state.awarded) return;
    var main = document.getElementById('dy-main');
    if (!main) return;
    var page = main.querySelector('.bp-page, .bp-page-form');
    if (!page) return;
    if (page.querySelector('[' + INJECTED_PROFILE_FLAG + ']')) return;

    var h1 = page.querySelector('h1');
    if (!h1) return;

    var days = Number(state.days_taken || 0);
    var dayLabel = (days === 0) ? 'op dag 0' : (days === 1 ? 'binnen 1 dag' : 'binnen ' + days + ' dagen');
    var awardedDate = state.awarded_at ? fmtDate(state.awarded_at) : '';

    var badge = document.createElement('div');
    badge.className = 'pp-7d-badge pp-7d-badge-hero';
    badge.setAttribute(INJECTED_PROFILE_FLAG, '1');
    badge.setAttribute('data-testid', BADGE_TESTID_PROFILE);
    badge.innerHTML =
      '<div class="pp-7d-badge-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<circle cx="12" cy="8" r="6"></circle>' +
          '<path d="M9 14l-2 7 5-3 5 3-2-7"></path>' +
        '</svg>' +
      '</div>' +
      '<div class="pp-7d-badge-text">' +
        '<span class="pp-7d-badge-titel">Onboarding voltooid ' + esc(dayLabel) + '</span>' +
        '<span class="pp-7d-badge-sub">' +
          'Achievement automatisch toegekend' +
          (awardedDate ? ' op ' + esc(awardedDate) : '') +
          '.' +
        '</span>' +
      '</div>';

    // Plaats onmiddellijk na de <h1>
    h1.parentNode.insertBefore(badge, h1.nextSibling);
  }

  // ────────── RENDER: dashboard pil ──────────
  function renderDashboardBadge(state) {
    if (!state.awarded) return;
    var main = document.getElementById('dy-main');
    if (!main) return;
    var header = main.querySelector('.bp-dash-header');
    if (!header) return;
    if (header.querySelector('[' + INJECTED_DASH_FLAG + ']')) return;

    var days = Number(state.days_taken || 0);
    var label = days === 0 ? 'Dag 0' : (days === 1 ? '1 dag' : days + ' dgn');

    var pil = document.createElement('span');
    pil.className = 'pp-7d-badge pp-7d-badge-pil';
    pil.setAttribute(INJECTED_DASH_FLAG, '1');
    pil.setAttribute('data-testid', BADGE_TESTID_DASH);
    pil.title = 'Onboarding voltooid in ' + label;
    pil.innerHTML =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="8" r="6"></circle>' +
        '<path d="M9 14l-2 7 5-3 5 3-2-7"></path>' +
      '</svg>' +
      '<span>7-dgn ' + esc(label) + '</span>';

    // Zoek de eyebrow ("Merkenportaal") of voeg toe aan het tekst-blok
    var firstBlock = header.querySelector('div');
    if (firstBlock) firstBlock.appendChild(pil);
    else header.appendChild(pil);
  }

  // ────────── INJECTION OBSERVER ──────────
  var _evalInflight = null;
  function maybeInject() {
    if (!window.DY) return;
    var pagina = window.DY.pagina;
    if (pagina !== 'brand_profiel' && pagina !== 'brand_dashboard') return;
    if (!uid()) return;

    var main = document.getElementById('dy-main');
    if (!main) return;
    var page = main.querySelector('.bp-page, .bp-page-form');
    if (!page) return;

    // Stop als al gerenderd op deze pagina
    if (pagina === 'brand_profiel' && page.querySelector('[' + INJECTED_PROFILE_FLAG + ']')) return;
    if (pagina === 'brand_dashboard' && main.querySelector('[' + INJECTED_DASH_FLAG + ']')) return;

    // Wacht op specifiek anchor-element per route
    if (pagina === 'brand_profiel' && !page.querySelector('h1')) return;
    if (pagina === 'brand_dashboard' && !main.querySelector('.bp-dash-header')) return;

    if (_evalInflight) {
      _evalInflight.then(function (s) { render(s, pagina); });
      return;
    }
    _evalInflight = evaluateBadge().then(function (state) {
      window.__ppBrand7dBadge = state;
      _evalInflight = null;
      return state;
    }).catch(function (e) {
      _evalInflight = null;
      try { console.warn(TAG, 'evaluate-failed', e); } catch (_) {}
      return { awarded:false };
    });
    _evalInflight.then(function (s) { render(s, pagina); });
  }

  function render(state, pagina) {
    try {
      if (!state || !state.awarded) return;
      if (pagina === 'brand_profiel')   renderProfileBadge(state);
      if (pagina === 'brand_dashboard') renderDashboardBadge(state);
    } catch (e) {
      try { console.warn(TAG, 'render-failed', e); } catch (_) {}
    }
  }

  // ────────── INIT ──────────
  function init() {
    var obs = new MutationObserver(function () {
      try { maybeInject(); } catch (e) {}
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(maybeInject, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_Brand7DaysBadge = {
    VERSION:  '1.0.0',
    evaluate: evaluateBadge,
    refresh:  function () {
      _evalInflight = null;
      try {
        document.querySelectorAll('[' + INJECTED_PROFILE_FLAG + '], [' + INJECTED_DASH_FLAG + ']').forEach(function (el) {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
      } catch (_) {}
      maybeInject();
    }
  };
})();
