// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Virtual Try-On v1 (Gemini Nano Banana)
//
// Modal-flow:
//   1. Hub-menu opent "Probeer outfit virtueel"
//   2. Twee upload-slots: jouw foto + outfit foto
//   3. POST → backend /api/tryon → generated image base64
//   4. Resultaat met share-knop (Web Share API of fallback download)
//
// Backend default: window.DY.apiBase || REACT_APP_BACKEND_URL preview.
// Productie: zet `<script>window.DY = {apiBase:"https://api.paskamerpraat.nl"}</script>`
// vóór deze script in index.html.
//
// Non-invasief: nieuwe DOM in eigen modal, raakt geen bestaande code aan.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  /* global firebase */

  if (window.__ppTryOnInit) return;
  window.__ppTryOnInit = true;

  var MODAL_ID  = 'dy-tryon-modal';
  var STYLE_ID  = 'dy-tryon-style';
  var DEFAULT_API_BASE = '';
  // v59: Hardcoded fallback URL voor 404-retry op stale hosting redirects
  var LIVE_BACKEND = 'https://fitting-chat-app.preview.emergentagent.com';

  function apiBase() {
    try {
      if (window.DY && window.DY.aiHealth && typeof window.DY.aiHealth.apiBase === 'function') {
        var b = window.DY.aiHealth.apiBase();
        if (b && b.indexOf('http') === 0) return b;
      }
    } catch (e) { /* ignore */ }
    if (window.DY && typeof window.DY.apiBase === 'string' && window.DY.apiBase.indexOf('http') === 0) return window.DY.apiBase;
    var host = (location.hostname || '').toLowerCase();
    if (host.indexOf('emergentagent.com') >= 0) return LIVE_BACKEND;
    if (host.indexOf('paskamerpraat.nl') >= 0) return LIVE_BACKEND;
    if (host.indexOf('pages.dev') >= 0) return LIVE_BACKEND;
    return DEFAULT_API_BASE;
  }

  // ─────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + MODAL_ID + '{position:fixed;inset:0;background:rgba(20,17,8,.78);',
      '  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:2147483640;',
      '  display:none;opacity:0;transition:opacity .25s ease}',
      '#' + MODAL_ID + '.show{display:flex;opacity:1}',
      '#' + MODAL_ID + ' .dy-tryon-frame{margin:auto;background:#fefcf5;color:#1e1a0f;',
      '  width:min(560px,94vw);max-height:92vh;border-radius:22px;overflow:hidden;',
      '  display:flex;flex-direction:column;box-shadow:0 24px 56px rgba(0,0,0,.45)}',
      '#' + MODAL_ID + ' header{padding:18px 22px;display:flex;align-items:center;justify-content:space-between;',
      '  border-bottom:1px solid rgba(30,26,15,.08)}',
      '#' + MODAL_ID + ' header h2{margin:0;font:700 17px "DM Sans",system-ui,sans-serif;letter-spacing:-.01em}',
      '#' + MODAL_ID + ' header small{display:block;color:rgba(30,26,15,.6);font-size:12px;margin-top:2px}',
      '#' + MODAL_ID + ' .dy-tryon-close{background:transparent;border:0;font:400 24px serif;color:#1e1a0f;cursor:pointer;',
      '  width:36px;height:36px;border-radius:10px}',
      '#' + MODAL_ID + ' .dy-tryon-close:hover{background:rgba(30,26,15,.08)}',
      '#' + MODAL_ID + ' main{padding:18px 22px;overflow-y:auto;flex:1}',
      '#' + MODAL_ID + ' .dy-tryon-slots{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
      '#' + MODAL_ID + ' .dy-tryon-slot{aspect-ratio:3/4;border:2px dashed rgba(200,155,60,.55);border-radius:14px;',
      '  background:#f8f3e3;display:flex;align-items:center;justify-content:center;cursor:pointer;',
      '  position:relative;overflow:hidden;transition:border-color .2s}',
      '#' + MODAL_ID + ' .dy-tryon-slot:hover{border-color:#c89b3c}',
      '#' + MODAL_ID + ' .dy-tryon-slot.filled{border-style:solid;border-color:#c89b3c}',
      '#' + MODAL_ID + ' .dy-tryon-slot img{width:100%;height:100%;object-fit:cover}',
      '#' + MODAL_ID + ' .dy-tryon-slot .hint{text-align:center;font:600 12px "DM Sans";color:rgba(30,26,15,.6);padding:12px}',
      '#' + MODAL_ID + ' .dy-tryon-slot .hint span{display:block;font-weight:400;font-size:11px;margin-top:6px}',
      '#' + MODAL_ID + ' .dy-tryon-extra{margin-top:12px}',
      '#' + MODAL_ID + ' .dy-tryon-extra input{width:100%;padding:11px 14px;border:1px solid rgba(30,26,15,.15);',
      '  border-radius:11px;font:400 13px "DM Sans";background:#fff}',
      '#' + MODAL_ID + ' .dy-tryon-cta{margin-top:14px;width:100%;padding:14px;border:0;border-radius:14px;',
      '  background:#1e1a0f;color:#fefcf5;font:700 14px "DM Sans";cursor:pointer;letter-spacing:.01em}',
      '#' + MODAL_ID + ' .dy-tryon-cta:disabled{opacity:.45;cursor:not-allowed}',
      '#' + MODAL_ID + ' .dy-tryon-cta:not(:disabled):hover{background:#2a2515}',
      '#' + MODAL_ID + ' .dy-tryon-loading{text-align:center;padding:40px 20px;color:#7a6a3f}',
      '#' + MODAL_ID + ' .dy-tryon-loading .spin{width:42px;height:42px;border:3px solid #e8dcb3;',
      '  border-top-color:#c89b3c;border-radius:50%;animation:dyTryOnSpin 1s linear infinite;margin:0 auto 14px}',
      '@keyframes dyTryOnSpin{to{transform:rotate(360deg)}}',
      '#' + MODAL_ID + ' .dy-tryon-result{margin-top:6px}',
      '#' + MODAL_ID + ' .dy-tryon-result img{width:100%;border-radius:14px;display:block}',
      '#' + MODAL_ID + ' .dy-tryon-actions{display:flex;gap:8px;margin-top:12px}',
      '#' + MODAL_ID + ' .dy-tryon-actions button{flex:1;padding:11px;border-radius:11px;border:0;cursor:pointer;',
      '  font:600 13px "DM Sans"}',
      '#' + MODAL_ID + ' .dy-tryon-share{background:#c89b3c;color:#1e1a0f}',
      '#' + MODAL_ID + ' .dy-tryon-share:hover{background:#d8aa48}',
      '#' + MODAL_ID + ' .dy-tryon-retry{background:transparent;border:1px solid rgba(30,26,15,.2);color:#1e1a0f}',
      '#' + MODAL_ID + ' .dy-tryon-retry:hover{background:rgba(30,26,15,.06)}',
      '#' + MODAL_ID + ' .dy-tryon-err{margin-top:12px;padding:12px;background:#fbe3df;color:#7a1d10;',
      '  border-radius:11px;font:500 13px "DM Sans"}',
      '#' + MODAL_ID + ' .dy-tryon-caption{margin-top:10px;font:400 13px "DM Sans";color:#5b4d28;line-height:1.45}',
      '@media (max-width:480px){#' + MODAL_ID + ' .dy-tryon-frame{width:100vw;max-height:100vh;border-radius:0;height:100vh}}',
      '@media (prefers-reduced-motion: reduce){#' + MODAL_ID + '{transition:none}#' + MODAL_ID + ' .spin{animation:none}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  var state = {
    userB64:   null,
    userMime:  null,
    outfitB64: null,
    outfitMime:null,
    busy:      false,
    lastResult:null
  };

  // ─────────────────────────────────────────────────────────────
  // Modal build
  // ─────────────────────────────────────────────────────────────
  function buildModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;
    injectStyles();
    var m = document.createElement('div');
    m.id = MODAL_ID;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Virtuele Paskamer');
    m.innerHTML =
      '<div class="dy-tryon-frame">' +
        '<header>' +
          '<div>' +
            '<h2>Virtuele Paskamer</h2>' +
            '<small>AI laat zien hoe het op jou staat</small>' +
          '</div>' +
          '<button type="button" class="dy-tryon-close" data-tryon-act="close" aria-label="Sluiten">×</button>' +
        '</header>' +
        '<main data-tryon-body>' +
          '<div class="dy-tryon-slots">' +
            '<label class="dy-tryon-slot" data-slot="user">' +
              '<input type="file" accept="image/*" hidden data-input="user">' +
              '<div class="dy-tryon-hint-wrap"><div class="hint">📷 Jouw foto<span>fullbody werkt het best</span></div></div>' +
            '</label>' +
            '<label class="dy-tryon-slot" data-slot="outfit">' +
              '<input type="file" accept="image/*" hidden data-input="outfit">' +
              '<div class="dy-tryon-hint-wrap"><div class="hint">👗 Outfit foto<span>uit feed of upload</span></div></div>' +
            '</label>' +
          '</div>' +
          '<div class="dy-tryon-extra">' +
            '<input type="text" maxlength="120" placeholder="Optioneel: extra wens (bv. \'studio licht\')" data-extra>' +
          '</div>' +
          '<button type="button" class="dy-tryon-cta" data-tryon-act="generate" disabled>Genereer mijn paskamer</button>' +
        '</main>' +
      '</div>';
    document.body.appendChild(m);

    m.addEventListener('click', function(e) {
      if (e.target === m) close();
    });
    m.querySelector('[data-tryon-act="close"]').addEventListener('click', close);
    m.querySelector('[data-tryon-act="generate"]').addEventListener('click', generate);

    // Hook upload inputs
    ['user', 'outfit'].forEach(function(kind) {
      var input = m.querySelector('[data-input="' + kind + '"]');
      input.addEventListener('change', function() {
        if (input.files && input.files[0]) handleFile(kind, input.files[0]);
      });
    });
    return m;
  }

  function close() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.classList.remove('show');
  }

  function open() {
    var m = buildModal();
    requestAnimationFrame(function() { m.classList.add('show'); });
  }

  // ─────────────────────────────────────────────────────────────
  // File handling
  // ─────────────────────────────────────────────────────────────
  function handleFile(kind, file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return;
    // Compress + base64
    var fr = new FileReader();
    fr.onload = function(ev) {
      var dataUrl = ev.target.result;
      // Resize via canvas to max 1280px lange zijde
      var img = new Image();
      img.onload = function() {
        var maxSide = 1280;
        var w = img.width, h = img.height;
        if (w > maxSide || h > maxSide) {
          if (w > h) { h = Math.round(h * (maxSide / w)); w = maxSide; }
          else       { w = Math.round(w * (maxSide / h)); h = maxSide; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var jpeg = canvas.toDataURL('image/jpeg', 0.86);
        var b64 = jpeg.split(',')[1];
        if (kind === 'user')   { state.userB64 = b64;   state.userMime = 'image/jpeg'; }
        if (kind === 'outfit') { state.outfitB64 = b64; state.outfitMime = 'image/jpeg'; }
        renderSlotPreview(kind, jpeg);
        updateCta();
      };
      img.onerror = function() { console.warn('[tryon] img decode error'); };
      img.src = dataUrl;
    };
    fr.readAsDataURL(file);
  }

  function renderSlotPreview(kind, dataUrl) {
    var m = document.getElementById(MODAL_ID);
    var slot = m.querySelector('[data-slot="' + kind + '"]');
    slot.classList.add('filled');
    slot.innerHTML = '<input type="file" accept="image/*" hidden data-input="' + kind + '"><img src="' + dataUrl + '" alt="">';
    // re-bind input change
    var input = slot.querySelector('[data-input="' + kind + '"]');
    input.addEventListener('change', function() {
      if (input.files && input.files[0]) handleFile(kind, input.files[0]);
    });
  }

  function updateCta() {
    var m = document.getElementById(MODAL_ID);
    var btn = m.querySelector('[data-tryon-act="generate"]');
    if (state.userB64 && state.outfitB64 && !state.busy) btn.disabled = false;
    else btn.disabled = true;
  }

  // ─────────────────────────────────────────────────────────────
  // Generate
  // ─────────────────────────────────────────────────────────────
  async function generate() {
    if (state.busy) return;
    var m = document.getElementById(MODAL_ID);
    var extra = m.querySelector('[data-extra]').value || '';
    state.busy = true;
    updateCta();
    var body = m.querySelector('[data-tryon-body]');
    body.innerHTML =
      '<div class="dy-tryon-loading"><div class="spin"></div>' +
      '<strong>AI past de outfit op je toe…</strong>' +
      '<div style="margin-top:6px;font-size:12px;opacity:.7">Dit duurt 15-30 sec</div></div>';

    try {
      // v59: Forceer absolute backend URL. Bij 404/HTML response (= verkeerde host)
      // retry met hardcoded LIVE_BACKEND ipv apiBase() resultaat.
      var endpoint = apiBase() + '/api/tryon';
      var payload = JSON.stringify({
        user_photo_b64:   state.userB64,
        user_photo_mime:  state.userMime,
        outfit_photo_b64: state.outfitB64,
        outfit_photo_mime:state.outfitMime,
        extra_prompt:     extra,
        uid: getUid(),
        session_id: 'tryon-' + Date.now()
      });
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      // v59: 404 met "page not found" = hosting fallback, niet onze backend.
      // Retry direct met hardcoded LIVE_BACKEND URL.
      if (res.status === 404) {
        var fallbackUrl = LIVE_BACKEND + '/api/tryon';
        if (endpoint !== fallbackUrl) {
          console.warn('[tryon] 404 op', endpoint, '- retry met', fallbackUrl);
          res = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
        }
      }
      if (!res.ok) {
        var t = await res.text();
        throw new Error('Server ' + res.status + ': ' + t.slice(0, 140));
      }
      var data = await res.json();
      if (!data || !data.image_b64) throw new Error((data && data.error) || 'AI gaf geen afbeelding terug');
      state.lastResult = data;
      renderResult(data);
      logEvent('tryon_success', { caption_len: (data.caption || '').length });
    } catch (e) {
      console.error('[tryon] fetch failed:', e && e.message);
      renderError(e.message || 'Onbekende fout');
      logEvent('tryon_error', { msg: (e.message || '').slice(0, 120) });
    } finally {
      state.busy = false;
    }
  }

  function renderResult(data) {
    var m = document.getElementById(MODAL_ID);
    var body = m.querySelector('[data-tryon-body]');
    var src = 'data:' + (data.mime_type || 'image/png') + ';base64,' + data.image_b64;
    body.innerHTML =
      '<div class="dy-tryon-result">' +
        '<img src="' + src + '" alt="Virtuele paskamer resultaat">' +
        (data.caption ? '<div class="dy-tryon-caption">' + escapeHtml(data.caption) + '</div>' : '') +
      '</div>' +
      '<div class="dy-tryon-actions">' +
        '<button type="button" class="dy-tryon-retry" data-tryon-act="retry">Opnieuw</button>' +
        '<button type="button" class="dy-tryon-share" data-tryon-act="share">Delen</button>' +
      '</div>';
    body.querySelector('[data-tryon-act="retry"]').addEventListener('click', resetModal);
    body.querySelector('[data-tryon-act="share"]').addEventListener('click', function() { shareResult(data); });
  }

  function renderError(msg) {
    var m = document.getElementById(MODAL_ID);
    var body = m.querySelector('[data-tryon-body]');
    body.innerHTML =
      '<div class="dy-tryon-err">' + escapeHtml(msg) + '</div>' +
      '<button type="button" class="dy-tryon-cta" data-tryon-act="retry-form">Probeer opnieuw</button>';
    body.querySelector('[data-tryon-act="retry-form"]').addEventListener('click', resetModal);
  }

  function resetModal() {
    state.userB64 = state.outfitB64 = state.lastResult = null;
    var m = document.getElementById(MODAL_ID);
    m.remove();
    open();
  }

  // ─────────────────────────────────────────────────────────────
  // Share
  // ─────────────────────────────────────────────────────────────
  async function shareResult(data) {
    var src = 'data:' + (data.mime_type || 'image/png') + ';base64,' + data.image_b64;
    var watermarkUrl;
    try {
      watermarkUrl = await applyWatermark(src);
    } catch (e) { watermarkUrl = src; }

    var shareData = {
      title: 'Mijn paskamer — Paskamer Praat',
      text:  'Bekijk mijn virtuele paskamer-look! https://paskamerpraat.nl',
      url:   'https://paskamerpraat.nl'
    };
    try {
      var blob = dataUrlToBlob(watermarkUrl);
      var file = new File([blob], 'paskamerpraat-tryon.png', { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        shareData.files = [file];
      }
    } catch (e) { /* noop */ }
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        logEvent('tryon_shared');
        return;
      }
    } catch (e) { /* abort / fail → fallback */ }
    // Fallback: download
    var a = document.createElement('a');
    a.href = watermarkUrl; a.download = 'paskamerpraat-tryon.png';
    document.body.appendChild(a); a.click(); a.remove();
    logEvent('tryon_downloaded');
  }

  function applyWatermark(src) {
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var pad = Math.round(img.width * 0.03);
        var fontSize = Math.max(14, Math.round(img.width * 0.026));
        ctx.font = '700 ' + fontSize + 'px "DM Sans", system-ui, sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        var label = 'paskamerpraat.nl';
        var metrics = ctx.measureText(label);
        var boxW = metrics.width + pad * 1.6;
        var boxH = fontSize * 1.7;
        var x = pad, y = img.height - pad;
        ctx.fillStyle = 'rgba(30,26,15,0.78)';
        ctx.beginPath();
        var r = boxH * 0.4;
        ctx.moveTo(x, y - boxH + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.arcTo(x + boxW, y, x + boxW, y - boxH, r);
        ctx.arcTo(x + boxW, y - boxH, x + boxW - r, y - boxH, r);
        ctx.arcTo(x, y - boxH, x, y - boxH + r, r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fefcf5';
        ctx.fillText(label, x + pad * 0.8, y - pad * 0.4);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function() { reject(new Error('watermark img fail')); };
      img.src = src;
    });
  }

  function dataUrlToBlob(d) {
    var parts = d.split(','), header = parts[0], data = parts[1];
    var mime = header.match(/data:([^;]+)/)[1];
    var bin = atob(data);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ─────────────────────────────────────────────────────────────
  // Util
  // ─────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function getUid() {
    try { return (window.DY && window.DY.user && window.DY.user.uid) || null; } catch (e) { return null; }
  }
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

  // Pre-fill outfit from feed (hub-menu → "Probeer aan")
  // Gebruikt <img crossorigin=anonymous> + canvas → toDataURL ipv fetch()
  // → bypassed CORS issues van Firebase Storage / CDN images.
  function openWithOutfit(imgUrl) {
    open();
    if (!imgUrl) return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    var done = false;
    var timer = setTimeout(function() {
      if (done) return; done = true;
      // Fallback 1: try zonder CORS (zelfde origin)
      tryFallback();
    }, 7000);
    img.onload = function() {
      if (done) return; done = true; clearTimeout(timer);
      try {
        var canvas = document.createElement('canvas');
        var maxDim = 1280;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var ratio = Math.min(1, maxDim / Math.max(w, h));
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        // toDataURL() faalt op tainted canvas (CORS); catch en fallback
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        fetch(dataUrl).then(function(r) { return r.blob(); }).then(function(blob) {
          var file = new File([blob], 'outfit.jpg', { type: 'image/jpeg' });
          handleFile('outfit', file);
        }).catch(tryFallback);
      } catch (e) {
        // Tainted canvas — image laadde maar zonder CORS-header
        tryFallback();
      }
    };
    img.onerror = function() {
      if (done) return; done = true; clearTimeout(timer);
      tryFallback();
    };
    img.src = imgUrl;

    function tryFallback() {
      // Fallback 2: via backend proxy om CORS te omzeilen
      var endpoint = apiBase() + '/api/proxy-image?url=' + encodeURIComponent(imgUrl);
      fetch(endpoint).then(function(r) {
        // v59: 404 = hosting redirect, retry met absolute backend URL
        if (r.status === 404) {
          var abs = LIVE_BACKEND + '/api/proxy-image?url=' + encodeURIComponent(imgUrl);
          if (endpoint !== abs) {
            console.warn('[tryon] proxy 404, retry abs:', abs);
            return fetch(abs).then(function(r2) {
              if (!r2.ok) throw new Error('proxy ' + r2.status);
              return r2.blob();
            });
          }
        }
        if (!r.ok) throw new Error('proxy ' + r.status);
        return r.blob();
      }).then(function(blob) {
        var file = new File([blob], 'outfit.jpg', { type: blob.type || 'image/jpeg' });
        handleFile('outfit', file);
      }).catch(function(err) {
        console.error('[tryon] proxy-image failed:', err && err.message);
        try {
          var slot = document.querySelector('#' + MODAL_ID + ' [data-slot="outfit"] .hint');
          if (slot) slot.innerHTML = 'Outfit-foto kon niet automatisch worden geladen<br><span>Tik om handmatig te uploaden</span>';
        } catch (e) { /* ignore */ }
      });
    }
  }

  // Public API
  window.DY = window.DY || {};
  window.DY.tryOn = {
    open: open,
    close: close,
    openWithOutfit: openWithOutfit
  };
})();
