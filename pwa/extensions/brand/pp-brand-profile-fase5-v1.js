/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Phase 5 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Voegt drie secties toe onderaan het publieke merkenprofiel:
 *
 *   1. GERELATEERDE MERKEN — query `brands` met dezelfde `categorie`
 *      + `status=approved`, exclusief huidig merk, gesorteerd op
 *      `volgers` (asc→desc) en gelimiteerd tot 6 kaarten.
 *
 *   2. VOLG ONS — social media kanalen uit brand.socials object
 *      (instagram, tiktok, pinterest, facebook, youtube, x/twitter).
 *
 *   3. CONTACT — email, telefoon, adres, chatUrl uit brand.contact.
 *
 * Positie: NA #pp-bp-reviews (Fase 4), NA .bp-prod-grid, of aan einde
 * van .bp-page. Gebruikt dezelfde robuuste anchor-placement als eerdere
 * fasen. Verbergt zich volledig als geen enkel veld data heeft.
 *
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandFase5Init) return;
  window.__ppBrandFase5Init = true;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function log(m) { try { console.log('[pp-brand-fase5]', m); } catch (_) {} }
  function db() { try { return (window.DY && DY.db) || null; } catch (_) { return null; } }

  var SOCIAL_META = [
    { key: 'instagram', label: 'Instagram', color: '#e1306c',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.22.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.22.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.22C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.22-.41C8.42 2.17 8.8 2.16 12 2.16zm0 5.68a4.16 4.16 0 100 8.32 4.16 4.16 0 000-8.32zm0 6.86a2.7 2.7 0 110-5.4 2.7 2.7 0 010 5.4zm5.29-7.02a.97.97 0 100-1.94.97.97 0 000 1.94z"/></svg>' },
    { key: 'tiktok',    label: 'TikTok',    color: '#25f4ee',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005.8 20.1a6.34 6.34 0 0010.86-4.43V8.98a8.16 8.16 0 004.77 1.52V7.03a4.85 4.85 0 01-1.84-.34z"/></svg>' },
    { key: 'pinterest', label: 'Pinterest', color: '#e60023',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12c0 4.86 2.9 9.05 7.05 10.9-.1-.93-.19-2.35.04-3.37.21-.9 1.37-5.72 1.37-5.72s-.35-.7-.35-1.74c0-1.63.94-2.85 2.12-2.85 1 0 1.48.75 1.48 1.65 0 1.01-.64 2.52-.97 3.92-.28 1.17.59 2.13 1.75 2.13 2.1 0 3.71-2.21 3.71-5.4 0-2.82-2.03-4.8-4.93-4.8-3.36 0-5.33 2.52-5.33 5.12 0 1.02.39 2.11.88 2.7.1.12.11.22.08.34-.09.37-.29 1.17-.33 1.33-.05.22-.17.26-.4.16-1.48-.69-2.4-2.85-2.4-4.59 0-3.74 2.71-7.17 7.83-7.17 4.11 0 7.31 2.93 7.31 6.85 0 4.09-2.58 7.38-6.16 7.38-1.2 0-2.34-.63-2.72-1.37l-.74 2.83c-.27 1.04-1 2.34-1.49 3.13.15.04.31.05.47.05C6.6 24 12 18.6 12 12S6.6 0 12 0z"/></svg>' },
    { key: 'facebook',  label: 'Facebook',  color: '#1877f2',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 12a10.7 10.7 0 10-12.4 10.6v-7.5H7.6V12h2.7V9.7c0-2.7 1.6-4.2 4-4.2 1.2 0 2.4.2 2.4.2v2.7h-1.4c-1.3 0-1.7.8-1.7 1.7V12h2.9l-.5 3.1h-2.4v7.5A10.7 10.7 0 0022.7 12z"/></svg>' },
    { key: 'youtube',   label: 'YouTube',   color: '#ff0000',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.6 3.6 12 3.6 12 3.6s-7.6 0-9.4.5A3 3 0 00.5 6.2 31.4 31.4 0 000 12a31.4 31.4 0 00.5 5.8 3 3 0 002.1 2.1c1.8.5 9.4.5 9.4.5s7.6 0 9.4-.5a3 3 0 002.1-2.1A31.4 31.4 0 0024 12a31.4 31.4 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>' },
    { key: 'x',         label: 'X (Twitter)', color: '#000000',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 3H22l-7.4 8.4L23.5 21H16l-5.4-7L4.5 21H1.4l7.9-9L1 3h7.6l4.9 6.4L18.9 3zm-1 16h1.7L7.2 4.8H5.4L17.9 19z"/></svg>' }
  ];

  function injectCss() {
    if (document.getElementById('pp-brand-fase5-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-fase5-css';
    s.textContent = [
      '.pp-bp-f5-sec{margin:26px 0 8px}',
      '.pp-bp-f5-hdr{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 14px}',
      '.pp-bp-f5-titel{font:400 clamp(1.05rem,2.4vw,1.35rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0;letter-spacing:-.01em}',
      // Related brands
      '.pp-bp-rel-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}',
      '@media(min-width:640px){.pp-bp-rel-grid{grid-template-columns:repeat(3,1fr);gap:12px}}',
      '@media(min-width:1024px){.pp-bp-rel-grid{grid-template-columns:repeat(6,1fr)}}',
      '.pp-bp-rel-kaart{display:flex;flex-direction:column;align-items:center;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:12px;padding:14px 10px;text-decoration:none;color:inherit;transition:all 0.18s ease;cursor:pointer}',
      '.pp-bp-rel-kaart:hover{transform:translateY(-2px);border-color:#d4910a;background:rgba(212,145,10,0.06)}',
      '.pp-bp-rel-logo{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.22);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:8px;color:#d4910a;font:700 15px/1 "DM Sans",sans-serif}',
      '.pp-bp-rel-logo img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pp-bp-rel-naam{font:600 12.5px/1.25 "DM Sans",sans-serif;color:#fcf8ef;margin:0 0 2px;word-break:break-word;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.pp-bp-rel-cat{font:400 10.5px/1.2 "DM Sans",sans-serif;color:rgba(252,248,239,0.5);text-transform:uppercase;letter-spacing:.06em}',
      // Socials
      '.pp-bp-soc-rij{display:flex;gap:10px;flex-wrap:wrap}',
      '.pp-bp-soc-btn{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(245,236,224,0.10);color:#fcf8ef;text-decoration:none;font:600 12.5px/1 "DM Sans",sans-serif;transition:all 0.18s ease}',
      '.pp-bp-soc-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,0.08);border-color:rgba(212,145,10,0.32)}',
      '.pp-bp-soc-btn svg{width:16px;height:16px;flex-shrink:0}',
      // Contact
      '.pp-bp-con-lijst{display:grid;grid-template-columns:1fr;gap:10px}',
      '@media(min-width:640px){.pp-bp-con-lijst{grid-template-columns:repeat(2,1fr)}}',
      '.pp-bp-con-item{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(245,236,224,0.08);border-radius:12px;text-decoration:none;color:inherit;transition:all 0.18s ease}',
      '.pp-bp-con-item[href]:hover{border-color:#d4910a;background:rgba(212,145,10,0.06)}',
      '.pp-bp-con-icon{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#d4910a,#f0b340);color:#0f0c08;display:flex;align-items:center;justify-content:center}',
      '.pp-bp-con-icon svg{width:16px;height:16px}',
      '.pp-bp-con-body{flex:1;min-width:0}',
      '.pp-bp-con-label{font:600 10.5px/1 "DM Sans",sans-serif;letter-spacing:.10em;text-transform:uppercase;color:rgba(212,145,10,0.85);margin:0 0 4px}',
      '.pp-bp-con-waarde{font:500 13px/1.4 "DM Sans",sans-serif;color:#fcf8ef;margin:0;word-break:break-word;white-space:pre-line}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Related brands ──────────────────────────────────────────────────
  function loadRelated(currentBrandId, categorie) {
    var d = db();
    if (!d || !categorie) return Promise.resolve([]);
    return d.collection('brands')
      .where('categorie', '==', categorie)
      .where('status', '==', 'approved')
      .limit(12).get()
      .then(function (snap) {
        var arr = [];
        if (snap && snap.forEach) snap.forEach(function (doc) {
          if (doc.id === currentBrandId) return;
          var data = doc.data() || {};
          data._id = doc.id;
          arr.push(data);
        });
        // Sorteer op volgers desc, dan naam asc
        arr.sort(function (a, b) {
          var va = Number(a.volgers || 0), vb = Number(b.volgers || 0);
          if (vb !== va) return vb - va;
          return String(a.naam || '').localeCompare(String(b.naam || ''));
        });
        return arr.slice(0, 6);
      })
      .catch(function (err) { log('related load fail: ' + (err && err.message)); return []; });
  }

  function buildRelatedKaart(b) {
    var naam = b.naam || 'Merk';
    var logo = b.logo || '';
    var initials = String(naam).slice(0, 2).toUpperCase();
    var cat = b.categorie || '';
    return '<a class="pp-bp-rel-kaart" href="javascript:void(0)" data-brand-id="' + esc(b._id) + '" data-testid="pp-bp-rel-' + esc(b._id) + '">' +
      '<div class="pp-bp-rel-logo">' +
        (logo ? '<img src="' + esc(logo) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : esc(initials)) +
      '</div>' +
      '<div class="pp-bp-rel-naam">' + esc(naam) + '</div>' +
      (cat ? '<div class="pp-bp-rel-cat">' + esc(cat) + '</div>' : '') +
    '</a>';
  }

  function buildRelatedSection(brands) {
    if (!brands || !brands.length) return '';
    var cards = brands.map(buildRelatedKaart).join('');
    return '<section class="pp-bp-f5-sec" id="pp-bp-related" data-testid="pp-bp-related">' +
      '<div class="pp-bp-f5-hdr"><h2 class="pp-bp-f5-titel">Gerelateerde merken</h2></div>' +
      '<div class="pp-bp-rel-grid">' + cards + '</div>' +
    '</section>';
  }

  // ─── Socials ─────────────────────────────────────────────────────────
  function normaliseerUrl(url, key) {
    if (!url) return '';
    url = String(url).trim();
    if (!url) return '';
    // Als het een handle is (zonder http), maak URL
    if (/^https?:\/\//i.test(url)) return url;
    if (/^@/.test(url)) url = url.slice(1);
    var slug = url.replace(/^\/+|\/+$/g, '');
    switch (key) {
      case 'instagram': return 'https://instagram.com/' + slug;
      case 'tiktok':    return 'https://tiktok.com/@' + slug;
      case 'pinterest': return 'https://pinterest.com/' + slug;
      case 'facebook':  return 'https://facebook.com/' + slug;
      case 'youtube':   return 'https://youtube.com/' + (slug.charAt(0) === '@' ? slug : '@' + slug);
      case 'x':         return 'https://x.com/' + slug;
      default:          return url;
    }
  }

  function buildSocialsSection(socials) {
    if (!socials || typeof socials !== 'object') return '';
    var btns = [];
    for (var i = 0; i < SOCIAL_META.length; i++) {
      var meta = SOCIAL_META[i];
      var raw = socials[meta.key];
      if (!raw) continue;
      var url = normaliseerUrl(raw, meta.key);
      if (!url) continue;
      btns.push('<a class="pp-bp-soc-btn" href="' + esc(url) + '" target="_blank" rel="noopener nofollow" data-testid="pp-bp-soc-' + esc(meta.key) + '" style="color:' + esc(meta.color) + '">' +
        meta.icon + '<span style="color:#fcf8ef">' + esc(meta.label) + '</span></a>');
    }
    if (!btns.length) return '';
    return '<section class="pp-bp-f5-sec" id="pp-bp-socials" data-testid="pp-bp-socials">' +
      '<div class="pp-bp-f5-hdr"><h2 class="pp-bp-f5-titel">Volg ons</h2></div>' +
      '<div class="pp-bp-soc-rij">' + btns.join('') + '</div>' +
    '</section>';
  }

  // ─── Contact ─────────────────────────────────────────────────────────
  function buildContactSection(contact, fallbackWebsite) {
    contact = contact || {};
    var items = [];
    var mailIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>';
    var telIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 00-1.02.24l-2.2 2.2a15.05 15.05 0 01-6.59-6.59l2.2-2.2a1 1 0 00.24-1.02A11.36 11.36 0 018.5 4 1 1 0 007.5 3H4a1 1 0 00-1 1c0 9.39 7.61 17 17 17a1 1 0 001-1v-3.5a1 1 0 00-1-1z"/></svg>';
    var pinIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/></svg>';
    var chatIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
    var webIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 118-8 8 8 0 01-8 8zm-1-14v6l5 3 .75-1.23-4.25-2.52V6z"/></svg>';

    if (contact.email) {
      items.push('<a class="pp-bp-con-item" href="mailto:' + esc(contact.email) + '" data-testid="pp-bp-con-email">' +
        '<div class="pp-bp-con-icon">' + mailIcon + '</div>' +
        '<div class="pp-bp-con-body"><p class="pp-bp-con-label">E-mail</p><p class="pp-bp-con-waarde">' + esc(contact.email) + '</p></div>' +
      '</a>');
    }
    if (contact.telefoon || contact.tel) {
      var tel = contact.telefoon || contact.tel;
      var telClean = String(tel).replace(/[^\d+]/g, '');
      items.push('<a class="pp-bp-con-item" href="tel:' + esc(telClean) + '" data-testid="pp-bp-con-tel">' +
        '<div class="pp-bp-con-icon">' + telIcon + '</div>' +
        '<div class="pp-bp-con-body"><p class="pp-bp-con-label">Telefoon</p><p class="pp-bp-con-waarde">' + esc(tel) + '</p></div>' +
      '</a>');
    }
    if (contact.adres) {
      items.push('<div class="pp-bp-con-item" data-testid="pp-bp-con-adres">' +
        '<div class="pp-bp-con-icon">' + pinIcon + '</div>' +
        '<div class="pp-bp-con-body"><p class="pp-bp-con-label">Adres</p><p class="pp-bp-con-waarde">' + esc(contact.adres) + '</p></div>' +
      '</div>');
    }
    if (contact.chatUrl) {
      items.push('<a class="pp-bp-con-item" href="' + esc(contact.chatUrl) + '" target="_blank" rel="noopener nofollow" data-testid="pp-bp-con-chat">' +
        '<div class="pp-bp-con-icon">' + chatIcon + '</div>' +
        '<div class="pp-bp-con-body"><p class="pp-bp-con-label">Chat / WhatsApp</p><p class="pp-bp-con-waarde">Open chat</p></div>' +
      '</a>');
    }
    var web = contact.website || fallbackWebsite;
    if (web) {
      items.push('<a class="pp-bp-con-item" href="' + esc(web) + '" target="_blank" rel="noopener nofollow" data-testid="pp-bp-con-website">' +
        '<div class="pp-bp-con-icon">' + webIcon + '</div>' +
        '<div class="pp-bp-con-body"><p class="pp-bp-con-label">Website</p><p class="pp-bp-con-waarde">' + esc(web.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</p></div>' +
      '</a>');
    }
    if (!items.length) return '';
    return '<section class="pp-bp-f5-sec" id="pp-bp-contact" data-testid="pp-bp-contact">' +
      '<div class="pp-bp-f5-hdr"><h2 class="pp-bp-f5-titel">Contact</h2></div>' +
      '<div class="pp-bp-con-lijst">' + items.join('') + '</div>' +
    '</section>';
  }

  // ─── Insertion: NA reviews / community / grid ────────────────────────
  function insertAtEnd(html) {
    if (!html) return null;
    var page = document.querySelector('.bp-page');
    if (!page) return null;
    var frag = document.createElement('div');
    frag.innerHTML = html;
    var el = frag.firstChild;
    if (!el) return null;
    // Zoek laatste bestaande sectie om NA in te voegen
    var candidates = ['#pp-bp-reviews', '#pp-bp-community', '.bp-prod-grid'];
    for (var i = 0; i < candidates.length; i++) {
      var anchor = page.querySelector(candidates[i]);
      if (anchor && anchor.parentNode) {
        // Voeg toe NA het laatste Fase5 blok, of NA de anchor
        var lastF5 = page.querySelector('.pp-bp-f5-sec:last-of-type');
        var target = lastF5 || anchor;
        target.parentNode.insertBefore(el, target.nextSibling);
        return el;
      }
    }
    page.appendChild(el);
    return el;
  }

  function enhanceFase5() {
    var page = document.querySelector('.bp-page');
    if (!page) return;
    if (page.dataset.ppFase5 === '1') return;
    var hero = page.querySelector('.bp-merk-hero');
    if (!hero) return;
    var brandId = '';
    try { brandId = window.__ppCurrentBrandId || ''; } catch (_) {}
    if (!brandId) return;
    page.dataset.ppFase5 = '1';
    injectCss();

    var d = db();
    if (!d) return;

    d.collection('brands').doc(brandId).get().then(function (snap) {
      if (!snap || !snap.exists) return;
      var b = snap.data() || {};

      // 1. Socials (synchronous)
      insertAtEnd(buildSocialsSection(b.socials));

      // 2. Contact (synchronous)
      insertAtEnd(buildContactSection(b.contact, b.website));

      // 3. Related brands (async op categorie)
      if (b.categorie) {
        loadRelated(brandId, b.categorie).then(function (related) {
          insertAtEnd(buildRelatedSection(related));
          // Delegated click handler voor navigatie
          var relSec = page.querySelector('#pp-bp-related');
          if (relSec && !relSec.__ppBound) {
            relSec.__ppBound = true;
            relSec.addEventListener('click', function (e) {
              var k = e.target && e.target.closest && e.target.closest('.pp-bp-rel-kaart[data-brand-id]');
              if (!k) return;
              var bid = k.getAttribute('data-brand-id');
              try {
                if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('brand_detail', { brandId: bid });
                else location.hash = '#merk/' + bid;
              } catch (_) { location.hash = '#merk/' + bid; }
            });
          }
        });
      }
    }).catch(function (err) { log('brand load fail: ' + (err && err.message)); });
  }

  function init() {
    var obs = new MutationObserver(function () {
      try { enhanceFase5(); } catch (e) { log('enhance error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { enhanceFase5(); } catch (_) {} }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandFase5 = { VERSION: '1.0.0', enhance: enhanceFase5 };
})();
