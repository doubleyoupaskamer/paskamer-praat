// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Zoekfilter "Op mijn maat" v1
// Voegt een extra filter toe aan de bestaande zoekbalk:
//   "Alle" / "Vergelijkbaar (≥55%)" / "Zelfde bouw (≥75%)"
// Non-invasief: wrapt DY.voerZoekUit en filtert resultaten post-render
// op basis van de matchScore die de bestaande code al berekent.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  function init(retries) {
    if (retries == null) retries = 0;
    if (!window.DY) {
      // Cap retries op 60 × 100ms = 6 sec; daarna geven we het op
      // zodat we niet voor altijd een setTimeout-loop houden draaien.
      if (retries >= 60) return;
      setTimeout(function() { init(retries + 1); }, 100);
      return;
    }

    // ── Default in bestaande _zoekFilters object zetten ───────────
    DY._zoekFilters = DY._zoekFilters || { lengte: 'alle', bouw: 'alle' };
    if (typeof DY._zoekFilters.mijnmaat === 'undefined') {
      DY._zoekFilters.mijnmaat = 'alle';
    }

    // ── Wrap DY.voerZoekUit zodat filter post-render werkt ────────
    if (typeof DY.voerZoekUit === 'function' && !DY._mijnMaatWrapped) {
      var orig = DY.voerZoekUit;
      DY.voerZoekUit = async function(q) {
        try {
          await orig.call(this, q);
        } catch (err) {
          // Origineel faalde — log, maar laat filter alsnog draaien
          // op wat al gerenderd is. Voorkomt unhandled rejection.
          try { console.warn('[mijnmaat] voerZoekUit error:', err); } catch (e) { /* noop */ }
          throw err; // doorgeven aan eventuele caller catch
        } finally {
          try { toepassenMijnMaatFilter(); } catch (e) { /* noop */ }
        }
      };
      DY._mijnMaatWrapped = true;
    }

    // ── Wrap _initZoekFilterChips voor extra chip-handlers ────────
    if (typeof DY._initZoekFilterChips === 'function' && !DY._mijnMaatChipsWrapped) {
      var origInit = DY._initZoekFilterChips;
      DY._initZoekFilterChips = function() {
        origInit.apply(this, arguments);
        bindMijnMaatChips();
      };
      DY._mijnMaatChipsWrapped = true;
    }

    // ── Wrap wisZoekFilters om ook mijnmaat te resetten ───────────
    if (typeof DY.wisZoekFilters === 'function' && !DY._mijnMaatWisWrapped) {
      var origWis = DY.wisZoekFilters;
      DY.wisZoekFilters = function() {
        DY._zoekFilters.mijnmaat = 'alle';
        var chips = document.querySelectorAll('#dy-zf-mijnmaat .dy-zf-chip');
        chips.forEach(function(c) {
          c.classList.toggle('actief', c.dataset.mijnmaat === 'alle');
          c.classList.toggle('active', c.dataset.mijnmaat === 'alle');
        });
        origWis.apply(this, arguments);
      };
      DY._mijnMaatWisWrapped = true;
    }

    // ── Wrap _updateZoekFilterBadge om de mijnmaat ook te tellen ──
    if (typeof DY._updateZoekFilterBadge === 'function' && !DY._mijnMaatBadgeWrapped) {
      var origBadge = DY._updateZoekFilterBadge;
      DY._updateZoekFilterBadge = function() {
        origBadge.apply(this, arguments);
        // Verhoog de badge met +1 als mijnmaat-filter actief is
        var badge   = document.getElementById('dy-zoek-filter-badge');
        var wisBtn  = document.getElementById('dy-zoek-filter-wis');
        var toggle  = document.getElementById('dy-zoek-filter-toggle');
        var f = DY._zoekFilters || {};
        var totaal = (f.lengte !== 'alle' ? 1 : 0)
                   + (f.bouw   !== 'alle' ? 1 : 0)
                   + (f.mijnmaat !== 'alle' ? 1 : 0);
        if (badge) {
          badge.style.display = totaal > 0 ? 'flex' : 'none';
          badge.textContent = totaal;
        }
        if (wisBtn) wisBtn.style.display = totaal > 0 ? 'block' : 'none';
        if (toggle) toggle.classList.toggle('heeft-filter', totaal > 0);
      };
      DY._mijnMaatBadgeWrapped = true;
    }

    // ── Helper voor "Filter wissen alleen mijnmaat" knop ──────────
    DY._wisMijnMaatFilter = function() {
      DY._zoekFilters.mijnmaat = 'alle';
      var chips = document.querySelectorAll('#dy-zf-mijnmaat .dy-zf-chip');
      chips.forEach(function(c) {
        c.classList.toggle('actief', c.dataset.mijnmaat === 'alle');
        c.classList.toggle('active', c.dataset.mijnmaat === 'alle');
      });
      if (typeof DY._updateZoekFilterBadge === 'function') DY._updateZoekFilterBadge();
      if (typeof DY._triggerZoek === 'function') DY._triggerZoek();
    };
  }

  function bindMijnMaatChips() {
    var chips = document.querySelectorAll('#dy-zf-mijnmaat .dy-zf-chip');
    if (!chips.length) return;
    chips.forEach(function(chip) {
      chip.onclick = function() {
        chips.forEach(function(c) {
          c.classList.remove('actief');
          c.classList.remove('active');
        });
        chip.classList.add('actief');
        chip.classList.add('active');
        DY._zoekFilters.mijnmaat = chip.dataset.mijnmaat || 'alle';
        if (typeof DY._updateZoekFilterBadge === 'function') DY._updateZoekFilterBadge();
        if (typeof DY._triggerZoek === 'function') DY._triggerZoek();
      };
    });
    // Initial actieve-state markeren
    chips.forEach(function(c) {
      var is = (DY._zoekFilters.mijnmaat || 'alle') === (c.dataset.mijnmaat || 'alle');
      c.classList.toggle('actief', is);
      c.classList.toggle('active', is);
    });
  }

  // ─── Post-render filter op matchScore (uit zichtbare badge) ───
  function toepassenMijnMaatFilter() {
    var resultaten = document.getElementById('dy-zoek-resultaten');
    if (!resultaten) return;

    // Verwijder vorige "leeg na filter"-melding
    var prev = resultaten.querySelector('.dy-mijnmaat-leeg');
    if (prev) prev.remove();

    var threshold = DY._zoekFilters && DY._zoekFilters.mijnmaat;
    if (!threshold || threshold === 'alle') {
      // Toon alles weer (terug na uitschakelen)
      resultaten.querySelectorAll('.dy-zoek-hit').forEach(function(h) {
        h.style.display = '';
      });
      return;
    }

    // Geen maatprofiel? Filter is niet bruikbaar — toon hint, toon alles
    var mijn = DY.profile || {};
    var heeftProfiel = !!(mijn.lengte || mijn.maat);
    if (!heeftProfiel) {
      toonGeenProfielHint(resultaten);
      return;
    }

    var minPct = parseInt(threshold, 10) || 0;
    var hits = resultaten.querySelectorAll('.dy-zoek-hit');
    var verborgen = 0;
    var totaal = hits.length;

    hits.forEach(function(h) {
      var badge = h.querySelector('.dy-zoek-hit-match');
      if (!badge) {
        // Geen match-score (bv. verhaal of gebruiker zonder maatdata) → verbergen
        h.style.display = 'none';
        verborgen++;
        return;
      }
      var m = badge.textContent.match(/(\d+)/);
      var pct = m ? parseInt(m[1], 10) : 0;
      if (pct < minPct) {
        h.style.display = 'none';
        verborgen++;
      } else {
        h.style.display = '';
      }
    });

    if (totaal > 0 && verborgen === totaal) {
      var leeg = document.createElement('div');
      leeg.className = 'dy-zoek-leeg dy-mijnmaat-leeg';
      leeg.style.cssText = 'padding:16px;text-align:center;font-size:13px;line-height:1.5;color:rgba(254,252,245,0.7)';
      leeg.innerHTML =
        'Geen resultaten matchen jouw maatprofiel (≥' + minPct + '%).' +
        '<br><button type="button" onclick="DY._wisMijnMaatFilter()" ' +
        'style="margin-top:8px;background:transparent;border:1px solid rgba(254,252,245,0.3);' +
        'color:#fefcf5;padding:6px 14px;border-radius:18px;font-size:12px;cursor:pointer">' +
        'Match-filter wissen</button>';
      resultaten.appendChild(leeg);
    }
  }

  function toonGeenProfielHint(resultaten) {
    var hint = document.createElement('div');
    hint.className = 'dy-zoek-leeg dy-mijnmaat-leeg';
    hint.style.cssText = 'padding:14px;text-align:center;font-size:12.5px;line-height:1.5;color:rgba(254,252,245,0.7)';
    hint.innerHTML =
      'Vul eerst je <strong>lengte/maat</strong> in om op jouw maat te filteren.' +
      '<br><button type="button" onclick="DY.navigeer(\'body_profile\')" ' +
      'style="margin-top:8px;background:transparent;border:1px solid rgba(254,252,245,0.3);' +
      'color:#fefcf5;padding:6px 14px;border-radius:18px;font-size:12px;cursor:pointer">' +
      'Maatprofiel invullen</button>';
    resultaten.appendChild(hint);
  }

  // Init zodra DOM klaar is
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
