// ═══════════════════════════════════════════════════════════════════════════
// PaskamerPraat — BRAND PORTAL MVP v1
// ─────────────────────────────────────────────────────────────────────────
// Self-contained module: registreer routes, render pagina's, RBAC enforced.
// GEEN bestaande code aangepast. GEEN bestaande user flows gebroken.
// Feature flag: window.DY_BRAND_PORTAL_ENABLED (default true; uitschakelen via
// localStorage.setItem('dy_brand_portal','0') of via Firestore app_config doc).
//
// Architectuur:
//   - users/{uid}.role === 'brand' wijst op brand-account (naast bestaande gast/user)
//   - brands/{uid}        bevat brand profile + status (draft|pending|approved|rejected|suspended)
//   - brand_products/{id} producten gekoppeld via brandId
//   - campaigns/{id}      campagnes gekoppeld via brandId
//   - campaign_events/{id} impressies + clicks (append-only)
//   - brand_admin_log/{id} audit log
//
// RBAC:
//   - USER  : bestaande gebruikers (geen change)
//   - BRAND : users/{uid}.role==='brand' + brands/{uid}.status==='approved'
//   - ADMIN : DY._isAdmin() (email-based, bestaande check)
//
// Pagina's:
//   - /merken               publieke discovery
//   - /brand_register       registratie
//   - /brand_login          login (hergebruikt bestaande Firebase Auth)
//   - /brand_pending        wachten op approval
//   - /brand_dashboard      overzicht
//   - /brand_producten      product CMS
//   - /brand_product_nieuw  nieuw/bewerken product
//   - /brand_campagnes      campagne lijst
//   - /brand_campagne_nieuw nieuw/bewerken campagne
//   - /brand_analytics      analytics dashboard
//   - /admin_brands         admin brand management
//   - /admin_campagnes      admin campaign control
//   - /admin_inkomsten      admin revenue dashboard
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // v60.1.5 — vroege marker zodat we in DevTools console kunnen zien dat
  // het script daadwerkelijk geladen is. Als deze niet verschijnt is het
  // een cache/loading probleem en niet een logica-fout.
  try { console.log('[brand-portal] script geladen v60.1.5-poll'); } catch(e) {}

  // ── Feature flag ────────────────────────────────────────────────────────
  try {
    if (localStorage.getItem('dy_brand_portal') === '0') {
      window.DY_BRAND_PORTAL_ENABLED = false;
      return;
    }
  } catch(e) {}
  window.DY_BRAND_PORTAL_ENABLED = true;

  // ── Bootstrap: wacht tot DY beschikbaar is ──────────────────────────────
  function whenReady(cb) {
    if (window.DY && typeof window.DY.toonPagina === 'function') return cb();
    setTimeout(function() { whenReady(cb); }, 80);
  }

  whenReady(function() {
    var DY = window.DY;
    var BP = DY.brandPortal = DY.brandPortal || {};

    // Validatie regex
    var EMAIL_RX  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var URL_RX    = /^https?:\/\/[^\s]+\.[^\s]+/i;
    var BTW_RX    = /^[A-Z]{2}[A-Z0-9]{8,12}$/i;

    // Categorieën (uit te breiden zonder code change via Firestore later)
    var CATEGORIEEN = [
      'Tall fashion','Plus size','Schoenen','Lingerie & nachtmode',
      'Sport & activewear','Sieraden & accessoires','Tassen','Beauty',
      'Lifestyle','Overige'
    ];
    var PLAATSINGEN = [
      { id:'feed',     label:'Merken-tab feed' },
      { id:'stories',  label:'Story-ring (Merken)' },
      { id:'review',   label:'Outfit Review' },
      { id:'ai',       label:'AI Style Assistent' },
      { id:'similar',  label:'Vergelijkbaar zoeken' }
    ];
    var DOELEN = [
      { id:'awareness', label:'Naamsbekendheid' },
      { id:'traffic',   label:'Website verkeer' },
      { id:'sales',     label:'Conversie / verkoop' }
    ];

    // ── HELPERS ───────────────────────────────────────────────────────────
    function esc(s) {
      return (DY.escapeHtml ? DY.escapeHtml(s) : String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;'));
    }
    function toast(msg, isErr) {
      try {
        if (DY.toonToast) return DY.toonToast(msg, isErr ? 'error' : 'info');
        if (DY.toast)     return DY.toast(msg);
      } catch(e) {}
      try { alert(msg); } catch(e) {}
    }
    function nu() {
      try { return firebase.firestore.FieldValue.serverTimestamp(); }
      catch(e) { return new Date().toISOString(); }
    }
    function uid() { return DY.user ? DY.user.uid : null; }
    function isAdmin() { return DY._isAdmin && DY._isAdmin(); }
    function isLogged() { return !!(DY.user && DY.user.uid); }

    function loaderHTML() {
      return '<div class="bp-loader"><div class="bp-spinner"></div></div>';
    }
    function emptyHTML(title, sub, cta) {
      return '<div class="bp-empty">' +
        '<div class="bp-empty-icon">📦</div>' +
        '<div class="bp-empty-titel">' + esc(title) + '</div>' +
        (sub ? '<div class="bp-empty-sub">' + esc(sub) + '</div>' : '') +
        (cta || '') +
        '</div>';
    }
    function badge(status) {
      var labels = {
        draft:'Concept', pending:'In review', approved:'Goedgekeurd',
        rejected:'Afgekeurd', suspended:'Geblokkeerd',
        live:'Live', paused:'Gepauzeerd', completed:'Afgerond', review:'In review',
        actief:'Actief', concept:'Concept', afgekeurd:'Afgekeurd'
      };
      return '<span class="bp-badge bp-badge-' + esc(status) + '">' +
        esc(labels[status] || status) + '</span>';
    }
    function fmtDatum(t) {
      if (!t) return '—';
      try {
        var d = t.toDate ? t.toDate() : new Date(t);
        return d.toLocaleDateString('nl-NL', { day:'2-digit', month:'short', year:'numeric' });
      } catch(e) { return '—'; }
    }
    function fmtNum(n) {
      n = +n || 0;
      return n.toLocaleString('nl-NL');
    }
    function fmtEuro(n) {
      n = +n || 0;
      return '€' + n.toLocaleString('nl-NL', { minimumFractionDigits:2, maximumFractionDigits:2 });
    }
    function rateLimitOK(key, windowMs) {
      try {
        var lastKey = 'bp_rl_' + key;
        var last = +(localStorage.getItem(lastKey) || 0);
        var now = Date.now();
        if (now - last < windowMs) return false;
        localStorage.setItem(lastKey, String(now));
        return true;
      } catch(e) { return true; }
    }

    // ── BRAND CACHE ───────────────────────────────────────────────────────
    BP._brandCache = null;
    BP.getBrand = async function(force) {
      if (!isLogged()) return null;
      if (!force && BP._brandCache && BP._brandCache._uid === uid()) return BP._brandCache;
      try {
        var snap = await DY.db.collection('brands').doc(uid()).get();
        if (!snap.exists) { BP._brandCache = null; return null; }
        var data = snap.data() || {};
        data.id = snap.id;
        data._uid = uid();
        BP._brandCache = data;
        return data;
      } catch(e) { return null; }
    };
    BP.clearCache = function() { BP._brandCache = null; };

    // ── ROUTER WRAPPER ────────────────────────────────────────────────────
    // Hook in op DY.toonPagina ZONDER bestaande logica te wijzigen
    var BP_PAGES = {
      merken:                BP.renderMerken,
      brand_register:        BP.renderRegister,
      brand_login:           BP.renderBrandLogin,
      brand_pending:         BP.renderPending,
      brand_dashboard:       BP.renderDashboard,
      brand_producten:       BP.renderProducten,
      brand_product_nieuw:   BP.renderProductForm,
      brand_campagnes:       BP.renderCampagnes,
      brand_campagne_nieuw:  BP.renderCampagneForm,
      brand_analytics:       BP.renderAnalytics,
      admin_brands:          BP.renderAdminBrands,
      admin_campagnes:       BP.renderAdminCampagnes,
      admin_inkomsten:       BP.renderAdminInkomsten
    };

    var _origToonPagina = DY.toonPagina;
    DY.toonPagina = function(pagina) {
      // ── v60.1.4 FINAL: sticky deeplink + render-lock ────────────────────
      // Combinatie van 2 mechanismen die elkaar aanvullen:
      //   1) Sticky deeplink (5s TTL) — hijack non-brand calls. NIET wissen
      //      bij render-start, pas wissen wanneer URL verandert of TTL afloopt.
      //   2) Render-lock (2s) — terwijl een brand-portal render bezig is,
      //      worden concurrent non-brand toonPagina calls GENEGEERD (zodat
      //      onAuthReady tijdens een async await niet over ons render heen
      //      schrijft).
      try {
        var nu = Date.now();
        // Sticky deeplink hijack
        if (BP._deeplink
            && (nu - (BP._deeplinkAt || 0)) < 5000
            && !Object.prototype.hasOwnProperty.call(BP_PAGES, pagina)) {
          pagina = BP._deeplink;
        }
        // Render-lock: tijdens onze render, slik concurrent non-brand navigatie
        if (BP._renderLock
            && (nu - (BP._renderLockAt || 0)) < 2000
            && !Object.prototype.hasOwnProperty.call(BP_PAGES, pagina)) {
          return; // negeer — we zijn bezig
        }
      } catch(e) {}

      // Brand-portal pagina's? Pak ze hier af; anders origineel
      if (pagina && Object.prototype.hasOwnProperty.call(BP_PAGES, pagina)) {
        try {
          DY.pagina = pagina;
          DY._laatstGerenderd = null;
          BP._renderLock = true;
          BP._renderLockAt = Date.now();
          var fn = BP_PAGES[pagina] || BP[pagina];
          if (typeof fn !== 'function') {
            // Functie nog niet aangemaakt (forward declaration) — lookup direct
            var directKey = {
              merken:'renderMerken', brand_register:'renderRegister', brand_login:'renderBrandLogin',
              brand_pending:'renderPending', brand_dashboard:'renderDashboard',
              brand_producten:'renderProducten', brand_product_nieuw:'renderProductForm',
              brand_campagnes:'renderCampagnes', brand_campagne_nieuw:'renderCampagneForm',
              brand_analytics:'renderAnalytics',
              admin_brands:'renderAdminBrands', admin_campagnes:'renderAdminCampagnes',
              admin_inkomsten:'renderAdminInkomsten'
            }[pagina];
            fn = BP[directKey];
          }
          if (typeof fn === 'function') {
            var _result = fn.call(BP);
            // v60.1.4: release render-lock na async render. Wis deeplink ook
            // pas hier zodat eventueel mislukte render een retry kan triggeren.
            if (_result && typeof _result.then === 'function') {
              _result.then(function() {
                BP._renderLock = false;
                if (BP._deeplink === pagina) {
                  BP._deeplink = null;
                  BP._deeplinkAt = 0;
                }
              }, function() {
                BP._renderLock = false;
              });
            } else {
              BP._renderLock = false;
              if (BP._deeplink === pagina) {
                BP._deeplink = null;
                BP._deeplinkAt = 0;
              }
            }
            return _result;
          }
        } catch(e) { console.error('[BrandPortal]', e); }
      }
      return _origToonPagina.call(DY, pagina);
    };

    // ── INJECT MENU ENTRY in profile + voorwaarden page ───────────────────
    // Observer: wanneer #dy-main vernieuwt, kijken of we onze entry moeten plaatsen
    function injecteerProfielKnop() {
      try {
        var main = document.getElementById('dy-main');
        if (!main) return;
        // Alleen op profiel-pagina
        if (DY.pagina !== 'profiel') return;
        if (main.querySelector('#bp-profiel-knop')) return;
        var acties = main.querySelector('.dy-profiel-acties');
        if (!acties) return;
        var knop = document.createElement('button');
        knop.id = 'bp-profiel-knop';
        knop.className = 'dy-btn dy-btn-ghost';
        knop.style.cssText = 'justify-content:flex-start;gap:8px;width:100%';
        knop.setAttribute('data-testid','brand-portal-menu-btn');
        knop.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
          '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
          'Merkenportaal';
        knop.onclick = function() { BP.openPortaal(); };
        // Plaats VOOR "Privacy & gegevensbeheer" voor visueel evenwicht
        acties.insertBefore(knop, acties.firstChild);
      } catch(e) { /* noop */ }
    }

    // Mutation observer — minimaal, alleen op profile/voorwaarden render
    var _obsTimer = null;
    var _obs = new MutationObserver(function() {
      if (_obsTimer) return;
      _obsTimer = setTimeout(function() {
        _obsTimer = null;
        injecteerProfielKnop();
      }, 60);
    });
    try {
      var rootMain = document.getElementById('dy-main');
      if (rootMain) _obs.observe(rootMain, { childList:true, subtree:false });
    } catch(e) {}

    // Ook direct na elke navigeer-call kort proberen
    var _origNavigeer = DY.navigeer;
    DY.navigeer = function(pagina) {
      var r = _origNavigeer ? _origNavigeer.call(DY, pagina) : null;
      setTimeout(injecteerProfielKnop, 120);
      return r;
    };

    // ── ENTRY POINT vanaf hamburger/profielmenu ───────────────────────────
    BP.openPortaal = async function() {
      // 1. Niet ingelogd? → registratie/login flow
      if (!isLogged()) {
        return DY.navigeer('brand_register');
      }
      // 2. Admin? → admin overzicht
      if (isAdmin()) {
        return DY.navigeer('admin_brands');
      }
      // 3. Ingelogd: brand record bestaat?
      var brand = await BP.getBrand(true);
      if (!brand) {
        // Bestaande user wil brand worden — toon registratie maar voorgevuld
        return DY.navigeer('brand_register');
      }
      if (brand.status === 'approved') return DY.navigeer('brand_dashboard');
      if (brand.status === 'rejected' || brand.status === 'suspended') return DY.navigeer('brand_pending');
      return DY.navigeer('brand_pending');
    };

    // ════════════════════════════════════════════════════════════════════
    // PUBLIEKE "MERKEN" TAB — gescheiden van organische feed
    // ════════════════════════════════════════════════════════════════════
    BP.renderMerken = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      main.innerHTML =
        '<div class="bp-page">' +
          '<div class="bp-header">' +
            '<div class="bp-header-titel">' +
              '<span class="bp-header-eyebrow">Paskamer Praat</span>' +
              '<h1>Merken</h1>' +
              '<p>Ontdek merken die speciaal voor de Tall &amp; Plus Size community ontworpen zijn.</p>' +
            '</div>' +
            (isLogged() ? '' :
              '<button class="bp-btn bp-btn-ghost" onclick="DY.brandPortal.openPortaal()" data-testid="brand-portal-cta-merken">Ben jij een merk? <strong>Word partner</strong></button>') +
          '</div>' +
          '<div id="bp-merken-lijst" class="bp-merken-grid">' + loaderHTML() + '</div>' +
        '</div>';

      try {
        // Haal approved brands op met actieve live campagnes
        var snap = await DY.db.collection('brands')
          .where('status','==','approved')
          .limit(60).get();
        var lijst = document.getElementById('bp-merken-lijst');
        if (!lijst) return;
        if (snap.empty) {
          lijst.innerHTML = emptyHTML('Nog geen merken zichtbaar',
            'Binnenkort worden hier de eerste merken getoond.',
            (isLogged() ? '' : '<button class="bp-btn bp-btn-primair" onclick="DY.brandPortal.openPortaal()" data-testid="brand-portal-empty-cta">Word partner</button>'));
          return;
        }
        var cards = [];
        snap.forEach(function(d) {
          var b = d.data();
          var logo = b.logo
            ? '<img src="' + esc(b.logo) + '" alt="" loading="lazy" decoding="async">'
            : '<div class="bp-merk-initialen">' + esc((b.naam || '?').slice(0,2).toUpperCase()) + '</div>';
          cards.push(
            '<a class="bp-merk-kaart" href="javascript:void(0)" onclick="DY.brandPortal.toonMerkDetail(\'' + esc(d.id) + '\')" data-testid="brand-card-' + esc(d.id) + '">' +
              '<div class="bp-merk-logo">' + logo + '</div>' +
              '<div class="bp-merk-info">' +
                '<div class="bp-merk-naam">' + esc(b.naam || 'Onbekend') + '</div>' +
                '<div class="bp-merk-cat">' + esc(b.categorie || '') + '</div>' +
              '</div>' +
            '</a>'
          );
        });
        lijst.innerHTML = cards.join('');
      } catch(e) {
        document.getElementById('bp-merken-lijst').innerHTML =
          emptyHTML('Kon merken niet laden', 'Probeer het later opnieuw.');
      }
    };

    BP.toonMerkDetail = async function(brandId) {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.scrollTo && main.scrollTo(0,0);
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      try {
        var bSnap = await DY.db.collection('brands').doc(brandId).get();
        if (!bSnap.exists || bSnap.data().status !== 'approved') {
          main.innerHTML = '<div class="bp-page">' + emptyHTML('Merk niet gevonden') + '</div>';
          return;
        }
        var b = bSnap.data();
        var pSnap = await DY.db.collection('brand_products')
          .where('brandId','==', brandId)
          .where('status','==','actief')
          .limit(24).get();
        var prods = [];
        pSnap.forEach(function(d) {
          var p = d.data();
          var img = (p.afbeeldingen && p.afbeeldingen[0]) || '';
          prods.push(
            '<a class="bp-prod-kaart" href="' + esc(p.url || '#') + '" target="_blank" rel="noopener nofollow" onclick="DY.brandPortal._trackClick(\'' + esc(d.id) + '\')" data-testid="brand-product-' + esc(d.id) + '">' +
              (img ? '<div class="bp-prod-img"><img src="' + esc(img) + '" alt="" loading="lazy" decoding="async"></div>' : '<div class="bp-prod-img bp-prod-noimg">📷</div>') +
              '<div class="bp-prod-titel">' + esc(p.titel || '') + '</div>' +
              (p.prijs ? '<div class="bp-prod-prijs">' + fmtEuro(p.prijs) + '</div>' : '') +
            '</a>'
          );
        });
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'merken\')" data-testid="brand-detail-back">&larr; Terug naar merken</button>' +
            '<div class="bp-merk-hero">' +
              '<div class="bp-merk-hero-logo">' +
                (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : esc((b.naam||'?').slice(0,2).toUpperCase())) +
              '</div>' +
              '<div>' +
                '<h1>' + esc(b.naam) + '</h1>' +
                '<p class="bp-merk-hero-cat">' + esc(b.categorie || '') + '</p>' +
                (b.website ? '<a class="bp-link" href="' + esc(b.website) + '" target="_blank" rel="noopener nofollow">Website &rarr;</a>' : '') +
              '</div>' +
            '</div>' +
            (prods.length
              ? '<div class="bp-prod-grid">' + prods.join('') + '</div>'
              : emptyHTML('Nog geen producten zichtbaar')) +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Fout bij laden', e.message) + '</div>';
      }
    };

    BP._trackClick = function(productId) {
      try {
        DY.db.collection('campaign_events').add({
          type: 'product_click', productId: productId,
          uid: uid() || null, ts: nu()
        }).catch(function(){});
      } catch(e) {}
    };

    // ════════════════════════════════════════════════════════════════════
    // BRAND REGISTRATIE
    // ════════════════════════════════════════════════════════════════════
    BP.renderRegister = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '40px';
      var prefill = {};
      if (isLogged()) {
        var existing = await BP.getBrand(true);
        if (existing && existing.status === 'approved') return DY.navigeer('brand_dashboard');
        prefill = existing || { contactEmail: DY.user.email || '' };
      }
      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<button class="bp-back" onclick="DY.navigeer(\'feed\')" data-testid="brand-register-back">&larr; Terug</button>' +
          '<h1>Word merkpartner</h1>' +
          '<p class="bp-sub">Vul je gegevens in. Na goedkeuring krijg je toegang tot het merkenportaal waar je producten en campagnes beheert.</p>' +
          '<form id="bp-register-form" autocomplete="off" novalidate>' +
            (isLogged() ? '<div class="bp-info">Je bent ingelogd als <strong>' + esc(DY.user.email) + '</strong>. Dit account wordt gekoppeld als merkaccount.</div>' : '') +
            '<label class="bp-veld"><span>Bedrijfsnaam *</span><input name="naam" required maxlength="80" data-testid="brand-reg-naam" value="' + esc(prefill.naam || '') + '"></label>' +
            '<label class="bp-veld"><span>Contactpersoon *</span><input name="contact" required maxlength="80" data-testid="brand-reg-contact" value="' + esc(prefill.contact || '') + '"></label>' +
            (isLogged() ? '' :
              '<label class="bp-veld"><span>E-mailadres *</span><input type="email" name="email" required maxlength="120" data-testid="brand-reg-email" value="' + esc(prefill.contactEmail || '') + '"></label>' +
              '<label class="bp-veld"><span>Wachtwoord *</span><input type="password" name="ww" required minlength="8" data-testid="brand-reg-ww"></label>') +
            '<label class="bp-veld"><span>BTW-nummer</span><input name="btw" maxlength="20" placeholder="bv. NL123456789B01" data-testid="brand-reg-btw" value="' + esc(prefill.btw || '') + '"></label>' +
            '<label class="bp-veld"><span>Website *</span><input type="url" name="website" required placeholder="https://" data-testid="brand-reg-website" value="' + esc(prefill.website || '') + '"></label>' +
            '<label class="bp-veld"><span>Instagram</span><input name="instagram" placeholder="@merknaam" data-testid="brand-reg-instagram" value="' + esc(prefill.instagram || '') + '"></label>' +
            '<label class="bp-veld"><span>TikTok</span><input name="tiktok" placeholder="@merknaam" data-testid="brand-reg-tiktok" value="' + esc(prefill.tiktok || '') + '"></label>' +
            '<label class="bp-veld"><span>Categorie *</span><select name="categorie" required data-testid="brand-reg-cat">' +
              '<option value="">Kies een categorie...</option>' +
              CATEGORIEEN.map(function(c){ return '<option value="' + esc(c) + '"' + (prefill.categorie===c?' selected':'') + '>' + esc(c) + '</option>'; }).join('') +
            '</select></label>' +
            '<label class="bp-veld"><span>Logo (PNG/JPG, max 2MB)</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" data-testid="brand-reg-logo"></label>' +
            '<label class="bp-veld"><span>Korte omschrijving (max 280 tekens)</span><textarea name="omschrijving" maxlength="280" rows="3" data-testid="brand-reg-omschrijving">' + esc(prefill.omschrijving || '') + '</textarea></label>' +
            '<label class="bp-check"><input type="checkbox" name="voorwaarden" required data-testid="brand-reg-tc"> Ik ga akkoord met de <a href="javascript:void(0)" onclick="DY.navigeer(\'voorwaarden\')">algemene voorwaarden</a> en het commissie/advertentie-reglement.</label>' +
            '<div class="bp-form-fouten" id="bp-reg-fouten" role="alert" aria-live="polite"></div>' +
            '<button type="submit" class="bp-btn bp-btn-primair" data-testid="brand-reg-submit">Aanvraag versturen</button>' +
          '</form>' +
        '</div>';

      var form = document.getElementById('bp-register-form');
      var foutBox = document.getElementById('bp-reg-fouten');
      form.addEventListener('submit', async function(ev) {
        ev.preventDefault();
        foutBox.textContent = '';
        if (!rateLimitOK('brand_register', 8000)) {
          foutBox.textContent = 'Even rustig — wacht een paar seconden voor je opnieuw verstuurt.';
          return;
        }
        var data = new FormData(form);
        var v = {
          naam: (data.get('naam')||'').trim(),
          contact: (data.get('contact')||'').trim(),
          email: (data.get('email')||'').trim().toLowerCase(),
          ww: (data.get('ww')||''),
          btw: (data.get('btw')||'').trim(),
          website: (data.get('website')||'').trim(),
          instagram: (data.get('instagram')||'').trim(),
          tiktok: (data.get('tiktok')||'').trim(),
          categorie: (data.get('categorie')||'').trim(),
          omschrijving: (data.get('omschrijving')||'').trim(),
          voorwaarden: !!data.get('voorwaarden'),
          logoFile: data.get('logo')
        };
        var errs = [];
        if (!v.naam || v.naam.length < 2) errs.push('Bedrijfsnaam ontbreekt.');
        if (!v.contact) errs.push('Contactpersoon ontbreekt.');
        if (!isLogged()) {
          if (!EMAIL_RX.test(v.email)) errs.push('E-mailadres is ongeldig.');
          if (v.ww.length < 8) errs.push('Wachtwoord moet minimaal 8 tekens zijn.');
        }
        if (v.btw && !BTW_RX.test(v.btw)) errs.push('BTW-nummer formaat onjuist (bv. NL123456789B01).');
        if (!URL_RX.test(v.website)) errs.push('Website moet beginnen met https://.');
        if (!v.categorie) errs.push('Kies een categorie.');
        if (!v.voorwaarden) errs.push('Voorwaarden moeten geaccepteerd zijn.');
        if (v.logoFile && v.logoFile.size > 2 * 1024 * 1024) errs.push('Logo is groter dan 2 MB.');
        if (errs.length) { foutBox.innerHTML = errs.map(function(x){ return '• ' + esc(x); }).join('<br>'); return; }

        var btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Bezig...';

        try {
          // 1. Bestaande account of nieuw account?
          var fbUid = uid();
          if (!isLogged()) {
            // Check dubbel account
            var emailLookup = await DY.db.collection('brands').where('contactEmail','==', v.email).limit(1).get();
            if (!emailLookup.empty) {
              foutBox.textContent = 'Er bestaat al een aanvraag voor dit e-mailadres.';
              btn.disabled = false; btn.textContent = 'Aanvraag versturen'; return;
            }
            var cred = await firebase.auth().createUserWithEmailAndPassword(v.email, v.ww);
            fbUid = cred.user.uid;
            try { await cred.user.sendEmailVerification(); } catch(e) {}
            // Maak users/{uid} entry (bestaande pattern — DY.profile struct)
            await DY.db.collection('users').doc(fbUid).set({
              displayName: v.naam,
              email: v.email,
              role: 'brand',
              aangemaakt: nu(),
              dsp_lifetime: 0, dsp_seizoen: 0
            }, { merge: true });
          } else {
            // Bestaande user → upgrade role
            await DY.db.collection('users').doc(fbUid).set({ role: 'brand' }, { merge: true });
          }

          // 2. Logo uploaden naar Firebase Storage
          var logoUrl = '';
          if (v.logoFile && v.logoFile.size) {
            try {
              var path = 'brands/' + fbUid + '/logo_' + Date.now() + '_' + (v.logoFile.name||'logo');
              var ref = firebase.storage().ref().child(path);
              var snap = await ref.put(v.logoFile);
              logoUrl = await snap.ref.getDownloadURL();
            } catch(e) { /* logo is niet kritiek */ }
          }

          // 3. brands/{uid} doc aanmaken
          var brandDoc = {
            naam: v.naam,
            contact: v.contact,
            contactEmail: v.email || (DY.user && DY.user.email) || '',
            btw: v.btw,
            website: v.website,
            instagram: v.instagram,
            tiktok: v.tiktok,
            categorie: v.categorie,
            omschrijving: v.omschrijving,
            logo: logoUrl,
            status: 'pending',
            aangemaakt: nu(),
            laatsteUpdate: nu(),
            voorwaardenAcceptedAt: nu(),
            voorwaardenVersie: 'v1'
          };
          await DY.db.collection('brands').doc(fbUid).set(brandDoc, { merge: true });

          // 4. Audit-event
          try {
            await DY.db.collection('brand_admin_log').add({
              type: 'brand_registered', brandId: fbUid,
              brandNaam: v.naam, door: fbUid, ts: nu()
            });
          } catch(e) {}

          BP.clearCache();
          toast('Aanvraag verstuurd! Je hoort binnen 2 werkdagen of je merk goedgekeurd is.');
          DY.navigeer('brand_pending');
        } catch(err) {
          var msg = (err && err.message) || 'Onbekende fout.';
          if (err && err.code === 'auth/email-already-in-use') msg = 'Dit e-mailadres is al in gebruik. Log eerst in.';
          if (err && err.code === 'auth/weak-password') msg = 'Wachtwoord is te zwak.';
          foutBox.textContent = msg;
          btn.disabled = false; btn.textContent = 'Aanvraag versturen';
        }
      });
    };

    BP.renderBrandLogin = function() {
      // Brand login = gewone login. Stuur door naar bestaande login, na succes
      // wordt openPortaal aangeroepen via menu of via deep-link.
      DY.navigeer('login');
      setTimeout(function() {
        toast('Log in met je merkaccount. Daarna kun je via Profiel → Merkenportaal verder.');
      }, 600);
    };

    // ════════════════════════════════════════════════════════════════════
    // PENDING / REJECTED / SUSPENDED STATE
    // ════════════════════════════════════════════════════════════════════
    BP.renderPending = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      if (!isLogged()) { DY.navigeer('brand_register'); return; }
      var brand = await BP.getBrand(true);
      if (!brand) { DY.navigeer('brand_register'); return; }
      if (brand.status === 'approved') { DY.navigeer('brand_dashboard'); return; }

      var statusBlok;
      if (brand.status === 'rejected') {
        statusBlok =
          '<div class="bp-status-card bp-status-rejected">' +
            '<h2>Aanvraag afgekeurd</h2>' +
            '<p>Helaas voldoet je aanvraag niet aan onze criteria.</p>' +
            (brand.afgekeurdReden ? '<p><strong>Reden:</strong> ' + esc(brand.afgekeurdReden) + '</p>' : '') +
            '<p>Vragen? Neem contact op via <a href="mailto:partners@paskamerpraat.nl">partners@paskamerpraat.nl</a>.</p>' +
          '</div>';
      } else if (brand.status === 'suspended') {
        statusBlok =
          '<div class="bp-status-card bp-status-rejected">' +
            '<h2>Account tijdelijk geblokkeerd</h2>' +
            '<p>Je merkaccount is gepauzeerd. Neem contact op met partners@paskamerpraat.nl voor uitleg.</p>' +
          '</div>';
      } else {
        statusBlok =
          '<div class="bp-status-card bp-status-pending">' +
            '<h2>Aanvraag in review</h2>' +
            '<p>Bedankt voor je aanvraag — we beoordelen meestal binnen 2 werkdagen. Je ontvangt een mail zodra je merkaccount actief is.</p>' +
            '<p class="bp-mini">Aangevraagd op ' + fmtDatum(brand.aangemaakt) + '</p>' +
          '</div>';
      }
      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="DY.navigeer(\'profiel\')">&larr; Profiel</button>' +
          '<h1>Merkenportaal — ' + esc(brand.naam) + '</h1>' +
          statusBlok +
        '</div>';
    };

    // ════════════════════════════════════════════════════════════════════
    // BRAND DASHBOARD
    // ════════════════════════════════════════════════════════════════════
    BP.renderDashboard = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      if (!isLogged()) { DY.navigeer('brand_register'); return; }
      var brand = await BP.getBrand(true);
      if (!brand) { DY.navigeer('brand_register'); return; }
      if (brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }

      // Tellen
      var prodCount = 0, campCount = 0, liveCount = 0, impr = 0, clicks = 0;
      try {
        var pAgg = await DY.db.collection('brand_products').where('brandId','==', uid()).get();
        prodCount = pAgg.size;
      } catch(e) {}
      try {
        var cAgg = await DY.db.collection('campaigns').where('brandId','==', uid()).get();
        campCount = cAgg.size;
        cAgg.forEach(function(d){ if ((d.data().status||'') === 'live') liveCount++; });
        cAgg.forEach(function(d){ impr += (d.data().impressies||0); clicks += (d.data().clicks||0); });
      } catch(e) {}
      var ctr = impr > 0 ? ((clicks/impr)*100).toFixed(2) + '%' : '—';

      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="DY.navigeer(\'profiel\')">&larr; Profiel</button>' +
          '<div class="bp-dash-header">' +
            '<div>' +
              '<span class="bp-header-eyebrow">Merkenportaal</span>' +
              '<h1>' + esc(brand.naam) + '</h1>' +
              '<p class="bp-sub">Welkom terug, ' + esc(brand.contact) + '. ' + badge('approved') + '</p>' +
            '</div>' +
            (brand.logo ? '<div class="bp-dash-logo"><img src="' + esc(brand.logo) + '" alt=""></div>' : '') +
          '</div>' +
          '<div class="bp-stat-grid">' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(prodCount) + '</span><span class="bp-stat-lbl">Producten</span></div>' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(campCount) + '</span><span class="bp-stat-lbl">Campagnes</span></div>' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(liveCount) + '</span><span class="bp-stat-lbl">Live</span></div>' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(impr) + '</span><span class="bp-stat-lbl">Impressies</span></div>' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(clicks) + '</span><span class="bp-stat-lbl">Clicks</span></div>' +
            '<div class="bp-stat-kaart"><span class="bp-stat-num">' + ctr + '</span><span class="bp-stat-lbl">CTR</span></div>' +
          '</div>' +
          '<div class="bp-quick-grid">' +
            '<button class="bp-quick" onclick="DY.navigeer(\'brand_producten\')" data-testid="brand-dash-producten">' +
              '<span>📦</span><strong>Producten beheren</strong><span class="bp-mini">Voeg toe of bewerk</span></button>' +
            '<button class="bp-quick" onclick="DY.navigeer(\'brand_campagnes\')" data-testid="brand-dash-campagnes">' +
              '<span>🎯</span><strong>Campagnes</strong><span class="bp-mini">Plan & start</span></button>' +
            '<button class="bp-quick" onclick="DY.navigeer(\'brand_analytics\')" data-testid="brand-dash-analytics">' +
              '<span>📈</span><strong>Analytics</strong><span class="bp-mini">Inzicht & export</span></button>' +
            '<button class="bp-quick" onclick="DY.brandPortal.openBrandInstellingen()" data-testid="brand-dash-instellingen">' +
              '<span>⚙️</span><strong>Merkprofiel</strong><span class="bp-mini">Logo & gegevens</span></button>' +
          '</div>' +
        '</div>';
    };

    BP.openBrandInstellingen = function() {
      // MVP: hergebruik registratie-form als edit-form
      DY.navigeer('brand_register');
    };

    // ════════════════════════════════════════════════════════════════════
    // PRODUCT CMS
    // ════════════════════════════════════════════════════════════════════
    BP.renderProducten = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      var brand = await BP.getBrand();
      if (!brand || brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }

      try {
        var snap = await DY.db.collection('brand_products')
          .where('brandId','==', uid())
          .orderBy('aangemaakt','desc').limit(100).get();
        var rows = [];
        snap.forEach(function(d) {
          var p = d.data();
          var img = (p.afbeeldingen && p.afbeeldingen[0]) || '';
          rows.push(
            '<div class="bp-list-rij" data-testid="brand-product-rij-' + esc(d.id) + '">' +
              '<div class="bp-list-img">' + (img ? '<img src="' + esc(img) + '" alt="">' : '📷') + '</div>' +
              '<div class="bp-list-info">' +
                '<div class="bp-list-titel">' + esc(p.titel || 'Onbenoemd') + '</div>' +
                '<div class="bp-list-meta">' + esc(p.categorie || '') + ' · ' + fmtEuro(p.prijs||0) + ' · ' + badge(p.status || 'concept') + '</div>' +
              '</div>' +
              '<div class="bp-list-acties">' +
                '<button class="bp-btn-mini" onclick="DY.brandPortal.bewerkProduct(\'' + esc(d.id) + '\')" data-testid="brand-product-edit-' + esc(d.id) + '">Bewerken</button>' +
                '<button class="bp-btn-mini bp-btn-mini-rood" onclick="DY.brandPortal.verwijderProduct(\'' + esc(d.id) + '\')" data-testid="brand-product-delete-' + esc(d.id) + '">Verwijder</button>' +
              '</div>' +
            '</div>'
          );
        });
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'brand_dashboard\')">&larr; Dashboard</button>' +
            '<div class="bp-list-header">' +
              '<h1>Producten</h1>' +
              '<button class="bp-btn bp-btn-primair" onclick="DY.brandPortal.nieuwProduct()" data-testid="brand-product-nieuw">+ Nieuw product</button>' +
            '</div>' +
            (rows.length ? '<div class="bp-list">' + rows.join('') + '</div>'
              : emptyHTML('Nog geen producten', 'Voeg je eerste product toe om zichtbaar te zijn in de Merken-tab.',
                '<button class="bp-btn bp-btn-primair" onclick="DY.brandPortal.nieuwProduct()" data-testid="brand-product-empty-cta">+ Nieuw product</button>')) +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon producten niet laden', e.message) + '</div>';
      }
    };

    BP._huidigProductId = null;
    BP.nieuwProduct = function() { BP._huidigProductId = null; DY.navigeer('brand_product_nieuw'); };
    BP.bewerkProduct = function(id) { BP._huidigProductId = id; DY.navigeer('brand_product_nieuw'); };
    BP.verwijderProduct = async function(id) {
      if (!confirm('Product permanent verwijderen?')) return;
      try {
        // Soft-delete: status = 'verwijderd'
        await DY.db.collection('brand_products').doc(id).set({
          status: 'verwijderd', verwijderdAt: nu()
        }, { merge: true });
        toast('Product verwijderd.');
        BP.renderProducten();
      } catch(e) { toast('Verwijderen mislukt: ' + e.message, true); }
    };

    BP.renderProductForm = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '40px';
      var brand = await BP.getBrand();
      if (!brand || brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }
      var bewerken = !!BP._huidigProductId;
      var p = {};
      if (bewerken) {
        try {
          var s = await DY.db.collection('brand_products').doc(BP._huidigProductId).get();
          if (s.exists) p = s.data();
        } catch(e) {}
      }
      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<button class="bp-back" onclick="DY.navigeer(\'brand_producten\')">&larr; Producten</button>' +
          '<h1>' + (bewerken ? 'Product bewerken' : 'Nieuw product') + '</h1>' +
          '<form id="bp-product-form" novalidate>' +
            '<label class="bp-veld"><span>Titel *</span><input name="titel" required maxlength="120" data-testid="bp-prod-titel" value="' + esc(p.titel||'') + '"></label>' +
            '<label class="bp-veld"><span>Categorie *</span><select name="categorie" required data-testid="bp-prod-cat">' +
              '<option value="">Kies...</option>' +
              CATEGORIEEN.map(function(c){ return '<option value="' + esc(c) + '"' + (p.categorie===c?' selected':'') + '>' + esc(c) + '</option>'; }).join('') +
            '</select></label>' +
            '<label class="bp-veld"><span>Beschrijving</span><textarea name="omschrijving" maxlength="600" rows="4" data-testid="bp-prod-omschr">' + esc(p.omschrijving||'') + '</textarea></label>' +
            '<div class="bp-grid-2">' +
              '<label class="bp-veld"><span>Prijs (€) *</span><input type="number" name="prijs" required min="0" step="0.01" data-testid="bp-prod-prijs" value="' + esc(p.prijs||'') + '"></label>' +
              '<label class="bp-veld"><span>Voorraad</span><input type="number" name="voorraad" min="0" data-testid="bp-prod-stock" value="' + esc(p.voorraad||'') + '"></label>' +
            '</div>' +
            '<label class="bp-veld"><span>Maten (komma-gescheiden)</span><input name="maten" placeholder="bv. 42, 44, 46" data-testid="bp-prod-maten" value="' + esc((p.maten||[]).join(', ')) + '"></label>' +
            '<label class="bp-veld"><span>Kleuren (komma-gescheiden)</span><input name="kleuren" placeholder="bv. zwart, rood, beige" data-testid="bp-prod-kleuren" value="' + esc((p.kleuren||[]).join(', ')) + '"></label>' +
            '<label class="bp-veld"><span>Product URL * (waar klant heen gaat)</span><input type="url" name="url" required placeholder="https://" data-testid="bp-prod-url" value="' + esc(p.url||'') + '"></label>' +
            '<label class="bp-veld"><span>Tracking ID (UTM/affiliate)</span><input name="trackingId" maxlength="80" data-testid="bp-prod-tracking" value="' + esc(p.trackingId||'') + '"></label>' +
            '<label class="bp-veld"><span>Afbeeldingen (tot 4, max 3 MB elk)</span><input type="file" name="afbeeldingen" accept="image/png,image/jpeg,image/webp" multiple data-testid="bp-prod-imgs"></label>' +
            ((p.afbeeldingen && p.afbeeldingen.length)
              ? '<div class="bp-prod-img-preview">' + p.afbeeldingen.map(function(a){ return '<img src="' + esc(a) + '" alt="">'; }).join('') + '</div>'
              : '') +
            '<label class="bp-veld"><span>Status</span><select name="status" data-testid="bp-prod-status">' +
              '<option value="concept"' + ((p.status||'concept')==='concept'?' selected':'') + '>Concept (niet zichtbaar)</option>' +
              '<option value="actief"'  + (p.status==='actief'?' selected':'') + '>Actief (zichtbaar)</option>' +
            '</select></label>' +
            '<div class="bp-form-fouten" id="bp-prod-fouten"></div>' +
            '<button type="submit" class="bp-btn bp-btn-primair" data-testid="bp-prod-submit">' + (bewerken ? 'Wijzigingen opslaan' : 'Product aanmaken') + '</button>' +
          '</form>' +
        '</div>';

      document.getElementById('bp-product-form').addEventListener('submit', async function(ev) {
        ev.preventDefault();
        var foutBox = document.getElementById('bp-prod-fouten');
        foutBox.textContent = '';
        if (!rateLimitOK('product_save', 1500)) { foutBox.textContent = 'Even rustig...'; return; }
        var d = new FormData(ev.target);
        var v = {
          titel: (d.get('titel')||'').trim(),
          categorie: (d.get('categorie')||'').trim(),
          omschrijving: (d.get('omschrijving')||'').trim(),
          prijs: +(d.get('prijs')||0),
          voorraad: +(d.get('voorraad')||0),
          maten: (d.get('maten')||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean),
          kleuren: (d.get('kleuren')||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean),
          url: (d.get('url')||'').trim(),
          trackingId: (d.get('trackingId')||'').trim(),
          status: (d.get('status')||'concept').trim(),
          afbFiles: d.getAll('afbeeldingen')
        };
        var errs = [];
        if (!v.titel) errs.push('Titel ontbreekt.');
        if (!v.categorie) errs.push('Categorie ontbreekt.');
        if (!URL_RX.test(v.url)) errs.push('URL moet beginnen met https://');
        if (!(v.prijs >= 0)) errs.push('Prijs is ongeldig.');
        if (v.afbFiles && v.afbFiles.length > 4) errs.push('Max 4 afbeeldingen.');
        if (errs.length) { foutBox.innerHTML = errs.map(esc).join('<br>'); return; }

        var btn = ev.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Bezig...';
        try {
          var docRef = bewerken
            ? DY.db.collection('brand_products').doc(BP._huidigProductId)
            : DY.db.collection('brand_products').doc();

          // Upload nieuwe afbeeldingen
          var nieuweAfb = [];
          if (v.afbFiles && v.afbFiles.length && v.afbFiles[0].size) {
            for (var i=0; i<Math.min(v.afbFiles.length, 4); i++) {
              var f = v.afbFiles[i];
              if (!f || !f.size) continue;
              if (f.size > 3*1024*1024) continue;
              try {
                var path = 'brand_products/' + uid() + '/' + docRef.id + '/img_' + Date.now() + '_' + i;
                var ref = firebase.storage().ref().child(path);
                var ss = await ref.put(f);
                nieuweAfb.push(await ss.ref.getDownloadURL());
              } catch(e) {}
            }
          }

          var payload = {
            brandId: uid(),
            brandNaam: brand.naam,
            titel: v.titel, categorie: v.categorie, omschrijving: v.omschrijving,
            prijs: v.prijs, voorraad: v.voorraad,
            maten: v.maten, kleuren: v.kleuren,
            url: v.url, trackingId: v.trackingId,
            status: v.status,
            laatsteUpdate: nu()
          };
          if (nieuweAfb.length) payload.afbeeldingen = nieuweAfb;
          else if (!bewerken) payload.afbeeldingen = [];
          if (!bewerken) payload.aangemaakt = nu();

          await docRef.set(payload, { merge: true });
          toast(bewerken ? 'Product bijgewerkt.' : 'Product aangemaakt.');
          BP._huidigProductId = null;
          DY.navigeer('brand_producten');
        } catch(err) {
          foutBox.textContent = 'Opslaan mislukt: ' + (err.message || err);
          btn.disabled = false; btn.textContent = bewerken ? 'Wijzigingen opslaan' : 'Product aanmaken';
        }
      });
    };

    // ════════════════════════════════════════════════════════════════════
    // CAMPAGNES
    // ════════════════════════════════════════════════════════════════════
    BP.renderCampagnes = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      var brand = await BP.getBrand();
      if (!brand || brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }

      try {
        var snap = await DY.db.collection('campaigns').where('brandId','==', uid()).orderBy('aangemaakt','desc').limit(50).get();
        var rows = [];
        snap.forEach(function(d) {
          var c = d.data();
          rows.push(
            '<div class="bp-list-rij" data-testid="brand-campagne-rij-' + esc(d.id) + '">' +
              '<div class="bp-list-info">' +
                '<div class="bp-list-titel">' + esc(c.naam || 'Naamloos') + ' ' + badge(c.status||'draft') + '</div>' +
                '<div class="bp-list-meta">' +
                  fmtDatum(c.startDatum) + ' — ' + fmtDatum(c.eindDatum) + ' · ' +
                  'Budget ' + fmtEuro(c.totaalBudget||0) + ' · ' +
                  fmtNum(c.impressies||0) + ' impressies · ' +
                  fmtNum(c.clicks||0) + ' clicks' +
                '</div>' +
              '</div>' +
              '<div class="bp-list-acties">' +
                '<button class="bp-btn-mini" onclick="DY.brandPortal.bewerkCampagne(\'' + esc(d.id) + '\')" data-testid="brand-camp-edit-' + esc(d.id) + '">Bewerken</button>' +
                (c.status === 'live' ? '<button class="bp-btn-mini" onclick="DY.brandPortal.pauseCampagne(\'' + esc(d.id) + '\')" data-testid="brand-camp-pause-' + esc(d.id) + '">Pauzeer</button>' : '') +
                (c.status === 'paused' ? '<button class="bp-btn-mini" onclick="DY.brandPortal.resumeCampagne(\'' + esc(d.id) + '\')" data-testid="brand-camp-resume-' + esc(d.id) + '">Hervat</button>' : '') +
              '</div>' +
            '</div>'
          );
        });
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'brand_dashboard\')">&larr; Dashboard</button>' +
            '<div class="bp-list-header">' +
              '<h1>Campagnes</h1>' +
              '<button class="bp-btn bp-btn-primair" onclick="DY.brandPortal.nieuweCampagne()" data-testid="brand-camp-nieuw">+ Nieuwe campagne</button>' +
            '</div>' +
            (rows.length ? '<div class="bp-list">' + rows.join('') + '</div>'
              : emptyHTML('Nog geen campagnes', 'Maak je eerste campagne om bereik op te bouwen.',
                '<button class="bp-btn bp-btn-primair" onclick="DY.brandPortal.nieuweCampagne()" data-testid="brand-camp-empty-cta">+ Nieuwe campagne</button>')) +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon campagnes niet laden', e.message) + '</div>';
      }
    };

    BP._huidigCampagneId = null;
    BP.nieuweCampagne = function() { BP._huidigCampagneId = null; DY.navigeer('brand_campagne_nieuw'); };
    BP.bewerkCampagne = function(id) { BP._huidigCampagneId = id; DY.navigeer('brand_campagne_nieuw'); };
    BP.pauseCampagne = async function(id) {
      try {
        await DY.db.collection('campaigns').doc(id).set({ status:'paused', laatsteUpdate: nu() }, { merge:true });
        await DY.db.collection('brand_admin_log').add({ type:'campaign_paused', campaignId:id, door: uid(), ts: nu() }).catch(function(){});
        BP.renderCampagnes();
      } catch(e) { toast('Mislukt: ' + e.message, true); }
    };
    BP.resumeCampagne = async function(id) {
      try {
        await DY.db.collection('campaigns').doc(id).set({ status:'live', laatsteUpdate: nu() }, { merge:true });
        await DY.db.collection('brand_admin_log').add({ type:'campaign_resumed', campaignId:id, door: uid(), ts: nu() }).catch(function(){});
        BP.renderCampagnes();
      } catch(e) { toast('Mislukt: ' + e.message, true); }
    };

    BP.renderCampagneForm = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '40px';
      var brand = await BP.getBrand();
      if (!brand || brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }
      var bewerken = !!BP._huidigCampagneId;
      var c = {};
      if (bewerken) {
        try {
          var s = await DY.db.collection('campaigns').doc(BP._huidigCampagneId).get();
          if (s.exists) c = s.data();
        } catch(e) {}
      }
      var vandaag = new Date().toISOString().slice(0,10);
      var startVal = c.startDatum && c.startDatum.toDate ? c.startDatum.toDate().toISOString().slice(0,10) : (c.startDatum||vandaag);
      var eindVal  = c.eindDatum  && c.eindDatum.toDate  ? c.eindDatum.toDate().toISOString().slice(0,10)  : (c.eindDatum||'');
      var plaatsings = c.plaatsingen || ['feed'];

      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<button class="bp-back" onclick="DY.navigeer(\'brand_campagnes\')">&larr; Campagnes</button>' +
          '<h1>' + (bewerken ? 'Campagne bewerken' : 'Nieuwe campagne') + '</h1>' +
          '<form id="bp-camp-form" novalidate>' +
            '<label class="bp-veld"><span>Campagnenaam *</span><input name="naam" required maxlength="80" data-testid="bp-camp-naam" value="' + esc(c.naam||'') + '"></label>' +
            '<div class="bp-grid-2">' +
              '<label class="bp-veld"><span>Startdatum *</span><input type="date" name="startDatum" required min="' + esc(vandaag) + '" data-testid="bp-camp-start" value="' + esc(startVal) + '"></label>' +
              '<label class="bp-veld"><span>Einddatum *</span><input type="date" name="eindDatum" required data-testid="bp-camp-eind" value="' + esc(eindVal) + '"></label>' +
            '</div>' +
            '<div class="bp-grid-2">' +
              '<label class="bp-veld"><span>Totaalbudget (€) *</span><input type="number" name="totaalBudget" min="0" step="1" required data-testid="bp-camp-budget" value="' + esc(c.totaalBudget||'') + '"></label>' +
              '<label class="bp-veld"><span>Dagbudget (€)</span><input type="number" name="dagBudget" min="0" step="1" data-testid="bp-camp-dagbudget" value="' + esc(c.dagBudget||'') + '"></label>' +
            '</div>' +
            '<label class="bp-veld"><span>Biedstrategie</span><select name="biedstrategie" data-testid="bp-camp-bied">' +
              '<option value="cpc"' + (c.biedstrategie==='cpc'?' selected':'') + '>CPC (cost per click)</option>' +
              '<option value="cpm"' + (c.biedstrategie==='cpm'?' selected':'') + '>CPM (cost per 1000 impressies)</option>' +
              '<option value="cpa"' + (c.biedstrategie==='cpa'?' selected':'') + '>CPA (cost per acquisitie)</option>' +
            '</select></label>' +
            '<label class="bp-veld"><span>Doel</span><select name="doel" data-testid="bp-camp-doel">' +
              DOELEN.map(function(d){ return '<option value="' + esc(d.id) + '"' + (c.doel===d.id?' selected':'') + '>' + esc(d.label) + '</option>'; }).join('') +
            '</select></label>' +
            '<div class="bp-veld bp-veld-multi"><span>Plaatsingen *</span><div class="bp-checklist">' +
              PLAATSINGEN.map(function(p){
                var checked = plaatsings.indexOf(p.id) !== -1;
                return '<label class="bp-checkitem"><input type="checkbox" name="plaatsingen" value="' + esc(p.id) + '"' + (checked?' checked':'') + ' data-testid="bp-camp-plaats-' + esc(p.id) + '"> ' + esc(p.label) + '</label>';
              }).join('') +
            '</div></div>' +
            '<label class="bp-veld"><span>Bericht / call-to-action (max 140 tekens)</span><textarea name="boodschap" maxlength="140" rows="2" data-testid="bp-camp-msg">' + esc(c.boodschap||'') + '</textarea></label>' +
            '<label class="bp-veld"><span>Status</span><select name="status" data-testid="bp-camp-status">' +
              '<option value="draft"' + ((c.status||'draft')==='draft'?' selected':'') + '>Concept</option>' +
              '<option value="review"' + (c.status==='review'?' selected':'') + '>Indienen voor review</option>' +
            '</select></label>' +
            '<div class="bp-form-fouten" id="bp-camp-fouten"></div>' +
            '<button type="submit" class="bp-btn bp-btn-primair" data-testid="bp-camp-submit">' + (bewerken ? 'Wijzigingen opslaan' : 'Campagne aanmaken') + '</button>' +
          '</form>' +
        '</div>';

      document.getElementById('bp-camp-form').addEventListener('submit', async function(ev) {
        ev.preventDefault();
        var foutBox = document.getElementById('bp-camp-fouten');
        foutBox.textContent = '';
        if (!rateLimitOK('campagne_save', 1500)) { foutBox.textContent = 'Even rustig...'; return; }
        var f = new FormData(ev.target);
        var plaatsingenSel = f.getAll('plaatsingen');
        var v = {
          naam: (f.get('naam')||'').trim(),
          startDatum: (f.get('startDatum')||'').trim(),
          eindDatum: (f.get('eindDatum')||'').trim(),
          totaalBudget: +(f.get('totaalBudget')||0),
          dagBudget: +(f.get('dagBudget')||0),
          biedstrategie: (f.get('biedstrategie')||'cpc').trim(),
          doel: (f.get('doel')||'traffic').trim(),
          plaatsingen: plaatsingenSel,
          boodschap: (f.get('boodschap')||'').trim(),
          status: (f.get('status')||'draft').trim()
        };
        var errs = [];
        if (!v.naam) errs.push('Naam ontbreekt.');
        if (!v.startDatum) errs.push('Startdatum ontbreekt.');
        if (!v.eindDatum) errs.push('Einddatum ontbreekt.');
        if (v.eindDatum && v.startDatum && v.eindDatum < v.startDatum) errs.push('Einddatum mag niet vóór startdatum liggen.');
        if (!(v.totaalBudget > 0)) errs.push('Totaalbudget moet > 0 zijn.');
        if (v.dagBudget && v.dagBudget > v.totaalBudget) errs.push('Dagbudget mag niet groter zijn dan totaalbudget.');
        if (!plaatsingenSel.length) errs.push('Selecteer minimaal één plaatsing.');
        if (errs.length) { foutBox.innerHTML = errs.map(esc).join('<br>'); return; }

        var btn = ev.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Bezig...';
        try {
          var ref = bewerken
            ? DY.db.collection('campaigns').doc(BP._huidigCampagneId)
            : DY.db.collection('campaigns').doc();
          var payload = {
            brandId: uid(),
            brandNaam: brand.naam,
            naam: v.naam,
            startDatum: new Date(v.startDatum),
            eindDatum: new Date(v.eindDatum + 'T23:59:59'),
            totaalBudget: v.totaalBudget,
            dagBudget: v.dagBudget,
            biedstrategie: v.biedstrategie,
            doel: v.doel,
            plaatsingen: v.plaatsingen,
            boodschap: v.boodschap,
            status: v.status,
            laatsteUpdate: nu()
          };
          if (!bewerken) {
            payload.aangemaakt = nu();
            payload.impressies = 0; payload.clicks = 0; payload.spend = 0;
          }
          await ref.set(payload, { merge: true });
          await DY.db.collection('brand_admin_log').add({
            type: bewerken ? 'campaign_updated' : 'campaign_created',
            campaignId: ref.id, brandId: uid(), brandNaam: brand.naam,
            naam: v.naam, status: v.status, door: uid(), ts: nu()
          }).catch(function(){});
          toast(bewerken ? 'Campagne bijgewerkt.' : 'Campagne aangemaakt.');
          BP._huidigCampagneId = null;
          DY.navigeer('brand_campagnes');
        } catch(err) {
          foutBox.textContent = 'Opslaan mislukt: ' + (err.message||err);
          btn.disabled = false; btn.textContent = bewerken ? 'Wijzigingen opslaan' : 'Campagne aanmaken';
        }
      });
    };

    // ════════════════════════════════════════════════════════════════════
    // BRAND ANALYTICS
    // ════════════════════════════════════════════════════════════════════
    BP.renderAnalytics = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      var brand = await BP.getBrand();
      if (!brand || brand.status !== 'approved') { DY.navigeer('brand_pending'); return; }
      try {
        var snap = await DY.db.collection('campaigns').where('brandId','==', uid()).get();
        var rows = []; var totImp=0, totClk=0, totSpend=0;
        snap.forEach(function(d) {
          var c = d.data();
          totImp   += c.impressies||0;
          totClk   += c.clicks||0;
          totSpend += c.spend||0;
          rows.push({
            id:d.id, naam:c.naam, status:c.status,
            impressies:c.impressies||0, clicks:c.clicks||0,
            spend:c.spend||0,
            ctr: (c.impressies>0 ? ((c.clicks||0)/c.impressies*100).toFixed(2) : '0.00'),
            roas: (c.spend>0 ? ((c.omzet||0)/c.spend).toFixed(2) : '—'),
            startDatum:c.startDatum, eindDatum:c.eindDatum
          });
        });
        var ctrTot = totImp>0 ? ((totClk/totImp)*100).toFixed(2) + '%' : '—';
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'brand_dashboard\')">&larr; Dashboard</button>' +
            '<div class="bp-list-header">' +
              '<h1>Analytics</h1>' +
              '<button class="bp-btn bp-btn-ghost" onclick="DY.brandPortal.exportCSV()" data-testid="brand-analytics-export">Exporteer CSV</button>' +
            '</div>' +
            '<div class="bp-stat-grid">' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(totImp)+ '</span><span class="bp-stat-lbl">Impressies</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(totClk)+ '</span><span class="bp-stat-lbl">Clicks</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + ctrTot      + '</span><span class="bp-stat-lbl">CTR</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtEuro(totSpend) + '</span><span class="bp-stat-lbl">Spend</span></div>' +
            '</div>' +
            (rows.length ? renderAnalyticsTabel(rows) : emptyHTML('Nog geen analytics', 'Zodra je campagnes live zijn verschijnen hier de cijfers.')) +
          '</div>';
        BP._analyticsRows = rows;
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon analytics niet laden', e.message) + '</div>';
      }
    };

    function renderAnalyticsTabel(rows) {
      return '<div class="bp-tabel-wrap"><table class="bp-tabel">' +
        '<thead><tr><th>Campagne</th><th>Status</th><th>Impressies</th><th>Clicks</th><th>CTR</th><th>Spend</th><th>ROAS</th></tr></thead>' +
        '<tbody>' + rows.map(function(r) {
          return '<tr>' +
            '<td>' + esc(r.naam||'—') + '</td>' +
            '<td>' + badge(r.status||'draft') + '</td>' +
            '<td>' + fmtNum(r.impressies) + '</td>' +
            '<td>' + fmtNum(r.clicks) + '</td>' +
            '<td>' + r.ctr + '%</td>' +
            '<td>' + fmtEuro(r.spend) + '</td>' +
            '<td>' + r.roas + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div>';
    }

    BP.exportCSV = function() {
      try {
        var rows = BP._analyticsRows || [];
        var lines = [['Campagne','Status','Impressies','Clicks','CTR%','Spend EUR','ROAS','Start','Eind'].join(',')];
        rows.forEach(function(r) {
          lines.push([
            '"' + (r.naam||'').replace(/"/g,'""') + '"',
            r.status||'', r.impressies, r.clicks, r.ctr, r.spend, r.roas,
            fmtDatum(r.startDatum), fmtDatum(r.eindDatum)
          ].join(','));
        });
        var blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'analytics_' + new Date().toISOString().slice(0,10) + '.csv';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      } catch(e) { toast('Export mislukt', true); }
    };

    // ════════════════════════════════════════════════════════════════════
    // ADMIN — BRAND MANAGEMENT
    // ════════════════════════════════════════════════════════════════════
    BP.renderAdminBrands = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      if (!isAdmin()) { DY.navigeer('feed'); return; }
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      try {
        var snap = await DY.db.collection('brands').orderBy('aangemaakt','desc').limit(200).get();
        var byStatus = { pending:[], approved:[], rejected:[], suspended:[] };
        snap.forEach(function(d) {
          var b = d.data(); b.id = d.id;
          (byStatus[b.status]||(byStatus.pending)).push(b);
        });
        function rij(b) {
          return '<div class="bp-list-rij" data-testid="admin-brand-rij-' + esc(b.id) + '">' +
            '<div class="bp-list-img">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '🏷️') + '</div>' +
            '<div class="bp-list-info">' +
              '<div class="bp-list-titel">' + esc(b.naam) + ' ' + badge(b.status) + '</div>' +
              '<div class="bp-list-meta">' + esc(b.categorie||'') + ' · ' + esc(b.contactEmail||'') + ' · ' + fmtDatum(b.aangemaakt) + '</div>' +
              (b.website ? '<a class="bp-mini-link" href="' + esc(b.website) + '" target="_blank" rel="noopener">' + esc(b.website) + '</a>' : '') +
            '</div>' +
            '<div class="bp-list-acties">' +
              (b.status === 'pending' || b.status === 'rejected' || b.status === 'suspended'
                ? '<button class="bp-btn-mini bp-btn-mini-groen" onclick="DY.brandPortal.adminBrand(\'approve\',\'' + esc(b.id) + '\')" data-testid="admin-brand-approve-' + esc(b.id) + '">Goedkeuren</button>' : '') +
              (b.status === 'pending' || b.status === 'approved'
                ? '<button class="bp-btn-mini bp-btn-mini-rood" onclick="DY.brandPortal.adminBrand(\'reject\',\'' + esc(b.id) + '\')" data-testid="admin-brand-reject-' + esc(b.id) + '">Afwijzen</button>' : '') +
              (b.status === 'approved'
                ? '<button class="bp-btn-mini bp-btn-mini-rood" onclick="DY.brandPortal.adminBrand(\'suspend\',\'' + esc(b.id) + '\')" data-testid="admin-brand-suspend-' + esc(b.id) + '">Blokkeer</button>' : '') +
            '</div>' +
          '</div>';
        }
        function sectie(titel, lst, kleur) {
          if (!lst.length) return '';
          return '<h2 class="bp-admin-sectie-titel" style="color:' + kleur + '">' + esc(titel) + ' (' + lst.length + ')</h2>' +
                 '<div class="bp-list">' + lst.map(rij).join('') + '</div>';
        }
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
            '<div class="bp-list-header">' +
              '<h1>Merken — Admin</h1>' +
              '<div class="bp-admin-tabs">' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_brands\')" data-testid="admin-tab-brands">Merken</button>' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_campagnes\')" data-testid="admin-tab-campagnes">Campagnes</button>' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_inkomsten\')" data-testid="admin-tab-inkomsten">Inkomsten</button>' +
              '</div>' +
            '</div>' +
            sectie('In review', byStatus.pending,   '#e6b34a') +
            sectie('Goedgekeurd', byStatus.approved, '#7fbf6f') +
            sectie('Afgewezen',   byStatus.rejected, '#e07b7b') +
            sectie('Geblokkeerd', byStatus.suspended,'#999') +
            (!snap.size ? emptyHTML('Geen merken gevonden') : '') +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon merken niet laden', e.message) + '</div>';
      }
    };

    BP.adminBrand = async function(actie, brandId) {
      if (!isAdmin()) return;
      var reden = '';
      if (actie === 'reject' || actie === 'suspend') {
        reden = prompt(actie === 'reject' ? 'Reden voor afwijzing:' : 'Reden voor blokkade:');
        if (reden === null) return;
      }
      var nieuwStatus = ({ approve:'approved', reject:'rejected', suspend:'suspended', restore:'approved' })[actie];
      if (!nieuwStatus) return;
      try {
        var update = { status: nieuwStatus, laatsteUpdate: nu(), moderatedBy: uid(), moderatedAt: nu() };
        if (actie === 'reject') update.afgekeurdReden = reden;
        if (actie === 'suspend') update.suspendReden = reden;
        if (actie === 'approve') update.goedgekeurdAt = nu();
        await DY.db.collection('brands').doc(brandId).set(update, { merge: true });
        await DY.db.collection('brand_admin_log').add({
          type: 'brand_' + actie, brandId: brandId, door: uid(), reden: reden, ts: nu()
        }).catch(function(){});
        toast('Actie voltooid.');
        BP.renderAdminBrands();
      } catch(e) { toast('Actie mislukt: ' + e.message, true); }
    };

    // ════════════════════════════════════════════════════════════════════
    // ADMIN — CAMPAIGN CONTROL
    // ════════════════════════════════════════════════════════════════════
    BP.renderAdminCampagnes = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      if (!isAdmin()) { DY.navigeer('feed'); return; }
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      try {
        var snap = await DY.db.collection('campaigns').orderBy('aangemaakt','desc').limit(200).get();
        var rows = [];
        snap.forEach(function(d) {
          var c = d.data();
          rows.push(
            '<div class="bp-list-rij" data-testid="admin-camp-rij-' + esc(d.id) + '">' +
              '<div class="bp-list-info">' +
                '<div class="bp-list-titel">' + esc(c.naam||'—') + ' ' + badge(c.status||'draft') + '</div>' +
                '<div class="bp-list-meta">' + esc(c.brandNaam||'') + ' · ' + fmtDatum(c.startDatum) + ' — ' + fmtDatum(c.eindDatum) + ' · ' + fmtEuro(c.totaalBudget||0) + '</div>' +
                '<div class="bp-list-meta">' + fmtNum(c.impressies||0) + ' impr · ' + fmtNum(c.clicks||0) + ' clk · spend ' + fmtEuro(c.spend||0) + '</div>' +
              '</div>' +
              '<div class="bp-list-acties">' +
                (c.status === 'review' ? '<button class="bp-btn-mini bp-btn-mini-groen" onclick="DY.brandPortal.adminCamp(\'approve\',\'' + esc(d.id) + '\')" data-testid="admin-camp-approve-' + esc(d.id) + '">Goedkeur &amp; live</button>' : '') +
                (c.status === 'live' ? '<button class="bp-btn-mini" onclick="DY.brandPortal.adminCamp(\'pause\',\'' + esc(d.id) + '\')" data-testid="admin-camp-pause-' + esc(d.id) + '">Pauzeer</button>' : '') +
                (c.status === 'paused' ? '<button class="bp-btn-mini" onclick="DY.brandPortal.adminCamp(\'resume\',\'' + esc(d.id) + '\')" data-testid="admin-camp-resume-' + esc(d.id) + '">Hervat</button>' : '') +
                (c.status !== 'completed' ? '<button class="bp-btn-mini bp-btn-mini-rood" onclick="DY.brandPortal.adminCamp(\'end\',\'' + esc(d.id) + '\')" data-testid="admin-camp-end-' + esc(d.id) + '">Beëindig</button>' : '') +
                '<button class="bp-btn-mini" onclick="DY.brandPortal.adminCampBudget(\'' + esc(d.id) + '\')" data-testid="admin-camp-budget-' + esc(d.id) + '">Budget</button>' +
              '</div>' +
            '</div>'
          );
        });
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
            '<div class="bp-list-header">' +
              '<h1>Campagnes — Admin</h1>' +
              '<div class="bp-admin-tabs">' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_brands\')">Merken</button>' +
                '<button class="bp-tab bp-tab-active" onclick="DY.navigeer(\'admin_campagnes\')">Campagnes</button>' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_inkomsten\')">Inkomsten</button>' +
              '</div>' +
            '</div>' +
            (rows.length ? '<div class="bp-list">' + rows.join('') + '</div>' : emptyHTML('Nog geen campagnes')) +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon campagnes niet laden', e.message) + '</div>';
      }
    };

    BP.adminCamp = async function(actie, id) {
      if (!isAdmin()) return;
      var map = { approve:'live', pause:'paused', resume:'live', end:'completed' };
      var status = map[actie]; if (!status) return;
      try {
        await DY.db.collection('campaigns').doc(id).set({ status: status, laatsteUpdate: nu(), moderatedBy: uid(), moderatedAt: nu() }, { merge: true });
        await DY.db.collection('brand_admin_log').add({ type:'campaign_'+actie, campaignId:id, door: uid(), ts: nu() }).catch(function(){});
        toast('Status gewijzigd.');
        BP.renderAdminCampagnes();
      } catch(e) { toast('Mislukt: ' + e.message, true); }
    };

    BP.adminCampBudget = async function(id) {
      if (!isAdmin()) return;
      var nieuw = prompt('Nieuw totaalbudget (€) — laat leeg om te annuleren:');
      if (nieuw === null || nieuw === '') return;
      var n = +nieuw;
      if (!(n >= 0)) { toast('Ongeldig bedrag.', true); return; }
      try {
        await DY.db.collection('campaigns').doc(id).set({ totaalBudget: n, laatsteUpdate: nu() }, { merge: true });
        await DY.db.collection('brand_admin_log').add({ type:'campaign_budget_changed', campaignId:id, nieuwBudget:n, door: uid(), ts: nu() }).catch(function(){});
        BP.renderAdminCampagnes();
      } catch(e) { toast('Mislukt: ' + e.message, true); }
    };

    // ════════════════════════════════════════════════════════════════════
    // ADMIN — REVENUE DASHBOARD
    // ════════════════════════════════════════════════════════════════════
    BP.renderAdminInkomsten = async function() {
      var main = document.getElementById('dy-main');
      if (!main) return;
      main.style.background = '#0a0806';
      main.style.paddingBottom = '90px';
      if (!isAdmin()) { DY.navigeer('feed'); return; }
      main.innerHTML = '<div class="bp-page">' + loaderHTML() + '</div>';
      try {
        var snap = await DY.db.collection('campaigns').get();
        var nuTs = new Date();
        var startVanMaand = new Date(nuTs.getFullYear(), nuTs.getMonth(), 1);
        var startVanVandaag = new Date(nuTs.getFullYear(), nuTs.getMonth(), nuTs.getDate());
        var totVandaag = 0, totMaand = 0, totAlles = 0, actief = 0;
        var perMerk = {};
        snap.forEach(function(d) {
          var c = d.data();
          var spend = c.spend || 0;
          totAlles += spend;
          if (c.status === 'live' || c.status === 'paused') actief++;
          var laat = c.laatsteUpdate && c.laatsteUpdate.toDate ? c.laatsteUpdate.toDate() : null;
          if (laat) {
            if (laat >= startVanMaand) totMaand += spend;
            if (laat >= startVanVandaag) totVandaag += spend;
          }
          var k = c.brandNaam || c.brandId || 'Onbekend';
          perMerk[k] = (perMerk[k]||0) + spend;
        });
        var rij = Object.entries(perMerk).sort(function(a,b){ return b[1]-a[1]; }).slice(0,20);
        main.innerHTML =
          '<div class="bp-page">' +
            '<button class="bp-back" onclick="DY.navigeer(\'admin\')">&larr; Admin</button>' +
            '<div class="bp-list-header">' +
              '<h1>Inkomsten</h1>' +
              '<div class="bp-admin-tabs">' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_brands\')">Merken</button>' +
                '<button class="bp-tab" onclick="DY.navigeer(\'admin_campagnes\')">Campagnes</button>' +
                '<button class="bp-tab bp-tab-active" onclick="DY.navigeer(\'admin_inkomsten\')">Inkomsten</button>' +
              '</div>' +
            '</div>' +
            '<div class="bp-stat-grid">' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtEuro(totVandaag) + '</span><span class="bp-stat-lbl">Vandaag</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtEuro(totMaand)   + '</span><span class="bp-stat-lbl">Deze maand</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtEuro(totAlles)   + '</span><span class="bp-stat-lbl">Totaal</span></div>' +
              '<div class="bp-stat-kaart"><span class="bp-stat-num">' + fmtNum(actief)      + '</span><span class="bp-stat-lbl">Actieve campagnes</span></div>' +
            '</div>' +
            '<div class="bp-tabel-wrap"><table class="bp-tabel">' +
              '<thead><tr><th>Merk</th><th>Spend (lifetime)</th></tr></thead>' +
              '<tbody>' + (rij.length
                ? rij.map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td>' + fmtEuro(r[1]) + '</td></tr>'; }).join('')
                : '<tr><td colspan="2"><em>Nog geen data</em></td></tr>') +
              '</tbody></table></div>' +
          '</div>';
      } catch(e) {
        main.innerHTML = '<div class="bp-page">' + emptyHTML('Kon inkomsten niet laden', e.message) + '</div>';
      }
    };

    // ── Update BP_PAGES nu alle functies bestaan ─────────────────────────
    BP_PAGES.merken               = BP.renderMerken;
    BP_PAGES.brand_register       = BP.renderRegister;
    BP_PAGES.brand_login          = BP.renderBrandLogin;
    BP_PAGES.brand_pending        = BP.renderPending;
    BP_PAGES.brand_dashboard      = BP.renderDashboard;
    BP_PAGES.brand_producten      = BP.renderProducten;
    BP_PAGES.brand_product_nieuw  = BP.renderProductForm;
    BP_PAGES.brand_campagnes      = BP.renderCampagnes;
    BP_PAGES.brand_campagne_nieuw = BP.renderCampagneForm;
    BP_PAGES.brand_analytics      = BP.renderAnalytics;
    BP_PAGES.admin_brands         = BP.renderAdminBrands;
    BP_PAGES.admin_campagnes      = BP.renderAdminCampagnes;
    BP_PAGES.admin_inkomsten      = BP.renderAdminInkomsten;

    // ── Init: probeer direct knop te injecteren als profile al rendert ──
    setTimeout(injecteerProfielKnop, 600);

    // ── v60.1.5 FINAL FIX — polling-based force-render ──────────────────
    // Eerdere oplossingen leden aan async race conditions met onAuthReady.
    // Deze aanpak is brute-force maar bulletproof: elke 200ms voor 8 seconden
    // checken we of de URL nog een brand-portal pagina vraagt EN of #dy-main
    // onze content toont. Zo nee → forceer re-render. Stopt automatisch zodra
    // onze content zichtbaar is OF de URL niet meer een brand-portal route is.
    function startForceRenderPoller() {
      try {
        var qs0 = new URLSearchParams(location.search || '');
        var hash0 = (location.hash || '').replace(/^#\/?/, '');
        var wanted = qs0.get('pagina') || hash0 || '';
        if (!wanted || !Object.prototype.hasOwnProperty.call(BP_PAGES, wanted)) return;

        console.log('[brand-portal] deep-link gedetecteerd:', wanted, '— start force-render poller');
        BP._deeplink = wanted;
        BP._deeplinkAt = Date.now();

        var attempts = 0;
        var maxAttempts = 40; // 40 * 200ms = 8 seconden
        var iv = setInterval(function() {
          attempts++;

          // Stop als URL niet meer brand-portal is (user navigeerde weg)
          var qsNow = new URLSearchParams(location.search || '');
          var hashNow = (location.hash || '').replace(/^#\/?/, '');
          var w = qsNow.get('pagina') || hashNow || '';
          if (!w || !Object.prototype.hasOwnProperty.call(BP_PAGES, w)) {
            console.log('[brand-portal] URL veranderd, poller stopt');
            clearInterval(iv);
            return;
          }

          // Stop als onze content al aanwezig is (succes)
          var main = document.getElementById('dy-main');
          if (main && main.querySelector('.bp-page')) {
            console.log('[brand-portal] brand-portal content gerenderd na', attempts, 'pogingen');
            clearInterval(iv);
            return;
          }

          // Forceer re-render
          console.log('[brand-portal] poging', attempts, '— force render:', w);
          try {
            BP._deeplink = w;
            BP._deeplinkAt = Date.now();
            DY.pagina = null; // bypass de v60.1 stability guard
            DY._laatstGerenderd = null;
            DY.toonPagina(w);
          } catch(e) {
            console.warn('[brand-portal] force render fout:', e.message);
          }

          // Stop na max attempts
          if (attempts >= maxAttempts) {
            console.warn('[brand-portal] poller gestopt na', attempts, 'pogingen — content niet zichtbaar');
            clearInterval(iv);
          }
        }, 200);

        // Eerste poging meteen
        try { DY.toonPagina(wanted); } catch(e) {}
      } catch(e) {
        console.warn('[brand-portal] poller setup fout:', e.message);
      }
    }
    startForceRenderPoller();

    // ── Markeer geladen ──────────────────────────────────────────────────
    BP._loaded = true;
    BP._versie = 'v60.1-brand-portal-v1.5-poll';

  });
})();
