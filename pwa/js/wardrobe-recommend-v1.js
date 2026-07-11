// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Wardrobe Recommender v1 (v52)
//
// Combineert saved items (dy_saved_posts) + recent outfit scores
// (dy_recent_scores) en vraagt /api/wardrobe/recommend om een
// "Wat te dragen deze week"-aanrader.
//
// Triggers:
//   1) Auto: zondag-avond (na 17:00) ÉÉN keer per ISO-week → banner +
//      optionele push (gebruik notification-skin-v1).
//   2) Manual: knop "Wat draag ik?" in Mijn Garderobe overlay header
//   3) Programmatic via window.DY.wardrobeRecommend.open()
//
// Rate-limit: gratis = 1 per week. Premium = unlimited (backend enforced).
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__ppWardrobeRecInit) return;
  window.__ppWardrobeRecInit = true;

  var LS_SAVED        = 'dy_saved_posts';
  var LS_RECENT_SCORE = 'dy_recent_scores';
  var LS_LAST_WEEK    = 'dy_wardrobe_rec_week';     // ISO week-tag laatst gerunde
  var LS_LAST_SUGGEST = 'dy_wardrobe_rec_last';     // cache van laatste response

  // ─── Utils ───────────────────────────────────────────────────────
  function apiBase() {
    try { return (window.DY && window.DY.aiHealth && window.DY.aiHealth.apiBase()) || ''; } catch (e) { return ''; }
  }

  // ─── Auth-guard (v1.1 fix, 2026-02-21) ───────────────────────────
  // "Wat draag je deze week?" mag ALLEEN voor ingelogde gebruikers.
  // Geen anonymous, geen gast. Voorkomt "Netwerkfout" bij backend
  // rejection van anon user_key + voorkomt popup voor gasten.
  function isAuthed() {
    try {
      if (window.DY && DY.user && DY.user.uid) return true;
      if (typeof firebase !== 'undefined' && firebase.auth &&
          firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) return true;
    } catch (e) {}
    return false;
  }

  function getUserKey() {
    if (window.DY && window.DY.premium && window.DY.premium.getUserKey) {
      try { return window.DY.premium.getUserKey(); } catch (e) {}
    }
    // v1.1: GEEN 'anon' fallback meer. Returns null als geen geldige key.
    try {
      var k = localStorage.getItem('dy_premium_userkey');
      return (k && k !== 'anon') ? k : null;
    } catch (e) { return null; }
  }

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(LS_SAVED) || '[]'); } catch (e) { return []; }
  }
  function getRecentScores() {
    try { return JSON.parse(localStorage.getItem(LS_RECENT_SCORE) || '[]'); } catch (e) { return []; }
  }

  function isoWeek(d) {
    d = d || new Date();
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    var ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    var wk = Math.ceil((((t - ys) / 86400000) + 1) / 7);
    return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
  }

  function weatherHint() {
    // Lichte heuristiek o.b.v. maand. Geen externe API call.
    var m = new Date().getMonth() + 1; // 1..12
    if (m === 12 || m <= 2) return 'koud winters';
    if (m <= 4) return 'wisselvallig voorjaar';
    if (m <= 8) return 'warm zomers';
    return 'kil herfstig';
  }

  // ─── API call ────────────────────────────────────────────────────
  async function fetchRecommendation() {
    // v1.1 GUARD: alleen ingelogde gebruikers
    if (!isAuthed()) {
      return { error: 'not_authed', message: 'Log in om je persoonlijk advies te zien.' };
    }
    var uk = getUserKey();
    if (!uk) {
      return { error: 'no_user_key', message: 'Account niet gevonden, herlaad de pagina.' };
    }
    var saved = getSaved();
    if (!saved.length) {
      return { error: 'no_saved', message: 'Bewaar eerst 1 of meer looks via het kaart-menu.' };
    }
    var base = apiBase();
    if (!base) return { error: 'no_api', message: 'Geen verbinding met AI service.' };

    try {
      var _ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var _to = _ctrl ? setTimeout(function () { try { _ctrl.abort(); } catch (_) {} }, 45000) : null;
      var r = await fetch(base + '/api/wardrobe/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_key: uk,
          saved_items: saved.slice(0, 30),
          recent_scores: getRecentScores().slice(0, 5),
          weather: weatherHint(),
          occasion: 'dagelijks',
        }),
        signal: _ctrl ? _ctrl.signal : undefined,
      });
      if (_to) clearTimeout(_to);
      var d = await r.json();
      if (!r.ok) return { error: 'http_' + r.status, message: d.detail || 'AI service fout', limit: r.status === 429 };
      try { localStorage.setItem(LS_LAST_SUGGEST, JSON.stringify({ ts: Date.now(), data: d })); } catch (e) {}
      return { ok: true, data: d };
    } catch (e) {
      var _isAbort = e && (e.name === 'AbortError' || String(e && e.message || '').toLowerCase().indexOf('abort') >= 0);
      return { error: _isAbort ? 'timeout' : 'network',
        message: _isAbort ? 'AI service reageerde te traag. Probeer over enkele seconden opnieuw.'
                          : 'Tijdelijke netwerkfout, probeer over enkele seconden opnieuw.' };
    }
  }

  // ─── Modal renderer ─────────────────────────────────────────────
  function openModal() {
    // v1.1 GUARD: alleen ingelogde gebruikers
    if (!isAuthed()) {
      try { console.warn('[wardrobe-rec] open() geblokkeerd: niet ingelogd'); } catch (e) {}
      // Trigger bestaande login-prompt indien beschikbaar (geen nieuwe UI)
      if (window.DY && typeof DY.toonLoginPrompt === 'function') {
        DY.toonLoginPrompt('Log in om je persoonlijke wekelijkse advies te zien.');
      }
      return;
    }
    if (document.getElementById('dy-wardrobe-rec-modal')) return;
    var ov = document.createElement('div');
    ov.id = 'dy-wardrobe-rec-modal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'dy-wr-title');
    ov.setAttribute('data-testid', 'wardrobe-rec-modal');
    ov.innerHTML =
      '<div class="dy-wr-backdrop" data-close="1"></div>' +
      '<div class="dy-wr-card" role="document">' +
      '  <button class="dy-wr-close" data-close="1" aria-label="Sluiten" data-testid="wardrobe-rec-close">×</button>' +
      '  <span class="dy-wr-pill">PERSOONLIJK</span>' +
      '  <h2 id="dy-wr-title">Wat te dragen deze week</h2>' +
      '  <p class="dy-wr-sub" data-testid="wardrobe-rec-intro">Onze AI combineert je opgeslagen looks tot 3 outfit-ideeën…</p>' +
      '  <div class="dy-wr-loading" data-testid="wardrobe-rec-loading">' +
      '    <div class="dy-wr-spinner" aria-hidden="true"></div>' +
      '    <span>Onze stylist is je looks aan het combineren…</span>' +
      '  </div>' +
      '  <div class="dy-wr-picks" data-picks hidden></div>' +
      '  <div class="dy-wr-error" data-error hidden></div>' +
      '  <p class="dy-wr-fineprint" data-meta></p>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    // v1.1: vooraf fineprint vullen met lokale data zodat
    // "undefined" nooit zichtbaar is tijdens loading.
    try {
      var preMetaEl = ov.querySelector('[data-meta]');
      if (preMetaEl) {
        var preSaved = getSaved().length;
        preMetaEl.textContent = 'Week ' + isoWeek() +
          ' · gebaseerd op ' + preSaved + ' opgeslagen look' + (preSaved === 1 ? '' : 's');
      }
    } catch (e) {}

    ov.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-close') === '1') closeModal();
    });

    fetchRecommendation().then(function (res) {
      var loading = ov.querySelector('.dy-wr-loading');
      var errEl = ov.querySelector('[data-error]');
      var picksEl = ov.querySelector('[data-picks]');
      var metaEl = ov.querySelector('[data-meta]');
      // v60.1.272 FIX: .dy-wr-loading gebruikt display:flex via een ID-selector,
      // die overschrijft de default [hidden]{display:none}. Zet dus expliciet
      // de inline display-style om de spinner écht weg te halen.
      loading.hidden = true;
      loading.style.display = 'none';

      if (res.error) {
        errEl.hidden = false;
        errEl.style.display = '';
        errEl.innerHTML = '<strong>Helaas.</strong> ' + (res.message || 'Iets ging mis.') +
          (res.limit ? '<br><button class="dy-wr-upgrade" data-testid="wardrobe-upgrade-btn">Upgrade naar Premium →</button>' : '');
        var up = errEl.querySelector('[data-testid="wardrobe-upgrade-btn"]');
        if (up) up.addEventListener('click', function () {
          closeModal();
          if (window.DY && window.DY.premium) window.DY.premium.openUpgrade();
        });
        return;
      }

      var d = res.data;
      ov.querySelector('[data-testid="wardrobe-rec-intro"]').textContent = d.intro || '';
      // v1.2 FIX: backend levert {ideas:[{titel, omschrijving}]} maar oude
      // frontend las {picks:[{title, why}]}. Accepteer beide vormen (map
      // ideas -> picks-vorm) zodat er niets stil-faalt.
      var picksArr = Array.isArray(d.picks) ? d.picks
                   : Array.isArray(d.ideas) ? d.ideas.map(function (x) {
                       return {
                         title: x.title || x.titel || '',
                         why: x.why || x.omschrijving || x.description || '',
                         items_to_combine: x.items_to_combine || x.items || [],
                         weather_note: x.weather_note || x.weer || ''
                       };
                     }) : [];
      // Toon fallback-boodschap als er ideeen zijn maar met een message
      if (d.fallback && d.message) {
        errEl.hidden = false;
        errEl.style.display = '';
        errEl.innerHTML = '<strong>Info.</strong> ' + escapeHtml(d.message);
      }
      picksEl.hidden = false;
      picksEl.style.display = '';
      picksEl.innerHTML = picksArr.map(function (p, i) {
        return '<article class="dy-wr-pick" data-testid="wardrobe-pick-' + i + '">' +
          '<div class="dy-wr-pick-num">' + (i + 1) + '</div>' +
          '<div class="dy-wr-pick-body">' +
          '  <h3>' + escapeHtml(p.title || 'Pick ' + (i + 1)) + '</h3>' +
          '  <p class="dy-wr-pick-why">' + escapeHtml(p.why || '') + '</p>' +
          (p.items_to_combine && p.items_to_combine.length ?
            '  <ul class="dy-wr-pick-items">' + p.items_to_combine.map(function (it) {
              return '<li>' + escapeHtml(it) + '</li>';
            }).join('') + '</ul>' : '') +
          (p.weather_note ? '  <p class="dy-wr-pick-weather">🌤 ' + escapeHtml(p.weather_note) + '</p>' : '') +
          '</div>' +
          '</article>';
      }).join('');

      // v1.1 FIX: fallback-waarden voorkomen "undefined" in UI
      var weekStr = d.week || isoWeek();
      var savedCount = (typeof d.based_on_saved === 'number') ? d.based_on_saved : getSaved().length;
      var meta = 'Week ' + weekStr + ' · gebaseerd op ' + savedCount + ' opgeslagen look' + (savedCount === 1 ? '' : 's');
      if (d.is_premium === true) {
        meta += ' · Premium ✓';
      } else if (typeof d.remaining_free_uses === 'number') {
        meta += ' · nog ' + d.remaining_free_uses + ' gratis gebruik(en)';
      }
      metaEl.textContent = meta;

      // Markeer week als verbruikt
      try { localStorage.setItem(LS_LAST_WEEK, isoWeek()); } catch (e) {}
    });
  }

  function closeModal() {
    var ov = document.getElementById('dy-wardrobe-rec-modal');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ─── Auto Monday trigger (v1.1 fix: maandag 00:01-23:59, was zondag 17:00) ─
  function maybeAutoTrigger() {
    try {
      // v1.1 GUARD: alleen voor ingelogde gebruikers
      if (!isAuthed()) return;
      var now = new Date();
      var dow = now.getDay(); // 1 = maandag
      var hour = now.getHours();
      var minute = now.getMinutes();
      // Maandag vanaf 00:01 (rest van de dag) - aansluitend op weekly_winner cron
      if (dow !== 1) return;
      if (hour === 0 && minute < 1) return;
      var lastWeek = localStorage.getItem(LS_LAST_WEEK) || '';
      if (lastWeek === isoWeek()) return; // al deze week getoond
      if (getSaved().length < 1) return; // v1.1: min 1 saved item (was 3)
      showAutoBanner();
    } catch (e) {}
  }

  function showAutoBanner() {
    if (document.getElementById('dy-wr-banner')) return;
    var el = document.createElement('div');
    el.id = 'dy-wr-banner';
    el.setAttribute('data-testid', 'wardrobe-auto-banner');
    el.innerHTML =
      '<div class="dy-wr-banner-inner">' +
      '  <div class="dy-wr-banner-icon">🪞</div>' +
      '  <div class="dy-wr-banner-text">' +
      '    <strong>Wat draag je deze week?</strong>' +
      '    <span>Je AI-stylist combineerde je looks tot 3 ideeën.</span>' +
      '  </div>' +
      '  <button class="dy-wr-banner-open" data-testid="wardrobe-banner-open">Bekijk</button>' +
      '  <button class="dy-wr-banner-close" data-testid="wardrobe-banner-close" aria-label="Sluiten">×</button>' +
      '</div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('is-show'); }, 60);
    el.querySelector('[data-testid="wardrobe-banner-open"]').addEventListener('click', function () { dismissBanner(); openModal(); });
    el.querySelector('[data-testid="wardrobe-banner-close"]').addEventListener('click', function () {
      dismissBanner();
      try { localStorage.setItem(LS_LAST_WEEK, isoWeek()); } catch (e) {}
    });
  }
  function dismissBanner() {
    var el = document.getElementById('dy-wr-banner');
    if (!el) return;
    el.classList.remove('is-show');
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 350);
  }

  // ─── Garderobe header button ────────────────────────────────────
  function injectGarderobeButton() {
    var obs = new MutationObserver(function () {
      var ov = document.getElementById('dy-garderobe-overlay');
      if (!ov || ov.querySelector('[data-testid="garderobe-wat-draag-ik"]')) return;
      var body = ov.querySelector('[data-body]');
      var header = ov.querySelector('header');
      if (!header || !body) return;
      // v1.1 GUARD: alleen voor ingelogde gebruikers
      if (!isAuthed()) return;
      if (getSaved().length < 1) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'garderobe-wat-draag-ik');
      btn.className = 'dy-wr-garderobe-btn';
      btn.innerHTML = '✨ Wat draag ik deze week?';
      btn.addEventListener('click', openModal);
      // Plaats meteen na header
      header.parentNode.insertBefore(btn, header.nextSibling);
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  // ─── Styles ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dy-wardrobe-rec-styles')) return;
    var s = document.createElement('style');
    s.id = 'dy-wardrobe-rec-styles';
    s.textContent =
      '#dy-wardrobe-rec-modal{position:fixed;inset:0;z-index:10070;display:flex;align-items:flex-end;justify-content:center;padding:0}' +
      '@media (min-width:560px){#dy-wardrobe-rec-modal{align-items:center;padding:24px}}' +
      '#dy-wardrobe-rec-modal .dy-wr-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 70% 0%,rgba(232,167,60,.22),rgba(20,15,5,.78))}' +
      '#dy-wardrobe-rec-modal .dy-wr-card{position:relative;max-width:520px;width:100%;background:linear-gradient(180deg,#fff9ec,#fdf2d8);border:1px solid rgba(120,70,4,.5);border-radius:22px 22px 0 0;padding:24px 22px 28px;box-shadow:0 -16px 56px -8px rgba(120,70,4,.4);color:#1a1304;font-family:"DM Sans",system-ui,sans-serif;max-height:90vh;overflow-y:auto}' +
      '@media (min-width:560px){#dy-wardrobe-rec-modal .dy-wr-card{border-radius:22px}}' +
      '#dy-wardrobe-rec-modal .dy-wr-close{position:absolute;top:10px;right:14px;background:none;border:0;font-size:30px;line-height:1;color:#4a3208;cursor:pointer;padding:4px 10px}' +
      '#dy-wardrobe-rec-modal .dy-wr-pill{display:inline-block;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;font:700 10px/1 "DM Sans";letter-spacing:.16em;padding:6px 12px;border-radius:999px;margin-bottom:10px}' +
      '#dy-wardrobe-rec-modal h2{font:700 22px/1.2 "DM Sans";margin:0 0 4px;color:#241a08}' +
      '#dy-wardrobe-rec-modal .dy-wr-sub{margin:0 0 16px;font-size:14px;color:#4a3208;line-height:1.45}' +
      '#dy-wardrobe-rec-modal .dy-wr-loading{display:flex;align-items:center;gap:12px;padding:14px;background:rgba(255,255,255,.7);border-radius:12px;color:#4a3208;font-size:14px;border:1px solid rgba(120,70,4,.22)}' +
      '#dy-wardrobe-rec-modal .dy-wr-spinner{width:18px;height:18px;border:2px solid rgba(120,70,4,.3);border-top-color:#7a4d04;border-radius:50%;animation:dyWrSpin .9s linear infinite}' +
      '@keyframes dyWrSpin{to{transform:rotate(360deg)}}' +
      '#dy-wardrobe-rec-modal .dy-wr-picks{display:flex;flex-direction:column;gap:12px;margin:6px 0 12px}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick{display:flex;gap:12px;padding:14px;background:rgba(255,255,255,.7);border:1px solid rgba(120,70,4,.22);border-radius:14px;color:#1a1304}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick-num{flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#7a4d04,#a56605);color:#fff;display:flex;align-items:center;justify-content:center;font:800 14px "DM Sans"}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick h3{margin:0 0 4px;font:700 15px "DM Sans";color:#241a08}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick-why{margin:0 0 8px;font-size:13.5px;line-height:1.45;color:#3a2a08}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick-items{list-style:none;padding:0;margin:0 0 8px;display:flex;flex-wrap:wrap;gap:5px}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick-items li{background:rgba(122,77,4,.16);color:#3a2a08;padding:4px 9px;border-radius:999px;font-size:12px;border:1px solid rgba(122,77,4,.24)}' +
      '#dy-wardrobe-rec-modal .dy-wr-pick-weather{margin:0;font-size:12.5px;color:#4a3208;font-style:italic}' +
      '#dy-wardrobe-rec-modal .dy-wr-error{padding:14px;background:rgba(122,24,24,.08);border:1px solid rgba(122,24,24,.4);border-radius:12px;color:#5a1818;font-size:13px;line-height:1.5;font-weight:500}' +
      '#dy-wardrobe-rec-modal .dy-wr-upgrade{display:block;margin-top:10px;padding:10px 16px;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;border:0;border-radius:10px;font:700 13px "DM Sans";cursor:pointer}' +
      '#dy-wardrobe-rec-modal .dy-wr-fineprint{margin:12px 0 0;text-align:center;font-size:12px;color:#4a3208}' +
      '.dy-wr-garderobe-btn{display:block;margin:10px 14px 6px;padding:11px 14px;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;border:0;border-radius:12px;font:700 14px "DM Sans";cursor:pointer;width:calc(100% - 28px);box-shadow:0 6px 18px -4px rgba(122,77,4,.55)}' +
      '.dy-wr-garderobe-btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px -4px rgba(122,77,4,.7)}' +
      '#dy-wr-banner{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0) + 76px);transform:translate(-50%,40px);z-index:9985;background:linear-gradient(180deg,#fff9ec,#fdf2d8);border:1px solid rgba(120,70,4,.5);border-radius:18px;box-shadow:0 18px 48px -10px rgba(120,70,4,.5);max-width:420px;width:calc(100% - 24px);opacity:0;transition:opacity .35s ease,transform .35s ease}' +
      '#dy-wr-banner.is-show{opacity:1;transform:translate(-50%,0)}' +
      '#dy-wr-banner .dy-wr-banner-inner{display:flex;align-items:center;gap:11px;padding:14px 14px 14px 16px;font-family:"DM Sans",system-ui,sans-serif}' +
      '#dy-wr-banner .dy-wr-banner-icon{font-size:28px;line-height:1;flex:0 0 auto}' +
      '#dy-wr-banner .dy-wr-banner-text{flex:1;line-height:1.3}' +
      '#dy-wr-banner .dy-wr-banner-text strong{display:block;color:#241a08;font:700 14px "DM Sans"}' +
      '#dy-wr-banner .dy-wr-banner-text span{color:#4a3208;font:500 12.5px "DM Sans"}' +
      '#dy-wr-banner .dy-wr-banner-open{padding:8px 14px;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;border:0;border-radius:10px;font:700 12px "DM Sans";cursor:pointer;flex:0 0 auto}' +
      '#dy-wr-banner .dy-wr-banner-close{background:none;border:0;font-size:22px;color:#4a3208;cursor:pointer;padding:0 6px;line-height:1;flex:0 0 auto}' +
      '@media (prefers-color-scheme: dark){' +
      '  #dy-wardrobe-rec-modal .dy-wr-card{background:linear-gradient(180deg,#1a1304,#0f0a02);color:#fdf2d8;border-color:rgba(232,167,60,.5)}' +
      '  #dy-wardrobe-rec-modal h2,#dy-wardrobe-rec-modal .dy-wr-pick h3{color:#fdf2d8}' +
      '  #dy-wardrobe-rec-modal .dy-wr-sub,#dy-wardrobe-rec-modal .dy-wr-pick-why{color:#e6d6a4}' +
      '  #dy-wardrobe-rec-modal .dy-wr-pick,#dy-wardrobe-rec-modal .dy-wr-loading{background:rgba(255,255,255,.08);color:#fdf2d8;border-color:rgba(232,167,60,.4)}' +
      '  #dy-wardrobe-rec-modal .dy-wr-pick-items li{background:rgba(232,167,60,.24);color:#fdf2d8;border-color:rgba(232,167,60,.5)}' +
      '  #dy-wardrobe-rec-modal .dy-wr-pick-weather,#dy-wardrobe-rec-modal .dy-wr-fineprint{color:#e6d6a4}' +
      '  #dy-wardrobe-rec-modal .dy-wr-close{color:#e6d6a4}' +
      '  #dy-wardrobe-rec-modal .dy-wr-error{background:rgba(255,80,80,.12);color:#ffd5d5;border-color:#8a3030}' +
      '  #dy-wr-banner{background:#1a1304;border-color:rgba(232,167,60,.5)}' +
      '  #dy-wr-banner .dy-wr-banner-text strong{color:#fdf2d8}' +
      '  #dy-wr-banner .dy-wr-banner-text span{color:#e6d6a4}' +
      '  #dy-wr-banner .dy-wr-banner-close{color:#e6d6a4}' +
      '}';
    document.head.appendChild(s);
  }

  // ─── Public API ─────────────────────────────────────────────────
  window.DY = window.DY || {};
  window.DY.wardrobeRecommend = {
    open: openModal,
    fetch: fetchRecommendation,
    getSaved: getSaved,
    isoWeek: isoWeek,
  };

  // ─── Score logger (lichte hook bij outfit-score, ondersteund door
  //     outfit-score-v1 als die het event uitstuurt) ────────────────
  window.addEventListener('dy-outfit-score-result', function (e) {
    try {
      var arr = JSON.parse(localStorage.getItem(LS_RECENT_SCORE) || '[]');
      arr.unshift({ score: e.detail.score, label: e.detail.label, tips: e.detail.tips, ts: Date.now() });
      arr = arr.slice(0, 10);
      localStorage.setItem(LS_RECENT_SCORE, JSON.stringify(arr));
    } catch (err) {}
  });

  // ─── Init ───────────────────────────────────────────────────────
  function init() {
    injectStyles();
    injectGarderobeButton();
    // Wacht 6s om geen first-paint te blokkeren, dan auto-check
    setTimeout(maybeAutoTrigger, 6000);

    // v1.1: bij logout, banner + modal verwijderen + cache wissen
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (user) {
          if (!user || user.isAnonymous) {
            dismissBanner();
            closeModal();
            try { localStorage.removeItem(LS_LAST_WEEK); } catch (e) {}
            try { localStorage.removeItem(LS_LAST_SUGGEST); } catch (e) {}
          }
        });
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
