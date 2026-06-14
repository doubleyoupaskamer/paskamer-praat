// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — AI Outfit Score v1
//
// Voegt een compacte "Style Score" pill toe aan elke feed-card met een
// foto. Klik → backend /api/outfit-score (Gemini Vision) → score 0-100
// + 3 tips + color palette. Resultaat gecached in localStorage per
// post-id (geen dubbele calls voor dezelfde post).
//
// Niet-invasief:
//   - Selecteert `.dy-reel-content` / `[data-post-id]` containers
//   - Voegt eigen element toe, raakt bestaande structuur niet aan
//   - Skip als al een score-pill aanwezig is
//   - Skip posts zonder image
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  /* global firebase */

  if (window.__ppOutfitScoreInit) return;
  window.__ppOutfitScoreInit = true;

  var DEFAULT_API_BASE = '';
  var STYLE_ID = 'dy-outfit-score-style';
  var LS_PREFIX = 'dy_outfit_score_';

  function apiBase() {
    if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
      return window.DY.aiHealth.apiBase();
    }
    if (window.DY && typeof window.DY.apiBase === 'string') return window.DY.apiBase;
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('emergentagent.com') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    if (host.indexOf('paskamerpraat.nl') >= 0) return 'https://paskamer-stability.preview.emergentagent.com';
    return DEFAULT_API_BASE;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.dy-score-pill{display:inline-flex;align-items:center;gap:8px;cursor:pointer;',
      '  background:#1e1a0f;color:#fefcf5;border-radius:999px;padding:6px 12px;',
      '  font:700 12px "DM Sans",system-ui,sans-serif;border:0;',
      '  -webkit-tap-highlight-color:transparent;transition:transform .15s,background .2s}',
      '.dy-score-pill:hover{background:#2a2515;transform:translateY(-1px)}',
      '.dy-score-pill .num{background:#c89b3c;color:#1e1a0f;border-radius:999px;padding:2px 8px;font-weight:800;min-width:30px;text-align:center}',
      '.dy-score-pill .lbl{font-weight:500;font-size:11px;opacity:.85}',
      '.dy-score-pill.loading{opacity:.6;pointer-events:none}',
      '.dy-score-pill.loading .num::after{content:"…";display:inline}',
      '.dy-score-detail{margin-top:10px;background:#fefcf5;border:1px solid rgba(30,26,15,.1);',
      '  border-radius:14px;padding:14px;font:400 13px/1.5 "DM Sans",system-ui,sans-serif;color:#1e1a0f;',
      '  animation:dyScoreSlide .3s cubic-bezier(.23,1,.32,1)}',
      '@keyframes dyScoreSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
      '.dy-score-detail .summary{font-weight:600;margin-bottom:8px}',
      '.dy-score-detail .tips{margin:8px 0 0;padding-left:0;list-style:none}',
      '.dy-score-detail .tips li{padding:6px 0 6px 22px;position:relative;color:#3b3624}',
      '.dy-score-detail .tips li::before{content:"✓";position:absolute;left:4px;color:#c89b3c;font-weight:700}',
      '.dy-score-detail .palette{margin-top:10px;display:flex;gap:6px;align-items:center}',
      '.dy-score-detail .palette small{color:rgba(30,26,15,.55);font-size:11px;margin-right:4px}',
      '.dy-score-detail .swatch{width:22px;height:22px;border-radius:999px;border:1px solid rgba(30,26,15,.12);box-shadow:inset 0 0 0 2px #fff}',
      '.dy-score-host{margin-top:8px}',
      '@media (prefers-reduced-motion: reduce){.dy-score-detail{animation:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function getPostInfo(card) {
    // Heuristieken om post-id + foto te vinden
    var postId = card.getAttribute('data-post-id') ||
                 card.id ||
                 (card.querySelector('[data-post-id]') && card.querySelector('[data-post-id]').getAttribute('data-post-id'));
    var img = card.querySelector('img:not(.dy-avatar):not([data-pp-skeleton])');
    var imgUrl = img ? (img.currentSrc || img.src) : null;
    return { postId: postId, imgUrl: imgUrl, img: img };
  }

  function findCards() {
    // Combineer mogelijke feed-card selectors
    return document.querySelectorAll(
      '.dy-reel-content:not([data-pp-score]),[data-post-id]:not([data-pp-score]),.dy-feed-card:not([data-pp-score])'
    );
  }

  function findActionsRow(card) {
    return card.querySelector('.dy-reel-acties') ||
           card.querySelector('[data-actions]') ||
           card.querySelector('.dy-feed-actions') ||
           card.querySelector('footer') ||
           null;
  }

  // ─── apiBase met absolute fallback (v59: robuust tegen stale aiHealth) ───
  var LIVE_BACKEND = 'https://paskamer-stability.preview.emergentagent.com';
  function apiBase() {
    try {
      if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
        var b = window.DY.aiHealth.apiBase();
        if (b && b.indexOf('http') === 0) return b;
      }
    } catch (e) { /* ignore */ }
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('paskamerpraat.nl') >= 0 || host.indexOf('emergentagent.com') >= 0 ||
        host.indexOf('cloudflare') >= 0 || host.indexOf('pages.dev') >= 0) {
      return LIVE_BACKEND;
    }
    return '';
  }

  // ── Content-hash voor cache key (v59 fix: voorkomt cache-mismatch
  //    bij gerecycled feed-cards met dezelfde data-post-id) ──
  function imgHash(url) {
    var s = String(url || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h = h & h; // 32-bit int
    }
    return Math.abs(h).toString(36);
  }
  function cacheKey(postId, imgUrl) {
    // Combineer ALTIJD postId + imgHash zodat zelfs bij hergebruikt
    // DOM-element met stale postId de juiste cache wordt gehit.
    return (postId || 'nopid') + '_' + imgHash(imgUrl);
  }
  function newReqId() {
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function loadCached(postId, imgUrl) {
    try {
      var key = cacheKey(postId, imgUrl);
      var raw = localStorage.getItem(LS_PREFIX + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      // 14 dagen valid
      if (!obj || (Date.now() - (obj._ts || 0)) > 14 * 86400000) return null;
      // v59 hard validation: weiger cache als imgHash niet overeenkomt
      if (obj._imgHash && obj._imgHash !== imgHash(imgUrl)) {
        console.warn('[outfit-score] cache rejected: image hash mismatch', { stored: obj._imgHash, current: imgHash(imgUrl) });
        try { localStorage.removeItem(LS_PREFIX + key); } catch (e) { /* ignore */ }
        return null;
      }
      return obj;
    } catch (e) { return null; }
  }
  function saveCached(postId, imgUrl, data) {
    try {
      data._ts = Date.now();
      data._imgHash = imgHash(imgUrl);
      data._imgUrl = imgUrl.slice(0, 200); // voor debugging
      localStorage.setItem(LS_PREFIX + cacheKey(postId, imgUrl), JSON.stringify(data));
    } catch (e) { /* noop */ }
  }

  async function fetchScore(imgUrl, requestId) {
    // Image → base64 (via canvas, vermijdt CORS issues van Firebase Storage)
    var b64 = await imageUrlToB64(imgUrl);
    var hash = imgHash(imgUrl);
    var res = await fetch(apiBase() + '/api/outfit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photo_b64: b64,
        photo_mime: 'image/jpeg',
        uid: getUid(),
        request_id: requestId,
        image_hash: hash
      })
    });
    if (!res.ok) {
      var t = await res.text();
      throw new Error('Score ' + res.status + ': ' + t.slice(0, 100));
    }
    var data = await res.json();
    // v59 hard validation: backend echo'ed request_id of image_hash moet matchen
    if (data.request_id && data.request_id !== requestId) {
      console.warn('[outfit-score] response request_id mismatch', { sent: requestId, got: data.request_id });
      throw new Error('Response mismatch (request_id)');
    }
    if (data.image_hash && data.image_hash !== hash) {
      console.warn('[outfit-score] response image_hash mismatch', { sent: hash, got: data.image_hash });
      throw new Error('Response mismatch (image_hash)');
    }
    // Bewaar onze eigen markers voor cache-validatie
    data._sentImgHash = hash;
    data._reqId = requestId;
    return data;
  }

  function imageUrlToB64(url) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        try {
          var maxSide = 1024;
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (w > maxSide || h > maxSide) {
            if (w > h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
            else       { w = Math.round(w * (maxSide / h)); h = maxSide; }
          }
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', 0.84).split(',')[1]);
        } catch (e) { reject(e); }
      };
      img.onerror = function() { reject(new Error('img load fail')); };
      img.src = url;
    });
  }

  function renderPill(card, data, postId) {
    var actions = findActionsRow(card) || card;
    var host = document.createElement('div');
    host.className = 'dy-score-host';
    host.setAttribute('data-pp-score-host', '1');
    var pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'dy-score-pill';
    pill.setAttribute('data-testid', 'outfit-score-pill-' + (postId || 'unknown'));
    pill.innerHTML =
      '<span class="num">' + data.score + '</span>' +
      '<span class="lbl">' + escapeHtml(data.label || 'Style Score') + '</span>';
    host.appendChild(pill);
    var detail = null;
    pill.addEventListener('click', function() {
      if (detail) { detail.remove(); detail = null; return; }
      detail = document.createElement('div');
      detail.className = 'dy-score-detail';
      var tipsHtml = (data.tips || []).map(function(t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('');
      var palHtml = (data.color_palette || []).map(function(c) {
        return '<span class="swatch" style="background:' + escapeHtml(c) + '" title="' + escapeHtml(c) + '"></span>';
      }).join('');
      detail.innerHTML =
        '<div class="summary">' + escapeHtml(data.summary || '') + '</div>' +
        '<ul class="tips">' + tipsHtml + '</ul>' +
        (palHtml ? '<div class="palette"><small>Palet:</small>' + palHtml + '</div>' : '');
      host.appendChild(detail);
      logEvent('outfit_score_expanded', { score: data.score, postId: postId || null });
    });
    actions.appendChild(host);
  }

  function renderLoading(card, postId) {
    var actions = findActionsRow(card) || card;
    var host = document.createElement('div');
    host.className = 'dy-score-host';
    host.setAttribute('data-pp-score-host', '1');
    host.innerHTML =
      '<button type="button" class="dy-score-pill loading" disabled>' +
        '<span class="num">' +
        '</span><span class="lbl">AI analyseert</span></button>';
    actions.appendChild(host);
    return host;
  }

  async function processCard(card) {
    if (card.hasAttribute('data-pp-score')) return;
    card.setAttribute('data-pp-score', 'pending');
    var info = getPostInfo(card);
    if (!info.imgUrl) { card.setAttribute('data-pp-score', 'no-image'); return; }
    var pid = info.postId || hashUrl(info.imgUrl);

    var cached = loadCached(pid, info.imgUrl);
    if (cached) {
      renderPill(card, cached, pid);
      card.setAttribute('data-pp-score', 'cached');
      return;
    }

    // Auto-mode is standaard AAN sinds v47 (wow-effect feed)
    // Opt-out via window.DY.outfitScoreAuto = false vóór deze script
    var autoMode = !(window.DY && window.DY.outfitScoreAuto === false);
    if (!autoMode) {
      renderManualTrigger(card, pid, info.imgUrl);
      card.setAttribute('data-pp-score', 'manual');
      return;
    }

    var loadingHost = renderLoading(card, pid);
    try {
      var reqId = newReqId();
      var data = await fetchScore(info.imgUrl, reqId);
      // v59 guard: kaart kan recycled zijn voordat response binnen is
      var nowInfo = getPostInfo(card);
      if (nowInfo.imgUrl !== info.imgUrl) {
        console.warn('[outfit-score] card recycled mid-fetch — discarding result', {
          was: imgHash(info.imgUrl), now: imgHash(nowInfo.imgUrl)
        });
        loadingHost.remove();
        card.removeAttribute('data-pp-score');
        return;
      }
      saveCached(pid, info.imgUrl, data);
      loadingHost.remove();
      renderPill(card, data, pid);
      card.setAttribute('data-pp-score', 'done');
      logEvent('outfit_score_generated', { score: data.score, postId: pid });
      try { window.dispatchEvent(new CustomEvent('dy-outfit-score-result', { detail: { score: data.score, label: data.label, tips: data.tips, postId: pid } })); } catch (e) { /* ignore */ }
    } catch (e) {
      loadingHost.remove();
      card.setAttribute('data-pp-score', 'error');
      console.error('[outfit-score] fetch failed:', e && e.message);
      logEvent('outfit_score_error', { msg: (e.message || '').slice(0, 120) });
    }
  }

  function renderManualTrigger(card, pid, imgUrl) {
    var actions = findActionsRow(card) || card;
    var host = document.createElement('div');
    host.className = 'dy-score-host';
    host.setAttribute('data-pp-score-host', '1');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dy-score-pill';
    btn.setAttribute('data-testid', 'outfit-score-trigger-' + pid);
    btn.innerHTML = '<span class="num">★</span><span class="lbl">Vraag Style Score</span>';
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.innerHTML = '<span class="num"></span><span class="lbl">AI analyseert</span>';
      try {
        var reqId = newReqId();
        var data = await fetchScore(imgUrl, reqId);
        // v59 guard: card recycled tijdens fetch?
        var nowInfo = getPostInfo(card);
        if (nowInfo.imgUrl && nowInfo.imgUrl !== imgUrl) {
          console.warn('[outfit-score] manual: card recycled — discard', {
            was: imgHash(imgUrl), now: imgHash(nowInfo.imgUrl)
          });
          host.remove();
          return;
        }
        saveCached(pid, imgUrl, data);
        host.remove();
        renderPill(card, data, pid);
        logEvent('outfit_score_generated', { score: data.score, postId: pid });
        try { window.dispatchEvent(new CustomEvent('dy-outfit-score-result', { detail: { score: data.score, label: data.label, tips: data.tips, postId: pid } })); } catch (e) { /* ignore */ }
      } catch (e) {
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.innerHTML = '<span class="num">!</span><span class="lbl">Fout — opnieuw</span>';
      }
    });
    host.appendChild(btn);
    actions.appendChild(host);
  }

  // ── Scan + observe ──
  function scanFeed() {
    var cards = findCards();
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      // v59 FIX: detecteer DOM-card recycling. Als card al verwerkt is maar
      // de huidige imgUrl wijkt af van de opgeslagen marker → wis & opnieuw.
      var prevHash = c.getAttribute('data-pp-score-imghash');
      var info = getPostInfo(c);
      var curHash = info.imgUrl ? imgHash(info.imgUrl) : '';
      if (prevHash && curHash && prevHash !== curHash) {
        // Recycled card: image gewisseld. Verwijder oude pill + reset.
        try {
          var oldHost = c.querySelector('.dy-score-host');
          if (oldHost) oldHost.remove();
        } catch (e) { /* ignore */ }
        c.removeAttribute('data-pp-score');
        c.removeAttribute('data-pp-score-imghash');
      }
      // Markeer huidige imgHash voor toekomstige recycle-detectie
      if (curHash) c.setAttribute('data-pp-score-imghash', curHash);
      processCard(c);
    }
  }

  function startObserver() {
    if (!('MutationObserver' in window)) return;
    try {
      var mo = new MutationObserver(function() {
        // Debounce: scan na 200ms
        if (mo._t) clearTimeout(mo._t);
        mo._t = setTimeout(scanFeed, 200);
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (e) { /* noop */ }
  }

  function init() {
    injectStyles();
    // Wacht op health-check voor we auto-scoren (vermijdt N×404 op productie zonder backend)
    var p = (window.DY && window.DY.aiHealth && window.DY.aiHealth.isHealthy)
      ? window.DY.aiHealth.isHealthy()
      : Promise.resolve(true);
    Promise.resolve(p).then(function(ok) {
      if (!ok) {
        // Backend offline → schakel auto-mode uit zodat scanFeed alleen
        // manual triggers rendert (gebruiker kan zelf klikken indien gewenst)
        window.DY = window.DY || {};
        if (window.DY.outfitScoreAuto !== false) window.DY.outfitScoreAuto = false;
        logEvent('outfit_score_skipped_backend_offline');
        return;
      }
      scanFeed();
      startObserver();
    });
  }

  // Util
  function hashUrl(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function getUid() { try { return (window.DY && window.DY.user && window.DY.user.uid) || null; } catch (e) { return null; } }
  function logEvent(name, extra) {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return;
      firebase.firestore().collection('kai_events').add(Object.assign({
        eventType: name,
        userId: getUid() || 'anon',
        ts: firebase.firestore.FieldValue.serverTimestamp()
      }, extra || {})).catch(function() { /* noop */ });
    } catch (e) { /* noop */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.outfitScore = {
    rescan:  scanFeed,
    clear:   function(pid) { try { localStorage.removeItem(LS_PREFIX + pid); } catch (e) { /* noop */ } },
    autoOn:  function() { window.DY.outfitScoreAuto = true; scanFeed(); },
    autoOff: function() { window.DY.outfitScoreAuto = false; },
    // v50 — Public force-rescore voor card-actions hub menu
    scoreCard: function(card, opts) {
      if (!card) return;
      opts = opts || {};
      var info = getPostInfo(card);
      var pid = info.postId || (info.imgUrl ? hashUrl(info.imgUrl) : ('card-' + Date.now()));
      if (opts.force) {
        try { localStorage.removeItem(LS_PREFIX + cacheKey(pid, info.imgUrl)); } catch (e) { /* ignore */ }
        card.removeAttribute('data-pp-score');
        card.removeAttribute('data-pp-score-imghash');
        var existing = card.querySelector('.dy-score-host');
        if (existing) existing.remove();
      }
      var prev = window.DY.outfitScoreAuto;
      window.DY.outfitScoreAuto = true;
      try { processCard(card); } finally {
        setTimeout(function() { window.DY.outfitScoreAuto = prev; }, 100);
      }
    }
  };
})();
