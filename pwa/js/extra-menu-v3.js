// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Extra Hub Menu v2
// Drie-punten hamburger menu BINNEN elke feed-card, vlak boven de avatar.
// Verbergt de oude losse FAB's (Vraag AI / Meldingen) volledig.
//
// Architectuur:
//   - GEEN body-vaste FAB meer. Het menu leeft binnen .dy-reel-content
//     van iedere feed-kaart, geinjecteerd vlak voor .dy-reel-auteur.
//   - MutationObserver zorgt dat nieuwe kaarten (oneindig scrollen,
//     filter wissel, refresh) ook de knop krijgen.
//   - Klik → kleine popover met "Vraag de AI" en "Notificaties".
//
// Non-invasief: bestaande pwa-v463 code blijft ongewijzigd.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var BTN_CLASS    = 'dy-card-hub-btn';
  var POP_ID       = 'dy-card-hub-pop';
  var BACK_ID      = 'dy-card-hub-backdrop';
  var DATA_FLAG    = 'data-hub-injected';

  // Zet vlag VOOR andere scripts opstarten zodat ai/push FABs nooit getoond worden
  window.DY = window.DY || {};
  window.DY._extraMenuActive = true;

  function init() {
    injectStyles();
    injectKillStyles();
    purgeLegacyFabs();
    observe();
    // Direct alle reeds aanwezige kaarten verwerken
    scanEnInject();
  }

  // ─── Actieve opruimer voor legacy FAB's (overlapt index.html styles
  //     voor het geval cached JS van vóór deze versie nog draait) ─────
  function purgeLegacyFabs() {
    var ids = ['dy-ai-fab', 'dy-push-btn', 'dy-hub-fab', 'dy-hub-items', 'dy-hub-backdrop'];
    function nukeOnce() {
      ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    }
    nukeOnce();
    // Loop alleen tijdens initiële boot-window (10s). Daarna handelt
    // de CSS killstyles in <head> het permanent af — geen permanente
    // setInterval meer (bespaart CPU/battery op mobile).
    var iv = setInterval(nukeOnce, 1500);
    setTimeout(function() { try { clearInterval(iv); } catch (e) { /* noop */ } }, 10000);
  }

  // ─── Verberg oude AI/Push FAB's permanent ───────────────────────
  function injectKillStyles() {
    if (document.getElementById('dy-hub-killstyles')) return;
    var k = document.createElement('style');
    k.id = 'dy-hub-killstyles';
    k.textContent =
      '#dy-ai-fab, #dy-push-btn, #dy-hub-fab, #dy-hub-items, #dy-hub-backdrop { ' +
        'display: none !important; visibility: hidden !important; ' +
        'opacity: 0 !important; pointer-events: none !important; ' +
        'position: absolute !important; width: 0 !important; height: 0 !important; ' +
      '}';
    document.head.appendChild(k);
  }

  // ─── Observer: nieuwe feed-kaarten van knop voorzien ────────────
  //     Globaal: werkt op home-feed, profiel, hashtag, zoekresultaten,
  //     story-detail en élke andere route waar .dy-reel-item verschijnt.
  //     Throttle via requestAnimationFrame om CPU-burst op snelle DOM mutaties
  //     (oneindig scroll, filter wissel) te voorkomen.
  function observe() {
    var rafId = 0;
    var obs = new MutationObserver(function() {
      if (rafId) return;
      rafId = requestAnimationFrame(function() {
        rafId = 0;
        scanEnInject();
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', function(e) {
      // Sluit popover bij klik buiten het menu
      var open = document.querySelector('.' + BTN_CLASS + '.open');
      if (!open) return;
      if (e.target.closest('.' + BTN_CLASS) || e.target.closest('#' + POP_ID)) return;
      sluitPopover();
    }, true);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') sluitPopover();
    });

    // Sluit popover ook bij scroll (mobiel anchored position blijft kloppen)
    window.addEventListener('scroll', function() {
      if (document.querySelector('.' + BTN_CLASS + '.open')) sluitPopover();
    }, { passive: true, capture: true });
    window.addEventListener('resize', sluitPopover);
    window.addEventListener('orientationchange', sluitPopover);
  }

  function scanEnInject() {
    var kaarten = document.querySelectorAll('.dy-reel-item:not(.dy-reel-empty):not(.dy-feed-loop-sep)');
    kaarten.forEach(function(kaart) {
      if (kaart.getAttribute(DATA_FLAG) === '1' && kaart.querySelector('.' + BTN_CLASS)) return;
      var auteur = kaart.querySelector('.dy-reel-auteur');
      if (!auteur) return;

      // Maak auteur tot positioneringsanker zodat de hub-knop er absolute
      // bovenop kan zweven — werkt identiek op desktop en mobiel, ongeacht
      // flex / max-height / overflow regels van .dy-reel-content.
      if (getComputedStyle(auteur).position === 'static') {
        auteur.style.position = 'relative';
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BTN_CLASS;
      btn.setAttribute('aria-label', 'Extra opties');
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML =
        '<svg class="dy-card-hub-crown" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">' +
          '<defs>' +
            '<linearGradient id="dy-crown-grad" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0%"  stop-color="#fde4a3"/>' +
              '<stop offset="45%" stop-color="#e8b94a"/>' +
              '<stop offset="100%" stop-color="#a87618"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<path d="M5 16 L3 7 l5 4 4-7 4 7 5-4 -2 9 Z" fill="url(#dy-crown-grad)" stroke="#5a3a08" stroke-width="0.6" stroke-linejoin="round"/>' +
          '<rect x="5" y="17.4" width="14" height="2" rx="0.6" fill="url(#dy-crown-grad)" stroke="#5a3a08" stroke-width="0.4"/>' +
          '<circle cx="12" cy="9.5" r="1.1" fill="#fff5d6" opacity="0.9"/>' +
        '</svg>';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        togglePopover(btn);
      });
      // Insert als EERSTE child van .dy-reel-auteur. Door absolute
      // positionering verschijnt hij visueel direct boven de avatar.
      auteur.insertBefore(btn, auteur.firstChild);
      kaart.setAttribute(DATA_FLAG, '1');
    });
  }

  // ─── Popover ────────────────────────────────────────────────────
  function bouwPopover() {
    var pop = document.getElementById(POP_ID);
    if (pop) return pop;

    var back = document.createElement('div');
    back.id = BACK_ID;
    back.addEventListener('click', sluitPopover);
    document.body.appendChild(back);

    pop = document.createElement('div');
    pop.id = POP_ID;
    pop.setAttribute('role', 'menu');
    pop.innerHTML =
      item('tryon', 'Probeer aan',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h-3l-1 2-1-2H8L4 7l3 3V21h10V10l3-3-4-4z"/></svg>'
      ) +
      item('outfit_analyse', 'Outfit analyse',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      ) +
      item('share', 'Deel deze look',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
      ) +
      item('bewaar', 'Bewaar',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
      ) +
      item('similar', 'Vergelijkbaar zoeken',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      ) +
      item('ai',   'AI Style Assistent',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
      ) +
      item('push', 'Notificaties',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      ) +
      '<div class="dy-card-hub-divider" role="separator"></div>' +
      item('verberg', 'Verberg deze post',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      ) +
      item('report', 'Rapporteren',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
      ) +
      item('block', 'Blokkeer gebruiker',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
      );
    document.body.appendChild(pop);

    pop.addEventListener('click', function(e) {
      var b = e.target.closest('.dy-card-hub-item');
      if (!b) return;
      e.stopPropagation();
      var actie = b.dataset.actie;
      var kaart = pop._activeCard || null;
      sluitPopover();
      setTimeout(function() {
        try {
          if (window.DY && window.DY.cardActions && typeof window.DY.cardActions[actie] === 'function') {
            return window.DY.cardActions[actie](kaart);
          }
          // Fallback: oude AI/Push handlers
          if (actie === 'ai'   && window.DY && DY.AIChat && typeof DY.AIChat.open === 'function') DY.AIChat.open();
          if (actie === 'push' && window.DY && DY.Push   && typeof DY.Push.open   === 'function') DY.Push.open();
        } catch (err) {}
      }, 140);
    });
    return pop;
  }

  function item(actie, label, svg) {
    return ''
      + '<button type="button" class="dy-card-hub-item" data-actie="' + actie + '" role="menuitem">'
      +   '<span class="dy-card-hub-item-icon">' + svg + '</span>'
      +   '<span class="dy-card-hub-item-label">' + label + '</span>'
      + '</button>';
  }

  function togglePopover(btn) {
    var pop = bouwPopover();
    var back = document.getElementById(BACK_ID);
    var nuOpen = btn.classList.contains('open');
    // Sluit altijd eerst
    sluitPopover();
    if (nuOpen) return;

    // Onthoud bij welke kaart het menu hoort (voor v50 card-actions)
    pop._activeCard = btn.closest('.dy-reel-item') || null;

    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    // Positie: net rechts naast de drie-puntjes knop, valt terug onder de knop indien geen ruimte
    var rect = btn.getBoundingClientRect();
    pop.classList.add('open');
    if (back) back.classList.add('open');

    // Meet popover en plaats
    pop.style.visibility = 'hidden';
    pop.style.left = '0px';
    pop.style.top = '0px';
    requestAnimationFrame(function() {
      var pw = pop.offsetWidth || 200;
      var ph = pop.offsetHeight || 96;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      // Standaard: rechts naast de knop, verticaal gecentreerd op de knop
      var left = rect.right + 8;
      var top  = rect.top + (rect.height / 2) - (ph / 2);
      // Te ver naar rechts? Dan rechts uitlijnen aan binnenrand van het scherm
      if (left + pw + 12 > vw) left = Math.max(12, rect.left - pw - 8);
      // Buiten viewport top/bottom corrigeren
      if (top < 12) top = 12;
      if (top + ph + 12 > vh) top = vh - ph - 12;
      pop.style.left = left + 'px';
      pop.style.top  = top + 'px';
      pop.style.visibility = '';
    });
  }

  function sluitPopover() {
    var pop = document.getElementById(POP_ID);
    var back = document.getElementById(BACK_ID);
    if (pop) pop.classList.remove('open');
    if (back) back.classList.remove('open');
    document.querySelectorAll('.' + BTN_CLASS + '.open').forEach(function(b) {
      b.classList.remove('open');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  // ─── Styles ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dy-card-hub-styles')) return;
    var s = document.createElement('style');
    s.id = 'dy-card-hub-styles';
    s.textContent = `
/* Drie-puntjes knop GEABSOLUTEERD boven de avatar in .dy-reel-auteur.
   Werkt identiek op desktop, tablet, Android, iPhone en PWA — onafhankelijk
   van flex layout, max-height of overflow regels van .dy-reel-content. */
.${BTN_CLASS} {
  position: absolute !important;
  bottom: calc(100% + 6px) !important;
  left: 0 !important;
  width: 32px !important; height: 32px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  /* Premium dark-glass + warme clay rand zodat de gouden kroon contrasteert. */
  background: radial-gradient(circle at 30% 30%, rgba(60,42,12,0.72), rgba(30,26,15,0.78)) !important;
  border: 1px solid rgba(232,185,74,0.55) !important;
  border-radius: 50% !important;
  color: #fefcf5 !important;
  cursor: pointer !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow:
    0 2px 12px rgba(0,0,0,0.50),
    0 0 0 1px rgba(232,185,74,0.18),
    inset 0 1px 0 rgba(254,252,245,0.10) !important;
  transition: background .18s ease, transform .18s ease, border-color .18s ease, box-shadow .18s ease;
  padding: 0 !important;
  margin: 0 !important;
  z-index: 12 !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  overflow: visible !important;
}
.${BTN_CLASS}:hover {
  background: radial-gradient(circle at 30% 30%, rgba(80,55,15,0.85), rgba(40,32,15,0.88)) !important;
  border-color: rgba(232,185,74,0.85) !important;
  box-shadow:
    0 4px 18px rgba(0,0,0,0.55),
    0 0 0 2px rgba(232,185,74,0.30),
    inset 0 1px 0 rgba(254,252,245,0.14) !important;
  transform: translateY(-1px);
}
.${BTN_CLASS}:active { transform: scale(0.92) !important; }
.${BTN_CLASS}.open {
  background: linear-gradient(135deg, var(--clay-d, #a56605), var(--clay, #c67d06)) !important;
  border-color: rgba(254,237,182,0.70) !important;
}

/* Kroon: bounce eenmalig bij eerste render + zachte glow-pulse continu. */
.dy-card-hub-crown {
  display: block;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55));
  animation:
    dy-crown-bounce 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 1,
    dy-crown-glow   3.2s ease-in-out infinite;
  transform-origin: 50% 90%;
}
.${BTN_CLASS}:hover .dy-card-hub-crown {
  animation: dy-crown-shimmer 0.9s ease-in-out 1, dy-crown-glow 3.2s ease-in-out infinite;
}
@keyframes dy-crown-bounce {
  0%   { transform: translateY(0)    scale(0.55); opacity: 0; }
  55%  { transform: translateY(-4px) scale(1.15); opacity: 1; }
  80%  { transform: translateY(1px)  scale(0.96); }
  100% { transform: translateY(0)    scale(1);    opacity: 1; }
}
@keyframes dy-crown-glow {
  0%, 100% { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55))
                     drop-shadow(0 0 0px rgba(232,185,74,0.0)); }
  50%      { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55))
                     drop-shadow(0 0 4px rgba(232,185,74,0.45)); }
}
@keyframes dy-crown-shimmer {
  0%   { transform: rotate(-6deg) scale(1.05); }
  50%  { transform: rotate(6deg)  scale(1.10); }
  100% { transform: rotate(0deg)  scale(1.00); }
}
@media (prefers-reduced-motion: reduce) {
  .dy-card-hub-crown { animation: none !important; }
}

/* Popover — subtiel premium gradient dat aansluit op de huisstijl:
   cream → warm → soft clay accent. Geen vlakke cream meer. */
#${POP_ID} {
  position: fixed;
  z-index: 10001;
  /* Gelaagd: linear basis (cream→warm) + 2 radial accent-glows in clay-tinten. */
  background:
    radial-gradient(120% 80% at  0%   0%, rgba(254,237,182,0.55) 0%, rgba(254,237,182,0) 55%),
    radial-gradient(120% 90% at 100% 100%, rgba(232,185,74, 0.18) 0%, rgba(232,185,74, 0) 60%),
    linear-gradient(160deg, var(--cream, #fdf8f0) 0%, var(--warm, #f5edda) 100%);
  color: var(--ink, #1e1a0f);
  border: 1px solid rgba(232,185,74,0.28);
  border-radius: 14px;
  box-shadow:
    0 12px 32px rgba(30,26,15,0.22),
    0 4px 10px  rgba(30,26,15,0.10),
    inset 0 1px 0 rgba(254,252,245,0.55);
  padding: 6px;
  display: none;
  min-width: 188px;
  opacity: 0;
  transform: translateY(-4px) scale(.98);
  transition: opacity .14s ease, transform .18s cubic-bezier(.34,1.56,.64,1);
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
#${POP_ID}.open {
  display: block;
  opacity: 1;
  transform: translateY(0) scale(1);
}

.dy-card-hub-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  background: transparent; border: none;
  padding: 9px 12px; border-radius: 10px;
  font: 600 13px/1.3 inherit;
  color: var(--ink, #1e1a0f);
  text-align: left;
  cursor: pointer;
  transition: background .16s ease, transform .12s ease;
}
.dy-card-hub-item + .dy-card-hub-item { margin-top: 2px; }
.dy-card-hub-item:hover {
  /* Hover blendt mee met de popover-gradient: warme highlight zonder harde kant. */
  background: linear-gradient(95deg,
    rgba(232,185,74,0.18) 0%,
    rgba(254,237,182,0.10) 100%);
}
.dy-card-hub-item:active { transform: scale(0.985); }
/* WCAG 2.4.7 — focus indicator voor keyboard nav (crown popover) */
.dy-card-hub-item:focus-visible {
  outline: 2px solid var(--clay, #c67d06);
  outline-offset: -2px;
  background: linear-gradient(95deg,
    rgba(232,185,74,0.22) 0%,
    rgba(254,237,182,0.14) 100%);
}
.${BTN_CLASS}:focus-visible {
  outline: 2px solid #e8b94a;
  outline-offset: 2px;
}
.dy-card-hub-item-icon {
  width: 30px; height: 30px; border-radius: 50%;
  /* Icon-badge krijgt zelfde dark-clay vibe als de crown-knop */
  background: radial-gradient(circle at 30% 30%, #3a2a10, var(--ink, #1e1a0f));
  color: var(--white, #fefcf5);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(254,252,245,0.08);
}
.dy-card-hub-item-label { flex: 1; }
.dy-card-hub-divider {
  height: 1px;
  margin: 6px 8px;
  background: linear-gradient(90deg, transparent, rgba(198,125,6,0.22), transparent);
  border: 0;
}
/* "Rapporteren" en "Blokkeren" subtiel rood-getint voor duidelijke intentie */
.dy-card-hub-item[data-actie="report"],
.dy-card-hub-item[data-actie="block"] {
  color: #7a1d10;
}
.dy-card-hub-item[data-actie="report"]:hover,
.dy-card-hub-item[data-actie="block"]:hover {
  background: rgba(192,57,43,0.08) !important;
}

@media (prefers-color-scheme: dark) {
  #${POP_ID} {
    background:
      radial-gradient(120% 80% at  0%   0%, rgba(232,185,74,0.18) 0%, rgba(232,185,74,0) 55%),
      radial-gradient(120% 90% at 100% 100%, rgba(198,125,6, 0.22) 0%, rgba(198,125,6,0) 60%),
      linear-gradient(160deg, #2a2218 0%, #1e1a0f 100%);
    color: #f5edda;
    border-color: rgba(232,185,74,0.32);
    box-shadow:
      0 12px 32px rgba(0,0,0,0.55),
      0 4px 10px  rgba(0,0,0,0.35),
      inset 0 1px 0 rgba(232,185,74,0.10);
  }
  .dy-card-hub-item { color: #f5edda; }
  .dy-card-hub-item:hover {
    background: linear-gradient(95deg,
      rgba(232,185,74,0.20) 0%,
      rgba(198,125,6, 0.12) 100%);
  }
}

#${BACK_ID} {
  position: fixed; inset: 0; z-index: 10000;
  background: transparent;
  display: none;
}
#${BACK_ID}.open { display: block; }
`;
    document.head.appendChild(s);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
