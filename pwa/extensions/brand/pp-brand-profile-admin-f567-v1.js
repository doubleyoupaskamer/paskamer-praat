/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Admin CMS Fase 5/6/7 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Voegt drie extra admin secties toe onder de bestaande "Uitgebreid
 * merkprofiel" (Fase 1-3 CMS) in het brand profile edit-form:
 *
 *   1. Social media kanalen (Fase 5)  — 6 URL/handle-inputs
 *   2. Contact gegevens (Fase 5)      — email, telefoon, adres, chat
 *   3. SEO overrides (Fase 6)         — title, description, keywords,
 *                                       og image upload
 *
 * Slaat op naar `brands/{uid}` met merge:true, precies zoals de bestaande
 * admin CMS extensie. Hergebruikt .bp-veld / .bp-btn styling.
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandAdminF567Init) return;
  window.__ppBrandAdminF567Init = true;

  var SOCIAL_KEYS = [
    { key: 'instagram', label: 'Instagram',    placeholder: '@paskamerpraat  of  https://instagram.com/paskamerpraat' },
    { key: 'tiktok',    label: 'TikTok',       placeholder: '@paskamerpraat  of  https://tiktok.com/@paskamerpraat' },
    { key: 'pinterest', label: 'Pinterest',    placeholder: 'paskamerpraat  of  https://pinterest.com/paskamerpraat' },
    { key: 'facebook',  label: 'Facebook',     placeholder: 'paskamerpraat  of  https://facebook.com/paskamerpraat' },
    { key: 'youtube',   label: 'YouTube',      placeholder: '@paskamerpraat  of  https://youtube.com/@paskamerpraat' },
    { key: 'x',         label: 'X (Twitter)',  placeholder: '@paskamerpraat  of  https://x.com/paskamerpraat' }
  ];

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-admin-f567]', m); } catch (_) {} }
  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }
  function currentUid() { try { return (window.DY && DY.user && DY.user.uid) || null; } catch (_) { return null; } }
  function toast(msg, isErr) { try { if (window.DY && DY.toast) return DY.toast(msg, isErr); } catch (_) {} }
  function nu() { try { return (window.DY && typeof DY.nu === 'function') ? DY.nu() : new Date().toISOString(); } catch (_) { return new Date().toISOString(); } }

  function injectCss() {
    if (document.getElementById('pp-brand-admin-f567-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-admin-f567-css';
    s.textContent = [
      '#pp-bp-admin-f567{margin-top:24px;padding-top:24px;border-top:1px solid rgba(212,145,10,0.22)}',
      '#pp-bp-admin-f567 > h2{font:400 clamp(1.05rem,2.5vw,1.3rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 6px;letter-spacing:-.01em}',
      '#pp-bp-admin-f567 > p.bp-sub{margin-bottom:14px}',
      '#pp-bp-admin-f567 .pp-f567-groep{margin:20px 0;padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:12px}',
      '#pp-bp-admin-f567 .pp-f567-groep-titel{font:600 12px/1 "DM Sans",sans-serif;letter-spacing:.10em;text-transform:uppercase;color:#d4910a;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid rgba(212,145,10,0.18)}',
      '#pp-bp-admin-f567 .bp-veld{margin-bottom:12px}',
      '#pp-bp-admin-f567 .pp-f567-hint{font:400 11.5px/1.4 "DM Sans",sans-serif;color:rgba(252,248,239,0.5);margin-top:4px;display:block}',
      '#pp-bp-admin-f567 .pp-f567-2col{display:grid;grid-template-columns:1fr;gap:10px}',
      '@media(min-width:640px){#pp-bp-admin-f567 .pp-f567-2col{grid-template-columns:1fr 1fr}}',
      '#pp-bp-admin-f567 .pp-f567-og-rij{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}',
      '#pp-bp-admin-f567 .pp-f567-og-preview{flex:0 0 auto;width:200px;height:105px;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.24);display:flex;align-items:center;justify-content:center;color:rgba(212,145,10,0.55);font:500 12px/1.3 "DM Sans",sans-serif}',
      '#pp-bp-admin-f567 .pp-f567-og-preview img{width:100%;height:100%;object-fit:cover;display:block}',
      '#pp-bp-admin-f567 .pp-f567-og-acties{flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px}',
      '#pp-bp-admin-f567 .pp-f567-acties{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:22px;padding-top:16px;border-top:1px solid rgba(245,236,224,0.08)}',
      '#pp-bp-admin-f567 .pp-f567-status{font:500 13px/1.4 "DM Sans",sans-serif}',
      '#pp-bp-admin-f567 .pp-f567-status[data-tone="ok"]{color:#8ee888}',
      '#pp-bp-admin-f567 .pp-f567-status[data-tone="err"]{color:#f28c8c}',
      '#pp-bp-admin-f567 .pp-f567-counter{font:400 11px/1 "DM Sans",sans-serif;color:rgba(252,248,239,0.5);float:right}'
    ].join('');
    document.head.appendChild(s);
  }

  function buildSocialField(m, val) {
    return '<label class="bp-veld"><span>' + esc(m.label) + '</span>' +
      '<input type="text" name="soc-' + esc(m.key) + '" placeholder="' + esc(m.placeholder) + '" value="' + esc(val || '') + '" data-testid="pp-bp-admin-soc-' + esc(m.key) + '">' +
    '</label>';
  }

  function buildSection(brand) {
    var socials = brand.socials || {};
    var contact = brand.contact || {};
    var seo = brand.seo || {};

    var socialsHtml = SOCIAL_KEYS.map(function (m) { return buildSocialField(m, socials[m.key]); }).join('');

    return '<section id="pp-bp-admin-f567" data-testid="pp-bp-admin-f567">' +
      '<h2>Social media, contact &amp; SEO</h2>' +
      '<p class="bp-sub">Aanvullende premium-profiel velden voor je merkenpagina. Alle velden zijn optioneel; leeggelaten velden worden automatisch verborgen.</p>' +

      // ─ Socials ─
      '<div class="pp-f567-groep" data-testid="pp-bp-admin-socials-groep">' +
        '<h3 class="pp-f567-groep-titel">Social media kanalen</h3>' +
        socialsHtml +
        '<span class="pp-f567-hint">Vul een handle (@merknaam) OF volledige URL in. Onbekende velden verschijnen niet in het "Volg ons" blok.</span>' +
      '</div>' +

      // ─ Contact ─
      '<div class="pp-f567-groep" data-testid="pp-bp-admin-contact-groep">' +
        '<h3 class="pp-f567-groep-titel">Contact</h3>' +
        '<div class="pp-f567-2col">' +
          '<label class="bp-veld"><span>E-mail</span>' +
            '<input type="email" name="con-email" placeholder="info@merk.nl" maxlength="120" value="' + esc(contact.email || '') + '" data-testid="pp-bp-admin-con-email">' +
          '</label>' +
          '<label class="bp-veld"><span>Telefoon</span>' +
            '<input type="tel" name="con-telefoon" placeholder="+31 20 123 4567" maxlength="30" value="' + esc(contact.telefoon || contact.tel || '') + '" data-testid="pp-bp-admin-con-tel">' +
          '</label>' +
        '</div>' +
        '<label class="bp-veld"><span>Adres</span>' +
          '<textarea name="con-adres" rows="2" maxlength="200" placeholder="Merkenstraat 1&#10;1000 AB Amsterdam" data-testid="pp-bp-admin-con-adres">' + esc(contact.adres || '') + '</textarea>' +
        '</label>' +
        '<label class="bp-veld"><span>Chat / WhatsApp URL</span>' +
          '<input type="url" name="con-chatUrl" placeholder="https://wa.me/31201234567" maxlength="200" value="' + esc(contact.chatUrl || '') + '" data-testid="pp-bp-admin-con-chat">' +
        '</label>' +
      '</div>' +

      // ─ SEO overrides ─
      '<div class="pp-f567-groep" data-testid="pp-bp-admin-seo-groep">' +
        '<h3 class="pp-f567-groep-titel">SEO overrides <span style="text-transform:none;letter-spacing:0;font-weight:400;color:rgba(252,248,239,0.5);font-size:11px">(optioneel)</span></h3>' +
        '<label class="bp-veld"><span>SEO titel <span class="pp-f567-counter" id="pp-f567-title-count">0/70</span></span>' +
          '<input type="text" name="seo-title" maxlength="70" placeholder="Bv. Merknaam — Slogan | Paskamer Praat" value="' + esc(seo.title || '') + '" data-testid="pp-bp-admin-seo-title">' +
          '<span class="pp-f567-hint">Aanbevolen: 50-70 tekens. Leeg = auto-gegenereerd uit merknaam + slogan.</span>' +
        '</label>' +
        '<label class="bp-veld"><span>SEO beschrijving <span class="pp-f567-counter" id="pp-f567-desc-count">0/160</span></span>' +
          '<textarea name="seo-description" rows="3" maxlength="160" placeholder="Bv. Ontdek de nieuwste collectie van [merk]: duurzame kleding voor de moderne vrouw." data-testid="pp-bp-admin-seo-desc">' + esc(seo.description || '') + '</textarea>' +
          '<span class="pp-f567-hint">Aanbevolen: 120-160 tekens. Verschijnt in Google zoekresultaten en link-previews.</span>' +
        '</label>' +
        '<label class="bp-veld"><span>SEO trefwoorden (komma-gescheiden)</span>' +
          '<input type="text" name="seo-keywords" maxlength="200" placeholder="Bv. duurzame mode, plus size, tall dames, Nederlandse merken" value="' + esc(seo.keywords || '') + '" data-testid="pp-bp-admin-seo-keywords">' +
        '</label>' +
        '<label class="bp-veld"><span>Social share afbeelding (1200×630, max 3 MB)</span>' +
          '<div class="pp-f567-og-rij">' +
            '<div class="pp-f567-og-preview" id="pp-f567-og-preview">' +
              (seo.ogImage ? '<img src="' + esc(seo.ogImage) + '" alt="" data-testid="pp-bp-admin-seo-og-current">' : 'Nog geen afbeelding') +
            '</div>' +
            '<div class="pp-f567-og-acties">' +
              '<label class="bp-btn bp-btn-ghost" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">' +
                '<input type="file" name="seo-og-file" accept="image/png,image/jpeg,image/webp" data-testid="pp-bp-admin-seo-og-file" style="display:none">' +
                (seo.ogImage ? 'Afbeelding vervangen' : 'Afbeelding uploaden') +
              '</label>' +
              '<span class="pp-f567-hint">PNG, JPG of WebP · aanbevolen 1200×630 px</span>' +
              (seo.ogImage ? '<button type="button" class="bp-btn-mini bp-btn-mini-rood" id="pp-f567-og-verwijder" data-testid="pp-bp-admin-seo-og-verwijder">Verwijderen</button>' : '') +
              '<input type="hidden" name="seo-ogImage" value="' + esc(seo.ogImage || '') + '">' +
            '</div>' +
          '</div>' +
        '</label>' +
      '</div>' +

      '<div class="pp-f567-acties">' +
        '<button type="button" class="bp-btn bp-btn-primair" data-role="save-f567" data-testid="pp-bp-admin-f567-save">Social + contact + SEO opslaan</button>' +
        '<span class="pp-f567-status" data-role="status-f567" aria-live="polite"></span>' +
      '</div>' +
    '</section>';
  }

  // ─── Upload naar Storage ────────────────────────────────────────────
  function uploadFile(file, pathPrefix) {
    return new Promise(function (resolve, reject) {
      try {
        if (!window.firebase || !firebase.storage) return reject(new Error('Firebase Storage niet beschikbaar'));
        var uid = currentUid();
        if (!uid) return reject(new Error('Niet ingelogd'));
        var safe = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        var path = 'brands/' + uid + '/' + pathPrefix + '_' + Date.now() + '_' + safe;
        var ref = firebase.storage().ref().child(path);
        ref.put(file).then(function (snap) { return snap.ref.getDownloadURL(); })
          .then(resolve).catch(reject);
      } catch (e) { reject(e); }
    });
  }

  // ─── Attach OG image upload handler ─────────────────────────────────
  function attachOgHandlers(section) {
    var fileInput = section.querySelector('input[name="seo-og-file"]');
    var hidden = section.querySelector('input[name="seo-ogImage"]');
    var preview = section.querySelector('#pp-f567-og-preview');
    var removeBtn = section.querySelector('#pp-f567-og-verwijder');
    if (fileInput) {
      fileInput.addEventListener('change', async function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.size > 3 * 1024 * 1024) {
          toast('OG afbeelding is groter dan 3 MB. Comprimeer en probeer opnieuw.', true);
          fileInput.value = '';
          return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          if (preview) preview.innerHTML = '<img src="' + ev.target.result + '" alt="">';
        };
        reader.readAsDataURL(f);
        try {
          var url = await uploadFile(f, 'og-image');
          if (hidden) hidden.value = url;
          toast('OG afbeelding geüpload ✓');
        } catch (err) {
          log('og upload err: ' + (err && err.message));
          toast('Upload mislukt: ' + (err && err.message ? err.message : 'onbekend'), true);
        }
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        if (hidden) hidden.value = '';
        if (preview) preview.innerHTML = 'Nog geen afbeelding';
        if (fileInput) fileInput.value = '';
        removeBtn.style.display = 'none';
      });
    }
  }

  // ─── Live counters voor SEO velden ──────────────────────────────────
  function attachCounters(section) {
    var pairs = [
      { input: 'seo-title',       counter: 'pp-f567-title-count', max: 70 },
      { input: 'seo-description', counter: 'pp-f567-desc-count',  max: 160 }
    ];
    pairs.forEach(function (p) {
      var inp = section.querySelector('[name="' + p.input + '"]');
      var out = section.querySelector('#' + p.counter);
      if (!inp || !out) return;
      var upd = function () { out.textContent = (inp.value || '').length + '/' + p.max; };
      inp.addEventListener('input', upd);
      upd();
    });
  }

  // ─── Save ───────────────────────────────────────────────────────────
  function attachSave(section) {
    var btn = section.querySelector('[data-role="save-f567"]');
    var status = section.querySelector('[data-role="status-f567"]');
    if (!btn || !status) return;
    btn.addEventListener('click', function () {
      var d = db();
      var uid = currentUid();
      if (!d || !uid) { status.setAttribute('data-tone', 'err'); status.textContent = 'Niet ingelogd of database offline'; return; }
      btn.disabled = true;
      status.removeAttribute('data-tone');
      status.textContent = 'Opslaan…';

      // Socials
      var socials = {};
      SOCIAL_KEYS.forEach(function (m) {
        var el = section.querySelector('[name="soc-' + m.key + '"]');
        var v = el && el.value ? el.value.trim() : '';
        if (v) socials[m.key] = v;
      });

      // Contact
      var contact = {};
      ['email', 'telefoon', 'adres', 'chatUrl'].forEach(function (k) {
        var el = section.querySelector('[name="con-' + k + '"]');
        var v = el && el.value ? el.value.trim() : '';
        if (v) contact[k] = v;
      });

      // SEO
      var seo = {};
      ['title', 'description', 'keywords', 'ogImage'].forEach(function (k) {
        var el = section.querySelector('[name="seo-' + k + '"]');
        var v = el && el.value ? el.value.trim() : '';
        if (v) seo[k] = v;
      });

      var patch = {
        socials: Object.keys(socials).length ? socials : null,
        contact: Object.keys(contact).length ? contact : null,
        seo:     Object.keys(seo).length ? seo : null,
        laatsteUpdate: nu()
      };

      d.collection('brands').doc(uid).set(patch, { merge: true })
        .then(function () {
          status.setAttribute('data-tone', 'ok');
          status.textContent = 'Opgeslagen ✓';
          setTimeout(function () { status.textContent = ''; status.removeAttribute('data-tone'); }, 3000);
        })
        .catch(function (err) {
          log('save f567 err: ' + (err && err.message));
          status.setAttribute('data-tone', 'err');
          status.textContent = 'Fout: ' + (err && err.message ? err.message : 'onbekend');
        })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ─── Injectie: NA #pp-bp-admin (bestaande CMS sectie) ───────────────
  var __injecting = false;
  function injectSection() {
    if (__injecting) return false;
    if (document.getElementById('pp-bp-admin-f567')) return true;
    var anchor = document.getElementById('pp-bp-admin');
    // Wacht tot de bestaande CMS sectie is geïnjecteerd
    if (!anchor) {
      var form = document.getElementById('bp-profiel-form');
      if (!form) return false;
      // Als bestaande CMS er nog niet is, injecteren we NA het form (best-effort)
      anchor = form;
    }
    var uid = currentUid();
    var d = db();
    if (!uid || !d) return false;
    injectCss();
    __injecting = true;
    d.collection('brands').doc(uid).get().then(function (snap) {
      // Double-check: mogelijk is een ander injectie-pad ondertussen klaar
      if (document.getElementById('pp-bp-admin-f567')) return;
      var brand = (snap && snap.exists) ? (snap.data() || {}) : {};
      var wrap = document.createElement('div');
      wrap.innerHTML = buildSection(brand);
      var section = wrap.firstChild;
      if (!section) return;
      if (anchor.parentNode) anchor.parentNode.insertBefore(section, anchor.nextSibling);
      attachOgHandlers(section);
      attachCounters(section);
      attachSave(section);
    }).catch(function (err) { log('load err: ' + (err && err.message)); })
      .finally(function () { __injecting = false; });
    return true;
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { injectSection(); } catch (e) { log('inject err: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { injectSection(); } catch (_) {} }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandAdminF567 = { VERSION: '1.0.0', reinject: injectSection };
})();
