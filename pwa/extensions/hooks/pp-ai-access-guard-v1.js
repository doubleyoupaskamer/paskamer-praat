/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT — AI Access Guard (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Centrale autorisatielaag voor ALLE AI-modules. Volledig additief —
 * geen bestaande module wordt aangeraakt. Werkt via een wereldwijde
 * fetch-hijack die AI-endpoints herkent en pre-flight controles doet.
 *
 * REGELS (per prompt):
 *   1) Niet-ingelogd  → toon login-popup, blokkeer request.
 *   2) Premium        → onbeperkte toegang, geen teller.
 *   3) Ingelogd niet-premium:
 *      - Max 5 AI-analyses per kalendermaand (gedeelde teller).
 *      - Eerste gebruik in nieuwe maand → info-popup één keer.
 *      - 6e analyse → premium-upgrade popup, request geblokkeerd.
 *   4) Teller persistente in Firestore: `ai_usage/{uid}_{YYYY-MM}`
 *   5) Teller reset automatisch bij nieuwe maand (nieuwe doc ID).
 *
 * BESCHERMDE ENDPOINTS (regex match):
 *   - /api/ai/*
 *   - /api/tryon
 *   - /api/outfit-score
 *   - /api/wardrobe/recommend
 *   - /api/weekly-stylist
 *   - /api/admin/generate-image  (mits niet-admin) → alleen premium
 *   - /api/admin/generate-video  (mits niet-admin) → alleen premium
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppAiAccessGuardInit) return;
  window.__ppAiAccessGuardInit = true;

  var FREE_LIMIT = 5;
  // v60.1.247/252: EXPLICIETE lijst van user-initiated AI-generation endpoints
  // die tegen de limiet tellen. Passive endpoints (health, embedding
  // matching, prefetch) mogen ALTIJD door - anders blokkeert de guard
  // menu-open flows voor gasten.
  //
  // v60.1.252 KRITIEKE UITBREIDING: legacy modules (Outfit Vergelijker /
  // Kleuranalyse / AI Chat improvement engine) roepen `api.anthropic.com`
  // DIRECT aan, buiten onze backend om. Deze moeten OOK gecontroleerd
  // worden — anders bypassen ze de gehele autorisatielaag.
  var AI_ENDPOINT_PATTERNS = [
    // ─── Backend AI endpoints ──────────────────────────────────────────
    /\/api\/tryon(\?|$)/i,
    /\/api\/outfit-score(\?|$)/i,
    /\/api\/wardrobe\/recommend(\?|$)/i,
    /\/api\/weekly-stylist(\?|$)/i,
    /\/api\/ai\/style-assistant(\?|$)/i,
    /\/api\/ai\/score-outfit(\?|$)/i,
    // ─── Externe AI provider endpoints (legacy direct-calls) ──────────
    /^https?:\/\/api\.anthropic\.com\/v1\/messages/i,
    /^https?:\/\/api\.openai\.com\/v1\/(chat|completions|images|responses|embeddings|audio)/i,
    /^https?:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:(generateContent|streamGenerateContent|embedContent)/i,
    /^https?:\/\/doubleyou-patroon-server\.onrender\.com\/patroon/i,
  ];
  // Expliciete whitelist (passieve/health/prefetch endpoints - nooit guarden)
  var AI_ENDPOINT_WHITELIST = [
    /\/api\/ai\/health(\?|$)/i,
    /\/api\/ai\/similar-items(\?|$)/i,
    /\/api\/ai\/embed(\?|$)/i,
    /\/api\/ai\/config(\?|$)/i,
  ];

  function log(m) { try { console.info('[ai-guard]', m); } catch (_) {} }
  function db()  { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }

  // v60.1.248: Auth uit Firebase Auth (source of truth), NIET uit DY.user.
  //   DY.user kan stale zijn na logout. Firebase Auth is direct accuraat.
  function fbAuth() {
    try { return window.firebase && firebase.auth ? firebase.auth() : null; } catch (_) { return null; }
  }
  function firebaseUid() {
    var a = fbAuth();
    if (!a) return null;
    var u = a.currentUser;
    return (u && !u.isAnonymous && u.uid) ? u.uid : null;
  }
  function uid() {
    // Combineer beide bronnen: gebruiker MOET beide passeren (defense in depth)
    var fb = firebaseUid();
    if (!fb) return null;
    try {
      var dyU = window.DY && DY.user;
      if (dyU && dyU.uid && dyU.uid !== fb) return null; // mismatch → treat as gast
    } catch (_) {}
    return fb;
  }
  function isGuest() {
    // v60.1.248: strict check — Firebase Auth is bron van waarheid
    var a = fbAuth();
    if (!a) return true;
    var u = a.currentUser;
    if (!u) return true;
    if (u.isAnonymous === true) return true;
    if (!u.uid) return true;
    return false;
  }

  // v60.1.248: Premium status cache met invalidatie bij auth-change
  var _premCache = { uid: null, isPrem: false, at: 0 };
  var PREM_CACHE_MS = 60 * 1000; // 60 sec — kort genoeg om vervalcheck relevant te houden
  async function isPremium() {
    var currentUid = uid();
    if (!currentUid) { _premCache = { uid: null, isPrem: false, at: 0 }; return false; }
    // Cache invalideren als uid veranderd is (nieuwe login na logout)
    if (_premCache.uid !== currentUid) _premCache = { uid: currentUid, isPrem: false, at: 0 };
    if (_premCache.at && (Date.now() - _premCache.at) < PREM_CACHE_MS) return _premCache.isPrem;
    try {
      if (window.DY && DY.premium && typeof DY.premium.isPremium === 'function') {
        var r = await DY.premium.isPremium();
        _premCache = { uid: currentUid, isPrem: !!r, at: Date.now() };
        return _premCache.isPrem;
      }
    } catch (_) {}
    _premCache = { uid: currentUid, isPrem: false, at: Date.now() };
    return false;
  }
  function monthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function usageDocId() {
    var u = uid();
    return u ? (u + '_' + monthKey()) : null;
  }

  // ─── Firestore usage counter ─────────────────────────────────────────
  async function getUsage() {
    var d = db(); var id = usageDocId();
    if (!d || !id) return { count: 0, firstShown: false };
    try {
      var snap = await d.collection('ai_usage').doc(id).get();
      if (!snap.exists) return { count: 0, firstShown: false };
      var v = snap.data() || {};
      return { count: Number(v.count || 0), firstShown: v.firstShown === true };
    } catch (e) {
      log('getUsage err: ' + (e && e.message));
      return { count: 0, firstShown: false };
    }
  }
  async function incUsage() {
    var d = db(); var id = usageDocId(); var u = uid();
    if (!d || !id || !u) return 0;
    try {
      var ref = d.collection('ai_usage').doc(id);
      var FieldValue = window.firebase && firebase.firestore && firebase.firestore.FieldValue;
      var payload = {
        userId: u,
        month: monthKey(),
        count: FieldValue && FieldValue.increment ? FieldValue.increment(1) : 1,
        laatsteUpdate: (FieldValue && FieldValue.serverTimestamp && FieldValue.serverTimestamp()) || new Date(),
      };
      await ref.set(payload, { merge: true });
      var snap = await ref.get();
      return Number((snap.data() || {}).count || 0);
    } catch (e) {
      log('incUsage err: ' + (e && e.message));
      return 0;
    }
  }
  async function markFirstShown() {
    var d = db(); var id = usageDocId();
    if (!d || !id) return;
    try {
      await d.collection('ai_usage').doc(id).set({ firstShown: true }, { merge: true });
    } catch (e) { log('markFirstShown err: ' + (e && e.message)); }
  }

  // ─── Modals ──────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('pp-ai-guard-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-ai-guard-css';
    s.textContent =
      '.pp-aig-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);animation:pp-aig-fade .18s ease-out}' +
      '@keyframes pp-aig-fade{from{opacity:0}to{opacity:1}}' +
      '.pp-aig-box{position:relative;background:linear-gradient(155deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,.42);border-radius:16px;padding:26px 24px 22px;max-width:460px;width:100%;color:#fcf8ef;font-family:"DM Sans",system-ui,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.6)}' +
      '.pp-aig-box h3{margin:0 0 10px;font:400 1.4rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#f0b340;padding-right:36px}' +
      '.pp-aig-box p{margin:0 0 14px;color:#fdf5e3;line-height:1.6;font-size:.95rem}' +
      '.pp-aig-box .pp-aig-badge{display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(212,145,10,.20);border:1px solid rgba(212,145,10,.45);color:#f0b340;font:700 11px/1 "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px}' +
      // X-close button — hoog contrast, groot klikgebied
      '.pp-aig-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.10);border:1px solid rgba(240,179,64,.45);color:#f0b340;cursor:pointer;font:700 22px/1 "DM Sans",sans-serif;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:all .15s ease;line-height:1}' +
      '.pp-aig-x:hover,.pp-aig-x:focus-visible{background:rgba(240,179,64,.20);color:#fff;transform:scale(1.08);outline:none;box-shadow:0 0 0 3px rgba(240,179,64,.28)}' +
      '.pp-aig-x:active{transform:scale(.94)}' +
      '.pp-aig-acts{display:flex;flex-wrap:wrap;gap:12px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid rgba(240,179,64,.18)}' +
      '.pp-aig-btn{padding:10px 20px;border-radius:999px;font:600 13.5px/1 "DM Sans",sans-serif;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:all .15s;min-height:44px}' +
      '.pp-aig-btn-ghost{background:transparent;border-color:rgba(240,179,64,.35);color:#f0b340}' +
      '.pp-aig-btn-ghost:hover,.pp-aig-btn-ghost:focus-visible{background:rgba(240,179,64,.10);color:#fdf5e3;outline:none}' +
      '.pp-aig-btn-primair{background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08;font-weight:700}' +
      '.pp-aig-btn-primair:hover,.pp-aig-btn-primair:focus-visible{transform:translateY(-1px);box-shadow:0 8px 22px rgba(212,145,10,.45);outline:none}';
    document.head.appendChild(s);
  }
  function showModal(html) {
    injectCss();
    // Voorkom dubbele modals
    var existing = document.querySelector('.pp-aig-ov');
    if (existing) existing.parentNode.removeChild(existing);
    var ov = document.createElement('div');
    ov.className = 'pp-aig-ov';
    ov.setAttribute('data-testid', 'pp-ai-guard-modal');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    // v60.1.249: elke modal krijgt een goed zichtbare X-close (WCAG AA)
    ov.innerHTML = '<div class="pp-aig-box">' +
      '<button type="button" class="pp-aig-x" data-role="x-close" data-testid="pp-ai-guard-close" aria-label="Sluiten">×</button>' +
      html +
    '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeModal();
      var xr = e.target.getAttribute && e.target.getAttribute('data-role');
      if (xr === 'x-close') closeModal();
    });
    // ESC key sluit
    var escHandler = function (e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
    return ov;
  }
  function closeModal() {
    var ov = document.querySelector('.pp-aig-ov');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
  }

  // v60.1.253: Centrale helper om de Premium-upgrade-modal te openen.
  //   Sluit EERST alle bestaande overlays (guard-modal, quota-banner én
  //   legacy overlays) zodat de premium-modal altijd bovenop een schone
  //   achtergrond verschijnt. Geen dubbele modals meer.
  function openPremiumUpgrade() {
    try {
      // 1. Sluit onze eigen overlays
      closeModal();
      try { removeBanner(); } catch (_) {}
      // 2. Sluit bekende legacy overlays defensief (alleen als open)
      var legacySelectors = [
        '#dy-prem-manage-overlay',
        '.dy-detail-overlay',          // outfit detail
        '.dy-verhaal-overlay',         // verhaal viewer
        '.dy-share-overlay',           // deel-modal
        '#dy-tryon-modal',
        '#dy-wardrobe-rec-modal',
        '#dy-weekly-modal',
        '#dy-push-modal',
        '.dy-score-detail',            // outfit-score detail
        '.dy-modal[data-modal-open="true"]',
      ];
      legacySelectors.forEach(function (sel) {
        try {
          var el = document.querySelector(sel);
          if (el && el.parentNode) {
            // Als het een echte modal is met een close-methode → probeer die
            // eerst; anders gewoon verwijderen (defensief, geen crash)
            var closeBtn = el.querySelector('[data-role="x-close"], .dy-tryon-close, .dy-wr-close, .dy-prem-close, .close');
            if (closeBtn && typeof closeBtn.click === 'function') {
              closeBtn.click();
            } else {
              el.style.display = 'none';
            }
          }
        } catch (_) {}
      });
      // 3. Focus reset zodat de premium-modal keyboard-toegankelijk is
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
      // 4. Open de premium-modal via de bestaande DY-API (of PP_Premium)
      var opened = false;
      try {
        if (window.DY && DY.premium && typeof DY.premium.openUpgrade === 'function') {
          DY.premium.openUpgrade(); opened = true;
        } else if (window.PP_Premium && typeof PP_Premium.openUpgrade === 'function') {
          PP_Premium.openUpgrade(); opened = true;
        }
      } catch (_) {}
      if (!opened) {
        try { location.hash = '#premium'; } catch (_) {}
      }
    } catch (e) {
      try { console.warn('[ai-guard] openPremiumUpgrade err:', e && e.message); } catch (_) {}
      try { location.hash = '#premium'; } catch (_) {}
    }
  }

  function showLoginPrompt() {
    // v60.1.246: Gebruik altijd eigen modal (DY.toonLoginPrompt kan silently
    // falen bij sommige app-states). Consistent UX gegarandeerd.
    var ov = showModal(
      '<span class="pp-aig-badge">Login vereist</span>' +
      '<h3>Log in om AI te gebruiken</h3>' +
      '<p>Alle AI-functionaliteiten (Outfit Score, Style Assistant, Probeer Aan, Media Generator, Wardrobe Advies) zijn alleen beschikbaar voor ingelogde gebruikers.</p>' +
      '<div class="pp-aig-acts">' +
        '<button class="pp-aig-btn pp-aig-btn-ghost" data-role="close" data-testid="pp-aig-login-close">Sluiten</button>' +
        '<button class="pp-aig-btn pp-aig-btn-primair" data-role="login" data-testid="pp-aig-login-open">Inloggen</button>' +
      '</div>'
    );
    ov.addEventListener('click', function (e) {
      var r = e.target.getAttribute && e.target.getAttribute('data-role');
      if (r === 'close') closeModal();
      if (r === 'login') {
        closeModal();
        // Probeer bestaande login-flow, anders hash-navigate
        try {
          if (window.DY && typeof DY.toonLoginPrompt === 'function') {
            DY.toonLoginPrompt('Log in om AI te gebruiken.');
            return;
          }
          if (window.DY && typeof DY.toonLogin === 'function') {
            DY.toonLogin();
            return;
          }
          if (window.DY && typeof DY.navigeer === 'function') {
            DY.navigeer('login');
            return;
          }
        } catch (_) {}
        location.hash = '#login';
      }
    });
  }

  function showFirstUseInfo() {
    return new Promise(function (resolve) {
      var ov = showModal(
        '<span class="pp-aig-badge">Deze maand</span>' +
        '<h3>Je hebt 5 gratis AI-analyses</h3>' +
        '<p>Je kunt deze maand <strong>5 AI-analyses</strong> gratis uitvoeren over alle AI-functies (Outfit Score, Probeer Aan, Style Assistant, Wardrobe Advies).</p>' +
        '<p style="font-size:.85rem;color:rgba(252,248,239,.62)">Na deze 5 analyses kun je <strong>onbeperkt</strong> gebruikmaken van alle AI-functies door te upgraden naar Premium.</p>' +
        '<div class="pp-aig-acts">' +
          '<button class="pp-aig-btn pp-aig-btn-ghost" data-role="premium-info" data-testid="pp-aig-first-info">Meer over Premium</button>' +
          '<button class="pp-aig-btn pp-aig-btn-primair" data-role="continue" data-testid="pp-aig-first-continue">Doorgaan</button>' +
        '</div>'
      );
      ov.addEventListener('click', function (e) {
        var r = e.target.getAttribute && e.target.getAttribute('data-role');
        if (r === 'continue') { closeModal(); markFirstShown(); resolve(true); }
        if (r === 'premium-info') {
          openPremiumUpgrade();
          resolve(false);
        }
      });
    });
  }

  function showLimitReached() {
    var ov = showModal(
      '<span class="pp-aig-badge">Limiet bereikt</span>' +
      '<h3>Je hebt je 5 gratis analyses gebruikt</h3>' +
      '<p>Je hebt deze maand je <strong>5 gratis AI-analyses</strong> gebruikt. Upgrade naar Premium om <strong>onbeperkt</strong> gebruik te maken van alle AI-functionaliteiten.</p>' +
      '<div class="pp-aig-acts">' +
        '<button class="pp-aig-btn pp-aig-btn-ghost" data-role="close" data-testid="pp-aig-limit-later">Misschien later</button>' +
        '<button class="pp-aig-btn pp-aig-btn-primair" data-role="upgrade" data-testid="pp-aig-limit-upgrade">Upgrade naar Premium</button>' +
      '</div>'
    );
    ov.addEventListener('click', function (e) {
      var r = e.target.getAttribute && e.target.getAttribute('data-role');
      if (r === 'close') closeModal();
      if (r === 'upgrade') {
        openPremiumUpgrade();
      }
    });
  }

  // v60.1.250 / v60.1.251: NIET-blokkerende banner boven een geopende AI-
  //   module. Twee varianten:
  //     - "info"    : voor niet-premium bij count < FREE_LIMIT → toont
  //                   progress-teller "X van 5 gebruikt" + progressbar.
  //     - "limit"   : bij count >= FREE_LIMIT → toont "Limiet bereikt".
  //   Uitkomst: zichtbaarheid VOOR de gebruiker op de limiet stuit,
  //   waardoor premium-conversie omhoog gaat zonder gratis-flow te
  //   frustreren.
  function injectBannerCss() {
    if (document.getElementById('pp-aig-banner-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-aig-banner-css';
    s.textContent =
      // Basis-container
      '.pp-aig-banner{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;' +
      'display:flex;align-items:center;gap:12px;padding:12px 16px 12px 14px;max-width:min(560px,94vw);' +
      'background:linear-gradient(135deg,#1a140c,#241a0e);border:1px solid rgba(240,179,64,.55);' +
      'border-radius:14px;color:#fdf5e3;font-family:"DM Sans",system-ui,sans-serif;font-size:13.5px;' +
      'line-height:1.45;box-shadow:0 18px 42px rgba(0,0,0,.55);' +
      'animation:pp-aig-banner-in .24s ease-out}' +
      '@keyframes pp-aig-banner-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}' +
      // Icon-cirkel (variant per state)
      '.pp-aig-banner-icon{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:rgba(240,179,64,.20);' +
      'display:inline-flex;align-items:center;justify-content:center;color:#f0b340;font:700 15px/1 "DM Sans",sans-serif}' +
      '.pp-aig-banner.state-warn .pp-aig-banner-icon{background:rgba(240,179,64,.30);color:#ffdb8a}' +
      '.pp-aig-banner.state-limit .pp-aig-banner-icon{background:rgba(217,74,52,.28);color:#ff9a82;border:1px solid rgba(217,74,52,.6)}' +
      // Tekstblok + progressbar
      '.pp-aig-banner-txt{flex:1 1 auto;min-width:0}' +
      '.pp-aig-banner-txt strong{color:#f0b340;font-weight:700}' +
      '.pp-aig-banner-title{display:block;font-weight:600;color:#fdf5e3;margin-bottom:4px;font-size:13.5px;letter-spacing:.005em}' +
      '.pp-aig-banner-sub{display:block;color:rgba(253,245,227,.72);font-size:11.5px;line-height:1.35}' +
      '.pp-aig-banner.state-limit .pp-aig-banner-title{color:#ffb59a}' +
      // Progress-strip
      '.pp-aig-progress{display:block;position:relative;height:5px;border-radius:999px;background:rgba(253,245,227,.14);' +
      'margin:6px 0 3px;overflow:hidden}' +
      '.pp-aig-progress-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#d4910a,#f0b340);' +
      'transition:width .45s cubic-bezier(.4,0,.2,1);min-width:4px}' +
      '.pp-aig-banner.state-warn .pp-aig-progress-fill{background:linear-gradient(90deg,#e6a63a,#ffd577)}' +
      '.pp-aig-banner.state-limit .pp-aig-progress-fill{background:linear-gradient(90deg,#c94a34,#ff8a70)}' +
      // CTA + close
      '.pp-aig-banner-cta{flex:0 0 auto;padding:8px 14px;border-radius:999px;background:linear-gradient(135deg,#d4910a,#f0b340);' +
      'color:#0f0c08;border:0;font:700 12.5px/1 "DM Sans",sans-serif;cursor:pointer;min-height:36px;white-space:nowrap;' +
      'transition:transform .15s ease,box-shadow .15s ease}' +
      '.pp-aig-banner-cta:hover,.pp-aig-banner-cta:focus-visible{transform:translateY(-1px);outline:none;box-shadow:0 6px 16px rgba(240,179,64,.35)}' +
      '.pp-aig-banner-cta.ghost{background:transparent;border:1px solid rgba(240,179,64,.45);color:#f0b340}' +
      '.pp-aig-banner-cta.ghost:hover,.pp-aig-banner-cta.ghost:focus-visible{background:rgba(240,179,64,.15);color:#fff}' +
      '.pp-aig-banner-x{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:rgba(240,179,64,.10);' +
      'border:1px solid rgba(240,179,64,.35);color:#f0b340;cursor:pointer;font:700 18px/1 "DM Sans",sans-serif;' +
      'display:inline-flex;align-items:center;justify-content:center;padding:0;transition:all .15s ease}' +
      '.pp-aig-banner-x:hover,.pp-aig-banner-x:focus-visible{background:rgba(240,179,64,.25);color:#fff;outline:none;transform:scale(1.06)}' +
      // Mobile: stack items zodat progressbar volledige breedte krijgt
      '@media (max-width:520px){.pp-aig-banner{left:10px;right:10px;transform:none;bottom:14px;max-width:none;flex-wrap:wrap;padding:12px 14px}' +
      '.pp-aig-banner-txt{flex:1 1 100%;order:2;width:100%}' +
      '.pp-aig-banner-icon{order:1}' +
      '.pp-aig-banner-cta{order:3;flex:1 1 auto}' +
      '.pp-aig-banner-x{order:4}' +
      '@keyframes pp-aig-banner-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}}' +
      // Reduced motion
      '@media (prefers-reduced-motion:reduce){.pp-aig-banner{animation:none}.pp-aig-progress-fill{transition:none}}';
    document.head.appendChild(s);
  }

  // Auto-dismiss timer handle om leaks te voorkomen
  var _bannerTimer = null;
  function removeBanner() {
    try {
      if (_bannerTimer) { clearTimeout(_bannerTimer); _bannerTimer = null; }
      var el = document.querySelector('.pp-aig-banner');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {}
  }
  function _escBanner(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // Toont een banner met de huidige stand. Aanroep is 100% defensief:
  //   - kraakt niet bij ontbrekende auth / db
  //   - stapelt geen dubbele banners
  //   - onafhankelijk van modal-lifecycle
  //   count  : integer >= 0
  //   limit  : integer (FREE_LIMIT)
  function renderUsageBanner(count, limit) {
    try {
      injectBannerCss();
      removeBanner();
      var safeCount = Math.max(0, Math.min(Number(count) || 0, limit));
      var pct = Math.round((safeCount / limit) * 100);
      var isLimit = safeCount >= limit;
      var isWarn  = !isLimit && safeCount >= (limit - 1); // laatste analyse
      var stateCls = isLimit ? 'state-limit' : (isWarn ? 'state-warn' : 'state-info');
      var iconChar = isLimit ? '!' : (isWarn ? '!' : (String(limit - safeCount)));
      var titleTxt, subTxt, ctaLabel;
      if (isLimit) {
        titleTxt = 'Limiet bereikt';
        subTxt   = 'Je ' + limit + ' gratis analyses zijn op. Upgrade voor onbeperkte AI.';
        ctaLabel = 'Upgrade';
      } else if (isWarn) {
        titleTxt = 'Nog 1 gratis analyse over';
        subTxt   = safeCount + ' van ' + limit + ' gebruikt deze maand. Upgrade nu voor onbeperkt.';
        ctaLabel = 'Upgrade';
      } else {
        titleTxt = safeCount + ' van ' + limit + ' AI-analyses gebruikt';
        subTxt   = 'Deze maand nog ' + (limit - safeCount) + ' gratis over. Upgrade voor onbeperkt.';
        ctaLabel = 'Upgrade';
      }
      var b = document.createElement('div');
      b.className = 'pp-aig-banner ' + stateCls;
      b.setAttribute('role', 'status');
      b.setAttribute('aria-live', 'polite');
      b.setAttribute('data-testid', 'pp-aig-usage-banner');
      b.setAttribute('data-state', isLimit ? 'limit' : (isWarn ? 'warn' : 'info'));
      b.setAttribute('data-count', String(safeCount));
      b.innerHTML =
        '<span class="pp-aig-banner-icon" aria-hidden="true">' + _escBanner(iconChar) + '</span>' +
        '<div class="pp-aig-banner-txt">' +
          '<span class="pp-aig-banner-title">' + _escBanner(titleTxt) + '</span>' +
          '<span class="pp-aig-progress" aria-hidden="true"><span class="pp-aig-progress-fill" style="width:0%"></span></span>' +
          '<span class="pp-aig-banner-sub">' + _escBanner(subTxt) + '</span>' +
        '</div>' +
        '<button type="button" class="pp-aig-banner-cta" data-role="banner-upgrade" data-testid="pp-aig-banner-upgrade">' + _escBanner(ctaLabel) + '</button>' +
        '<button type="button" class="pp-aig-banner-x" data-role="banner-close" data-testid="pp-aig-banner-close" aria-label="Sluiten">×</button>';
      document.body.appendChild(b);
      // Trigger progress-animatie na append (na de eerstvolgende frame)
      requestAnimationFrame(function () {
        try {
          var f = b.querySelector('.pp-aig-progress-fill');
          if (f) f.style.width = pct + '%';
        } catch (_) {}
      });
      b.addEventListener('click', function (e) {
        var r = e.target && e.target.getAttribute && e.target.getAttribute('data-role');
        if (r === 'banner-close') { removeBanner(); }
        if (r === 'banner-upgrade') { openPremiumUpgrade(); }
      });
      // Info-banner verdwijnt na 6s; warn na 9s; limit blijft langer (14s)
      var lifespan = isLimit ? 14000 : (isWarn ? 9000 : 6000);
      _bannerTimer = setTimeout(removeBanner, lifespan);
      return b;
    } catch (e) {
      try { console.warn('[ai-guard] banner render failed:', e && e.message); } catch (_) {}
      return null;
    }
  }

  // Legacy alias: bij quota-op-only (backwards compat met externe callers)
  function showQuotaBanner() {
    renderUsageBanner(FREE_LIMIT, FREE_LIMIT);
  }
  // Nieuwe publieke helper — wordt aangeroepen na module-open voor
  // non-premium users. Skipt bij premium (die krijgen NOOIT een banner).
  async function maybeShowUsageBanner() {
    try {
      if (isGuest()) return; // guests krijgen alleen login-modal, geen banner
      if (await isPremium()) return; // premium ziet nooit progress
      var usage = await getUsage();
      var count = (usage && Number(usage.count)) || 0;
      renderUsageBanner(count, FREE_LIMIT);
    } catch (e) {
      try { console.warn('[ai-guard] maybeShowUsageBanner err:', e && e.message); } catch (_) {}
    }
  }

  // ─── Guard: pre-flight check vóór AI request ────────────────────────
  //   Returns true als request door mag, false als geblokkeerd.
  //   v60.1.248: Auth is ALTIJD live gecontroleerd (geen cache),
  //   zodat logout onmiddellijk effect heeft op alle in-flight aanvragen.
  var _inflight = false;
  async function guardCheck() {
    // STAP 1: harde auth-check via Firebase Auth (source of truth)
    if (isGuest()) {
      showLoginPrompt();
      return false;
    }
    // STAP 2: Premium bypass — onbeperkte toegang
    if (await isPremium()) return true;
    // STAP 3: Voorkom parallelle popups tijdens gelijktijdige requests
    if (_inflight) return false;
    _inflight = true;
    try {
      // Herevalueer auth NA async premium check (kan intussen zijn uitgelogd)
      if (isGuest()) { showLoginPrompt(); return false; }

      var usage = await getUsage();
      // Eerste-gebruik popup (één keer per maand, alleen als count===0)
      if (usage.count === 0 && !usage.firstShown) {
        var ok = await showFirstUseInfo();
        if (!ok) return false;
        // Herevalueer auth NA modal-interactie
        if (isGuest()) { showLoginPrompt(); return false; }
      }
      if (usage.count >= FREE_LIMIT) {
        showLimitReached();
        return false;
      }
      // v60.1.256: GEEN client-side incUsage meer.
      //   Backend `_verify_ai_access` doet de atomische increment via
      //   Firestore-transactie. Dit is defense-in-depth EN voorkomt
      //   dubbele tellingen (bug: user kreeg 2-3 analyses ipv 5).
      //   De frontend leest count na de fetch via maybeShowUsageBanner.
      return true;
    } finally { _inflight = false; }
  }

  function isAiEndpoint(url) {
    try {
      var s = typeof url === 'string' ? url : (url && url.url) || '';
      if (!s) return false;
      // v60.1.247: whitelist heeft voorrang - passieve/health endpoints
      // mogen altijd door zonder guard-popup, ook voor gasten.
      if (AI_ENDPOINT_WHITELIST.some(function (r) { return r.test(s); })) return false;
      return AI_ENDPOINT_PATTERNS.some(function (r) { return r.test(s); });
    } catch (_) { return false; }
  }

  // v60.1.252: Herken alleen ONZE eigen /api/ endpoints (voor token-injectie).
  //   Externe providers zoals api.anthropic.com krijgen GEEN Bearer token
  //   (die hebben hun eigen auth) — maar worden nog steeds guard-gecheckt.
  function isOurBackendApi(url) {
    try {
      var s = String(url || '');
      if (!s) return false;
      if (/^https?:\/\/api\.anthropic\.com/i.test(s)) return false;
      if (/^https?:\/\/api\.openai\.com/i.test(s)) return false;
      if (/^https?:\/\/generativelanguage\.googleapis\.com/i.test(s)) return false;
      if (/^https?:\/\/doubleyou-patroon-server\.onrender\.com/i.test(s)) return false;
      // Relatieve /api of onze backend-hosts
      if (s.indexOf('/api/') >= 0) return true;
      return false;
    } catch (_) { return false; }
  }

  // ─── Global fetch hijack ─────────────────────────────────────────────
  var _origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (isAiEndpoint(url)) {
      var allowed = await guardCheck();
      if (!allowed) {
        // v60.1.246: Return een never-resolving Promise. Zo blijft de
        // guard-modal het enige zichtbare element en toont de calling
        // code géén error dialog met rauwe response. Als de gebruiker
        // klikt op Login/Upgrade wordt de pagina/state vernieuwd.
        return new Promise(function () { /* nooit resolven */ });
      }
      // v60.1.252: injecteer Firebase ID token in Authorization header voor
      //   ONZE backend endpoints. Externe providers krijgen geen token.
      if (isOurBackendApi(url)) {
        try {
          var a = fbAuth();
          var currentUser = a && a.currentUser;
          if (currentUser && typeof currentUser.getIdToken === 'function') {
            var idToken = await currentUser.getIdToken(/* forceRefresh */ false);
            if (idToken) {
              init = init || {};
              // Kopieer headers zonder de originele init te muteren
              var mergedHeaders = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
              if (!mergedHeaders.has('Authorization')) {
                mergedHeaders.set('Authorization', 'Bearer ' + idToken);
              }
              init.headers = mergedHeaders;
            }
          }
        } catch (e) {
          try { console.warn('[ai-guard] token injection failed:', e && e.message); } catch (_) {}
        }
      }
      // v60.1.251: na succesvolle AI-call de banner verversen zodat de
      // teller live meestapelt. Skip bij premium (isPremium is al gecheckt
      // in guardCheck, dus als we hier zijn is user non-premium).
      var _resp = await _origFetch(input, init);
      try {
        // v60.1.252: 401 → login-modal (token verlopen); 402 → limit-modal
        if (_resp && _resp.status === 401) {
          try { showLoginPrompt(); } catch (_) {}
        } else if (_resp && _resp.status === 402) {
          try { showLimitReached(); } catch (_) {}
        }
        // Alleen bij OK response updaten; failed requests worden niet geteld
        if (_resp && (_resp.ok || (_resp.status >= 200 && _resp.status < 300))) {
          // getUsage is inmiddels geincrementeerd; toon vernieuwde stand
          setTimeout(function () { maybeShowUsageBanner(); }, 200);
        }
      } catch (_) {}
      return _resp;
    }
    return _origFetch(input, init);
  };

  window.PP_AiGuard = {
    VERSION: '1.8.0',
    getUsage: getUsage,
    check: guardCheck,
    FREE_LIMIT: FREE_LIMIT,
    showQuotaBanner: showQuotaBanner,
    renderUsageBanner: renderUsageBanner,
    maybeShowUsageBanner: maybeShowUsageBanner,
    removeBanner: removeBanner,
    openPremiumUpgrade: openPremiumUpgrade,
    isGuest: isGuest,
    invalidate: function () { _premCache = { uid: null, isPrem: false, at: 0 }; _inflight = false; }
  };

  // v60.1.256: Cross-tab sync via visibilitychange + storage-events.
  //   Wanneer een tab actief wordt (bijv. na tab-switch), invalideer de
  //   premium-cache en refresh de banner-teller. Zo blijft de teller
  //   consistent tussen meerdere geopende tabs.
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      try {
        _premCache = { uid: null, isPrem: false, at: 0 };
        _inflight = false;
        // Alleen verversen als banner al zichtbaar was — geen surprise-popups
        if (document.querySelector('.pp-aig-banner')) {
          setTimeout(function () { try { maybeShowUsageBanner(); } catch (_) {} }, 100);
        }
      } catch (_) {}
    });
    // Cross-tab: als een andere tab de premium/usage-status wijzigt, sync
    window.addEventListener('storage', function (e) {
      if (!e || !e.key) return;
      if (e.key === 'pp-aig-invalidate' || e.key === 'pp-premium-invalidate') {
        _premCache = { uid: null, isPrem: false, at: 0 };
        _inflight = false;
      }
    });
  } catch (_) {}

  // v60.1.249: Firebase Auth state listener — instant invalidatie bij logout
  function installAuthListener() {
    var a = fbAuth();
    if (!a) return false;
    try {
      a.onAuthStateChanged(function (u) {
        _premCache = { uid: null, isPrem: false, at: 0 };
        _inflight = false;
        try {
          var ov = document.querySelector('.pp-aig-ov');
          if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        } catch (_) {}
        // v60.1.251: verwijder ook eventuele usage-banner bij logout/switch
        try { removeBanner(); } catch (_) {}
        log(u ? ('Auth: uid=' + u.uid + (u.isAnonymous ? ' (anon)' : '')) : 'Auth: logged out — caches gewist');
      });
      return true;
    } catch (_) { return false; }
  }

  // v60.1.249: Module-open hooks — blokkeer AI-UI vóór rendering voor gasten.
  //   Wraps de publieke open() functies van elke AI-module.
  //   v60.1.250 UPDATE: bij quota-op laat UI WEL openen (per user-keuze) en
  //   toon een niet-blokkerende banner. Fetch-guard blijft het echte
  //   generate-request blokkeren en toont de premium-upgrade modal.
  function wrapModuleOpen(namespace, key) {
    try {
      var target = window;
      var parts = namespace.split('.');
      for (var i = 0; i < parts.length; i++) {
        target = target && target[parts[i]];
        if (!target) return false;
      }
      var orig = target[key];
      if (typeof orig !== 'function' || target['__ppGuarded_' + key]) return false;
      target[key] = function () {
        // STAP 1: harde auth-check vóór module rendert
        if (isGuest()) {
          showLoginPrompt();
          return; // module open volledig geblokkeerd, geen UI, geen fetch
        }
        // STAP 2: async premium/quota check
        var self = this, args = arguments;
        Promise.resolve().then(async function () {
          // Premium → onbeperkt, open direct
          if (await isPremium()) { orig.apply(self, args); return; }
          // Herevalueer auth NA async check
          if (isGuest()) { showLoginPrompt(); return; }
          var usage = await getUsage();
          // Eerste-gebruik popup (één keer per maand)
          if (usage.count === 0 && !usage.firstShown) {
            var ok = await showFirstUseInfo();
            if (!ok) return; // gebruiker klikte "Meer over Premium"
            if (isGuest()) { showLoginPrompt(); return; }
          }
          // UI altijd openen (ook bij quota-op → user-keuze non-blocking overlay)
          orig.apply(self, args);
          // v60.1.251: toon ALTIJD progress-teller (X van 5 gebruikt) voor
          // non-premium na module-open. Verhoogt bewustzijn + premium-
          // conversie zonder gratis flow te frustreren. Bij limit-op wordt
          // automatisch de 'limit'-variant getoond.
          setTimeout(function () { maybeShowUsageBanner(); }, 420);
        });
      };
      target['__ppGuarded_' + key] = true;
      return true;
    } catch (_) { return false; }
  }

  // Registreer bekende AI-module open-functies. Ontbrekende worden gewoon
  // overgeslagen — polling zorgt dat late-init modules alsnog gewrapt worden.
  var MODULE_HOOKS = [
    ['DY.tryOn', 'open'],
    ['DY.tryOn', 'openWithOutfit'],
    ['DY.outfitScore', 'scoreCard'],   // v60.1.250: force-rescore vanuit hub menu
    ['DY.wardrobeRecommend', 'open'],
    ['DY.AIChat', 'open'],             // v60.1.250: fix casing (was DY.aiChat)
    ['DY.weeklyStylist', 'open'],
    // v60.1.252: legacy Outfit Vergelijker / Kleuranalyse (bypaste guard)
    ['DY', 'cfgStuurAI'],              // AI configurator (patroon-server)
    ['DY', '_kleurenAnalyseerMet'],    // Kleuranalyse ↔ Anthropic
    ['DY', '_kaiImprovementEngine'],   // Kleuranalyse improvement suggesties
    // Toekomstige AI-modules toevoegen zonder code-refactor:
    ['DY.pickMe', 'open'],
    ['DY.styleAssistant', 'open'],
    ['DY.kleuranalyse', 'open'],
    ['DY.fashionMatch', 'open'],
  ];

  // v60.1.252/254: ROUTE-GUARD voor beschermde AI-paginas. Wraps DY.toonPagina
  //   en DY.navigeer zodat kleuren_ai / outfit-vergelijker en toekomstige
  //   AI-routes (media-generator, ai-chat, try-on) voor gasten direct de
  //   login-modal tonen ipv de pagina te renderen.
  //   Synchroon met de pre-auth cloak-detector in <head>.
  var PROTECTED_PAGES = ['kleuren_ai']; // interne pagina-id's
  var PROTECTED_ROUTES_RX = new RegExp([
    'outfit-vergelijker',
    'kleuren[_-]?ai',
    'media[_-]?generator',
    'image[_-]?generator',
    'img[_-]?gen',
    'video[_-]?gen',
    'ai[_-]?chat',
    'chat[_-]?ai',
    'try[_-]?on',
    'probeer[_-]?aan',
    'outfit[_-]?score',
    'wardrobe[_-]?recommend',
    'style[_-]?assistant',
    'styling[_-]?advies',
    'weekly[_-]?stylist',
    'pick[_-]?me',
    'fashion[_-]?match'
  ].join('|'), 'i');

  function _isProtectedPageArg(arg) {
    try {
      var s = String(arg == null ? '' : arg).toLowerCase().trim();
      if (!s) return false;
      if (PROTECTED_PAGES.indexOf(s) >= 0) return true;
      if (PROTECTED_ROUTES_RX.test(s)) return true;
      return false;
    } catch (_) { return false; }
  }
  function wrapPageRouter() {
    try {
      if (!window.DY) return false;
      var wrapped = 0;
      ['toonPagina', 'navigeer'].forEach(function (fn) {
        if (typeof DY[fn] !== 'function' || DY['__ppGuarded_' + fn]) return;
        var orig = DY[fn];
        DY[fn] = function (arg) {
          if (_isProtectedPageArg(arg) && isGuest()) {
            try { showLoginPrompt(); } catch (_) {}
            return; // pagina niet renderen
          }
          // Non-premium mag door — de banner + fetch-guard handelen quota af
          return orig.apply(this, arguments);
        };
        DY['__ppGuarded_' + fn] = true;
        wrapped++;
      });
      return wrapped > 0;
    } catch (_) { return false; }
  }
  function installModuleHooks() {
    var wrappedAny = false;
    for (var i = 0; i < MODULE_HOOKS.length; i++) {
      if (wrapModuleOpen(MODULE_HOOKS[i][0], MODULE_HOOKS[i][1])) wrappedAny = true;
    }
    return wrappedAny;
  }

  var _initAttempts = 0;
  var _initIv = setInterval(function () {
    var ok1 = installAuthListener();
    installModuleHooks(); // best-effort elke tick — voegt late modules toe
    wrapPageRouter();      // v60.1.252: wrap router zodra DY.toonPagina bestaat
    if (ok1 || _initAttempts++ > 80) clearInterval(_initIv);
  }, 250);
  // Initial run
  installModuleHooks();
  wrapPageRouter();

  // v60.1.252: initial route-check. Als de pagina al laadt met
  //   ?pagina=kleuren_ai OF ?kleuranalyse=... en de gebruiker gast is,
  //   sluit de content af en toon direct de login-modal.
  //   v60.1.253: werkt samen met pre-auth cloak in <head>. De cloak
  //   voorkomt dat de pagina flashed vóór auth resolved is. Wij
  //   verwijderen de cloak zodra we weten of user gast is.
  function _uncloak() {
    try { document.documentElement.classList.remove('pp-preauth-locked'); } catch (_) {}
  }
  function _initialRouteCheck() {
    try {
      var qs = new URLSearchParams(location.search || '');
      var page = (qs.get('pagina') || '').toLowerCase();
      var path = (location.pathname || '').toLowerCase();
      var hash = (location.hash || '').toLowerCase();
      var SHARE_PARAMS = ['kleuranalyse','tryon','outfit_score','style_advies','mediagen','imggen'];
      var hasShareParam = SHARE_PARAMS.some(function (k) { return qs.get(k); });
      var isProtected = (PROTECTED_PAGES.indexOf(page) >= 0)
        || hasShareParam
        || PROTECTED_ROUTES_RX.test(path)
        || PROTECTED_ROUTES_RX.test(hash);
      if (!isProtected) { _uncloak(); return; }
      // Wacht tot Firebase Auth klaar is (async)
      var a = fbAuth();
      if (!a) { setTimeout(_initialRouteCheck, 300); return; }
      var settled = false;
      var unsub = a.onAuthStateChanged(function (u) {
        if (settled) return;
        settled = true;
        try { if (typeof unsub === 'function') unsub(); } catch (_) {}
        if (!u || u.isAnonymous === true) {
          // Gast: cloak eerst weg zodat login-modal zichtbaar wordt tegen
          // een schone donkere achtergrond, GEEN AI-content geflashed.
          _uncloak();
          try { showLoginPrompt(); } catch (_) {}
          // Blokkeer render van kleuren_ai op DOM-niveau: verwijder de
          // pagina-container als die intussen door legacy-init is
          // aangemaakt (defensief - normaal komt hij hier nog niet)
          try {
            var pageEl = document.getElementById('kleuren_ai') || document.querySelector('[data-pagina="kleuren_ai"]');
            if (pageEl) pageEl.style.display = 'none';
          } catch (_) {}
        } else {
          // Ingelogd (of premium) → cloak weg, pagina rendert normaal
          _uncloak();
        }
      });
    } catch (_) { _uncloak(); }
  }
  _initialRouteCheck();

  log('AI Access Guard geladen (limiet: ' + FREE_LIMIT + '/maand)');
})();
