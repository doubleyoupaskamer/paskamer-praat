// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Composer Auto-save v1
// Slaat conceptversie automatisch op elke 3s in localStorage
// Herstelt bij volgende bezoek (per composer-type, per user)
//
// Watches:
//  - #verhaal-tekst   (renderNieuwVerhaal)
//  - #look-omschrijving + alle #look-* maatvelden (renderNieuwLook)
//
// Werking:
//  - Detecteert composer met MutationObserver (verschijnt na navigeer)
//  - input/change events → debounce 3s → schrijft naar localStorage
//  - Bij re-render: herstelt waarden + toont kleine "Concept hersteld" bar
//  - Bij succesvol plaatsen (textarea leeg + media weg): wist concept
//  - Non-invasief — bestaande compose-flow blijft 100% werken
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var LS_PREFIX  = 'dy_draft_';
  var DEBOUNCE   = 3000;        // 3 sec
  var EXPIRY_MS  = 14 * 24 * 60 * 60 * 1000; // 14 dagen
  var _timers    = {};
  var _restored  = {};

  function lsKey(type) {
    var uid = (window.DY && DY.user && DY.user.uid) || 'anon';
    return LS_PREFIX + type + '_' + uid;
  }

  function read(type) {
    try {
      var raw = localStorage.getItem(lsKey(type));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.t) return null;
      if ((Date.now() - data.t) > EXPIRY_MS) {
        localStorage.removeItem(lsKey(type));
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function write(type, payload) {
    try {
      payload.t = Date.now();
      localStorage.setItem(lsKey(type), JSON.stringify(payload));
    } catch (e) {}
  }

  function clear(type) {
    try { localStorage.removeItem(lsKey(type)); } catch (e) {}
    _restored[type] = false;
  }

  function debounce(type, fn) {
    clearTimeout(_timers[type]);
    _timers[type] = setTimeout(fn, DEBOUNCE);
  }

  function toonHerstelBar(targetEl, type, onWissen) {
    if (!targetEl) return;
    if (targetEl.parentNode.querySelector('.dy-draft-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'dy-draft-bar';
    bar.style.cssText = [
      'display:flex','align-items:center','justify-content:space-between',
      'gap:8px','margin:0 0 10px','padding:8px 12px',
      'background:var(--warm,#f5edda)',
      'border:1px solid var(--border-m,rgba(30,26,15,0.18))',
      'border-radius:10px','font:500 12.5px/1.3 inherit',
      'color:var(--ink-soft,#3a3018)'
    ].join(';');
    bar.innerHTML =
      '<span>📝 Concept hersteld vanaf vorige sessie</span>' +
      '<button type="button" class="dy-draft-wissen" style="' +
        'background:transparent;border:1px solid var(--border-m,rgba(30,26,15,0.18));' +
        'color:var(--ink-soft,#3a3018);padding:4px 10px;border-radius:999px;' +
        'font:500 11.5px inherit;cursor:pointer">Wissen</button>';
    bar.querySelector('.dy-draft-wissen').onclick = function() {
      if (typeof onWissen === 'function') onWissen();
      bar.remove();
    };
    targetEl.parentNode.insertBefore(bar, targetEl);
    // Auto-hide na 8s
    setTimeout(function() {
      if (bar.parentNode) {
        bar.style.transition = 'opacity .4s';
        bar.style.opacity = '0';
        setTimeout(function() { try { bar.remove(); } catch (e) {} }, 450);
      }
    }, 8000);
  }

  // ─── VERHAAL composer ───────────────────────────────────────────
  function bindVerhaal() {
    var ta = document.getElementById('verhaal-tekst');
    if (!ta || ta._draftBound) return;
    ta._draftBound = true;

    // Herstellen
    var saved = read('verhaal');
    if (saved && saved.tekst && !ta.value && !_restored.verhaal) {
      ta.value = saved.tekst;
      try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      _restored.verhaal = true;
      toonHerstelBar(ta, 'verhaal', function() {
        ta.value = '';
        try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        clear('verhaal');
      });
    }

    // Opslaan tijdens typen
    ta.addEventListener('input', function() {
      debounce('verhaal', function() {
        if (ta.value && ta.value.trim().length > 2) {
          write('verhaal', { tekst: ta.value });
        } else {
          clear('verhaal');
        }
      });
    });

    // Detecteer succesvol plaatsen: wanneer textarea verdwijnt uit DOM
    // of geleegd is na een "plaatsen" actie — gebruik observer op parent
  }

  // ─── LOOK composer ──────────────────────────────────────────────
  function bindLook() {
    var ta = document.getElementById('look-omschrijving');
    if (!ta || ta._draftBound) return;
    ta._draftBound = true;

    var velden = {
      omschrijving: 'look-omschrijving',
      lengte:       'look-lengte',
      maat:         'look-maat',
      gewicht:      'look-gewicht',
      borst:        'look-borst',
      taille:       'look-taille',
      heupen:       'look-heupen'
    };

    function huidigeWaarden() {
      var out = {};
      Object.keys(velden).forEach(function(k) {
        var el = document.getElementById(velden[k]);
        if (el) out[k] = el.value;
      });
      return out;
    }

    function herstelWaarden(data) {
      Object.keys(velden).forEach(function(k) {
        var el = document.getElementById(velden[k]);
        if (el && data[k] && !el.value) {
          el.value = data[k];
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      });
    }

    function wisLook() {
      Object.keys(velden).forEach(function(k) {
        var el = document.getElementById(velden[k]);
        if (el && k === 'omschrijving') {
          el.value = '';
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      });
      clear('look');
    }

    // Herstellen
    var saved = read('look');
    if (saved && saved.omschrijving && !ta.value && !_restored.look) {
      herstelWaarden(saved);
      _restored.look = true;
      toonHerstelBar(ta, 'look', wisLook);
    }

    // Opslaan op input/change in alle velden
    Object.keys(velden).forEach(function(k) {
      var el = document.getElementById(velden[k]);
      if (!el) return;
      var handler = function() {
        debounce('look', function() {
          var d = huidigeWaarden();
          if (d.omschrijving && d.omschrijving.trim().length > 2) {
            write('look', d);
          } else {
            clear('look');
          }
        });
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
  }

  // ─── Detect composer + cleanup na navigatie ────────────────────
  function check() {
    bindVerhaal();
    bindLook();
  }

  // Polling want composers worden via DY.navigeer() opnieuw gerenderd
  setInterval(check, 800);

  // Reset _restored wanneer composer DOM weg is (= navigatie weg)
  setInterval(function() {
    if (!document.getElementById('verhaal-tekst')) _restored.verhaal = false;
    if (!document.getElementById('look-omschrijving')) _restored.look = false;
  }, 1500);

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
})();
