// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Notification Skin v1 (visual-only)
//
// Eén gedeelde brand-aligned surface voor ALLE notification-componenten:
//   - push-notifications modal       (#dy-push-modal)
//   - weekly stylist banner+modal    (#dy-weekly-banner, #dy-weekly-modal)
//   - virtual try-on modal           (#dy-tryon-modal)
//   - outfit score detail card       (.dy-score-detail)
//   - network status toast           (.dy-net-toast)
//   - sw-update banner               (#dy-sw-update)
//   - a2hs install prompt            (#dy-a2hs)
//
// Werking:
//   - Hoge-specificiteit overrides die platte crème vervangen door de
//     premium gradient van de AI Style Assistant / Crown popover.
//   - GEEN logic-wijzigingen, geen DOM-wijzigingen - alleen CSS.
//   - Gebruikt bestaande CSS-tokens (--cream, --warm, --clay, --ink) uit
//     app.css zodat dark-mode + responsive automatisch meedoen.
//
// Non-invasief: pwa-v463-*.js, push-notifications-v3.js etc blijven ongewijzigd.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppNotifSkinInit) return;
  window.__ppNotifSkinInit = true;

  var STYLE_ID = 'dy-notification-skin';

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.setAttribute('data-pp-notification-skin', 'v1');
    // Hoge specificiteit via #id + body→html cascade; gebruikt ALLEEN
    // bestaande huisstijl-tokens (var fallbacks ook van app.css).
    s.textContent = [
      /* ── Gedeelde premium surface (AI Style Assistant gradient) ── */
      'html .dy-notif-surface,',
      'html #dy-push-modal .dy-push-card,',
      'html #dy-push-modal > div,',
      'html #dy-weekly-modal .frame,',
      'html #dy-tryon-modal .dy-tryon-frame,',
      'html .dy-score-detail,',
      'html #dy-sw-update,',
      'html #dy-a2hs,',
      'html .dy-net-toast{',
      '  background:',
      '    radial-gradient(60% 50% at 0% 0%, rgba(254,237,182,0.45) 0%, rgba(254,237,182,0) 60%),',
      '    radial-gradient(70% 60% at 100% 100%, rgba(232,185,74,0.16) 0%, rgba(232,185,74,0) 65%),',
      '    linear-gradient(160deg, var(--cream,#fdf8f0) 0%, var(--warm,#f5edda) 100%) !important;',
      '  color: var(--ink,#1e1a0f) !important;',
      '  border: 1px solid rgba(198,125,6,0.18) !important;',
      '  box-shadow:',
      '    0 24px 56px rgba(30,26,15,0.32),',
      '    0 2px 6px rgba(30,26,15,0.08),',
      '    inset 0 1px 0 rgba(255,255,255,0.55),',
      '    inset 0 -1px 0 rgba(198,125,6,0.08) !important;',
      '  backdrop-filter: saturate(125%);',
      '  -webkit-backdrop-filter: saturate(125%);',
      '}',

      /* ── Weekly stylist banner: premium gold gradient (was flat goud) ── */
      'html #dy-weekly-banner{',
      '  background:',
      '    radial-gradient(70% 60% at 100% 0%, rgba(255,236,180,0.45) 0%, rgba(255,236,180,0) 60%),',
      '    linear-gradient(135deg, var(--clay,#c67d06) 0%, var(--clay-d,#a56605) 55%, #7a4a04 100%) !important;',
      '  color: #fff6df !important;',
      '  border: 1px solid rgba(255,236,180,0.32) !important;',
      '  box-shadow:',
      '    0 18px 38px rgba(168,124,40,0.48),',
      '    inset 0 1px 0 rgba(255,255,255,0.28),',
      '    inset 0 -1px 0 rgba(0,0,0,0.18) !important;',
      '}',
      'html #dy-weekly-banner .ico{',
      '  background: rgba(30,26,15,0.62) !important;',
      '  color: var(--clay-l,#d4910a) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,236,180,0.25) !important;',
      '}',
      'html #dy-weekly-banner .txt{ color:#fff6df !important; }',
      'html #dy-weekly-banner .txt small{ color: rgba(255,246,223,0.78) !important; }',
      'html #dy-weekly-banner .x{ color:#fff6df !important; opacity:.72 !important; }',
      'html #dy-weekly-banner .x:hover{ opacity:1 !important; }',

      /* ── Weekly modal: subtitel + intro contrast ── */
      'html #dy-weekly-modal header .s{ color: var(--clay-d,#a56605) !important; letter-spacing:.1em }',
      'html #dy-weekly-modal .intro{ color: var(--ink-soft,#3a3018) !important; }',
      'html #dy-weekly-modal .pick{ border-top-color: rgba(198,125,6,0.16) !important; }',
      'html #dy-weekly-modal .pick h3{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-weekly-modal .pick p{ color: var(--ink-soft,#3a3018) !important; }',
      'html #dy-weekly-modal .pick ul{ color: var(--ink-muted,#7a6a3a) !important; }',
      'html #dy-weekly-modal .pick .reason{ color: var(--clay-d,#a56605) !important; font-style:normal; font-weight:500 }',
      'html #dy-weekly-modal .pick .shop{',
      '  background: linear-gradient(135deg, var(--ink,#1e1a0f) 0%, #2a2515 100%) !important;',
      '  color: var(--cream,#fdf8f0) !important;',
      '  box-shadow: 0 6px 18px rgba(30,26,15,0.32), inset 0 1px 0 rgba(255,255,255,0.08) !important;',
      '  border:1px solid rgba(198,125,6,0.32) !important;',
      '}',
      'html #dy-weekly-modal .pick .shop:hover{ background: linear-gradient(135deg, #2a2515 0%, var(--clay-d,#a56605) 100%) !important; }',
      'html #dy-weekly-modal .close{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-weekly-modal .close:hover{ background: rgba(198,125,6,0.12) !important; }',

      /* ── Try-On modal: header divider + slots ── */
      'html #dy-tryon-modal header{ border-bottom-color: rgba(198,125,6,0.18) !important; }',
      'html #dy-tryon-modal header h2{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-tryon-modal header small{ color: var(--clay-d,#a56605) !important; letter-spacing:.04em }',
      'html #dy-tryon-modal .dy-tryon-slot{',
      '  background: rgba(255,255,255,0.42) !important;',
      '  border-color: rgba(198,125,6,0.42) !important;',
      '}',
      'html #dy-tryon-modal .dy-tryon-slot.filled{ border-color: var(--clay,#c67d06) !important; }',
      'html #dy-tryon-modal .dy-tryon-slot .hint{ color: var(--ink-soft,#3a3018) !important; }',
      'html #dy-tryon-modal .dy-tryon-extra input{',
      '  background: rgba(255,255,255,0.65) !important;',
      '  border-color: rgba(198,125,6,0.24) !important;',
      '  color: var(--ink,#1e1a0f) !important;',
      '}',
      'html #dy-tryon-modal .dy-tryon-cta{',
      '  background: linear-gradient(135deg, var(--ink,#1e1a0f) 0%, #2a2515 100%) !important;',
      '  color: var(--cream,#fdf8f0) !important;',
      '  box-shadow: 0 8px 20px rgba(30,26,15,0.35), inset 0 1px 0 rgba(255,255,255,0.08) !important;',
      '  border: 1px solid rgba(198,125,6,0.32) !important;',
      '}',
      'html #dy-tryon-modal .dy-tryon-cta:not(:disabled):hover{ background: linear-gradient(135deg, #2a2515 0%, var(--clay-d,#a56605) 100%) !important; }',
      'html #dy-tryon-modal .dy-tryon-share{ background: linear-gradient(135deg, var(--clay,#c67d06), var(--clay-d,#a56605)) !important; color:#fff6df !important; }',
      'html #dy-tryon-modal .dy-tryon-loading{ color: var(--clay-d,#a56605) !important; }',
      'html #dy-tryon-modal .dy-tryon-loading .spin{ border-color: rgba(198,125,6,0.22) !important; border-top-color: var(--clay,#c67d06) !important; }',
      'html #dy-tryon-modal .dy-tryon-err{',
      '  background: linear-gradient(135deg, rgba(192,57,43,0.16), rgba(192,57,43,0.08)) !important;',
      '  color: #7a1d10 !important;',
      '  border: 1px solid rgba(192,57,43,0.28) !important;',
      '}',
      'html #dy-tryon-modal .dy-tryon-caption{ color: var(--ink-soft,#3a3018) !important; }',
      'html #dy-tryon-modal .dy-tryon-close{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-tryon-modal .dy-tryon-close:hover{ background: rgba(198,125,6,0.12) !important; }',

      /* ── Outfit score detail card ── */
      'html .dy-score-detail{ color: var(--ink,#1e1a0f) !important; }',
      'html .dy-score-detail .summary{ color: var(--ink,#1e1a0f) !important; }',
      'html .dy-score-detail .tips li{ color: var(--ink-soft,#3a3018) !important; }',
      'html .dy-score-detail .tips li::before{ color: var(--clay,#c67d06) !important; }',
      'html .dy-score-detail .palette small{ color: var(--ink-muted,#7a6a3a) !important; }',
      'html .dy-score-detail .swatch{ border-color: rgba(198,125,6,0.22) !important; box-shadow: inset 0 0 0 2px rgba(255,255,255,0.6), 0 2px 4px rgba(30,26,15,0.12) !important; }',

      /* ── Outfit score pill: brand gold ── */
      'html .dy-score-pill{',
      '  background: linear-gradient(135deg, var(--ink,#1e1a0f) 0%, #2a2515 100%) !important;',
      '  color: var(--cream,#fdf8f0) !important;',
      '  box-shadow: 0 4px 12px rgba(30,26,15,0.28), inset 0 1px 0 rgba(255,236,180,0.12) !important;',
      '  border: 1px solid rgba(198,125,6,0.32) !important;',
      '}',
      'html .dy-score-pill:hover{ background: linear-gradient(135deg, #2a2515 0%, var(--clay-d,#a56605) 100%) !important; }',
      'html .dy-score-pill .num{',
      '  background: linear-gradient(135deg, var(--clay-l,#d4910a) 0%, var(--clay,#c67d06) 100%) !important;',
      '  color: var(--ink,#1e1a0f) !important;',
      '  box-shadow: inset 0 1px 0 rgba(255,255,255,0.32) !important;',
      '}',

      /* ── Push notifications modal ── */
      'html #dy-push-modal{',
      '  background: rgba(20,17,8,0.78) !important;',
      '  backdrop-filter: blur(8px) saturate(120%) !important;',
      '  -webkit-backdrop-filter: blur(8px) saturate(120%) !important;',
      '}',
      'html #dy-push-modal .dy-push-h1, html #dy-push-modal h2{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-push-modal .dy-push-status-aan{',
      '  background: linear-gradient(135deg, rgba(26,107,58,0.18), rgba(26,107,58,0.06)) !important;',
      '  color: #0e4a26 !important;',
      '  border: 1px solid rgba(26,107,58,0.22) !important;',
      '}',
      'html #dy-push-modal .dy-push-status-denied{',
      '  background: linear-gradient(135deg, rgba(192,57,43,0.14), rgba(192,57,43,0.04)) !important;',
      '  color: #7a1d10 !important;',
      '  border: 1px solid rgba(192,57,43,0.22) !important;',
      '}',
      'html #dy-push-modal .dy-push-opt{',
      '  background: rgba(255,255,255,0.42) !important;',
      '  border: 1px solid rgba(198,125,6,0.18) !important;',
      '  backdrop-filter: blur(4px);',
      '}',
      'html #dy-push-modal .dy-push-opt:hover{',
      '  background: rgba(255,255,255,0.65) !important;',
      '  border-color: var(--clay,#c67d06) !important;',
      '  box-shadow: 0 4px 12px rgba(198,125,6,0.18) !important;',
      '}',
      'html #dy-push-modal .dy-push-cta, html #dy-push-modal button[data-act="aanzetten"], html #dy-push-modal button[data-act="opslaan"]{',
      '  background: linear-gradient(135deg, var(--ink,#1e1a0f) 0%, #2a2515 100%) !important;',
      '  color: var(--cream,#fdf8f0) !important;',
      '  box-shadow: 0 8px 20px rgba(30,26,15,0.35), inset 0 1px 0 rgba(255,255,255,0.08) !important;',
      '  border: 1px solid rgba(198,125,6,0.32) !important;',
      '}',
      'html #dy-push-modal .dy-push-cta:hover{ background: linear-gradient(135deg, #2a2515 0%, var(--clay-d,#a56605) 100%) !important; }',
      'html #dy-push-modal .dy-push-close{ background: transparent !important; color: var(--ink,#1e1a0f) !important; }',
      'html #dy-push-modal .dy-push-close:hover{ background: rgba(198,125,6,0.14) !important; }',

      /* ── Network status toast ── */
      'html .dy-net-toast.offline{',
      '  background: linear-gradient(135deg, rgba(122,29,16,0.96) 0%, rgba(90,20,10,0.96) 100%) !important;',
      '  color: #ffe8e2 !important;',
      '  border: 1px solid rgba(255,193,178,0.18) !important;',
      '  box-shadow: 0 16px 36px rgba(122,29,16,0.36), inset 0 1px 0 rgba(255,255,255,0.10) !important;',
      '}',
      'html .dy-net-toast.online{',
      '  background: linear-gradient(135deg, rgba(14,74,38,0.96) 0%, rgba(8,52,26,0.96) 100%) !important;',
      '  color: #d9f3e3 !important;',
      '  border: 1px solid rgba(178,234,200,0.18) !important;',
      '  box-shadow: 0 16px 36px rgba(14,74,38,0.36), inset 0 1px 0 rgba(255,255,255,0.10) !important;',
      '}',

      /* ── SW update banner ── */
      'html #dy-sw-update{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-sw-update button{',
      '  background: linear-gradient(135deg, var(--clay,#c67d06), var(--clay-d,#a56605)) !important;',
      '  color: #fff6df !important;',
      '  border: 1px solid rgba(255,236,180,0.32) !important;',
      '  box-shadow: 0 4px 12px rgba(198,125,6,0.32) !important;',
      '}',

      /* ── A2HS install prompt ── */
      'html #dy-a2hs{ color: var(--ink,#1e1a0f) !important; }',
      'html #dy-a2hs .cta, html #dy-a2hs button.primary{',
      '  background: linear-gradient(135deg, var(--ink,#1e1a0f) 0%, var(--clay-d,#a56605) 100%) !important;',
      '  color: var(--cream,#fdf8f0) !important;',
      '  border: 1px solid rgba(198,125,6,0.32) !important;',
      '  box-shadow: 0 8px 20px rgba(30,26,15,0.30) !important;',
      '}',

      /* ── Safe-area & responsive guards (geen ander gedrag, alleen visueel) ── */
      '@media (max-width:480px){',
      '  html #dy-weekly-banner{ bottom: calc(env(safe-area-inset-bottom,0) + 180px) !important; max-width: 92vw !important; }',
      '  html .dy-net-toast{ left: 12px !important; right: 12px !important; max-width: calc(100vw - 24px) !important; }',
      '  html #dy-push-modal .dy-push-card,',
      '  html #dy-weekly-modal .frame,',
      '  html #dy-tryon-modal .dy-tryon-frame{',
      '    padding-bottom: calc(env(safe-area-inset-bottom,0) + 16px) !important;',
      '  }',
      '}',

      /* ── Dark-scheme respect (gebruikt --ink-* tokens uit app.css) ── */
      '@media (prefers-color-scheme: dark){',
      '  html .dy-notif-surface,',
      '  html #dy-push-modal .dy-push-card,',
      '  html #dy-push-modal > div,',
      '  html #dy-weekly-modal .frame,',
      '  html #dy-tryon-modal .dy-tryon-frame,',
      '  html .dy-card-modal-frame,',
      '  html #dy-garderobe-overlay > div,',
      '  html .dy-score-detail{',
      '    background:',
      '      radial-gradient(60% 50% at 0% 0%, rgba(232,185,74,0.22) 0%, rgba(232,185,74,0) 60%),',
      '      linear-gradient(160deg, #1c1810 0%, #2a2418 100%) !important;',
      '    color: var(--cream,#fdf8f0) !important;',
      '    border-color: rgba(198,125,6,0.34) !important;',
      '  }',
      /* Dark-mode text overrides - fix slecht contrast op donker oppervlak */
      '  html .dy-card-modal-frame .dy-card-modal-title,',
      '  html .dy-card-modal-frame .dy-card-modal-body,',
      '  html .dy-card-modal-frame .dy-card-modal-body *,',
      '  html .dy-card-modal-frame strong{',
      '    color: var(--cream,#fdf8f0) !important;',
      '  }',
      '  html .dy-card-modal-frame .dy-card-modal-body strong{ color:#ffd98a !important; }',
      '  html .dy-card-modal-frame .dy-card-modal-radio{',
      '    background: rgba(255,255,255,0.06) !important;',
      '    border-color: rgba(255,236,180,0.20) !important;',
      '    color: var(--cream,#fdf8f0) !important;',
      '  }',
      '  html .dy-card-modal-frame .dy-card-modal-cancel{',
      '    color: var(--cream,#fdf8f0) !important;',
      '    border-color: rgba(255,236,180,0.32) !important;',
      '  }',
      '  html #dy-garderobe-overlay h2,',
      '  html #dy-garderobe-overlay strong{ color: var(--cream,#fdf8f0) !important; }',
      '  html #dy-garderobe-overlay [data-count]{ color: rgba(253,248,240,0.72) !important; }',
      '}',

      /* ── Reduced motion ── */
      '@media (prefers-reduced-motion: reduce){',
      '  html #dy-weekly-banner,',
      '  html .dy-net-toast,',
      '  html .dy-score-pill,',
      '  html .dy-score-detail{ transition:none !important; animation:none !important; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
