/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT - Brand Profile Enhancement Phase 1 (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Additief enhancement voor het merkenprofiel (BP.toonMerkDetail).
 * Wrapt de bestaande render zonder legacy code te wijzigen en voegt toe:
 *
 *   1. HERO uitbreiding:
 *      - banner (b.banner)
 *      - verificatie badge (b.geverifieerd)
 *      - sponsorlabel (b.sponsorActief)
 *      - slogan (b.slogan)
 *      - locatie (b.locatie)
 *      - sinds jaar (b.sinds)
 *      - CTA's: Volgen, Ontdek collectie, Website, Delen, Contact
 *
 *   2. "Over het merk" blok:
 *      - beschrijving, missie, visie, doelgroep, specialisaties,
 *        duurzaamheid, verzending, retour, keurmerken
 *      - alle velden optioneel; ontbreken -> verbergen
 *
 *   3. Statistieken:
 *      - aantal producten (live count uit brand_products)
 *      - aantal volgers (b.followers of live count uit brand_followers)
 *      - beoordeling + reviews (b.rating, b.reviewCount)
 *      - badges: nieuw, populair, geverifieerd
 *
 * Fallback: elk veld wordt verborgen wanneer leeg/ontbrekend.
 * Geen wijzigingen aan brand-portal-v1.js.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppBrandProfileInit) return;
  window.__ppBrandProfileInit = true;

  function log(msg) { try { console.log('[pp-brand-profile]', msg); } catch (_) {} }

  // ─── ESC helper ───────────────────────────────────────────────────────
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  // ─── CSS injectie (eenmalig) ──────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('pp-brand-profile-css')) return;
    var s = document.createElement('style');
    s.id = 'pp-brand-profile-css';
    s.textContent = [
      // ── Banner ───────────────────────────────────────────────────────
      '.pp-bp-banner{position:relative;width:100%;aspect-ratio:16/6;max-height:280px;overflow:hidden;border-radius:18px;margin:0 0 22px;background:linear-gradient(135deg,#1a140c,#0f0c08);border:1px solid rgba(212,145,10,0.18)}',
      '.pp-bp-banner img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}',
      '.pp-bp-banner-badges{position:absolute;top:14px;left:14px;display:flex;gap:6px;flex-wrap:wrap}',
      '.pp-bp-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;font:600 10.5px/1 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
      '.pp-bp-badge-verified{background:rgba(31,124,32,0.92);color:#f0fdf4;border:1px solid rgba(255,255,255,0.15)}',
      '.pp-bp-badge-sponsor{background:rgba(212,145,10,0.92);color:#0f0c08;border:1px solid rgba(255,255,255,0.15)}',
      '.pp-bp-badge-populair{background:linear-gradient(135deg,#f0b340,#d4910a);color:#0f0c08;border:1px solid rgba(255,255,255,0.15)}',
      '.pp-bp-badge-nieuw{background:rgba(41,120,203,0.92);color:#f0f9ff;border:1px solid rgba(255,255,255,0.15)}',
      // ── Hero meta info ───────────────────────────────────────────────
      '.pp-bp-slogan{font:400 clamp(0.95rem,2.2vw,1.15rem)/1.4 "DM Serif Display","Cormorant Garamond",serif;color:rgba(252,248,239,0.85);margin:6px 0 4px;font-style:italic}',
      '.pp-bp-meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px;font:500 12.5px/1.35 "DM Sans",sans-serif;color:rgba(252,248,239,0.65)}',
      '.pp-bp-meta-item{display:inline-flex;align-items:center;gap:5px}',
      '.pp-bp-meta-item svg{width:12px;height:12px;opacity:.75;flex-shrink:0}',
      // ── CTA bar ──────────────────────────────────────────────────────
      '.pp-bp-cta-bar{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}',
      '.pp-bp-cta{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:999px;font:600 13px/1 "DM Sans",sans-serif;letter-spacing:.01em;cursor:pointer;transition:all 0.18s ease;font-family:inherit;text-decoration:none;border:1px solid transparent;background:transparent;color:#fcf8ef;-webkit-tap-highlight-color:transparent}',
      '.pp-bp-cta-primary{background:linear-gradient(135deg,#f0b340,#d4910a);color:#0f0c08;border-color:#d4910a}',
      '.pp-bp-cta-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}',
      '.pp-bp-cta-primary[data-active="true"]{background:rgba(31,124,32,0.15);color:#8ee888;border-color:rgba(31,124,32,0.6)}',
      '.pp-bp-cta-ghost{border-color:rgba(245,236,224,0.18);color:rgba(245,236,224,0.85)}',
      '.pp-bp-cta-ghost:hover{border-color:#d4910a;color:#f0b340;background:rgba(212,145,10,0.08)}',
      '.pp-bp-cta[disabled],.pp-bp-cta[aria-disabled="true"]{opacity:0.4;cursor:not-allowed;pointer-events:none}',
      '.pp-bp-cta svg{width:14px;height:14px;flex-shrink:0}',
      // ── Over het merk ────────────────────────────────────────────────
      '.pp-bp-over{margin:28px 0 0;padding:20px;background:linear-gradient(155deg,rgba(212,145,10,0.06),rgba(20,16,12,0.4));border:1px solid rgba(245,236,224,0.08);border-radius:16px}',
      '.pp-bp-over-titel{font:400 clamp(1.15rem,2.6vw,1.4rem)/1.2 "DM Serif Display","Cormorant Garamond",serif;color:#fcf8ef;margin:0 0 14px;letter-spacing:-.01em}',
      '.pp-bp-over-tekst{font:400 .92rem/1.6 "DM Sans",sans-serif;color:rgba(252,248,239,0.78);margin:0 0 16px;word-break:break-word;white-space:pre-line}',
      '.pp-bp-over-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-top:6px}',
      '@media(min-width:640px){.pp-bp-over-grid{grid-template-columns:repeat(2,1fr)}}',
      '.pp-bp-over-blok h4{font:600 11.5px/1 "DM Sans",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d4910a;margin:0 0 6px}',
      '.pp-bp-over-blok p{font:400 .86rem/1.55 "DM Sans",sans-serif;color:rgba(252,248,239,0.72);margin:0;white-space:pre-line}',
      '.pp-bp-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}',
      '.pp-bp-tag{display:inline-flex;padding:3px 10px;border-radius:999px;font:500 11.5px/1.35 "DM Sans",sans-serif;color:rgba(245,236,224,0.82);background:rgba(255,255,255,0.05);border:1px solid rgba(245,236,224,0.10)}',
      // ── Statistieken ─────────────────────────────────────────────────
      '.pp-bp-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:22px 0 0;padding:16px;background:rgba(255,255,255,0.02);border:1px solid rgba(245,236,224,0.06);border-radius:14px}',
      '@media(min-width:560px){.pp-bp-stats{grid-template-columns:repeat(4,1fr)}}',
      '.pp-bp-stat{text-align:center;padding:6px 4px}',
      '.pp-bp-stat-num{font:700 clamp(1.15rem,3vw,1.55rem)/1 "DM Sans",sans-serif;color:#fcf8ef;letter-spacing:-.01em;display:block}',
      '.pp-bp-stat-lbl{font:500 10.5px/1.2 "DM Sans",sans-serif;letter-spacing:.10em;text-transform:uppercase;color:rgba(252,248,239,0.55);margin-top:3px;display:block}',
      // ── Toast ────────────────────────────────────────────────────────
      '.pp-bp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(20,16,12,0.96);color:#fcf8ef;padding:12px 20px;border-radius:999px;font:500 13px/1.3 "DM Sans",sans-serif;border:1px solid rgba(212,145,10,0.4);box-shadow:0 8px 32px rgba(0,0,0,0.4);animation:ppBpToastIn 0.24s ease}',
      '@keyframes ppBpToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ─── Utility: toast ───────────────────────────────────────────────────
  function toast(msg) {
    try {
      var t = document.createElement('div');
      t.className = 'pp-bp-toast';
      t.setAttribute('data-testid', 'pp-bp-toast');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
    } catch (_) {}
  }

  // ─── Firestore helpers ────────────────────────────────────────────────
  function db() {
    try { return (window.DY && window.DY.db) || null; } catch (_) { return null; }
  }
  function currentUid() {
    try { return (window.DY && window.DY.user && window.DY.user.uid) || null; } catch (_) { return null; }
  }

  // ─── SVG icons ────────────────────────────────────────────────────────
  var ICONS = {
    verified: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4 M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    externalLink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };

  // ─── Number formatting ────────────────────────────────────────────────
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '0';
    n = Number(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  // ─── Render: Banner + badges ──────────────────────────────────────────
  function buildBanner(b) {
    var badgesHtml = '';
    if (b.geverifieerd === true) {
      badgesHtml += '<span class="pp-bp-badge pp-bp-badge-verified" data-testid="pp-bp-badge-verified">' + ICONS.verified + ' Geverifieerd</span>';
    }
    if (b.sponsorActief === true || b.sponsorLabel) {
      var lbl = esc(b.sponsorLabel || 'Sponsor');
      badgesHtml += '<span class="pp-bp-badge pp-bp-badge-sponsor" data-testid="pp-bp-badge-sponsor">' + lbl + '</span>';
    }
    if (b.populair === true) {
      badgesHtml += '<span class="pp-bp-badge pp-bp-badge-populair" data-testid="pp-bp-badge-populair">Populair</span>';
    }
    if (b.nieuw === true) {
      badgesHtml += '<span class="pp-bp-badge pp-bp-badge-nieuw" data-testid="pp-bp-badge-nieuw">Nieuw</span>';
    }
    // Alleen banner tonen als er een banner-URL is
    if (!b.banner) {
      if (!badgesHtml) return '';
      return '<div class="pp-bp-banner" data-testid="pp-bp-banner"><div class="pp-bp-banner-badges">' + badgesHtml + '</div></div>';
    }
    return '<div class="pp-bp-banner" data-testid="pp-bp-banner">' +
      '<img src="' + esc(b.banner) + '" alt="' + esc(b.naam || '') + ' banner" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
      (badgesHtml ? '<div class="pp-bp-banner-badges">' + badgesHtml + '</div>' : '') +
    '</div>';
  }

  // ─── Render: Extended hero meta (slogan, locatie, sinds) ──────────────
  function buildHeroMeta(b) {
    var out = '';
    if (b.slogan && String(b.slogan).trim()) {
      out += '<p class="pp-bp-slogan" data-testid="pp-bp-slogan">' + esc(b.slogan) + '</p>';
    }
    var metaItems = [];
    if (b.locatie && String(b.locatie).trim()) {
      metaItems.push('<span class="pp-bp-meta-item" data-testid="pp-bp-locatie">' + ICONS.pin + ' ' + esc(b.locatie) + '</span>');
    }
    if (b.sinds) {
      metaItems.push('<span class="pp-bp-meta-item" data-testid="pp-bp-sinds">' + ICONS.cal + ' Sinds ' + esc(b.sinds) + '</span>');
    }
    if (metaItems.length) {
      out += '<div class="pp-bp-meta">' + metaItems.join('') + '</div>';
    }
    return out;
  }

  // ─── Render: CTA bar ──────────────────────────────────────────────────
  function buildCtas(b, brandId) {
    var uid = currentUid();
    var isFollowing = false; // wordt async gecontroleerd
    var out = '<div class="pp-bp-cta-bar" data-testid="pp-bp-cta-bar">';
    // Volgen
    out += '<button class="pp-bp-cta pp-bp-cta-primary" type="button" data-action="follow" data-brand-id="' + esc(brandId) + '" data-testid="pp-bp-cta-follow">' +
      ICONS.heart + ' <span data-role="label">Volgen</span>' +
    '</button>';
    // Ontdek collectie (scroll to product grid)
    out += '<button class="pp-bp-cta pp-bp-cta-ghost" type="button" data-action="scroll-products" data-testid="pp-bp-cta-collectie">' +
      ICONS.grid + ' Ontdek collectie' +
    '</button>';
    // Website (herhaling van bestaande website-link, maar in CTA styling)
    if (b.website && String(b.website).trim()) {
      out += '<a class="pp-bp-cta pp-bp-cta-ghost" href="' + esc(b.website) + '" target="_blank" rel="noopener nofollow" data-testid="pp-bp-cta-website">' +
        ICONS.externalLink + ' Website' +
      '</a>';
    }
    // Delen
    out += '<button class="pp-bp-cta pp-bp-cta-ghost" type="button" data-action="share" data-testid="pp-bp-cta-share">' +
      ICONS.share + ' Delen' +
    '</button>';
    // Contact (mailto:) - alleen als e-mail bekend
    if (b.email && String(b.email).trim()) {
      out += '<a class="pp-bp-cta pp-bp-cta-ghost" href="mailto:' + esc(b.email) + '" data-testid="pp-bp-cta-contact">' +
        ICONS.mail + ' Contact' +
      '</a>';
    }
    out += '</div>';
    return out;
  }

  // ─── Render: Over het merk blok ───────────────────────────────────────
  function buildOverBlok(b) {
    var blocks = [];
    // Uitgebreide beschrijving als hoofdtekst
    if (b.beschrijving && String(b.beschrijving).trim()) {
      // gebruik als hoofdtekst
    }
    // Extra info-blokken (naast/onder de beschrijving)
    var infoBlocks = [];
    function pushBlock(titel, waarde) {
      if (!waarde) return;
      var v = String(waarde).trim();
      if (!v) return;
      infoBlocks.push(
        '<div class="pp-bp-over-blok">' +
          '<h4>' + esc(titel) + '</h4>' +
          '<p>' + esc(v) + '</p>' +
        '</div>'
      );
    }
    pushBlock('Missie', b.missie);
    pushBlock('Visie', b.visie);
    pushBlock('Doelgroep', b.doelgroep);
    pushBlock('Duurzaamheid', b.duurzaamheid);
    pushBlock('Materialen', b.materialen);
    pushBlock('Verzending', b.verzending);
    pushBlock('Retourbeleid', b.retour);
    // Tags: specialisaties, keurmerken
    function tagsBlock(titel, arr) {
      if (!Array.isArray(arr) || !arr.length) return;
      var items = arr.filter(function (x) { return x && String(x).trim(); });
      if (!items.length) return;
      infoBlocks.push(
        '<div class="pp-bp-over-blok">' +
          '<h4>' + esc(titel) + '</h4>' +
          '<div class="pp-bp-tags">' +
            items.map(function (t) { return '<span class="pp-bp-tag">' + esc(t) + '</span>'; }).join('') +
          '</div>' +
        '</div>'
      );
    }
    tagsBlock('Specialisaties', b.specialisaties);
    tagsBlock('Keurmerken', b.keurmerken);
    // Als er GEEN content is, hele blok verbergen
    var hasDescription = b.beschrijving && String(b.beschrijving).trim();
    if (!hasDescription && !infoBlocks.length) return '';
    var html = '<section class="pp-bp-over" data-testid="pp-bp-over">' +
      '<h2 class="pp-bp-over-titel">Over het merk</h2>';
    if (hasDescription) {
      html += '<div class="pp-bp-over-tekst" data-testid="pp-bp-over-tekst">' + esc(b.beschrijving) + '</div>';
    }
    if (infoBlocks.length) {
      html += '<div class="pp-bp-over-grid">' + infoBlocks.join('') + '</div>';
    }
    html += '</section>';
    return html;
  }

  // ─── Render: Statistieken ─────────────────────────────────────────────
  function buildStats(stats) {
    var items = [];
    if (stats.producten != null) {
      items.push('<div class="pp-bp-stat" data-testid="pp-bp-stat-producten"><span class="pp-bp-stat-num">' + fmtNum(stats.producten) + '</span><span class="pp-bp-stat-lbl">Producten</span></div>');
    }
    if (stats.followers != null) {
      items.push('<div class="pp-bp-stat" data-testid="pp-bp-stat-volgers"><span class="pp-bp-stat-num">' + fmtNum(stats.followers) + '</span><span class="pp-bp-stat-lbl">Volgers</span></div>');
    }
    if (stats.rating != null && stats.rating > 0) {
      items.push('<div class="pp-bp-stat" data-testid="pp-bp-stat-rating"><span class="pp-bp-stat-num">' + Number(stats.rating).toFixed(1) + '★</span><span class="pp-bp-stat-lbl">' + (stats.reviewCount ? fmtNum(stats.reviewCount) + ' Reviews' : 'Beoordeling') + '</span></div>');
    }
    if (stats.collecties != null && stats.collecties > 0) {
      items.push('<div class="pp-bp-stat" data-testid="pp-bp-stat-collecties"><span class="pp-bp-stat-num">' + fmtNum(stats.collecties) + '</span><span class="pp-bp-stat-lbl">Collecties</span></div>');
    }
    if (!items.length) return '';
    return '<div class="pp-bp-stats" data-testid="pp-bp-stats">' + items.join('') + '</div>';
  }

  // ─── Async: check follow state + follower count ───────────────────────
  function updateFollowState(brandId) {
    var uid = currentUid();
    var d = db();
    if (!d) return;
    var followBtn = document.querySelector('.pp-bp-cta[data-action="follow"][data-brand-id="' + brandId + '"]');
    // Follower count (statistiek)
    d.collection('brand_followers').where('brandId', '==', brandId).get()
      .then(function (snap) {
        var count = snap ? snap.size : 0;
        // Update stat lijst (alleen als eerder gerenderd)
        var statEl = document.querySelector('[data-testid="pp-bp-stat-volgers"] .pp-bp-stat-num');
        if (statEl) statEl.textContent = fmtNum(count);
      })
      .catch(function (err) { log('follower count error: ' + (err && err.message)); });
    // Follow state van huidige user
    if (!uid || !followBtn) return;
    d.collection('brand_followers').where('brandId', '==', brandId).where('uid', '==', uid).limit(1).get()
      .then(function (snap) {
        var isFollowing = snap && snap.size > 0;
        followBtn.setAttribute('data-active', isFollowing ? 'true' : 'false');
        var lbl = followBtn.querySelector('[data-role="label"]');
        if (lbl) lbl.textContent = isFollowing ? 'Gevolgd' : 'Volgen';
      })
      .catch(function (err) { log('follow state check: ' + (err && err.message)); });
  }

  // ─── CTA click handler (delegated) ────────────────────────────────────
  function handleCtaClick(e) {
    var target = e.target && e.target.closest && e.target.closest('.pp-bp-cta[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var brandId = target.getAttribute('data-brand-id') || '';
    if (action === 'follow') { e.preventDefault(); toggleFollow(brandId, target); return; }
    if (action === 'scroll-products') {
      e.preventDefault();
      var grid = document.querySelector('.bp-prod-grid');
      if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else toast('Nog geen collectie zichtbaar');
      return;
    }
    if (action === 'share') { e.preventDefault(); handleShare(); return; }
  }

  function handleShare() {
    var url = window.location.href;
    var title = document.title || 'Paskamerpraat';
    try {
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
    } catch (_) {}
    // Fallback: kopieer naar klembord
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('Link gekopieerd'); })
          .catch(function () { toast('Kopieren mislukt'); });
        return;
      }
    } catch (_) {}
    toast('Delen niet ondersteund op dit apparaat');
  }

  function toggleFollow(brandId, btn) {
    var uid = currentUid();
    if (!uid) {
      toast('Log in om te volgen');
      try {
        if (window.DY && typeof DY.toonLogin === 'function') DY.toonLogin();
        else if (window.DY && typeof DY.navigeer === 'function') DY.navigeer('login');
      } catch (_) {}
      return;
    }
    var d = db();
    if (!d) { toast('Database niet beschikbaar'); return; }
    btn.setAttribute('aria-disabled', 'true');
    var isActive = btn.getAttribute('data-active') === 'true';
    var col = d.collection('brand_followers');
    if (isActive) {
      // Unfollow
      col.where('brandId', '==', brandId).where('uid', '==', uid).limit(1).get()
        .then(function (snap) {
          if (snap && snap.size > 0) {
            var doc = snap.docs[0];
            return doc.ref.delete();
          }
        })
        .then(function () {
          btn.setAttribute('data-active', 'false');
          var lbl = btn.querySelector('[data-role="label"]');
          if (lbl) lbl.textContent = 'Volgen';
          toast('Niet meer gevolgd');
        })
        .catch(function (err) { toast('Kon niet ontvolgen'); log('unfollow error: ' + (err && err.message)); })
        .finally(function () { btn.removeAttribute('aria-disabled'); updateFollowState(brandId); });
    } else {
      // Follow
      col.add({
        brandId: brandId,
        uid: uid,
        ts: (window.firebase && firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.serverTimestamp && firebase.firestore.FieldValue.serverTimestamp()) || new Date()
      })
        .then(function () {
          btn.setAttribute('data-active', 'true');
          var lbl = btn.querySelector('[data-role="label"]');
          if (lbl) lbl.textContent = 'Gevolgd';
          toast('Je volgt dit merk nu');
        })
        .catch(function (err) { toast('Kon niet volgen'); log('follow error: ' + (err && err.message)); })
        .finally(function () { btn.removeAttribute('aria-disabled'); updateFollowState(brandId); });
    }
  }

  // ─── Injectie: vind .bp-merk-hero en enhance omheen ───────────────────
  function enhanceMerkDetail() {
    var hero = document.querySelector('.bp-page .bp-merk-hero');
    if (!hero || hero.dataset.ppEnhanced === '1') return;
    hero.dataset.ppEnhanced = '1';

    // Zoek brandId uit context
    // Kans 1: URL query
    var brandId = '';
    try {
      var u = new URL(window.location.href);
      brandId = u.searchParams.get('merkId') || u.searchParams.get('brandId') || '';
    } catch (_) {}
    // Kans 2: uit DY.currentBrandId of DY.pageParams
    try {
      if (!brandId && window.DY) {
        brandId = DY.currentBrandId || (DY.pageParams && DY.pageParams.merkId) || '';
      }
    } catch (_) {}
    if (!brandId) {
      // Fallback: extract uit een van de product-cards data-testid
      var prodEl = document.querySelector('[data-testid^="brand-product-"]');
      if (prodEl) {
        // niet ideaal maar sla stap over
      }
    }
    // Als geen brandId → alleen visueel enhancen zonder follow-actie
    injectCss();

    // Fetch brand doc voor extra velden (async, wachten op resultaat vóór injecteren)
    var d = db();
    if (!d || !brandId) {
      // Zonder DB of brandId: doe basis-enhancement met alleen aanwezige DOM info
      renderEnhancement({ naam: '', logo: '' }, brandId || '');
      return;
    }
    d.collection('brands').doc(brandId).get()
      .then(function (snap) {
        if (!snap || !snap.exists) { renderEnhancement({}, brandId); return; }
        var b = snap.data() || {};
        renderEnhancement(b, brandId);
        // Async: producten count + volgers
        loadStats(brandId, b);
      })
      .catch(function (err) {
        log('brand doc load error: ' + (err && err.message));
        renderEnhancement({}, brandId);
      });
  }

  function renderEnhancement(b, brandId) {
    var hero = document.querySelector('.bp-page .bp-merk-hero');
    if (!hero) return;

    // 1. Banner + badges VOOR de hero invoegen
    var bannerHtml = buildBanner(b);
    if (bannerHtml) {
      var bannerFrag = document.createElement('div');
      bannerFrag.innerHTML = bannerHtml;
      var bannerEl = bannerFrag.firstChild;
      if (bannerEl) hero.parentNode.insertBefore(bannerEl, hero);
    }

    // 2. Slogan + locatie/sinds direct binnen de hero-content (naast de bestaande h1/catetorie/website)
    var heroInfo = hero.querySelector('div:nth-child(2)') || hero.lastElementChild;
    if (heroInfo) {
      var extraMeta = buildHeroMeta(b);
      if (extraMeta) {
        var wrap = document.createElement('div');
        wrap.innerHTML = extraMeta;
        while (wrap.firstChild) heroInfo.appendChild(wrap.firstChild);
      }
    }

    // 3. CTA bar NA de hero
    if (brandId) {
      var ctaHtml = buildCtas(b, brandId);
      var ctaFrag = document.createElement('div');
      ctaFrag.innerHTML = ctaHtml;
      var ctaEl = ctaFrag.firstChild;
      if (ctaEl && hero.parentNode) hero.parentNode.insertBefore(ctaEl, hero.nextSibling);
    }

    // 4. "Over het merk" blok NA CTA bar (voor product-grid)
    var overHtml = buildOverBlok(b);
    if (overHtml) {
      var overFrag = document.createElement('div');
      overFrag.innerHTML = overHtml;
      var overEl = overFrag.firstChild;
      // Plaats vóór .bp-prod-grid (indien aanwezig) of aan het eind
      var grid = document.querySelector('.bp-page .bp-prod-grid');
      if (overEl) {
        if (grid && grid.parentNode) grid.parentNode.insertBefore(overEl, grid);
        else hero.parentNode.appendChild(overEl);
      }
    }

    // 5. Statistieken direct na hero (of na CTA-bar) — placeholder tot loadStats
    var initialStats = {
      producten: null,
      followers: null,
      rating: b.rating || null,
      reviewCount: b.reviewCount || null,
      collecties: b.collecties || null
    };
    var statsHtml = buildStats(initialStats);
    if (statsHtml) {
      var statsFrag = document.createElement('div');
      statsFrag.innerHTML = statsHtml;
      var statsEl = statsFrag.firstChild;
      // plaats na CTA bar of na hero
      var ctaBar = document.querySelector('.pp-bp-cta-bar');
      var anchor = ctaBar || hero;
      if (statsEl && anchor.parentNode) anchor.parentNode.insertBefore(statsEl, anchor.nextSibling);
    }

    // Delegated CTA click handler (idempotent)
    if (!window.__ppBpCtaBound) {
      window.__ppBpCtaBound = true;
      document.addEventListener('click', handleCtaClick, false);
    }

    // Async: follow state
    if (brandId) updateFollowState(brandId);
  }

  function loadStats(brandId, b) {
    var d = db();
    if (!d || !brandId) return;
    // Producten count
    d.collection('brand_products').where('brandId', '==', brandId).where('status', '==', 'actief').get()
      .then(function (snap) {
        var cnt = snap ? snap.size : 0;
        // Als statistiek-blok nog niet bestaat (initieel had geen producten value), rebuild
        var statsBlok = document.querySelector('[data-testid="pp-bp-stats"]');
        if (!statsBlok) {
          // Bouw compleet blok opnieuw op met producten
          var newStats = buildStats({
            producten: cnt,
            followers: b.followers || 0,
            rating: b.rating || null,
            reviewCount: b.reviewCount || null,
            collecties: b.collecties || null
          });
          if (newStats) {
            var frag = document.createElement('div');
            frag.innerHTML = newStats;
            var el = frag.firstChild;
            var ctaBar = document.querySelector('.pp-bp-cta-bar');
            var hero = document.querySelector('.bp-merk-hero');
            var anchor = ctaBar || hero;
            if (el && anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
          }
        } else {
          // Update alleen product-stat
          var pStat = statsBlok.querySelector('[data-testid="pp-bp-stat-producten"] .pp-bp-stat-num');
          if (pStat) pStat.textContent = fmtNum(cnt);
          else {
            // Voeg producten-stat toe als eerste
            var pDiv = document.createElement('div');
            pDiv.className = 'pp-bp-stat';
            pDiv.setAttribute('data-testid', 'pp-bp-stat-producten');
            pDiv.innerHTML = '<span class="pp-bp-stat-num">' + fmtNum(cnt) + '</span><span class="pp-bp-stat-lbl">Producten</span>';
            statsBlok.insertBefore(pDiv, statsBlok.firstChild);
          }
        }
      })
      .catch(function (err) { log('product count error: ' + (err && err.message)); });
  }

  // ─── Init: MutationObserver op body ───────────────────────────────────
  function init() {
    injectCss();
    var obs = new MutationObserver(function () {
      try { enhanceMerkDetail(); } catch (e) { log('enhance error: ' + (e && e.message)); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Direct proberen als er al content is
    setTimeout(function () { try { enhanceMerkDetail(); } catch (_) {} }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.PP_BrandProfile = {
    VERSION: '1.0.0',
    enhance: enhanceMerkDetail
  };
})();
