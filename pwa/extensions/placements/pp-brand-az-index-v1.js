/* PaskamerPraat - Brand A-Z sticky index bar v1
 * Additieve extensie: hooks in op BP.renderMerken (#bp-merken-lijst).
 * Bouwt automatisch een sticky A-Z balk boven de merkengrid op basis
 * van de zichtbare merknamen. Klik op een letter scrollt naar het
 * eerste merk dat met die letter begint. Inactieve letters worden
 * gedimd. Mobile-first, geen extra dependencies.
 *
 * Veiligheid: bestaande code blijft intact. Geen overschrijven.
 * Cache: bump via ?v= in index.html bij elke wijziging.
 */
(function () {
  'use strict';
  if (window.__PP_BRAND_AZ_V1__) return;
  window.__PP_BRAND_AZ_V1__ = true;

  var LETTERS = '0-9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z'.split(' ');
  var STYLE_ID = 'pp-brand-az-style';
  var BAR_ID   = 'pp-brand-az-bar';
  var GRID_SEL = '#bp-merken-lijst';
  var CARD_SEL = '.bp-merk-kaart';
  var NAAM_SEL = '.bp-merk-naam';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + BAR_ID + '{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;' +
        'justify-content:center;gap:2px;padding:8px 6px;margin:0 0 14px;' +
        'background:rgba(10,8,6,.92);backdrop-filter:blur(10px);' +
        '-webkit-backdrop-filter:blur(10px);border-radius:12px;' +
        'border:1px solid rgba(255,255,255,.06);box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
      '#' + BAR_ID + ' button{appearance:none;border:0;background:transparent;' +
        'color:rgba(255,255,255,.45);font:600 11px/1 system-ui,sans-serif;' +
        'padding:6px 7px;min-width:22px;cursor:pointer;border-radius:6px;' +
        'transition:background .15s ease,color .15s ease,transform .12s ease;' +
        'letter-spacing:.5px}' +
      '#' + BAR_ID + ' button.has-brand{color:#f5e6c8}' +
      '#' + BAR_ID + ' button.has-brand:hover{background:rgba(245,230,200,.12);' +
        'color:#fff;transform:translateY(-1px)}' +
      '#' + BAR_ID + ' button.is-active{background:#f5e6c8;color:#0a0806}' +
      '#' + BAR_ID + ' button:disabled{cursor:default;opacity:.35}' +
      '@media (max-width:480px){' +
        '#' + BAR_ID + '{position:sticky;top:0;padding:6px 4px;gap:1px}' +
        '#' + BAR_ID + ' button{padding:5px 5px;min-width:18px;font-size:10px}' +
      '}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function firstChar(naam) {
    if (!naam) return null;
    var c = String(naam).trim().charAt(0).toUpperCase();
    if (!c) return null;
    if (/[0-9]/.test(c)) return '0-9';
    if (/[A-Z]/.test(c)) return c;
    // Diakrieten normaliseren (Ö -> O, É -> E)
    try {
      var nfd = String(naam).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      var alt = nfd.charAt(0).toUpperCase();
      if (/[A-Z]/.test(alt)) return alt;
      if (/[0-9]/.test(alt)) return '0-9';
    } catch (e) { /* ignore */ }
    return null;
  }

  function buildIndex(grid) {
    var cards = grid.querySelectorAll(CARD_SEL);
    var map = {};
    cards.forEach(function (card) {
      var nm = card.querySelector(NAAM_SEL);
      if (!nm) return;
      var ch = firstChar(nm.textContent);
      if (!ch) return;
      if (!map[ch]) map[ch] = card;
    });
    return map;
  }

  function clearActive() {
    var prev = document.querySelectorAll('#' + BAR_ID + ' button.is-active');
    prev.forEach(function (b) { b.classList.remove('is-active'); });
  }

  function scrollToCard(card, letter) {
    if (!card) return;
    var bar = document.getElementById(BAR_ID);
    var offset = (bar ? bar.getBoundingClientRect().height : 0) + 12;
    var top = card.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: top, behavior: 'smooth' });
    clearActive();
    var btn = document.querySelector('#' + BAR_ID + ' button[data-letter="' + letter + '"]');
    if (btn) btn.classList.add('is-active');
  }

  function renderBar(map) {
    var existing = document.getElementById(BAR_ID);
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Merken A tot Z');
    bar.setAttribute('data-testid', 'brand-az-index-bar');

    LETTERS.forEach(function (l) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = l;
      btn.setAttribute('data-letter', l);
      btn.setAttribute('data-testid', 'brand-az-letter-' + l.replace(/[^A-Z0-9]/g, ''));
      if (map[l]) {
        btn.classList.add('has-brand');
        btn.addEventListener('click', function () { scrollToCard(map[l], l); });
      } else {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
      bar.appendChild(btn);
    });
    return bar;
  }

  function tryRender() {
    var grid = document.querySelector(GRID_SEL);
    if (!grid) return false;
    // Skip als grid nog leeg of nog loader
    if (grid.querySelector('.dy-loader')) return false;
    var cards = grid.querySelectorAll(CARD_SEL);
    if (!cards.length) return false;
    injectStyle();
    var map = buildIndex(grid);
    var bar = renderBar(map);
    grid.parentNode.insertBefore(bar, grid);
    return true;
  }

  // MutationObserver: kijkt naar #dy-main voor render veranderingen
  var debTimer = null;
  function schedule() {
    clearTimeout(debTimer);
    debTimer = setTimeout(function () {
      // Alleen renderen op merken-route
      var loc = (window.location.hash || '').toLowerCase();
      var onMerken = (loc.indexOf('merken') >= 0) || !!document.querySelector(GRID_SEL);
      if (!onMerken) return;
      tryRender();
    }, 120);
  }

  function init() {
    var main = document.getElementById('dy-main') || document.body;
    try {
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          // Trigger zodra een merk-kaart of merken-lijst is toegevoegd
          if (m.addedNodes && m.addedNodes.length) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType !== 1) continue;
              if (n.id === 'bp-merken-lijst' ||
                  (n.matches && n.matches(CARD_SEL)) ||
                  (n.querySelector && n.querySelector(CARD_SEL))) {
                schedule();
                return;
              }
            }
          }
        }
      });
      obs.observe(main, { childList: true, subtree: true });
    } catch (e) { /* graceful */ }

    // Eerste poging bij init
    schedule();
    // Reageer ook op hashchange (bij navigatie naar merken)
    window.addEventListener('hashchange', schedule);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
