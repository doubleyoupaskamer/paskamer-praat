// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Premium Tier v55 (Stripe checkout error-handling fix)
//
// v55 changes (vs v54):
//   • Robuuste apiBase() fallback (LIVE_BACKEND_FALLBACK als aiHealth nog niet geladen)
//   • Verbeterde error-handling in startCheckout: console.error logging, JSON-parse
//     guard, Stripe "invalid email" message rebranded, géén generieke "Netwerkfout"
//     meer als backend wél bereikbaar is.
//   • Customer Portal-flow ook robuust gemaakt.
//
// Stripe-checkout flow + premium status caching. Non-invasief:
//   - Voegt premium-status check toe aan window.DY.premium
//   - Voegt "Upgrade" item toe aan extra-menu hub (boven aan)
//   - Toont upgrade-modal met perks + Stripe checkout button
//   - Handelt success/cancel redirect af via ?premium=success&session_id=
//   - Cached premium status in localStorage (5 min TTL) om backend te ontlasten
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__ppPremiumInit) return;
  window.__ppPremiumInit = true;

  var PKG_ID = 'premium_monthly';
  var LS_CACHE = 'dy_premium_cache';
  var LS_USERKEY = 'dy_premium_userkey'; // anoniem fallback id

  // ─── Helpers ─────────────────────────────────────────────────────
  // Hardcoded LIVE backend fallback — used als aiHealth nog niet geladen is
  // bij vroege click (race condition op iOS PWA). Komt overeen met
  // LIVE_BACKEND in ai-health-v1.js.
  var LIVE_BACKEND_FALLBACK = 'https://fitting-chat-app.preview.emergentagent.com';
  function apiBase() {
    try {
      var b = (window.DY && window.DY.aiHealth && window.DY.aiHealth.apiBase && window.DY.aiHealth.apiBase()) || '';
      if (b) return b;
    } catch (e) { /* ignore */ }
    // Fallback: detecteer productie/preview host en gebruik vaste backend
    try {
      var host = (location.hostname || '').toLowerCase();
      if (host.indexOf('paskamerpraat.nl') >= 0 ||
          host.indexOf('emergentagent.com') >= 0 ||
          host.indexOf('cloudflare') >= 0 ||
          host.indexOf('pages.dev') >= 0) {
        return LIVE_BACKEND_FALLBACK;
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function getUserKey() {
    // 1) Firebase auth uid
    try {
      var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      if (u && u.uid) return u.uid;
    } catch (e) { /* ignore */ }
    // 2) Persisted email (set via upgrade modal)
    try {
      var e = localStorage.getItem('dy_premium_email');
      if (e) return e;
    } catch (e) { /* ignore */ }
    // 3) Anoniem session id (per device)
    try {
      var k = localStorage.getItem(LS_USERKEY);
      if (!k) {
        k = 'anon-' + Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
        localStorage.setItem(LS_USERKEY, k);
      }
      return k;
    } catch (e) {
      return 'anon-session';
    }
  }

  function getEmailFromAuth() {
    try {
      var u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      return (u && u.email) || '';
    } catch (e) { return ''; }
  }

  function getCached() {
    try {
      var raw = localStorage.getItem(LS_CACHE);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.ts) return null;
      if (Date.now() - o.ts > 5 * 60 * 1000) return null; // 5 min TTL
      return o;
    } catch (e) { return null; }
  }
  function setCached(state) {
    try { localStorage.setItem(LS_CACHE, JSON.stringify({ ...state, ts: Date.now() })); } catch (e) { /* ignore */ }
  }

  async function fetchStatus(force) {
    if (!force) {
      var c = getCached();
      if (c) return c;
    }
    var base = apiBase();
    if (!base) return { is_premium: false };
    try {
      var r = await fetch(base + '/api/premium/status?user_key=' + encodeURIComponent(getUserKey()), { cache: 'no-store' });
      if (!r.ok) return { is_premium: false };
      var d = await r.json();
      setCached(d);
      return d;
    } catch (e) { return { is_premium: false }; }
  }

  async function isPremium() {
    var s = await fetchStatus(false);
    return !!s.is_premium;
  }

  // ─── Upgrade modal ───────────────────────────────────────────────
  function openUpgradeModal() {
    if (document.getElementById('dy-premium-modal')) return;
    var ov = document.createElement('div');
    ov.id = 'dy-premium-modal';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'dy-prem-title');
    ov.setAttribute('data-testid', 'premium-upgrade-modal');
    ov.innerHTML =
      '<div class="dy-prem-backdrop" data-close="1"></div>' +
      '<div class="dy-prem-card" role="document">' +
      '  <button class="dy-prem-close" data-close="1" aria-label="Sluiten" data-testid="premium-close-btn">×</button>' +
      '  <div class="dy-prem-crown">PREMIUM</div>' +
      '  <h2 id="dy-prem-title">Upgrade naar Premium</h2>' +
      '  <p class="dy-prem-sub">Onbeperkt AI styling voor €6,99/maand</p>' +
      '  <ul class="dy-prem-perks">' +
      '    <li>Onbeperkt Virtual Try-on</li>' +
      '    <li>Onbeperkt Style Score</li>' +
      '    <li>Onbeperkt Vergelijkbaar zoeken</li>' +
      '    <li>Onbeperkt AI Fit Chat</li>' +
      '    <li>Premium badge op je profiel</li>' +
      '  </ul>' +
      (getEmailFromAuth() ? '' :
        '<label class="dy-prem-email-label">E-mail voor je bon</label>' +
        '<input id="dy-prem-email" type="email" placeholder="[email protected]" autocomplete="email" data-testid="premium-email-input">'
      ) +
      '  <button class="dy-prem-pay" data-testid="premium-pay-btn">Start Premium →</button>' +
      '  <p class="dy-prem-fineprint">Veilige betaling via Stripe. Annuleer wanneer je wilt.</p>' +
      '  <div class="dy-prem-error" id="dy-prem-error" role="alert"></div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';

    ov.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-close') === '1') closeModal();
    });
    var payBtn = ov.querySelector('[data-testid="premium-pay-btn"]');
    payBtn.addEventListener('click', startCheckout);
  }
  function closeModal() {
    var ov = document.getElementById('dy-premium-modal');
    if (ov) ov.remove();
    document.body.style.overflow = '';
  }

  async function startCheckout() {
    var err = document.getElementById('dy-prem-error');
    var payBtn = document.querySelector('#dy-premium-modal [data-testid="premium-pay-btn"]');
    if (err) err.textContent = '';

    var email = getEmailFromAuth();
    if (!email) {
      var inp = document.getElementById('dy-prem-email');
      email = inp ? (inp.value || '').trim() : '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (err) err.textContent = 'Vul een geldig e-mailadres in.';
        return;
      }
      try { localStorage.setItem('dy_premium_email', email); } catch (e) { /* ignore */ }
    }

    payBtn.disabled = true;
    payBtn.textContent = 'Bezig...';

    try {
      var base = apiBase();
      var body = {
        package_id: PKG_ID,
        origin_url: window.location.origin,
        user_key: email || getUserKey(),
        email: email,
      };
      var endpoint = base + '/api/checkout/session';
      console.info('[premium] POST', endpoint, 'email=', email);

      var r;
      try {
        r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (netErr) {
        console.error('[premium] Network error during checkout fetch:', netErr);
        if (err) err.textContent = 'Geen verbinding met de server. Check je internet en probeer opnieuw.';
        payBtn.disabled = false;
        payBtn.textContent = 'Start Premium →';
        return;
      }

      // Parse JSON defensively — backend kan 502 + JSON, 503 + JSON, of HTML-error retourneren
      var d = null;
      var rawText = '';
      try {
        rawText = await r.text();
        d = rawText ? JSON.parse(rawText) : null;
      } catch (parseErr) {
        console.error('[premium] JSON parse failed. status=', r.status, 'body=', rawText.slice(0, 300));
        if (err) err.textContent = 'Server gaf onverwacht antwoord (' + r.status + '). Probeer opnieuw.';
        payBtn.disabled = false;
        payBtn.textContent = 'Start Premium →';
        return;
      }

      if (!r.ok || !d || !d.url) {
        var msg = (d && d.detail) ? String(d.detail) : ('Kon checkout niet starten (' + r.status + ').');
        // Stripe live mode error rebranding voor gebruiker
        if (/invalid email/i.test(msg)) {
          msg = 'Dit e-mailadres wordt door Stripe niet geaccepteerd. Gebruik je échte e-mailadres (geen test-adressen).';
        }
        console.warn('[premium] Checkout failed:', r.status, msg, d);
        if (err) err.textContent = msg;
        payBtn.disabled = false;
        payBtn.textContent = 'Start Premium →';
        return;
      }
      // Save pending session for status-polling on return
      try { localStorage.setItem('dy_premium_pending', d.session_id); } catch (e) { /* ignore */ }
      console.info('[premium] Redirecting to Stripe:', d.url);
      window.location.href = d.url;
    } catch (e) {
      console.error('[premium] Unexpected error in startCheckout:', e);
      if (err) err.textContent = 'Onverwachte fout: ' + (e && e.message ? e.message : 'probeer opnieuw');
      payBtn.disabled = false;
      payBtn.textContent = 'Start Premium →';
    }
  }

  // ─── Return-flow polling ─────────────────────────────────────────
  async function pollStatus(sessionId, attempts) {
    attempts = attempts || 0;
    if (attempts > 6) return showReturnToast('Betaling kon niet bevestigd worden. Check je mail.', false);
    var base = apiBase();
    try {
      var r = await fetch(base + '/api/checkout/status/' + encodeURIComponent(sessionId));
      var d = await r.json();
      if (d.payment_status === 'paid' && d.premium_activated) {
        try { localStorage.removeItem('dy_premium_pending'); localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ }
        await fetchStatus(true);
        return showReturnToast('Welkom bij Premium! 👑 Alle AI-features zijn onbeperkt.', true);
      }
      if (d.status === 'expired' || d.payment_status === 'unpaid' && d.status === 'complete') {
        return showReturnToast('Betaling is niet doorgegaan.', false);
      }
    } catch (e) { /* ignore */ }
    setTimeout(function () { pollStatus(sessionId, attempts + 1); }, 1800);
  }

  function showReturnToast(msg, ok) {
    var el = document.createElement('div');
    el.className = 'dy-prem-return-toast' + (ok ? ' is-ok' : ' is-err');
    el.textContent = msg;
    el.setAttribute('data-testid', ok ? 'premium-success-toast' : 'premium-error-toast');
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('is-show'); }, 30);
    setTimeout(function () { el.classList.remove('is-show'); setTimeout(function () { try { el.remove(); } catch (e) { /* ignore */ } }, 400); }, 5500);
  }

  function checkReturnFromStripe() {
    var u = new URL(window.location.href);
    var sid = u.searchParams.get('session_id');
    var p = u.searchParams.get('premium');
    if (!sid && !p) return;
    if (p === 'success' && sid) {
      pollStatus(sid, 0);
    } else if (p === 'cancel') {
      showReturnToast('Premium upgrade geannuleerd.', false);
    }
    // strip params uit URL
    u.searchParams.delete('session_id');
    u.searchParams.delete('premium');
    var clean = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash;
    try { history.replaceState({}, '', clean); } catch (e) { /* ignore */ }
  }

  // ─── Customer Portal (cancel/manage abonnement) ──────────────────
  async function openCustomerPortal() {
    var base = apiBase();
    if (!base) {
      alert('Kan geen verbinding maken met de server.');
      return;
    }
    try {
      var r = await fetch(base + '/api/billing/portal?user_key=' + encodeURIComponent(getUserKey()), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      var rawText = await r.text();
      var d = null;
      try { d = rawText ? JSON.parse(rawText) : null; } catch (e) { console.error('[premium] portal JSON parse failed:', rawText.slice(0,300)); }
      if (!r.ok || !d || !d.url) {
        alert((d && d.detail) ? d.detail : ('Kon abonnement-beheer niet openen (' + r.status + ').'));
        return;
      }
      window.location.href = d.url;
    } catch (e) {
      console.error('[premium] portal network error:', e);
      alert('Geen verbinding. Probeer opnieuw.');
    }
  }


  // ─── Card-hub menu integratie (vervangt vorige floating pill) ────
  // Voegt "👑 Upgrade naar Premium" dynamisch toe aan de bestaande
  // drie-puntjes hub popover (extra-menu-v3.js) — zodat geen overlap
  // met tabs of bottom-nav meer optreedt.
  function injectIntoCardHub() {
    var POP_ID = 'dy-card-hub-pop';
    var ITEM_ID = 'dy-card-hub-premium';

    function tryInject(pop) {
      if (!pop || pop.querySelector('#' + ITEM_ID)) return;
      var firstItem = pop.querySelector('.dy-card-hub-item');
      var btn = document.createElement('button');
      btn.id = ITEM_ID;
      btn.type = 'button';
      btn.className = 'dy-card-hub-item dy-card-hub-item--premium';
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('data-testid', 'hub-upgrade-premium');
      btn.innerHTML =
        '<span class="dy-card-hub-item-icon" aria-hidden="true">' +
        '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '    <polygon points="3 8 8 12 12 4 16 12 21 8 19 19 5 19 3 8"/>' +
        '  </svg>' +
        '</span>' +
        '<span class="dy-card-hub-item-label">Upgrade naar Premium</span>' +
        '<span class="dy-card-hub-item-pill" aria-hidden="true">€6,99/m</span>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        // Sluit het hub-menu vóór we de modal openen
        try {
          var openBtn = document.querySelector('.dy-card-hub-toggle.open');
          if (openBtn) openBtn.click();
        } catch (err) { /* ignore */ }
        setTimeout(openUpgradeModal, 140);
      });

      // Plaats bovenaan, vóór 1e bestaande item
      if (firstItem) pop.insertBefore(btn, firstItem);
      else pop.appendChild(btn);

      // Voor premium users: label aanpassen naar "Beheer abonnement"
      fetchStatus(false).then(function (s) {
        if (s && s.is_premium) {
          var label = btn.querySelector('.dy-card-hub-item-label');
          var pill = btn.querySelector('.dy-card-hub-item-pill');
          if (label) label.textContent = 'Beheer Premium abonnement';
          if (pill) pill.textContent = 'Actief';
          btn.setAttribute('data-testid', 'hub-manage-premium');
          // Vervang click handler: open customer portal i.p.v. upgrade modal
          var clone = btn.cloneNode(true);
          btn.parentNode.replaceChild(clone, btn);
          clone.addEventListener('click', function (e) {
            e.stopPropagation();
            try {
              var openBtn = document.querySelector('.dy-card-hub-toggle.open');
              if (openBtn) openBtn.click();
            } catch (err) { /* ignore */ }
            setTimeout(openCustomerPortal, 140);
          });
        }
      });
    }

    // Bestaande popover (lazy gemaakt door extra-menu-v3 bij 1e open)
    var existing = document.getElementById(POP_ID);
    if (existing) tryInject(existing);

    // MutationObserver: zodra popover wordt aangemaakt of de items wijzigen,
    // injecteren we ons item. Idempotent dankzij ITEM_ID check.
    var obs = new MutationObserver(function () {
      var pop = document.getElementById(POP_ID);
      if (pop) tryInject(pop);
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  function injectIntoGarderobe() {
    // Hook in Mijn Garderobe overlay (geopend via card-actions). Voegt
    // een upgrade-CTA toe als gebruiker geen premium heeft.
    var obs = new MutationObserver(function () {
      var ov = document.getElementById('dy-garderobe-overlay');
      if (!ov || ov.querySelector('[data-testid="garderobe-premium-cta"]')) return;
      var header = ov.querySelector('header');
      if (!header) return;
      fetchStatus(false).then(function (s) {
        if (s && s.is_premium) return;
        var cta = document.createElement('button');
        cta.type = 'button';
        cta.setAttribute('data-testid', 'garderobe-premium-cta');
        cta.className = 'dy-prem-garderobe-cta';
        cta.innerHTML = '👑 Upgrade voor onbeperkte AI styling';
        cta.addEventListener('click', openUpgradeModal);
        header.parentNode.insertBefore(cta, header.nextSibling);
      });
    });
    obs.observe(document.body, { childList: true, subtree: false });
  }

  // ─── Styles ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dy-premium-styles')) return;
    var s = document.createElement('style');
    s.id = 'dy-premium-styles';
    s.textContent =
      '#dy-premium-modal{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:20px}' +
      '#dy-premium-modal .dy-prem-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 30% 20%, rgba(198,125,6,.22), rgba(20,15,5,.78))}' +
      '#dy-premium-modal .dy-prem-card{position:relative;max-width:440px;width:100%;background:linear-gradient(180deg,#fff9ec 0%,#fdf2d8 100%);border:1px solid rgba(120,70,4,.5);border-radius:22px;padding:28px 24px 22px;box-shadow:0 24px 72px -8px rgba(120,70,4,.4),0 4px 12px rgba(0,0,0,.12);color:#1a1304;font-family:"DM Sans",system-ui,sans-serif}' +
      '#dy-premium-modal .dy-prem-close{position:absolute;top:10px;right:14px;background:none;border:0;font-size:30px;line-height:1;color:#4a3208;cursor:pointer;padding:4px 10px}' +
      '#dy-premium-modal .dy-prem-crown{display:inline-block;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;font:700 11px/1 "DM Sans";letter-spacing:.16em;padding:6px 13px;border-radius:999px;margin-bottom:12px}' +
      '#dy-premium-modal h2{font:700 24px/1.2 "DM Sans";margin:0 0 4px;color:#241a08}' +
      '#dy-premium-modal .dy-prem-sub{margin:0 0 16px;font-size:14px;color:#4a3208}' +
      '#dy-premium-modal .dy-prem-perks{list-style:none;padding:0;margin:0 0 18px;display:flex;flex-direction:column;gap:8px}' +
      '#dy-premium-modal .dy-prem-perks li{padding:8px 12px 8px 36px;background:rgba(255,255,255,.7);border:1px solid rgba(120,70,4,.22);border-radius:10px;font-size:14px;position:relative;color:#241a08}' +
      '#dy-premium-modal .dy-prem-perks li::before{content:"✓";position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#7a4d04;font-weight:800}' +
      '#dy-premium-modal .dy-prem-email-label{display:block;font:600 12px "DM Sans";color:#4a3208;margin:0 0 6px;letter-spacing:.04em;text-transform:uppercase}' +
      '#dy-premium-modal #dy-prem-email{width:100%;padding:11px 14px;border:1px solid rgba(120,70,4,.4);border-radius:10px;background:#fff;font:500 15px "DM Sans";color:#1a1304;margin-bottom:14px;box-sizing:border-box}' +
      '#dy-premium-modal #dy-prem-email:focus{outline:none;border-color:#7a4d04;box-shadow:0 0 0 3px rgba(122,77,4,.25)}' +
      '#dy-premium-modal .dy-prem-pay{display:block;width:100%;padding:14px;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;border:0;border-radius:12px;font:700 16px "DM Sans";letter-spacing:.02em;cursor:pointer;box-shadow:0 8px 22px -4px rgba(122,77,4,.55);transition:transform .15s ease,box-shadow .15s ease}' +
      '#dy-premium-modal .dy-prem-pay:hover{transform:translateY(-1px);box-shadow:0 12px 28px -4px rgba(122,77,4,.7)}' +
      '#dy-premium-modal .dy-prem-pay:disabled{opacity:.7;cursor:not-allowed;transform:none}' +
      '#dy-premium-modal .dy-prem-fineprint{margin:10px 0 0;text-align:center;font-size:12px;color:#4a3208}' +
      '#dy-premium-modal .dy-prem-error{color:#7a1818;font-size:13px;margin-top:8px;min-height:18px;text-align:center;font-weight:600}' +
      // Card-hub menu item (Premium upgrade entry — vervangt floating pill)
      '.dy-card-hub-item--premium{border-top:1px solid rgba(120,70,4,.18);border-bottom:1px solid rgba(120,70,4,.18);margin-bottom:6px;color:#241a08 !important;background:linear-gradient(90deg,rgba(255,243,210,.95),rgba(253,242,216,.85)) !important;font-weight:700 !important}' +
      '.dy-card-hub-item--premium:hover,.dy-card-hub-item--premium:focus-visible{background:linear-gradient(90deg,rgba(255,233,170,.98),rgba(248,221,160,.92)) !important;outline:none}' +
      '.dy-card-hub-item--premium .dy-card-hub-item-icon{color:#7a4d04}' +
      '.dy-card-hub-item--premium .dy-card-hub-item-pill{margin-left:auto;background:linear-gradient(90deg,#7a4d04,#a56605);color:#fff;font:700 10px/1 "DM Sans";letter-spacing:.06em;padding:5px 9px;border-radius:999px}' +
      '.dy-prem-garderobe-cta{display:block;margin:10px 14px 6px;padding:11px 14px;background:linear-gradient(90deg,rgba(122,77,4,.14),rgba(165,102,5,.10));border:1px dashed rgba(120,70,4,.5);border-radius:12px;color:#4a3208;font:700 13px "DM Sans";cursor:pointer;text-align:center;width:calc(100% - 28px)}' +
      '.dy-prem-garderobe-cta:hover{background:linear-gradient(90deg,rgba(122,77,4,.22),rgba(165,102,5,.16));color:#241a08}' +
      '.dy-prem-return-toast{position:fixed;bottom:24px;left:50%;transform:translate(-50%,40px);background:#fff9ec;color:#1a1304;padding:14px 22px;border-radius:14px;border:1px solid rgba(120,70,4,.45);box-shadow:0 18px 40px -8px rgba(120,70,4,.4);font:600 14px "DM Sans";opacity:0;transition:opacity .35s ease,transform .35s ease;z-index:10060;max-width:420px;text-align:center}' +
      '.dy-prem-return-toast.is-show{opacity:1;transform:translate(-50%,0)}' +
      '.dy-prem-return-toast.is-ok{border-color:#7a4d04;background:linear-gradient(180deg,#fff9ec,#fdf2d8);color:#241a08}' +
      '.dy-prem-return-toast.is-err{border-color:#7a1818;color:#5a1818;background:#ffeaea}' +
      '@media (prefers-color-scheme: dark){' +
      '  #dy-premium-modal .dy-prem-card{background:linear-gradient(180deg,#1a1304,#0f0a02);color:#fdf2d8;border-color:rgba(232,167,60,.55)}' +
      '  #dy-premium-modal h2{color:#fdf2d8}' +
      '  #dy-premium-modal .dy-prem-sub,#dy-premium-modal .dy-prem-fineprint{color:#e6d6a4}' +
      '  #dy-premium-modal .dy-prem-perks li{background:rgba(255,255,255,.08);color:#fdf2d8;border-color:rgba(232,167,60,.35)}' +
      '  #dy-premium-modal .dy-prem-perks li::before{color:#f0c569}' +
      '  #dy-premium-modal #dy-prem-email{background:rgba(255,255,255,.10);color:#fdf2d8;border-color:rgba(232,167,60,.5)}' +
      '  #dy-premium-modal .dy-prem-email-label{color:#e6d6a4}' +
      '  #dy-premium-modal .dy-prem-close{color:#e6d6a4}' +
      '  #dy-premium-modal .dy-prem-error{color:#ffb3b3}' +
      '  .dy-card-hub-item--premium{background:linear-gradient(90deg,rgba(122,77,4,.4),rgba(85,53,3,.35)) !important;color:#fdf2d8 !important;border-color:rgba(232,167,60,.4)}' +
      '  .dy-card-hub-item--premium .dy-card-hub-item-icon{color:#f0c569}' +
      '  .dy-prem-return-toast{background:#1a1304;color:#fdf2d8;border-color:rgba(232,167,60,.5)}' +
      '  .dy-prem-return-toast.is-err{background:#3a0a0a;color:#ffd5d5;border-color:#8a3030}' +
      '  .dy-prem-garderobe-cta{background:linear-gradient(90deg,rgba(232,167,60,.18),rgba(232,167,60,.10));color:#f0c569;border-color:rgba(232,167,60,.5)}' +
      '  .dy-prem-garderobe-cta:hover{color:#fdf2d8}' +
      '}';
    document.head.appendChild(s);
  }

  // ─── Public API ──────────────────────────────────────────────────
  window.DY = window.DY || {};
  window.DY.premium = {
    isPremium: isPremium,
    status: fetchStatus,
    openUpgrade: openUpgradeModal,
    openPortal: openCustomerPortal,
    getUserKey: getUserKey,
  };

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    checkReturnFromStripe();
    injectIntoCardHub();
    injectIntoGarderobe();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
