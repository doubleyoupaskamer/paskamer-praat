/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Admin CMS (v1.1.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Injecteert een "Uitgebreid merkprofiel" sectie in het brand profile
 * edit-form (BP.renderProfiel) met dezelfde .bp-veld / .bp-btn styling
 * als de legacy form.
 *
 * Features:
 *   - Banner UPLOAD (Firebase Storage) i.p.v. URL-veld, met live preview
 *   - Uitgelichte collecties: dynamische lijst (titel, beschrijving,
 *     afbeelding upload, aantal, URL) — geen JSON meer
 *   - Alle andere velden als textarea/text/number, allemaal optioneel
 *   - Opslaan naar brands/{uid} met merge: true
 *
 * v1.1.0 (2026-07-02): design gelijkgetrokken met legacy form, banner
 *                      upload, collecties structured input
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandProfileAdminInit) return;
  window.__ppBrandProfileAdminInit = true;

  var TEXT_FIELDS = [
    { key: 'slogan',       label: 'Slogan',                type: 'text',     max: 120 },
    { key: 'locatie',      label: 'Locatie',               type: 'text',     max: 80  },
    { key: 'sinds',        label: 'Sinds (jaar)',          type: 'number',   min: 1900, max: 2100 },
    { key: 'beschrijving', label: 'Uitgebreide beschrijving', type: 'textarea', max: 2000, rows: 4 },
    { key: 'missie',       label: 'Missie',                type: 'textarea', max: 1000, rows: 4 },
    { key: 'visie',        label: 'Visie',                 type: 'textarea', max: 1000, rows: 4 },
    { key: 'doelgroep',    label: 'Doelgroep',             type: 'textarea', max: 1000, rows: 4 },
    { key: 'duurzaamheid', label: 'Duurzaamheid',          type: 'textarea', max: 1000, rows: 4 },
    { key: 'materialen',   label: 'Materialen',            type: 'textarea', max: 500,  rows: 2 },
    { key: 'verzending',   label: 'Verzendinformatie',     type: 'textarea', max: 500,  rows: 2 },
    { key: 'retour',       label: 'Retourbeleid',          type: 'textarea', max: 500,  rows: 2 },
    { key: 'specialisaties', label: 'Specialisaties (komma-gescheiden)', type: 'text', max: 300, hint: 'Bv. Tall dames, Plus size, Herenmode' },
    { key: 'keurmerken',     label: 'Keurmerken (komma-gescheiden)',      type: 'text', max: 300, hint: 'Bv. OEKO-TEX, GOTS, Fair Trade' }
  ];

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-admin]', m); } catch (_) {} }

  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }
  function currentUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (_) { return null; } }
  function nu() { try { return (window.DY && typeof DY.nu === 'function') ? DY.nu() : new Date().toISOString(); } catch (_) { return new Date().toISOString(); } }

  function toast(msg, isErr) {
    try {
      if (window.DY && typeof DY.toast === 'function') return DY.toast(msg, isErr);
    } catch (_) {}
    try { console.log('[pp-brand-admin toast]', msg); } catch (_) {}
  }

  // ─── CSS: alleen voor secties die niet in legacy .bp-* zitten ────────
  function injectCss() {
    if (document.getElementById('pp-brand-admin-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-admin-css';
    s.textContent = [
      '#pp-bp-admin{margin-top:32px;padding-top:24px;border-top:1px solid rgba(212,145,10,0.22)}',
      '#pp-bp-admin > h2{font:400 clamp(1.15rem,2.6vw,1.4rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 4px;letter-spacing:-.01em}',
      '#pp-bp-admin > p.bp-sub{margin-bottom:20px}',
      '#pp-bp-admin .bp-veld{margin-bottom:14px}',
      '#pp-bp-admin .pp-bp-admin-hint{font:400 11.5px/1.4 "DM Sans",sans-serif;color:rgba(252,248,239,0.5);margin-top:4px;display:block}',
      // Banner preview (zelfde stijl als .bp-profiel-logo-preview maar landscape)
      '#pp-bp-admin .pp-bp-banner-rij{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}',
      '#pp-bp-admin .pp-bp-banner-preview{flex:0 0 auto;width:260px;max-width:100%;aspect-ratio:16/6;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.24);position:relative;display:flex;align-items:center;justify-content:center}',
      '#pp-bp-admin .pp-bp-banner-preview img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}',
      '#pp-bp-admin .pp-bp-banner-preview-empty{color:rgba(212,145,10,0.55);font:500 12px/1.3 "DM Sans",sans-serif;text-align:center;padding:12px;letter-spacing:.04em}',
      '#pp-bp-admin .pp-bp-banner-acties{flex:1;min-width:200px;display:flex;flex-direction:column;gap:6px}',
      // Collecties lijst
      '#pp-bp-admin .pp-bp-coll-lijst{display:flex;flex-direction:column;gap:14px;margin-bottom:12px}',
      '#pp-bp-admin .pp-bp-coll-item{padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.10);border-radius:12px;position:relative}',
      '#pp-bp-admin .pp-bp-coll-item .bp-veld{margin-bottom:10px}',
      '#pp-bp-admin .pp-bp-coll-item .pp-bp-coll-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(245,236,224,0.08)}',
      '#pp-bp-admin .pp-bp-coll-item .pp-bp-coll-hdr-titel{font:600 11.5px/1 "DM Sans",sans-serif;letter-spacing:.10em;text-transform:uppercase;color:#d4910a}',
      '#pp-bp-admin .pp-bp-coll-item .pp-bp-coll-verwijder{background:transparent;border:1px solid rgba(245,236,224,0.14);color:rgba(245,236,224,0.7);padding:4px 10px;border-radius:999px;font:600 11px/1 "DM Sans",sans-serif;cursor:pointer;transition:all 0.18s ease}',
      '#pp-bp-admin .pp-bp-coll-item .pp-bp-coll-verwijder:hover{border-color:#f28c8c;color:#f28c8c}',
      '#pp-bp-admin .pp-bp-coll-img-rij{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}',
      '#pp-bp-admin .pp-bp-coll-img-preview{flex:0 0 auto;width:120px;height:90px;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.22);display:flex;align-items:center;justify-content:center;color:rgba(212,145,10,0.55);font-size:11px}',
      '#pp-bp-admin .pp-bp-coll-img-preview img{width:100%;height:100%;object-fit:cover;display:block}',
      '#pp-bp-admin .pp-bp-coll-img-acties{flex:1;min-width:150px}',
      '#pp-bp-admin .pp-bp-coll-2col{display:grid;grid-template-columns:1fr;gap:10px}',
      '@media(min-width:640px){#pp-bp-admin .pp-bp-coll-2col{grid-template-columns:2fr 1fr}}',
      '#pp-bp-admin .pp-bp-coll-toevoegen{margin-top:6px}',
      // Save area
      '#pp-bp-admin .pp-bp-admin-acties{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:22px;padding-top:16px;border-top:1px solid rgba(245,236,224,0.08)}',
      '#pp-bp-admin .pp-bp-admin-status{font:500 13px/1.4 "DM Sans",sans-serif}',
      '#pp-bp-admin .pp-bp-admin-status[data-tone="ok"]{color:#8ee888}',
      '#pp-bp-admin .pp-bp-admin-status[data-tone="err"]{color:#f28c8c}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Field renderer using .bp-veld style ─────────────────────────────
  function buildField(field, value) {
    var v = value == null ? '' : String(value);
    var input;
    if (field.type === 'textarea') {
      input = '<textarea name="' + esc(field.key) + '" rows="' + (field.rows || 3) + '"' +
              (field.max ? ' maxlength="' + field.max + '"' : '') +
              ' data-testid="pp-bp-admin-' + esc(field.key) + '">' + esc(v) + '</textarea>';
    } else {
      input = '<input type="' + esc(field.type) + '" name="' + esc(field.key) + '"' +
              (field.max ? ' maxlength="' + field.max + '"' : '') +
              (field.min != null ? ' min="' + field.min + '"' : '') +
              (field.max != null && field.type === 'number' ? ' max="' + field.max + '"' : '') +
              ' value="' + esc(v) + '" data-testid="pp-bp-admin-' + esc(field.key) + '">';
    }
    return '<label class="bp-veld">' +
             '<span>' + esc(field.label) + '</span>' +
             input +
             (field.hint ? '<span class="pp-bp-admin-hint">' + esc(field.hint) + '</span>' : '') +
           '</label>';
  }

  // ─── Banner upload row ────────────────────────────────────────────────
  function buildBannerRow(currentBannerUrl) {
    var hasBanner = !!currentBannerUrl;
    return '<label class="bp-veld">' +
             '<span>Banner (16:6 landscape, max 3 MB)</span>' +
             '<div class="pp-bp-banner-rij">' +
               '<div class="pp-bp-banner-preview" id="pp-bp-banner-preview">' +
                 (hasBanner
                   ? '<img src="' + esc(currentBannerUrl) + '" alt="" data-testid="pp-bp-banner-current">'
                   : '<span class="pp-bp-banner-preview-empty">Nog geen banner</span>') +
               '</div>' +
               '<div class="pp-bp-banner-acties">' +
                 '<label class="bp-btn bp-btn-ghost" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">' +
                   '<input type="file" name="banner-file" accept="image/png,image/jpeg,image/webp" data-testid="pp-bp-admin-banner-file" style="display:none">' +
                   (hasBanner ? 'Banner vervangen' : 'Banner uploaden') +
                 '</label>' +
                 '<span class="pp-bp-admin-hint">PNG, JPG of WebP · aanbevolen 1600×600 px</span>' +
                 (hasBanner ? '<button type="button" class="bp-btn-mini bp-btn-mini-rood" id="pp-bp-banner-verwijder" data-testid="pp-bp-admin-banner-verwijder">Banner verwijderen</button>' : '') +
                 '<input type="hidden" name="banner" value="' + esc(currentBannerUrl || '') + '" data-testid="pp-bp-admin-banner-url">' +
               '</div>' +
             '</div>' +
             '<span class="pp-bp-admin-hint">De banner verschijnt bovenaan je publieke merkenprofiel.</span>' +
           '</label>';
  }

  // ─── Collectie item ──────────────────────────────────────────────────
  function buildCollectieItem(index, coll) {
    coll = coll || {};
    var img = coll.afbeelding || '';
    return '<div class="pp-bp-coll-item" data-coll-index="' + index + '" data-testid="pp-bp-coll-item-' + index + '">' +
      '<div class="pp-bp-coll-hdr">' +
        '<span class="pp-bp-coll-hdr-titel">Collectie ' + (index + 1) + '</span>' +
        '<button type="button" class="pp-bp-coll-verwijder" data-testid="pp-bp-coll-verwijder-' + index + '">Verwijderen</button>' +
      '</div>' +
      '<div class="pp-bp-coll-img-rij">' +
        '<div class="pp-bp-coll-img-preview">' +
          (img ? '<img src="' + esc(img) + '" alt="">' : 'Geen afbeelding') +
        '</div>' +
        '<div class="pp-bp-coll-img-acties">' +
          '<label class="bp-btn bp-btn-ghost" style="cursor:pointer;display:inline-flex;">' +
            '<input type="file" data-coll-file="' + index + '" accept="image/png,image/jpeg,image/webp" style="display:none">' +
            (img ? 'Afbeelding vervangen' : 'Afbeelding uploaden') +
          '</label>' +
          '<input type="hidden" data-coll-field="afbeelding" value="' + esc(img) + '">' +
        '</div>' +
      '</div>' +
      '<label class="bp-veld"><span>Titel</span>' +
        '<input type="text" data-coll-field="titel" maxlength="80" value="' + esc(coll.titel || '') + '" data-testid="pp-bp-coll-titel-' + index + '">' +
      '</label>' +
      '<label class="bp-veld"><span>Korte beschrijving</span>' +
        '<textarea data-coll-field="beschrijving" rows="2" maxlength="200" data-testid="pp-bp-coll-desc-' + index + '">' + esc(coll.beschrijving || '') + '</textarea>' +
      '</label>' +
      '<div class="pp-bp-coll-2col">' +
        '<label class="bp-veld"><span>URL (naar collectiepagina)</span>' +
          '<input type="url" data-coll-field="url" placeholder="https://..." value="' + esc(coll.url || '') + '" data-testid="pp-bp-coll-url-' + index + '">' +
        '</label>' +
        '<label class="bp-veld"><span>Aantal producten</span>' +
          '<input type="number" data-coll-field="aantal" min="0" max="9999" value="' + (typeof coll.aantal === 'number' ? coll.aantal : '') + '" data-testid="pp-bp-coll-aantal-' + index + '">' +
        '</label>' +
      '</div>' +
    '</div>';
  }

  function buildCollectiesBlok(collecties) {
    var arr = Array.isArray(collecties) ? collecties : [];
    var itemsHtml = arr.map(function (c, i) { return buildCollectieItem(i, c); }).join('');
    return '<label class="bp-veld"><span>Uitgelichte collecties</span></label>' +
      '<div class="pp-bp-coll-lijst" id="pp-bp-coll-lijst">' + itemsHtml + '</div>' +
      '<button type="button" class="bp-btn bp-btn-ghost pp-bp-coll-toevoegen" id="pp-bp-coll-toevoegen" data-testid="pp-bp-coll-toevoegen">+ Collectie toevoegen</button>' +
      '<span class="pp-bp-admin-hint" style="display:block;margin-top:8px">Elke collectie verschijnt als kaart op je merkenprofiel met afbeelding, titel en link.</span>';
  }

  function buildSection(brand) {
    var textFieldsHtml = TEXT_FIELDS.map(function (f) {
      var v = brand[f.key];
      if (Array.isArray(v)) v = v.join(', ');
      return buildField(f, v);
    }).join('');
    return '<section id="pp-bp-admin" data-testid="pp-bp-admin">' +
      '<h2>Uitgebreid merkprofiel</h2>' +
      '<p class="bp-sub">Extra velden voor het premium merkenprofiel op de publieke merken-pagina. Alle velden zijn optioneel; leeggelaten velden worden automatisch verborgen.</p>' +
      buildBannerRow(brand.banner || '') +
      textFieldsHtml +
      buildCollectiesBlok(brand.collecties || brand.uitgelichteCollecties || []) +
      '<div class="pp-bp-admin-acties">' +
        '<button type="button" class="bp-btn bp-btn-primair" data-role="save" data-testid="pp-bp-admin-save">Uitgebreid profiel opslaan</button>' +
        '<span class="pp-bp-admin-status" data-role="status" aria-live="polite"></span>' +
      '</div>' +
    '</section>';
  }

  // ─── File upload naar Firebase Storage ───────────────────────────────
  function uploadFile(file, pathPrefix) {
    return new Promise(function (resolve, reject) {
      try {
        if (!window.firebase || !firebase.storage) return reject(new Error('Firebase Storage niet beschikbaar'));
        var uid = currentUid();
        if (!uid) return reject(new Error('Niet ingelogd'));
        var safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        var path = 'brands/' + uid + '/' + pathPrefix + '_' + Date.now() + '_' + safeName;
        var ref = firebase.storage().ref().child(path);
        ref.put(file).then(function (snap) {
          return snap.ref.getDownloadURL();
        }).then(function (url) { resolve(url); }).catch(reject);
      } catch (e) { reject(e); }
    });
  }

  // ─── Attach banner handlers ──────────────────────────────────────────
  function attachBannerHandlers(section, brandId) {
    var fileInput = section.querySelector('input[name="banner-file"]');
    var hiddenUrl = section.querySelector('input[name="banner"]');
    var preview = section.querySelector('#pp-bp-banner-preview');
    var removeBtn = section.querySelector('#pp-bp-banner-verwijder');
    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) {
          toast('Banner is groter dan 3 MB. Comprimeer de afbeelding en probeer opnieuw.', true);
          fileInput.value = '';
          return;
        }
        // Live preview
        var reader = new FileReader();
        reader.onload = function (ev) {
          if (preview) preview.innerHTML = '<img src="' + ev.target.result + '" alt="" data-testid="pp-bp-banner-current">';
        };
        reader.readAsDataURL(f);
        // Upload naar Storage
        try {
          var url = await uploadFile(f, 'banner');
          if (hiddenUrl) hiddenUrl.value = url;
          toast('Banner geüpload ✓');
        } catch (err) {
          log('banner upload error: ' + (err && err.message));
          toast('Banner upload mislukt: ' + (err && err.message ? err.message : 'onbekend'), true);
        }
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (hiddenUrl) hiddenUrl.value = '';
        if (preview) preview.innerHTML = '<span class="pp-bp-banner-preview-empty">Nog geen banner</span>';
        if (fileInput) fileInput.value = '';
        removeBtn.style.display = 'none';
      });
    }
  }

  // ─── Attach collecties handlers (add / remove / file uploads) ────────
  function attachCollectiesHandlers(section) {
    var lijst = section.querySelector('#pp-bp-coll-lijst');
    var addBtn = section.querySelector('#pp-bp-coll-toevoegen');
    if (!lijst || !addBtn) return;

    function nextIndex() {
      var items = lijst.querySelectorAll('.pp-bp-coll-item');
      return items.length;
    }

    addBtn.addEventListener('click', function () {
      var idx = nextIndex();
      var tmp = document.createElement('div');
      tmp.innerHTML = buildCollectieItem(idx, {});
      var el = tmp.firstChild;
      lijst.appendChild(el);
    });

    lijst.addEventListener('click', function (e) {
      var rm = e.target && e.target.closest && e.target.closest('.pp-bp-coll-verwijder');
      if (rm) {
        var item = rm.closest('.pp-bp-coll-item');
        if (item) item.parentNode.removeChild(item);
      }
    });

    lijst.addEventListener('change', function (e) {
      var fileInput = e.target;
      if (!fileInput || !fileInput.hasAttribute || !fileInput.hasAttribute('data-coll-file')) return;
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) {
        toast('Afbeelding is groter dan 3 MB. Comprimeer en probeer opnieuw.', true);
        fileInput.value = '';
        return;
      }
      var item = fileInput.closest('.pp-bp-coll-item');
      var preview = item && item.querySelector('.pp-bp-coll-img-preview');
      var hidden = item && item.querySelector('input[data-coll-field="afbeelding"]');
      // Live preview
      var reader = new FileReader();
      reader.onload = function (ev) {
        if (preview) preview.innerHTML = '<img src="' + ev.target.result + '" alt="">';
      };
      reader.readAsDataURL(f);
      // Upload
      uploadFile(f, 'collectie').then(function (url) {
        if (hidden) hidden.value = url;
        toast('Afbeelding geüpload ✓');
      }).catch(function (err) {
        log('coll img upload error: ' + (err && err.message));
        toast('Upload mislukt: ' + (err && err.message ? err.message : 'onbekend'), true);
      });
    });
  }

  // ─── Verzamel collecties uit DOM ─────────────────────────────────────
  function readCollecties(section) {
    var items = section.querySelectorAll('.pp-bp-coll-item');
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var titel = (item.querySelector('[data-coll-field="titel"]') || {}).value || '';
      var beschrijving = (item.querySelector('[data-coll-field="beschrijving"]') || {}).value || '';
      var afbeelding = (item.querySelector('[data-coll-field="afbeelding"]') || {}).value || '';
      var url = (item.querySelector('[data-coll-field="url"]') || {}).value || '';
      var aantalRaw = (item.querySelector('[data-coll-field="aantal"]') || {}).value || '';
      var coll = {
        titel: titel.trim(),
        beschrijving: beschrijving.trim(),
        afbeelding: afbeelding.trim(),
        url: url.trim()
      };
      var n = parseInt(aantalRaw, 10);
      if (!isNaN(n) && n >= 0) coll.aantal = n;
      if (coll.titel || coll.afbeelding || coll.url) out.push(coll);
    }
    return out;
  }

  function parseTextValue(field, raw) {
    if (raw == null) raw = '';
    raw = String(raw).trim();
    if (field.type === 'number') {
      if (!raw) return null;
      var n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    }
    if (field.key === 'specialisaties' || field.key === 'keurmerken') {
      if (!raw) return null;
      return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (!raw) return null;
    return raw;
  }

  function attachSave(section) {
    var btn = section.querySelector('[data-role="save"]');
    var status = section.querySelector('[data-role="status"]');
    if (!btn || !status) return;
    btn.addEventListener('click', function () {
      var d = db();
      var uid = currentUid();
      if (!d || !uid) { status.setAttribute('data-tone', 'err'); status.textContent = 'Niet ingelogd of database offline'; return; }
      btn.disabled = true;
      status.removeAttribute('data-tone');
      status.textContent = 'Opslaan…';

      var patch = {};
      // Text/textarea velden
      TEXT_FIELDS.forEach(function (f) {
        var el = section.querySelector('[name="' + f.key + '"]');
        if (!el) return;
        patch[f.key] = parseTextValue(f, el.value);
      });
      // Banner URL (hidden field, gevuld door upload)
      var bannerEl = section.querySelector('input[name="banner"]');
      patch.banner = bannerEl && bannerEl.value ? bannerEl.value.trim() : null;
      // Collecties
      var collArr = readCollecties(section);
      patch.collecties = collArr.length ? collArr : null;
      patch.laatsteUpdate = nu();

      d.collection('brands').doc(uid).set(patch, { merge: true })
        .then(function () {
          status.setAttribute('data-tone', 'ok');
          status.textContent = 'Opgeslagen ✓';
          setTimeout(function () { status.textContent = ''; status.removeAttribute('data-tone'); }, 3000);
        })
        .catch(function (err) {
          log('save error: ' + (err && err.message));
          status.setAttribute('data-tone', 'err');
          status.textContent = 'Fout: ' + (err && err.message ? err.message : 'onbekend');
        })
        .finally(function () { btn.disabled = false; });
    });
  }

  function injectSection() {
    var form = document.getElementById('bp-profiel-form');
    if (!form) return false;
    if (document.getElementById('pp-bp-admin')) return true;
    var uid = currentUid();
    var d = db();
    if (!uid || !d) return false;
    injectCss();
    d.collection('brands').doc(uid).get()
      .then(function (snap) {
        var brand = (snap && snap.exists) ? (snap.data() || {}) : {};
        var wrap = document.createElement('div');
        wrap.innerHTML = buildSection(brand);
        var section = wrap.firstChild;
        if (!section) return;
        // Insert direct NA het form
        form.parentNode.insertBefore(section, form.nextSibling);
        attachBannerHandlers(section, uid);
        attachCollectiesHandlers(section);
        attachSave(section);
      })
      .catch(function (err) { log('load brand error: ' + (err && err.message)); });
    return true;
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { injectSection(); } catch (e) { log('inject error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { injectSection(); } catch (_) {} }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandProfileAdmin = { VERSION: '1.1.0', reinject: injectSection };
})();
