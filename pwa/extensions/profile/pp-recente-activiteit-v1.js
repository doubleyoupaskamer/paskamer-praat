/* PaskamerPraat - Recente activiteit sectie in profiel v1
 * Additieve extensie: injecteert een "Recente activiteit" blok in
 * het profiel (DY.renderProfiel). Toont de laatste 5 verhalen van
 * de huidige gebruiker uit de 'stories' collectie.
 *
 * Veiligheid: bestaande profiel-render code blijft intact. Het blok
 * wordt na render geinjecteerd op basis van een MutationObserver.
 */
(function () {
  'use strict';
  if (window.__PP_RECENTE_ACT_V1__) return;
  window.__PP_RECENTE_ACT_V1__ = true;

  var BLOCK_ID  = 'pp-recente-activiteit';
  var STYLE_ID  = 'pp-recente-activiteit-style';
  var ANCHOR_ID = 'dy-profiel-badges';     // bestaande sectie na de hero
  var WRAP_SEL  = '.dy-profiel-wrap';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + BLOCK_ID + '{margin:14px 16px 0;background:rgba(255,255,255,.03);' +
        'border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:16px}' +
      '#' + BLOCK_ID + ' .pp-act-h{display:flex;align-items:center;justify-content:space-between;' +
        'margin:0 0 10px;color:#f5e6c8;font:600 14px/1.2 system-ui,sans-serif;' +
        'letter-spacing:.3px}' +
      '#' + BLOCK_ID + ' .pp-act-h small{font:500 11px/1 system-ui,sans-serif;' +
        'color:rgba(255,255,255,.45)}' +
      '#' + BLOCK_ID + ' .pp-act-list{list-style:none;margin:0;padding:0;display:flex;' +
        'flex-direction:column;gap:8px}' +
      '#' + BLOCK_ID + ' .pp-act-row{display:flex;gap:10px;align-items:center;' +
        'padding:8px;border-radius:10px;background:rgba(0,0,0,.25);cursor:pointer;' +
        'transition:background .15s ease,transform .12s ease}' +
      '#' + BLOCK_ID + ' .pp-act-row:hover{background:rgba(245,230,200,.08);' +
        'transform:translateX(2px)}' +
      '#' + BLOCK_ID + ' .pp-act-icon{width:32px;height:32px;flex:0 0 32px;' +
        'border-radius:8px;display:grid;place-items:center;font-size:16px;' +
        'background:rgba(245,230,200,.12)}' +
      '#' + BLOCK_ID + ' .pp-act-body{flex:1;min-width:0}' +
      '#' + BLOCK_ID + ' .pp-act-title{color:#fff;font:500 13px/1.3 system-ui,sans-serif;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 2px}' +
      '#' + BLOCK_ID + ' .pp-act-meta{color:rgba(255,255,255,.5);' +
        'font:500 11px/1 system-ui,sans-serif}' +
      '#' + BLOCK_ID + ' .pp-act-leeg{color:rgba(255,255,255,.55);' +
        'font:500 12px/1.4 system-ui,sans-serif;padding:8px 4px;text-align:center}';
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = String(t == null ? '' : t);
    return d.innerHTML;
  }

  function ago(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      var s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return 'zojuist';
      if (s < 3600) return Math.floor(s/60) + ' min geleden';
      if (s < 86400) return Math.floor(s/3600) + ' u geleden';
      if (s < 604800) return Math.floor(s/86400) + ' d geleden';
      return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
  }

  function iconFor(cat) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('outfit') >= 0) return '👗';
    if (c.indexOf('review') >= 0) return '⭐';
    if (c.indexOf('vraag') >= 0)  return '💬';
    return '📸';
  }

  function titelOf(data) {
    var t = data.titel || data.text || data.tekst || data.caption || data.beschrijving;
    if (t && String(t).trim()) return String(t).trim().slice(0, 80);
    return data.category || 'Verhaal';
  }

  function tsOf(data) {
    if (data.tsMs && typeof data.tsMs === 'number') return data.tsMs;
    if (data.createdAt) return data.createdAt;
    if (data.ts && data.ts.toMillis) return data.ts.toMillis();
    return null;
  }

  function navigateToVerhaal(id) {
    try {
      if (window.DY && typeof window.DY.navigeer === 'function') {
        // De verhaal-detail route accepteert vaak een id-parameter
        // via openStoryViewer of dergelijke. Fallback: ga naar feed
        // met hash op het id.
        if (typeof window.DY.openVerhaal === 'function') {
          window.DY.openVerhaal(id);
          return;
        }
      }
    } catch (e) { /* ignore */ }
    // Generieke fallback
    window.location.hash = '#verhaal=' + encodeURIComponent(id);
  }

  function render(items) {
    var html = ''
      + '<div class="pp-act-h">'
      +   '<span>Recente activiteit</span>'
      +   '<small data-testid="pp-act-count">' + items.length + ' ' + (items.length === 1 ? 'item' : 'items') + '</small>'
      + '</div>';
    if (!items.length) {
      html += '<div class="pp-act-leeg" data-testid="pp-act-leeg">Nog geen verhalen geplaatst. Deel je eerste fitcheck!</div>';
    } else {
      html += '<ul class="pp-act-list" data-testid="pp-act-list">';
      items.forEach(function (it) {
        html += ''
          + '<li class="pp-act-row" data-testid="pp-act-row-' + esc(it.id) + '" '
          +     'onclick="window.__PP_RECENTE_ACT_GO(\'' + esc(it.id) + '\')">'
          +   '<div class="pp-act-icon">' + iconFor(it.category) + '</div>'
          +   '<div class="pp-act-body">'
          +     '<p class="pp-act-title">' + esc(it.titel) + '</p>'
          +     '<span class="pp-act-meta">' + esc(ago(it.ts)) + '</span>'
          +   '</div>'
          + '</li>';
      });
      html += '</ul>';
    }
    return html;
  }

  window.__PP_RECENTE_ACT_GO = navigateToVerhaal;

  async function laadEnRender() {
    var wrap = document.querySelector(WRAP_SEL);
    if (!wrap) return;
    if (document.getElementById(BLOCK_ID)) return;          // al gerenderd
    var anchor = document.getElementById(ANCHOR_ID);
    if (!anchor) return;
    var DY = window.DY;
    if (!DY || !DY.user || !DY.db) return;

    injectStyle();
    var block = document.createElement('section');
    block.id = BLOCK_ID;
    block.setAttribute('data-testid', 'pp-recente-activiteit');
    block.innerHTML = '<div class="pp-act-h"><span>Recente activiteit</span>' +
                      '<small>laden...</small></div>';
    anchor.parentNode.insertBefore(block, anchor.nextSibling);

    try {
      // Eerst proberen met orderBy tsMs (snelst), valt terug op
      // client-side sort als index niet bestaat.
      var snap;
      try {
        snap = await DY.db.collection('stories')
          .where('userId', '==', DY.user.uid)
          .orderBy('tsMs', 'desc')
          .limit(5).get();
      } catch (e1) {
        // Fallback zonder orderBy (index ontbreekt)
        snap = await DY.db.collection('stories')
          .where('userId', '==', DY.user.uid)
          .limit(25).get();
      }
      var items = [];
      snap.forEach(function (d) {
        var data = d.data() || {};
        items.push({
          id: d.id,
          titel: titelOf(data),
          category: data.category,
          ts: tsOf(data)
        });
      });
      items.sort(function (a, b) {
        var av = typeof a.ts === 'number' ? a.ts : new Date(a.ts || 0).getTime();
        var bv = typeof b.ts === 'number' ? b.ts : new Date(b.ts || 0).getTime();
        return bv - av;
      });
      items = items.slice(0, 5);
      block.innerHTML = render(items);
    } catch (e) {
      // Geen toegang of fout - blok minimaal houden
      block.innerHTML = render([]);
    }
  }

  function schedule() {
    setTimeout(laadEnRender, 80);
  }

  function init() {
    var main = document.getElementById('dy-main') || document.body;
    try {
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.addedNodes && m.addedNodes.length) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var n = m.addedNodes[j];
              if (n.nodeType !== 1) continue;
              if ((n.matches && n.matches(WRAP_SEL)) ||
                  (n.querySelector && n.querySelector(WRAP_SEL))) {
                schedule();
                return;
              }
            }
          }
        }
      });
      obs.observe(main, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }

    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
