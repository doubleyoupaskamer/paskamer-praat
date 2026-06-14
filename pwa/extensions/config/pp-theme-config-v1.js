/* Doubleyou - Centrale Theme Config v1
 * window.PP_THEME = { presets, current, apply, switch }
 *
 * Pre-existing CSS gebruikt al een hand vol kleur-tokens (zoals
 * #c89b3c goud, #1e1a0f ink, #fefcf5 zand). Deze module legt die
 * vast als CSS custom properties op :root zodat ze centraal
 * overschreven kunnen worden voor seizoenscampagnes of dark/light.
 *
 * Werkwijze:
 *   1. Definieer presets ('default', 'light', 'kerst', 'lente').
 *   2. Zet bij init de huidige preset (uit localStorage of 'default').
 *   3. Injecteer :root { --pp-primary: ...; --pp-ink: ...; ... }.
 *   4. Bestaande CSS hoeft niets te veranderen; nieuwe componenten
 *      kunnen var(--pp-primary) gebruiken.
 *
 * Geen build step - vanilla JS, defer-load.
 */
(function () {
  'use strict';
  if (window.PP_THEME) return;

  var STORAGE_KEY = 'dy_theme';

  // ── Presets ──────────────────────────────────────────────────────
  // Sleutels worden 1-op-1 in CSS gepubliceerd als --pp-<key>.
  var PRESETS = {
    'default': {           // huidige Doubleyou look (donker, goud accent)
      primary:    '#c89b3c',   // goud
      'primary-deep': '#a87f2d',
      accent:     '#f5e6c8',   // zand-licht
      ink:        '#1e1a0f',   // donker bruin (tekst op licht)
      'ink-soft': '#3b3624',
      'ink-muted':'rgba(255,255,255,.55)',
      bg:         '#0a0806',   // app achtergrond donker
      'bg-soft':  '#1e1a0f',
      surface:    'rgba(255,255,255,.04)',
      'surface-2':'rgba(255,255,255,.08)',
      success:    '#7ab87a',
      warning:    '#e0a13c',
      danger:     '#d4504a',
      info:       '#5fa8d3',
      'radius-sm':'8px',
      'radius-md':'14px',
      'radius-lg':'22px'
    },

    'light': {             // light mode optie
      primary:    '#a87f2d',
      'primary-deep': '#7a5b1e',
      accent:     '#c89b3c',
      ink:        '#1e1a0f',
      'ink-soft': '#3b3624',
      'ink-muted':'rgba(30,26,15,.55)',
      bg:         '#fefcf5',
      'bg-soft':  '#f5e6c8',
      surface:    'rgba(30,26,15,.04)',
      'surface-2':'rgba(30,26,15,.08)',
      success:    '#4f8c4f',
      warning:    '#b87a1f',
      danger:     '#a83b35',
      info:       '#2a78a3',
      'radius-sm':'8px',
      'radius-md':'14px',
      'radius-lg':'22px'
    },

    'kerst': {             // december campaign
      primary:    '#b8332b',   // diep rood
      'primary-deep': '#7a1f17',
      accent:     '#e8c878',   // warm goud
      ink:        '#1a0f0a',
      'ink-soft': '#2f1f15',
      'ink-muted':'rgba(255,255,255,.55)',
      bg:         '#0a0604',
      'bg-soft':  '#1a0f0a',
      surface:    'rgba(184,51,43,.06)',
      'surface-2':'rgba(232,200,120,.10)',
      success:    '#7ab87a',
      warning:    '#e0a13c',
      danger:     '#d4504a',
      info:       '#5fa8d3',
      'radius-sm':'8px',
      'radius-md':'14px',
      'radius-lg':'22px'
    },

    'lente': {             // maart-mei campaign
      primary:    '#7ab87a',   // bladgroen
      'primary-deep': '#4f8c4f',
      accent:     '#f5e6c8',
      ink:        '#1e1a0f',
      'ink-soft': '#3b3624',
      'ink-muted':'rgba(255,255,255,.55)',
      bg:         '#0c0a07',
      'bg-soft':  '#1f1c14',
      surface:    'rgba(122,184,122,.06)',
      'surface-2':'rgba(245,230,200,.10)',
      success:    '#7ab87a',
      warning:    '#e0a13c',
      danger:     '#d4504a',
      info:       '#5fa8d3',
      'radius-sm':'8px',
      'radius-md':'14px',
      'radius-lg':'22px'
    }
  };

  function readStored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && PRESETS[v]) return v;
    } catch (e) { /* ignore */ }
    return 'default';
  }

  function writeStored(name) {
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) { /* ignore */ }
  }

  // ── CSS toepassen ────────────────────────────────────────────────
  function applyPreset(name) {
    var preset = PRESETS[name] || PRESETS['default'];
    var root = document.documentElement;
    Object.keys(preset).forEach(function (k) {
      root.style.setProperty('--pp-' + k, preset[k]);
    });
    root.setAttribute('data-pp-theme', name);
    try {
      window.dispatchEvent(new CustomEvent('pp:theme-change', {
        detail: { name: name, preset: preset }
      }));
    } catch (e) { /* ignore */ }
  }

  function switchTo(name) {
    if (!PRESETS[name]) return false;
    writeStored(name);
    applyPreset(name);
    window.PP_THEME.current = name;
    return true;
  }

  function listPresets() {
    return Object.keys(PRESETS);
  }

  function getPreset(name) {
    return Object.assign({}, PRESETS[name || window.PP_THEME.current]);
  }

  // Init
  var initial = readStored();
  applyPreset(initial);

  window.PP_THEME = {
    current:     initial,
    presets:     listPresets(),
    apply:       applyPreset,
    switch:      switchTo,
    get:         getPreset
  };

  // Bij user-switch: theme behouden (persoonlijke voorkeur per device)
  // Bij logout: reset naar default zodat de volgende gebruiker schoon start
  document.addEventListener('pp:logout', function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    switchTo('default');
  });
})();
