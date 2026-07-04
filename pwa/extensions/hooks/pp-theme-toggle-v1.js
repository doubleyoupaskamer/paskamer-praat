/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT. Theme Toggle (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * DOEL
 * Gebruiker kan schakelen tussen licht / donker / auto (system) thema.
 * 100% additief. Legacy JS blijft ongewijzigd.
 *
 * PATRONEN
 * 1. State opgeslagen in localStorage key 'pp-theme' (light | dark | auto)
 * 2. <html> krijgt data attribuut data-pp-theme met de resolved waarde
 *    (light of dark, nooit 'auto'). Auto resolved via prefers-color-scheme.
 * 3. Toggle knop wordt geinjecteerd in de topbar zodra die bestaat, via
 *    MutationObserver (topbar wordt dynamisch gerender in legacy JS).
 * 4. Cross-tab sync via storage event.
 * 5. Bij system theme change (prefers-color-scheme media query change)
 *    wordt automatisch de resolved theme bijgewerkt als user 'auto' koos.
 *
 * DE-facto DEFAULT: donker (behoud bestaande UX voor bestaande gebruikers).
 * NIEUWE gebruikers krijgen auto zodat ze het systeem-thema volgen.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORAGE_KEY = 'pp-theme';
  var VALID = ['light', 'dark', 'auto'];

  function readPref() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (VALID.indexOf(v) >= 0) return v;
    } catch (_) {}
    return 'dark'; // default: behoud bestaande UX
  }
  function writePref(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {}
  }
  function systemPrefersDark() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) { return true; }
  }
  function resolveTheme(pref) {
    if (pref === 'auto') return systemPrefersDark() ? 'dark' : 'light';
    return pref;
  }

  function applyTheme(pref) {
    var resolved = resolveTheme(pref);
    try {
      document.documentElement.setAttribute('data-pp-theme', resolved);
      document.documentElement.setAttribute('data-pp-theme-pref', pref);
    } catch (_) {}
    updateButtonState(pref, resolved);
    try {
      document.dispatchEvent(new CustomEvent('pp-theme-changed', {
        detail: { pref: pref, resolved: resolved }
      }));
    } catch (_) {}
  }

  function nextPref(current) {
    var idx = VALID.indexOf(current);
    return VALID[(idx + 1) % VALID.length];
  }

  function labelFor(pref) {
    return { light: 'Licht', dark: 'Donker', auto: 'Systeem' }[pref] || 'Donker';
  }
  function iconFor(pref) {
    // Inline SVG icons; deterministisch en zonder externe afhankelijkheid
    var svgs = {
      light: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
      dark:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      auto:  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h9"/></svg>'
    };
    return svgs[pref] || svgs.dark;
  }

  function makeButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'pp-theme-toggle';
    btn.className = 'pp-theme-toggle';
    btn.setAttribute('aria-label', 'Wissel thema');
    btn.setAttribute('title', 'Wissel thema (Licht / Donker / Systeem)');
    btn.setAttribute('data-testid', 'pp-theme-toggle-btn');
    btn.innerHTML = '<span class="pp-theme-toggle-icon" aria-hidden="true"></span>' +
                    '<span class="pp-theme-toggle-label"></span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var current = readPref();
      var next = nextPref(current);
      writePref(next);
      applyTheme(next);
      // Broadcast naar andere tabs
      try { localStorage.setItem('pp-theme-tick', String(Date.now())); } catch (_) {}
    });
    return btn;
  }

  function updateButtonState(pref, resolved) {
    var btn = document.getElementById('pp-theme-toggle');
    if (!btn) return;
    var iconEl = btn.querySelector('.pp-theme-toggle-icon');
    var labelEl = btn.querySelector('.pp-theme-toggle-label');
    if (iconEl) iconEl.innerHTML = iconFor(pref);
    if (labelEl) labelEl.textContent = labelFor(pref);
    btn.setAttribute('data-pref', pref);
    btn.setAttribute('data-resolved', resolved);
  }

  // Inject knop in topbar. Legacy topbar heeft varierende selectors,
  // dus we proberen meerdere kandidaten in volgorde.
  function findInjectTarget() {
    var candidates = [
      '.dy-topbar-acties',
      '.dy-topbar-rechts',
      '.dy-topbar .dy-topbar-inner',
      '.dy-topbar',
      '#dy-topbar',
      'header nav',
      'header'
    ];
    for (var i = 0; i < candidates.length; i++) {
      var el = document.querySelector(candidates[i]);
      if (el) return el;
    }
    return null;
  }

  function inject() {
    if (document.getElementById('pp-theme-toggle')) return true;
    var target = findInjectTarget();
    if (!target) return false;
    var btn = makeButton();
    // Voeg toe aan begin zodat de knop altijd zichtbaar is
    if (target.firstChild) target.insertBefore(btn, target.firstChild);
    else target.appendChild(btn);
    updateButtonState(readPref(), resolveTheme(readPref()));
    return true;
  }

  // Bootstrap: start observer voor dynamisch gerender topbar
  function bootstrap() {
    // Direct pas theme toe op html zodat FOUC minimaal is (script staat in defer)
    applyTheme(readPref());
    // Probeer meteen injecteren
    if (inject()) return;
    // Anders wacht op DOM changes
    var obs = new MutationObserver(function () {
      if (inject()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Fail-safe: stop na 15s zodat we geen infinite observer houden
    setTimeout(function () { try { obs.disconnect(); } catch (_) {} }, 15000);
  }

  // Cross-tab sync
  window.addEventListener('storage', function (e) {
    if (!e || !e.key) return;
    if (e.key === STORAGE_KEY || e.key === 'pp-theme-tick') {
      applyTheme(readPref());
    }
  });

  // System theme change listener
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var mqHandler = function () {
      if (readPref() === 'auto') applyTheme('auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', mqHandler);
    else if (mq.addListener) mq.addListener(mqHandler);
  } catch (_) {}

  // Public API
  window.PP_Theme = {
    VERSION: '1.0.0',
    get: readPref,
    getResolved: function () { return resolveTheme(readPref()); },
    set: function (v) {
      if (VALID.indexOf(v) < 0) return false;
      writePref(v); applyTheme(v);
      try { localStorage.setItem('pp-theme-tick', String(Date.now())); } catch (_) {}
      return true;
    },
    cycle: function () { this.set(nextPref(readPref())); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
