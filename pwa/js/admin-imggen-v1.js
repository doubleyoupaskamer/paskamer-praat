// ════════════════════════════════════════════════════════════════
// PASKAMERPRAAT — Admin Image + Video Generator UI (v60.1.44)
// Backend endpoints:
//   POST /api/admin/generate-image  (Gemini Nano Banana)
//   POST /api/admin/generate-video  (Sora 2 via Emergent LLM Key)
// Auth: X-Admin-Secret + X-User-Email (server-side gate op
// williamdevriesis@gmail.com via ADMIN_USER_EMAIL env var).
// ════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  if (!window.DY) window.DY = {};

  function _backendUrl() {
    return localStorage.getItem('dy.imggen.url') || 'https://paskamer-stability.preview.emergentagent.com';
  }
  function _secret() {
    return localStorage.getItem('dy.imggen.secret') || '';
  }
  function _setSecret(v) {
    if (v && v.length > 2) localStorage.setItem('dy.imggen.secret', v);
  }
  function _userEmail() {
    // v60.1.44: stuur ingelogde email mee voor server-side account-gate
    try {
      if (DY.user && DY.user.email) return DY.user.email;
      if (DY.profile && DY.profile.email) return DY.profile.email;
    } catch (e) {}
    return '';
  }
  function _isAdmin() {
    return !!(DY._isAdmin && DY._isAdmin());
  }
  function esc(s) { return String(s||'').replace(/[<>&"]/g, function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }

  var IMG_PRESETS = [
    { label: 'Inclusieve groep, sportief casual, urban outdoor',
      prompt: 'Inclusive group portrait of six diverse people standing relaxed on a brick paved Dutch city street in late afternoon golden hour, soft warm sunlight on industrial brick wall in background. Mix of tall slim, plus size, petite and average body types, men and women, different ages and ethnicities. Sport casual styling: cream sweatshirts, clay gold joggers, white sneakers, beige track jacket, off white hoodie. Natural skin textures, real proportions, no airbrushing. Warm earth tone palette of cream, camel, clay gold, deep brown. Editorial lookbook quality, cinematic shallow depth of field.' },
    { label: 'Mix outfits: kleurrijke jurk en navy jeans',
      prompt: 'Inclusive everyday fashion group portrait of six diverse people on a Dutch city street in golden hour. Mixed styling: one person in a colorful floral midi dress with clay gold, terracotta and sage tones, one person in dark navy blue straight jeans with cream blouse, others in sport casual athleisure. Different ages from twenties to fifties, different ethnicities, tall and plus size and petite bodies. Real proportions, no airbrushing, warm earth tone palette with one bold colorful dress and navy denim accents.' },
    { label: 'Tall fashion focus, studio editorial',
      prompt: 'Editorial studio portrait of three tall fashion forward people against deep brown studio background. Tall slim Black woman with afro in flowing cream maxi dress, tall South Asian man in beige tailored linen suit, exceptionally tall white woman in clay gold wide leg trousers and cream blouse. Warm cinematic rim lighting, magazine quality, real bodies, natural skin textures.' },
    { label: 'Plus size focus, lifestyle café terras',
      prompt: 'Lifestyle portrait of three plus size people sitting and standing at an outdoor cafe terras in Amsterdam during golden hour. Confident relaxed poses, natural conversation, real bodies, warm friendly vibe. Mixed styling: one in clay gold wrap dress, one in cream linen jumpsuit, one in navy denim and beige blouse. Soft afternoon sunlight, warm earth tone palette, editorial lifestyle photography quality.' },
    { label: 'Banner social media, breed formaat',
      prompt: 'Wide horizontal banner composition of inclusive fashion community standing together on a cobblestone street. Six diverse people of different body types, ages, ethnicities and genders in mixed casual styling. Warm golden hour light, earth tone palette, deep brown brick wall background. Editorial lookbook quality, cinematic.',
      aspect: 'landscape' },
  ];

  var VIDEO_PRESETS = [
    { label: 'UGC reel: plus-size model loopt langs gracht',
      prompt: 'A confident plus-size woman with warm brown hair walking calmly along an Amsterdam canal in golden hour, wearing a cream linen jumpsuit and clay-gold belt, soft natural step rhythm, slight smile, gentle hair movement in the breeze. Warm cinematic backlight from the late afternoon sun reflecting on the water. Camera does a slow steady dolly-follow at chest height. Sharp detail on fabric texture and skin pores, no airbrushing, real proportions.' },
    { label: 'Editorial loop: tall model strikt jas',
      prompt: 'Tall slim South Asian man in a beige tailored linen suit adjusting his cream blouse collar against a deep brown industrial brick wall during golden hour. Subtle micro-movements, small head turn, confident relaxed expression. Camera holds steady, very slight push-in. Soft warm rim light. Editorial fashion magazine quality, 24fps cinematic feel, natural skin texture.' },
    { label: 'Vertical reel: inclusieve groep lacht samen',
      prompt: 'Inclusive group of four diverse friends laughing together on a cobblestone Dutch street in late afternoon golden hour. Mix of body types (tall, plus, petite), ages and ethnicities. Natural unscripted reactions, slight movement between them. Camera does a soft slow circular dolly around the group. Warm earth-tone styling, natural skin textures, real proportions, social media UGC vibe but with cinematic depth of field.' },
  ];

  DY.renderAdminImggen = function() {
    if (!_isAdmin()) { DY.navigeer('feed'); return; }
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.classList.remove('dy-feed-actief');
    main.classList.remove('dy-main--home');

    var hasSecret = !!_secret();
    var userEmail = _userEmail();
    var imgPresetOpts = IMG_PRESETS.map(function(p,i){ return '<option value="'+i+'">'+esc(p.label)+'</option>'; }).join('');
    var vidPresetOpts = VIDEO_PRESETS.map(function(p,i){ return '<option value="'+i+'">'+esc(p.label)+'</option>'; }).join('');

    main.innerHTML =
      '<div class="bp-page" style="padding:24px;max-width:780px;margin:0 auto">' +
        '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
        '<h1 style="font-family:\'Cormorant Garamond\',serif;font-size:1.8rem;color:#fcf8ef;margin:8px 0 4px">Media Generator</h1>' +
        '<p style="color:rgba(252,248,239,0.6);font-size:0.88rem;margin:0 0 12px">Genereer hero/banner afbeeldingen (Nano Banana) of korte editorial video clips (Sora 2). Resultaat downloadbaar.</p>' +
        '<p style="color:rgba(252,248,239,0.45);font-size:0.78rem;margin:0 0 18px">Ingelogd als: <strong style="color:#d4910a">' + esc(userEmail || '(geen email gevonden)') + '</strong></p>' +

        // Secret block
        '<div id="ig-secret-block" style="display:' + (hasSecret ? 'none' : 'block') + ';background:rgba(212,145,10,0.10);border:1px solid rgba(212,145,10,0.25);border-radius:10px;padding:14px;margin-bottom:14px">' +
          '<div style="font-weight:600;color:#d4910a;font-size:0.92rem;margin-bottom:6px">Eerste keer: admin-toegang</div>' +
          '<p style="font-size:0.82rem;color:rgba(252,248,239,0.7);margin:0 0 10px">Vul je admin-secret in (eenmalig, blijft bewaard in deze browser).</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<input id="ig-secret-input" type="password" placeholder="Admin secret" autocomplete="off" style="flex:1;min-width:200px;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:0.92rem">' +
            '<button id="ig-secret-save" class="bp-btn bp-btn-primair" style="white-space:nowrap" data-testid="imggen-secret-save">Opslaan</button>' +
          '</div>' +
        '</div>' +
        '<div id="ig-secret-ok" style="display:' + (hasSecret ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;background:rgba(130,192,138,0.08);border:1px solid rgba(130,192,138,0.20);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.82rem;color:#82c08a">' +
          '<span><span style="margin-right:6px">✓</span>Admin-toegang actief</span>' +
          '<button id="ig-secret-reset" style="background:none;border:none;color:rgba(252,248,239,0.6);font-size:0.78rem;cursor:pointer;text-decoration:underline">Wijzigen</button>' +
        '</div>' +

        // Tabs
        '<div style="display:flex;gap:0;background:#1a1612;border:1px solid rgba(252,248,239,0.12);border-radius:10px;padding:4px;margin-bottom:18px">' +
          '<button id="ig-tab-img" class="ig-tab actief" data-testid="imggen-tab-image" style="flex:1;padding:10px 14px;background:#d4910a;color:#0a0806;border:none;border-radius:8px;font-weight:600;cursor:pointer">Afbeelding</button>' +
          '<button id="ig-tab-vid" class="ig-tab" data-testid="imggen-tab-video" style="flex:1;padding:10px 14px;background:transparent;color:rgba(252,248,239,0.7);border:none;border-radius:8px;font-weight:600;cursor:pointer">Video</button>' +
        '</div>' +

        // IMAGE pane
        '<div id="ig-pane-img">' +
          '<div class="bp-veld"><span>Voorbeeld-prompt (optioneel)</span>' +
            '<select id="ig-preset" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
              '<option value="">— Kies een voorbeeld of typ zelf —</option>' + imgPresetOpts +
            '</select></div>' +
          '<div class="bp-veld"><span>Prompt</span>' +
            '<textarea id="ig-prompt" rows="6" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:12px;font-size:0.92rem;line-height:1.5;resize:vertical"></textarea></div>' +
          '<div class="bp-veld"><span>Aspect ratio</span>' +
            '<select id="ig-aspect" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
              '<option value="portrait">Portrait 2:3 (hero)</option>' +
              '<option value="landscape">Landscape 16:9 (banner)</option>' +
              '<option value="square">Square 1:1 (social)</option>' +
            '</select></div>' +
          '<button id="ig-genereer" class="bp-btn bp-btn-primair" style="width:100%" data-testid="imggen-submit">Genereer afbeelding</button>' +
          '<div id="ig-status" style="margin-top:14px;font-size:0.88rem;color:rgba(252,248,239,0.6);min-height:1.4em"></div>' +
          '<div id="ig-result" style="margin-top:18px"></div>' +
        '</div>' +

        // VIDEO pane
        '<div id="ig-pane-vid" style="display:none">' +
          '<div class="bp-veld"><span>Voorbeeld-prompt</span>' +
            '<select id="vg-preset" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
              '<option value="">— Kies een voorbeeld of typ zelf —</option>' + vidPresetOpts +
            '</select></div>' +
          '<div class="bp-veld"><span>Scene prompt</span>' +
            '<textarea id="vg-prompt" rows="6" placeholder="Beschrijf de scène, camerabeweging, belichting..." style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:12px;font-size:0.92rem;line-height:1.5;resize:vertical"></textarea></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
            '<div class="bp-veld"><span>Resolutie</span>' +
              '<select id="vg-size" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
                '<option value="1280x720">1280×720 HD</option>' +
                '<option value="1792x1024">1792×1024 wide</option>' +
                '<option value="1024x1792">1024×1792 vertical</option>' +
                '<option value="1024x1024">1024×1024 square</option>' +
              '</select></div>' +
            '<div class="bp-veld"><span>Duur</span>' +
              '<select id="vg-duration" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
                '<option value="4">4 sec</option>' +
                '<option value="8" selected>8 sec</option>' +
                '<option value="12">12 sec</option>' +
              '</select></div>' +
            '<div class="bp-veld"><span>Model</span>' +
              '<select id="vg-model" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px">' +
                '<option value="sora-2">sora-2 (sneller)</option>' +
                '<option value="sora-2-pro">sora-2-pro (hogere kwaliteit)</option>' +
              '</select></div>' +
          '</div>' +
          '<div style="background:rgba(212,145,10,0.08);border:1px solid rgba(212,145,10,0.20);border-radius:10px;padding:10px 12px;margin:12px 0;font-size:0.82rem;color:rgba(252,248,239,0.7)">' +
            '<strong style="color:#d4910a">Let op:</strong> video generatie duurt 2-5 minuten. Houd het tabblad open. De brand-styling (golden hour, real proportions, UGC editorial vibe) wordt automatisch toegevoegd.' +
          '</div>' +
          '<button id="vg-genereer" class="bp-btn bp-btn-primair" style="width:100%" data-testid="vidgen-submit">Genereer video</button>' +
          '<div id="vg-status" style="margin-top:14px;font-size:0.88rem;color:rgba(252,248,239,0.6);min-height:1.4em"></div>' +
          '<div id="vg-result" style="margin-top:18px"></div>' +
        '</div>' +
      '</div>';

    // Pre-fill
    document.getElementById('ig-prompt').value = IMG_PRESETS[0].prompt;

    // Tab switching
    function setTab(which) {
      var tabImg = document.getElementById('ig-tab-img');
      var tabVid = document.getElementById('ig-tab-vid');
      var paneImg = document.getElementById('ig-pane-img');
      var paneVid = document.getElementById('ig-pane-vid');
      if (which === 'video') {
        tabImg.style.background = 'transparent'; tabImg.style.color = 'rgba(252,248,239,0.7)';
        tabVid.style.background = '#d4910a';     tabVid.style.color = '#0a0806';
        paneImg.style.display = 'none'; paneVid.style.display = 'block';
      } else {
        tabImg.style.background = '#d4910a';     tabImg.style.color = '#0a0806';
        tabVid.style.background = 'transparent'; tabVid.style.color = 'rgba(252,248,239,0.7)';
        paneImg.style.display = 'block'; paneVid.style.display = 'none';
      }
    }
    document.getElementById('ig-tab-img').onclick = function(){ setTab('image'); };
    document.getElementById('ig-tab-vid').onclick = function(){ setTab('video'); };

    // Secret save/reset
    document.getElementById('ig-secret-save').onclick = function() {
      var v = document.getElementById('ig-secret-input').value.trim();
      if (!v) return;
      _setSecret(v);
      document.getElementById('ig-secret-block').style.display = 'none';
      document.getElementById('ig-secret-ok').style.display = 'flex';
    };
    document.getElementById('ig-secret-input').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') document.getElementById('ig-secret-save').click();
    });
    document.getElementById('ig-secret-reset').onclick = function() {
      localStorage.removeItem('dy.imggen.secret');
      document.getElementById('ig-secret-block').style.display = 'block';
      document.getElementById('ig-secret-ok').style.display = 'none';
      document.getElementById('ig-secret-input').value = '';
      document.getElementById('ig-secret-input').focus();
    };

    // Preset selectors
    document.getElementById('ig-preset').onchange = function() {
      var idx = parseInt(this.value, 10);
      if (isNaN(idx)) return;
      var p = IMG_PRESETS[idx]; if (!p) return;
      document.getElementById('ig-prompt').value = p.prompt;
      if (p.aspect) document.getElementById('ig-aspect').value = p.aspect;
    };
    document.getElementById('vg-preset').onchange = function() {
      var idx = parseInt(this.value, 10);
      if (isNaN(idx)) return;
      var p = VIDEO_PRESETS[idx]; if (!p) return;
      document.getElementById('vg-prompt').value = p.prompt;
    };

    // ── IMAGE generation
    document.getElementById('ig-genereer').onclick = async function() {
      var btn = this;
      var prompt = document.getElementById('ig-prompt').value.trim();
      var aspect = document.getElementById('ig-aspect').value;
      var statusEl = document.getElementById('ig-status');
      var resEl = document.getElementById('ig-result');
      if (!prompt) { statusEl.textContent = 'Voer eerst een prompt in.'; return; }
      if (!_secret()) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Admin-secret ontbreekt.</span>';
        document.getElementById('ig-secret-block').style.display = 'block';
        document.getElementById('ig-secret-input').focus();
        return;
      }
      btn.disabled = true; btn.textContent = 'Bezig (15-30 sec)...';
      statusEl.innerHTML = '<span style="color:#d4910a">Aanroep naar Nano Banana...</span>';
      resEl.innerHTML = '';
      try {
        var r = await fetch(_backendUrl() + '/api/admin/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': _secret(), 'X-User-Email': _userEmail() },
          body: JSON.stringify({ prompt: prompt, aspect: aspect }),
        });
        if (!r.ok) {
          var errTxt = await r.text();
          statusEl.innerHTML = '<span style="color:#ff6b6b">Fout HTTP ' + r.status + ': ' + esc(errTxt.substring(0,200)) + '</span>';
          return;
        }
        var data = await r.json();
        statusEl.innerHTML = '<span style="color:#82c08a">Klaar. ' + data.mime_type + '</span>';
        var url = 'data:' + data.mime_type + ';base64,' + data.base64;
        var ext = data.mime_type.indexOf('jpeg') >= 0 ? 'jpg' : 'png';
        var filename = 'paskamerpraat-' + aspect + '-' + Date.now() + '.' + ext;
        resEl.innerHTML =
          '<img src="' + url + '" style="max-width:100%;border-radius:12px;display:block;margin-bottom:12px" data-testid="imggen-result-img">' +
          '<a href="' + url + '" download="' + filename + '" class="bp-btn bp-btn-primair" style="display:inline-block;text-decoration:none" data-testid="imggen-download-btn">Download ' + filename + '</a>';
      } catch(e) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Netwerkfout: ' + esc(String(e.message || e)) + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = 'Genereer afbeelding';
      }
    };

    // ── VIDEO generation
    document.getElementById('vg-genereer').onclick = async function() {
      var btn = this;
      var prompt = document.getElementById('vg-prompt').value.trim();
      var size = document.getElementById('vg-size').value;
      var duration = parseInt(document.getElementById('vg-duration').value, 10);
      var model = document.getElementById('vg-model').value;
      var statusEl = document.getElementById('vg-status');
      var resEl = document.getElementById('vg-result');
      if (!prompt) { statusEl.textContent = 'Voer eerst een scène-prompt in.'; return; }
      if (!_secret()) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Admin-secret ontbreekt.</span>';
        document.getElementById('ig-secret-block').style.display = 'block';
        document.getElementById('ig-secret-input').focus();
        return;
      }
      btn.disabled = true;
      var startTs = Date.now();
      var tickIv = setInterval(function() {
        var sec = Math.round((Date.now() - startTs) / 1000);
        btn.textContent = 'Genereren... ' + Math.floor(sec/60) + ':' + String(sec % 60).padStart(2, '0');
      }, 1000);
      statusEl.innerHTML = '<span style="color:#d4910a">Aanroep naar Sora 2. Dit kan 2 tot 5 minuten duren. Houd dit tabblad open.</span>';
      resEl.innerHTML = '';
      try {
        var r = await fetch(_backendUrl() + '/api/admin/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': _secret(), 'X-User-Email': _userEmail() },
          body: JSON.stringify({ prompt: prompt, size: size, duration: duration, model: model }),
        });
        clearInterval(tickIv);
        if (!r.ok) {
          var errTxt = await r.text();
          statusEl.innerHTML = '<span style="color:#ff6b6b">Fout HTTP ' + r.status + ': ' + esc(errTxt.substring(0,300)) + '</span>';
          return;
        }
        var data = await r.json();
        var totalSec = Math.round((Date.now() - startTs) / 1000);
        var sizeMB = (data.size_bytes / (1024*1024)).toFixed(1);
        statusEl.innerHTML = '<span style="color:#82c08a">Klaar in ' + totalSec + ' sec. ' + sizeMB + ' MB</span>';
        var url = 'data:' + data.mime_type + ';base64,' + data.base64;
        var filename = 'paskamerpraat-video-' + duration + 's-' + Date.now() + '.mp4';
        resEl.innerHTML =
          '<video src="' + url + '" controls autoplay loop muted playsinline style="max-width:100%;border-radius:12px;display:block;margin-bottom:12px;background:#000" data-testid="vidgen-result-video"></video>' +
          '<a href="' + url + '" download="' + filename + '" class="bp-btn bp-btn-primair" style="display:inline-block;text-decoration:none" data-testid="vidgen-download-btn">Download ' + filename + '</a>';
      } catch(e) {
        clearInterval(tickIv);
        statusEl.innerHTML = '<span style="color:#ff6b6b">Netwerkfout: ' + esc(String(e.message || e)) + '</span>';
      } finally {
        clearInterval(tickIv);
        btn.disabled = false; btn.textContent = 'Genereer video';
      }
    };
  };

  // Registreer als admin pagina binnen brand-portal routing
  if (DY.brandPortal && DY.brandPortal._registreerPage) {
    DY.brandPortal._registreerPage('admin_imggen', DY.renderAdminImggen);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        if (DY.brandPortal && DY.brandPortal._registreerPage) {
          DY.brandPortal._registreerPage('admin_imggen', DY.renderAdminImggen);
        }
      }, 800);
    });
  }
})();
