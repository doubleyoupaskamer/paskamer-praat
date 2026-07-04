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
  // v60.1.247: EXPLICIETE lijst van user-initiated AI-generation endpoints
  // die tegen de limiet tellen. Passive endpoints (health, embedding
  // matching, prefetch) mogen ALTIJD door - anders blokkeert de guard
  // menu-open flows voor gasten.
  var AI_ENDPOINT_PATTERNS = [
    /\/api\/tryon(\?|$)/i,
    /\/api\/outfit-score(\?|$)/i,
    /\/api\/wardrobe\/recommend(\?|$)/i,
    /\/api\/weekly-stylist(\?|$)/i,
    /\/api\/ai\/style-assistant(\?|$)/i,
    /\/api\/ai\/score-outfit(\?|$)/i,
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
      '.pp-aig-ov{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}' +
      '.pp-aig-box{background:linear-gradient(155deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,.34);border-radius:16px;padding:24px;max-width:440px;width:100%;color:#fcf8ef;font-family:"DM Sans",system-ui,sans-serif}' +
      '.pp-aig-box h3{margin:0 0 8px;font:400 1.35rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#f0b340}' +
      '.pp-aig-box p{margin:0 0 14px;color:rgba(252,248,239,.82);line-height:1.55;font-size:.93rem}' +
      '.pp-aig-box .pp-aig-badge{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(212,145,10,.14);border:1px solid rgba(212,145,10,.35);color:#f0b340;font:700 11px/1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}' +
      '.pp-aig-acts{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid rgba(245,236,224,.08)}' +
      '.pp-aig-btn{padding:9px 18px;border-radius:999px;font:600 13px/1 "DM Sans",sans-serif;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:all .15s}' +
      '.pp-aig-btn-ghost{background:transparent;border-color:rgba(245,236,224,.16);color:rgba(252,248,239,.75)}' +
      '.pp-aig-btn-ghost:hover{background:rgba(255,255,255,.05)}' +
      '.pp-aig-btn-primair{background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08}' +
      '.pp-aig-btn-primair:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(212,145,10,.35)}';
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
    ov.innerHTML = '<div class="pp-aig-box">' + html + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeModal();
    });
    return ov;
  }
  function closeModal() {
    var ov = document.querySelector('.pp-aig-ov');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
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
          closeModal();
          if (window.DY && DY.premium && typeof DY.premium.openUpgrade === 'function') {
            try { DY.premium.openUpgrade(); } catch (_) {}
          }
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
        closeModal();
        if (window.DY && DY.premium && typeof DY.premium.openUpgrade === 'function') {
          try { DY.premium.openUpgrade(); return; } catch (_) {}
        }
        try { location.hash = '#premium'; } catch (_) {}
      }
    });
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
      // Increment vóór we door laten (atomische verhoging)
      await incUsage();
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
    }
    return _origFetch(input, init);
  };

  window.PP_AiGuard = {
    VERSION: '1.2.0',
    getUsage: getUsage,
    check: guardCheck,
    FREE_LIMIT: FREE_LIMIT,
    invalidate: function () { _premCache = { uid: null, isPrem: false, at: 0 }; _inflight = false; }
  };

  // v60.1.248: Firebase Auth state listener — instant invalidatie bij logout
  function installAuthListener() {
    var a = fbAuth();
    if (!a) return false;
    try {
      a.onAuthStateChanged(function (u) {
        // Reset alle interne caches — geen stale premium of counter state
        _premCache = { uid: null, isPrem: false, at: 0 };
        _inflight = false;
        // Sluit eventuele open guard-modals — nieuwe login/logout = schone slate
        try {
          var ov = document.querySelector('.pp-aig-ov');
          if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
        } catch (_) {}
        log(u ? ('Auth: uid=' + u.uid + (u.isAnonymous ? ' (anon)' : '')) : 'Auth: logged out — caches gewist');
      });
      return true;
    } catch (_) { return false; }
  }
  var _authWatchAttempts = 0;
  var _authWatchIv = setInterval(function () {
    if (installAuthListener() || _authWatchAttempts++ > 40) clearInterval(_authWatchIv);
  }, 250);

  log('AI Access Guard geladen (limiet: ' + FREE_LIMIT + '/maand)');
})();
