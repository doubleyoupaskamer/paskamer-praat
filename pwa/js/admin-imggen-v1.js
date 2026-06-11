// ════════════════════════════════════════════════════════════════
// PASKAMERPRAAT — Admin Image Generator UI (v60.1.18)
// Volledig UI-gebaseerd: geen console-acties meer nodig.
// Backend endpoint: POST /api/admin/generate-image
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
    if (v && v.length > 4) localStorage.setItem('dy.imggen.secret', v);
  }
  function _isAdmin() {
    return !!(DY._isAdmin && DY._isAdmin());
  }

  // Vooraf gedefinieerde brand-prompts zodat admin niet hoeft te typen
  var PRESETS = [
    {
      label: 'Inclusieve groep, sportief casual, urban outdoor',
      prompt: 'Inclusive group portrait of six diverse people standing relaxed on a brick paved Dutch city street in late afternoon golden hour, soft warm sunlight on industrial brick wall in background. Mix of tall slim, plus size, petite and average body types, men and women, different ages and ethnicities. Sport casual styling: cream sweatshirts, clay gold joggers, white sneakers, beige track jacket, off white hoodie. Natural skin textures, real proportions, no airbrushing. Warm earth tone palette of cream, camel, clay gold, deep brown. Editorial lookbook quality, cinematic shallow depth of field.'
    },
    {
      label: 'Mix outfits: kleurrijke jurk en navy jeans',
      prompt: 'Inclusive everyday fashion group portrait of six diverse people on a Dutch city street in golden hour. Mixed styling: one person in a colorful floral midi dress with clay gold, terracotta and sage tones, one person in dark navy blue straight jeans with cream blouse, others in sport casual athleisure. Different ages from twenties to fifties, different ethnicities, tall and plus size and petite bodies. Real proportions, no airbrushing, warm earth tone palette with one bold colorful dress and navy denim accents.'
    },
    {
      label: 'Tall fashion focus, studio, editorial',
      prompt: 'Editorial studio portrait of three tall fashion forward people against deep brown studio background. Tall slim Black woman with afro in flowing cream maxi dress, tall South Asian man in beige tailored linen suit, exceptionally tall white woman in clay gold wide leg trousers and cream blouse. Warm cinematic rim lighting, magazine quality, real bodies, natural skin textures.'
    },
    {
      label: 'Plus size focus, lifestyle, café terras',
      prompt: 'Lifestyle portrait of three plus size people sitting and standing at an outdoor cafe terras in Amsterdam during golden hour. Confident relaxed poses, natural conversation, real bodies, warm friendly vibe. Mixed styling: one in clay gold wrap dress, one in cream linen jumpsuit, one in navy denim and beige blouse. Soft afternoon sunlight, warm earth tone palette, editorial lifestyle photography quality.'
    },
    {
      label: 'Banner social media, breed formaat',
      prompt: 'Wide horizontal banner composition of inclusive fashion community standing together on a cobblestone street. Six diverse people of different body types, ages, ethnicities and genders in mixed casual styling. Warm golden hour light, earth tone palette, deep brown brick wall background. Editorial lookbook quality, cinematic.',
      aspect: 'landscape'
    },
  ];

  DY.renderAdminImggen = function() {
    if (!_isAdmin()) { DY.navigeer('feed'); return; }
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.classList.remove('dy-feed-actief');
    main.classList.remove('dy-main--home');

    var hasSecret = !!_secret();

    var presetOpties = PRESETS.map(function(p, i) {
      return '<option value="' + i + '">' + esc(p.label) + '</option>';
    }).join('');

    main.innerHTML =
      '<div class="bp-page" style="padding:24px;max-width:780px;margin:0 auto">' +
        '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
        '<h1 style="font-family:\'Cormorant Garamond\',serif;font-size:1.8rem;color:#fcf8ef;margin:8px 0 4px">Image Generator</h1>' +
        '<p style="color:rgba(252,248,239,0.6);font-size:0.88rem;margin:0 0 18px">Genereer hero, banner en social images via Gemini Nano Banana. Resultaat downloadbaar als JPG.</p>' +

        // Secret-veld: enkel zichtbaar als nog niet gezet, met save-knop
        '<div id="ig-secret-block" style="display:' + (hasSecret ? 'none' : 'block') + ';background:rgba(212,145,10,0.10);border:1px solid rgba(212,145,10,0.25);border-radius:10px;padding:14px;margin-bottom:14px">' +
          '<div style="font-weight:600;color:#d4910a;font-size:0.92rem;margin-bottom:6px">Eerste keer: admin-toegang</div>' +
          '<p style="font-size:0.82rem;color:rgba(252,248,239,0.7);margin:0 0 10px">Vul je admin-secret in (eenmalig, blijft bewaard in deze browser).</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<input id="ig-secret-input" type="password" placeholder="Admin secret" autocomplete="off" style="flex:1;min-width:200px;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:0.92rem">' +
            '<button id="ig-secret-save" class="bp-btn bp-btn-primair" style="white-space:nowrap" data-testid="imggen-secret-save">Opslaan</button>' +
          '</div>' +
        '</div>' +

        // Status badge wanneer secret wel is gezet (verbergbaar)
        '<div id="ig-secret-ok" style="display:' + (hasSecret ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;background:rgba(130,192,138,0.08);border:1px solid rgba(130,192,138,0.20);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.82rem;color:#82c08a">' +
          '<span><span style="margin-right:6px">✓</span>Admin-toegang actief</span>' +
          '<button id="ig-secret-reset" style="background:none;border:none;color:rgba(252,248,239,0.6);font-size:0.78rem;cursor:pointer;text-decoration:underline">Wijzigen</button>' +
        '</div>' +

        // Preset selector
        '<div class="bp-veld">' +
          '<span>Voorbeeld-prompt (optioneel snelstartpunt)</span>' +
          '<select id="ig-preset" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px;font-family:inherit">' +
            '<option value="">— Kies een voorbeeld of typ zelf —</option>' +
            presetOpties +
          '</select>' +
        '</div>' +

        '<div class="bp-veld">' +
          '<span>Prompt (subject van de afbeelding)</span>' +
          '<textarea id="ig-prompt" rows="6" placeholder="Beschrijf het onderwerp..." style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:12px;font-family:inherit;font-size:0.92rem;line-height:1.5;resize:vertical"></textarea>' +
        '</div>' +

        '<div class="bp-veld">' +
          '<span>Aspect ratio</span>' +
          '<select id="ig-aspect" style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:10px;font-family:inherit">' +
            '<option value="portrait">Portrait 2:3 (hero, 1024x1536)</option>' +
            '<option value="landscape">Landscape 16:9 (OG banner, 1200x630)</option>' +
            '<option value="square">Square 1:1 (social, 1024x1024)</option>' +
          '</select>' +
        '</div>' +

        '<div style="background:rgba(212,145,10,0.08);border:1px solid rgba(212,145,10,0.20);border-radius:10px;padding:10px 12px;margin:12px 0;font-size:0.82rem;color:rgba(252,248,239,0.7)">' +
          '<strong style="color:#d4910a">Tip:</strong> de brand-styling (kleurpalet, body diversity, editorial fashion vibe) wordt automatisch toegevoegd. Beschrijf alleen het onderwerp.' +
        '</div>' +

        '<button id="ig-genereer" class="bp-btn bp-btn-primair" style="width:100%" data-testid="imggen-submit">Genereer afbeelding</button>' +
        '<div id="ig-status" style="margin-top:14px;font-size:0.88rem;color:rgba(252,248,239,0.6);min-height:1.4em"></div>' +
        '<div id="ig-result" style="margin-top:18px"></div>' +
      '</div>';

    function esc(s) { return String(s||'').replace(/[<>&"]/g, function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];}); }

    // Pre-fill eerste preset als startpunt
    var firstPrompt = PRESETS[0].prompt;
    document.getElementById('ig-prompt').value = firstPrompt;

    // Secret opslaan via UI
    document.getElementById('ig-secret-save').onclick = function() {
      var v = document.getElementById('ig-secret-input').value.trim();
      if (!v) { return; }
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

    // Preset selector vult prompt + aspect
    document.getElementById('ig-preset').onchange = function() {
      var idx = parseInt(this.value, 10);
      if (isNaN(idx)) return;
      var p = PRESETS[idx];
      if (!p) return;
      document.getElementById('ig-prompt').value = p.prompt;
      if (p.aspect) document.getElementById('ig-aspect').value = p.aspect;
    };

    document.getElementById('ig-genereer').onclick = async function() {
      var btn = this;
      var prompt = document.getElementById('ig-prompt').value.trim();
      var aspect = document.getElementById('ig-aspect').value;
      var statusEl = document.getElementById('ig-status');
      var resEl = document.getElementById('ig-result');

      if (!prompt) { statusEl.textContent = 'Voer eerst een prompt in (of kies een voorbeeld).'; return; }
      if (!_secret()) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Admin-secret ontbreekt. Vul deze in bij het veld bovenaan.</span>';
        document.getElementById('ig-secret-block').style.display = 'block';
        document.getElementById('ig-secret-input').focus();
        return;
      }

      btn.disabled = true; btn.textContent = 'Bezig met genereren (kan 15-30 sec duren)...';
      statusEl.innerHTML = '<span style="color:#d4910a">Aanroep naar Nano Banana...</span>';
      resEl.innerHTML = '';

      try {
        var r = await fetch(_backendUrl() + '/api/admin/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': _secret() },
          body: JSON.stringify({ prompt: prompt, aspect: aspect }),
        });
        if (!r.ok) {
          var errTxt = await r.text();
          if (r.status === 403) {
            statusEl.innerHTML = '<span style="color:#ff6b6b">Admin-secret klopt niet. Klik op "Wijzigen" en probeer opnieuw.</span>';
          } else {
            statusEl.innerHTML = '<span style="color:#ff6b6b">Fout HTTP ' + r.status + ': ' + esc(errTxt.substring(0, 200)) + '</span>';
          }
          return;
        }
        var data = await r.json();
        statusEl.innerHTML = '<span style="color:#82c08a">Klaar. ' + data.mime_type + '</span>';

        var url = 'data:' + data.mime_type + ';base64,' + data.base64;
        var ext = data.mime_type.indexOf('jpeg') >= 0 ? 'jpg' : 'png';
        var filename = 'paskamerpraat-' + aspect + '-' + Date.now() + '.' + ext;

        resEl.innerHTML =
          '<img src="' + url + '" style="max-width:100%;border-radius:12px;display:block;margin-bottom:12px" data-testid="imggen-result-img" alt="Generated image">' +
          '<a href="' + url + '" download="' + filename + '" class="bp-btn bp-btn-primair" style="display:inline-block;text-decoration:none" data-testid="imggen-download-btn">Download ' + filename + '</a>' +
          '<button class="bp-btn" style="margin-left:8px" onclick="document.getElementById(\'ig-genereer\').click()" data-testid="imggen-regenerate-btn">Genereer opnieuw</button>';
      } catch(e) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Netwerkfout: ' + esc(String(e.message || e)) + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = 'Genereer afbeelding';
      }
    };
  };

  // Registreer als admin pagina binnen de brand-portal routing
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
