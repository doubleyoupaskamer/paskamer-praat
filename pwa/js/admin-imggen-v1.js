// ════════════════════════════════════════════════════════════════
// PASKAMERPRAAT — Admin Image Generator UI (v60.1.14)
// Minimale admin-only image generator via Gemini Nano Banana.
// Backend endpoint: POST /api/admin/generate-image
// Auth: X-Admin-Secret header
// ════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  if (!window.DY) window.DY = {};

  // Backend URL en secret worden gelezen uit localStorage zodat ze niet
  // hardcoded in de bundle staan. Admin zet deze 1x via console:
  //   localStorage.setItem('dy.imggen.url', 'https://...preview.emergentagent.com');
  //   localStorage.setItem('dy.imggen.secret', 'paskamerpraat-admin-genimg-2026');
  function _backendUrl() {
    return localStorage.getItem('dy.imggen.url') || 'https://paskamer-stability.preview.emergentagent.com';
  }
  function _secret() {
    return localStorage.getItem('dy.imggen.secret') || '';
  }
  function _isAdmin() {
    return !!(DY._isAdmin && DY._isAdmin());
  }

  DY.renderAdminImggen = function() {
    if (!_isAdmin()) { DY.navigeer('feed'); return; }
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.classList.remove('dy-feed-actief');
    main.classList.remove('dy-main--home');

    main.innerHTML =
      '<div class="bp-page" style="padding:24px;max-width:780px;margin:0 auto">' +
        '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
        '<h1 style="font-family:\'Cormorant Garamond\',serif;font-size:1.8rem;color:#fcf8ef;margin:8px 0 4px">Image Generator</h1>' +
        '<p style="color:rgba(252,248,239,0.6);font-size:0.88rem;margin:0 0 18px">Genereer hero, banner en social images via Gemini Nano Banana. Resultaat downloadbaar als JPG.</p>' +

        '<div class="bp-veld">' +
          '<span>Prompt (subject van de afbeelding)</span>' +
          '<textarea id="ig-prompt" rows="5" placeholder="Inclusive group fashion shot, three diverse models against deep brown studio background..." style="width:100%;background:#1a1612;color:#fcf8ef;border:1px solid rgba(252,248,239,0.18);border-radius:10px;padding:12px;font-family:inherit;font-size:0.92rem;line-height:1.4;resize:vertical"></textarea>' +
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
          '<strong style="color:#d4910a">Tip:</strong> de brand-styling wordt automatisch toegevoegd (kleurpalet, body diversity, editorial fashion vibe). Beschrijf alleen het onderwerp.' +
        '</div>' +

        '<button id="ig-genereer" class="bp-btn bp-btn-primair" style="width:100%" data-testid="imggen-submit">Genereer afbeelding</button>' +
        '<div id="ig-status" style="margin-top:14px;font-size:0.88rem;color:rgba(252,248,239,0.6)"></div>' +
        '<div id="ig-result" style="margin-top:18px"></div>' +
      '</div>';

    // Pre-fill een veelgebruikte prompt als startpunt
    document.getElementById('ig-prompt').value =
      'Inclusive group fashion shot: three confident models of diverse body types ' +
      'against a deep brown studio background. Tall slim model on the left in earth-tone dress, ' +
      'plus-size model in the center in cream wrap top and clay-gold midi skirt, ' +
      'petite model on the right in tailored camel suit. Warm rim-lighting, real bodies, ' +
      'natural skin textures, magazine editorial quality.';

    document.getElementById('ig-genereer').onclick = async function() {
      var btn = this;
      var prompt = document.getElementById('ig-prompt').value.trim();
      var aspect = document.getElementById('ig-aspect').value;
      var statusEl = document.getElementById('ig-status');
      var resEl = document.getElementById('ig-result');

      if (!prompt) { statusEl.textContent = 'Voer eerst een prompt in.'; return; }
      if (!_secret()) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Admin-secret ontbreekt. Zet via console:<br>' +
          '<code style="font-size:0.78rem">localStorage.setItem(\'dy.imggen.secret\', \'paskamerpraat-admin-genimg-2026\');</code></span>';
        return;
      }

      btn.disabled = true; btn.textContent = 'Bezig met genereren (kan 15-30 sec duren)...';
      statusEl.textContent = 'Aanroep naar Nano Banana via emergent LLM key...';
      resEl.innerHTML = '';

      try {
        var r = await fetch(_backendUrl() + '/api/admin/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': _secret() },
          body: JSON.stringify({ prompt: prompt, aspect: aspect }),
        });
        if (!r.ok) {
          var errTxt = await r.text();
          throw new Error('HTTP ' + r.status + ': ' + errTxt.substring(0, 300));
        }
        var data = await r.json();
        statusEl.innerHTML = '<span style="color:#82c08a">Klaar. Mime: ' + data.mime_type + '</span>';

        var url = 'data:' + data.mime_type + ';base64,' + data.base64;
        var ext = data.mime_type.indexOf('jpeg') >= 0 ? 'jpg' : 'png';
        var filename = 'paskamerpraat-' + aspect + '-' + Date.now() + '.' + ext;

        resEl.innerHTML =
          '<img src="' + url + '" style="max-width:100%;border-radius:12px;display:block;margin-bottom:12px" data-testid="imggen-result-img">' +
          '<a href="' + url + '" download="' + filename + '" class="bp-btn bp-btn-primair" style="display:inline-block;text-decoration:none" data-testid="imggen-download-btn">Download ' + filename + '</a>';
      } catch(e) {
        statusEl.innerHTML = '<span style="color:#ff6b6b">Fout: ' + (e.message || e) + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = 'Genereer afbeelding';
      }
    };
  };

  // Registreer als admin pagina binnen de brand-portal routing
  if (DY.brandPortal && DY.brandPortal._registreerPage) {
    DY.brandPortal._registreerPage('admin_imggen', DY.renderAdminImggen);
  } else {
    // Wacht tot brand-portal initialiseert en registreer dan
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        if (DY.brandPortal && DY.brandPortal._registreerPage) {
          DY.brandPortal._registreerPage('admin_imggen', DY.renderAdminImggen);
        }
      }, 800);
    });
  }
})();
