/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Admin CMS Phase 1 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Injecteert een "Uitgebreid merkprofiel" sectie in het brand profile
 * edit-form (BP.renderProfiel). Merken kunnen hier de nieuwe velden
 * vullen die de klant-facing brand-profile view (pp-brand-profile-v1.js)
 * gebruikt:
 *
 *   - Banner URL
 *   - Slogan
 *   - Locatie, Sinds jaar
 *   - Uitgebreide beschrijving, Missie, Visie
 *   - Doelgroep, Duurzaamheid, Materialen, Verzending, Retourbeleid
 *   - Specialisaties (comma-separated), Keurmerken (comma-separated)
 *
 * Puur additief. Bewaart naar hetzelfde brands/{uid} document.
 * Voorlaat legacy form + submit intact.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandProfileAdminInit) return;
  window.__ppBrandProfileAdminInit = true;

  var FIELDS = [
    { key: 'banner',        label: 'Banner URL',              type: 'url',      hint: 'Publieke URL van bannerafbeelding (16:6 landscape). Bv. Firebase Storage of Cloudinary.' },
    { key: 'slogan',        label: 'Slogan',                  type: 'text',     max: 120, hint: 'Korte pakkende zin (max 120 tekens).' },
    { key: 'locatie',       label: 'Locatie',                 type: 'text',     max: 80,  hint: 'Bv. Amsterdam, NL.' },
    { key: 'sinds',         label: 'Sinds (jaar)',            type: 'number',   min: 1900, max: 2100 },
    { key: 'beschrijving',  label: 'Uitgebreide beschrijving',type: 'textarea', max: 2000, rows: 4 },
    { key: 'missie',        label: 'Missie',                  type: 'textarea', max: 500,  rows: 2 },
    { key: 'visie',         label: 'Visie',                   type: 'textarea', max: 500,  rows: 2 },
    { key: 'doelgroep',     label: 'Doelgroep',               type: 'textarea', max: 500,  rows: 2 },
    { key: 'duurzaamheid',  label: 'Duurzaamheid',            type: 'textarea', max: 500,  rows: 2 },
    { key: 'materialen',    label: 'Materialen',              type: 'textarea', max: 500,  rows: 2 },
    { key: 'verzending',    label: 'Verzendinformatie',       type: 'textarea', max: 500,  rows: 2 },
    { key: 'retour',        label: 'Retourbeleid',            type: 'textarea', max: 500,  rows: 2 },
    { key: 'specialisaties',label: 'Specialisaties (komma-gescheiden)', type: 'text', max: 300, hint: 'Bv. Tall dames, Plus size, Herenmode' },
    { key: 'keurmerken',    label: 'Keurmerken (komma-gescheiden)',      type: 'text', max: 300, hint: 'Bv. OEKO-TEX, GOTS, Fair Trade' },
    { key: 'collecties',    label: 'Uitgelichte collecties (JSON array)', type: 'textarea', max: 4000, rows: 5, hint: 'JSON-lijst. Voorbeeld: [{"titel":"Zomer 2026","afbeelding":"https://...","beschrijving":"Frisse zomerlook","aantal":24,"url":"https://..."}]' }
  ];

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-admin]', m); } catch (_) {} }

  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }
  function currentUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (_) { return null; } }

  function injectCss() {
    if (document.getElementById('pp-brand-admin-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-admin-css';
    s.textContent = [
      '#pp-bp-admin{margin:24px 0 0;padding:20px;background:linear-gradient(155deg,rgba(212,145,10,0.06),rgba(20,16,12,0.5));border:1px solid rgba(212,145,10,0.22);border-radius:14px}',
      '#pp-bp-admin > h3{font:400 1.15rem/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 4px;letter-spacing:-.01em}',
      '#pp-bp-admin > p.pp-bp-admin-sub{font:400 12.5px/1.4 "DM Sans",sans-serif;color:rgba(252,248,239,0.65);margin:0 0 16px}',
      '#pp-bp-admin .pp-bp-admin-grid{display:grid;grid-template-columns:1fr;gap:14px}',
      '@media(min-width:640px){#pp-bp-admin .pp-bp-admin-grid{grid-template-columns:repeat(2,1fr)}}',
      '#pp-bp-admin .pp-bp-admin-veld{display:flex;flex-direction:column;gap:5px}',
      '#pp-bp-admin .pp-bp-admin-veld.full{grid-column:1 / -1}',
      '#pp-bp-admin .pp-bp-admin-veld > span{font:600 11.5px/1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:rgba(212,145,10,0.9)}',
      '#pp-bp-admin .pp-bp-admin-veld > input,#pp-bp-admin .pp-bp-admin-veld > textarea{background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.12);border-radius:8px;color:#fcf8ef;padding:8px 12px;font:400 13.5px/1.45 "DM Sans",sans-serif;font-family:inherit;transition:border-color 0.18s ease}',
      '#pp-bp-admin .pp-bp-admin-veld > input:focus,#pp-bp-admin .pp-bp-admin-veld > textarea:focus{outline:none;border-color:rgba(212,145,10,0.6)}',
      '#pp-bp-admin .pp-bp-admin-veld > textarea{resize:vertical;min-height:60px}',
      '#pp-bp-admin .pp-bp-admin-hint{font:400 11px/1.35 "DM Sans",sans-serif;color:rgba(252,248,239,0.5)}',
      '#pp-bp-admin .pp-bp-admin-acties{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid rgba(245,236,224,0.08)}',
      '#pp-bp-admin .pp-bp-admin-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:999px;font:600 13px/1 "DM Sans",sans-serif;cursor:pointer;transition:all 0.18s ease;font-family:inherit;border:1px solid transparent}',
      '#pp-bp-admin .pp-bp-admin-btn[data-role="save"]{background:linear-gradient(135deg,#f0b340,#d4910a);color:#0f0c08;border-color:#d4910a}',
      '#pp-bp-admin .pp-bp-admin-btn[data-role="save"]:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-1px)}',
      '#pp-bp-admin .pp-bp-admin-btn[disabled]{opacity:0.45;cursor:not-allowed}',
      '#pp-bp-admin .pp-bp-admin-status{font:500 12.5px/1.4 "DM Sans",sans-serif;margin-left:6px;align-self:center}',
      '#pp-bp-admin .pp-bp-admin-status[data-tone="ok"]{color:#8ee888}',
      '#pp-bp-admin .pp-bp-admin-status[data-tone="err"]{color:#f28c8c}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildFieldHtml(field, value) {
    var full = field.type === 'textarea' ? ' full' : '';
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
    return '<label class="pp-bp-admin-veld' + full + '">' +
             '<span>' + esc(field.label) + '</span>' +
             input +
             (field.hint ? '<span class="pp-bp-admin-hint">' + esc(field.hint) + '</span>' : '') +
           '</label>';
  }

  function buildSection(brand) {
    var gridHtml = FIELDS.map(function (f) {
      var v = brand[f.key];
      if (Array.isArray(v)) {
        if (f.key === 'collecties') v = JSON.stringify(v, null, 2);
        else v = v.join(', ');
      }
      return buildFieldHtml(f, v);
    }).join('');
    return '<section id="pp-bp-admin" data-testid="pp-bp-admin">' +
      '<h3>Uitgebreid merkprofiel</h3>' +
      '<p class="pp-bp-admin-sub">Extra velden voor het premium merkenprofiel op de publieke merken-pagina. Alle velden zijn optioneel; leeggelaten velden worden automatisch verborgen.</p>' +
      '<div class="pp-bp-admin-grid">' + gridHtml + '</div>' +
      '<div class="pp-bp-admin-acties">' +
        '<button type="button" class="pp-bp-admin-btn" data-role="save" data-testid="pp-bp-admin-save">Uitgebreid profiel opslaan</button>' +
        '<span class="pp-bp-admin-status" data-role="status" aria-live="polite"></span>' +
      '</div>' +
    '</section>';
  }

  function parseValue(field, raw) {
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
    if (field.key === 'collecties') {
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('collecties moet een JSON array zijn');
        // Valideer basisstructuur
        return parsed.filter(function (c) { return c && typeof c === 'object' && (c.titel || c.naam); });
      } catch (e) {
        throw new Error('Collecties JSON is ongeldig: ' + e.message);
      }
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
      try {
        FIELDS.forEach(function (f) {
          var el = section.querySelector('[name="' + f.key + '"]');
          if (!el) return;
          patch[f.key] = parseValue(f, el.value);
        });
      } catch (e) {
        status.setAttribute('data-tone', 'err');
        status.textContent = e.message || 'Fout bij verwerken velden';
        btn.disabled = false;
        return;
      }
      d.collection('brands').doc(uid).set(patch, { merge: true })
        .then(function () {
          status.setAttribute('data-tone', 'ok');
          status.textContent = 'Opgeslagen ✓';
          setTimeout(function () { status.textContent = ''; status.removeAttribute('data-tone'); }, 2500);
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
    if (document.getElementById('pp-bp-admin')) return true; // idempotent
    var uid = currentUid();
    var d = db();
    if (!uid || !d) return false;
    injectCss();
    d.collection('brands').doc(uid).get()
      .then(function (snap) {
        var brand = (snap && snap.exists) ? (snap.data() || {}) : {};
        // Insert direct NA het form
        var wrap = document.createElement('div');
        wrap.innerHTML = buildSection(brand);
        var section = wrap.firstChild;
        if (!section) return;
        form.parentNode.insertBefore(section, form.nextSibling);
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

  window.PP_BrandProfileAdmin = { VERSION: '1.0.0', reinject: injectSection };
})();
