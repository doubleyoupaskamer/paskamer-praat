// ═══════════════════════════════════════════════════════════════════
// Doubleyou - Premium Tier v60 (Shopify checkout migration)
//
// v60 changes (vs v55):
//   • Stripe checkout vervangen door directe Shopify cart-redirect
//   • Premium-product wordt op doubleyousmallandtall.nl gefactureerd
//   • Backend webhook activeert premium na bevestigde Shopify-betaling
//   • Return-flow: ?premium=success (geen session_id meer nodig)
//
// Shopify-flow + premium status caching. Non-invasief:
//   - Voegt premium-status check toe aan window.DY.premium
//   - Voegt "Upgrade" item toe aan extra-menu hub (boven aan)
//   - Toont upgrade-modal met perks + Shopify checkout button
//   - Handelt success/cancel redirect af via ?premium=success
//   - Cached premium status in localStorage (5 min TTL) om backend te ontlasten
// ═══════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__ppPremiumInit) return;
  window.__ppPremiumInit = true;

  var PKG_ID = 'premium_monthly';
  var LS_CACHE = 'dy_premium_cache';
  var LS_USERKEY = 'dy_premium_userkey'; // anoniem fallback id

  // ─── Shopify Premium Config ──────────────────────────────────────
  // Vul de Variant-ID van het Premium-maand-product hieronder in
  // (zie SETUP_PREMIUM.md voor de stappen om 'm op te halen).
  var PP_SHOPIFY_PREMIUM = {
    shop_domain: 'doubleyousmallandtall.nl',
    variants: {
      'monthly': '57525570273624',   // Variant-ID voor "Premium Paskamerpraat" (€4,99 / maand)
      'yearly':  ''                  // (optioneel) Variant-ID voor jaarabonnement
    },
    return_path: '/?premium=success'
  };

  // ─── Helpers ─────────────────────────────────────────────────────
  // Hardcoded LIVE backend fallback - used als aiHealth nog niet geladen is
  // bij vroege click (race condition op iOS PWA). Komt overeen met
  // LIVE_BACKEND in ai-health-v1.js.
  var LIVE_BACKEND_FALLBACK = 'https://paskamer-stability.preview.emergentagent.com';
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
      // v60.1.62: TTL verlaagd van 5min naar 30s voor aggressievere refresh
      if (Date.now() - o.ts > 30 * 1000) return null;
      // v60.1.62: verifieer dat cache bij huidige user hoort (anti-leak)
      var curEmail = (getEmailFromAuth() || '').toLowerCase();
      var curKey = (getUserKey() || '').toLowerCase();
      if (o._owner_email && curEmail && o._owner_email !== curEmail) return null;
      if (o._owner_key && curKey && o._owner_key !== curKey) return null;
      return o;
    } catch (e) { return null; }
  }
  function setCached(state) {
    try {
      // v60.1.62: tag cache met owner zodat user-switch hem niet hergebruikt
      var payload = Object.assign({}, state, {
        ts: Date.now(),
        _owner_email: (getEmailFromAuth() || '').toLowerCase(),
        _owner_key: (getUserKey() || '').toLowerCase(),
      });
      localStorage.setItem(LS_CACHE, JSON.stringify(payload));
    } catch (e) { /* ignore */ }
  }

  async function fetchStatus(force) {
    if (!force) {
      var c = getCached();
      if (c) return c;
    }
    var base = apiBase();
    if (!base) return { is_premium: false };
    try {
      // v60.1.56: stuur email mee zodat backend admin-override kan toepassen
      var emailParam = '';
      try {
        var ae = getEmailFromAuth();
        if (ae) emailParam = '&email=' + encodeURIComponent(ae);
      } catch (e) { /* ignore */ }
      var r = await fetch(base + '/api/premium/status?user_key=' + encodeURIComponent(getUserKey()) + emailParam, { cache: 'no-store' });
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

  // v60.1.60: luister naar session-events voor cache-isolatie
  document.addEventListener('pp:logout', function() {
    try { localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ }
    var modal = document.getElementById('dy-prem-manage-overlay');
    if (modal) modal.remove();
  });
  document.addEventListener('pp:userchange', function() {
    try { localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ }
    // Forceer fresh fetch voor nieuwe user
    setTimeout(function() { fetchStatus(true); }, 50);
  });

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
      '  <p class="dy-prem-sub">Onbeperkt AI styling voor €4,99/maand</p>' +
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
      '  <p class="dy-prem-fineprint">Veilige betaling via Shopify. Annuleer wanneer je wilt.</p>' +
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
      // ── Shopify Premium flow ──────────────────────────────────────
      var cfg = PP_SHOPIFY_PREMIUM;
      var plan = 'monthly';
      var variantId = cfg.variants[plan];
      if (!variantId) {
        if (err) err.textContent = 'Premium-koppeling wordt geconfigureerd. Probeer later opnieuw.';
        console.warn('[premium] Geen Shopify Variant-ID ingevuld voor', plan);
        payBtn.disabled = false;
        payBtn.textContent = 'Start Premium →';
        return;
      }

      var userKey = email || getUserKey();
      var domain = (cfg.shop_domain || 'doubleyousmallandtall.nl').replace(/^https?:\/\//,'').replace(/\/$/,'');
      var returnTo = window.location.origin + (cfg.return_path || '/?premium=success');

      // v60.1.117: force checkout-email naar de ingelogde gebruiker (override Shop Pay device-cache)
      var params = [
        'attributes%5Bpremium_user_key%5D=' + encodeURIComponent(userKey),
        'attributes%5Bpremium_email%5D=' + encodeURIComponent(email),
        'attributes%5Bpremium_plan%5D=' + encodeURIComponent(plan),
        'return_to=' + encodeURIComponent(returnTo)
      ];
      if (email) {
        params.push('checkout%5Bemail%5D=' + encodeURIComponent(email));
        params.push('checkout%5Bnote%5D=' + encodeURIComponent('Premium ' + plan + ' voor account=' + email));
      }
      var url = 'https://' + domain + '/cart/' + encodeURIComponent(variantId) + ':1?' + params.join('&');

      // Save pending marker (voor de return-toast)
      try {
        localStorage.setItem('dy_premium_pending', 'shopify:' + plan + ':' + Date.now());
      } catch (e) { /* ignore */ }

      console.info('[premium] Redirecting to Shopify:', url);
      // Same-tab redirect ipv popup (geen blocker-issues)
      window.location.href = url;
    } catch (e) {
      console.error('[premium] Unexpected error in startCheckout:', e);
      if (err) err.textContent = 'Onverwachte fout: ' + (e && e.message ? e.message : 'probeer opnieuw');
      payBtn.disabled = false;
      payBtn.textContent = 'Start Premium →';
    }
  }

  // ─── Return-flow polling (Shopify) ───────────────────────────────
  // Na Shopify checkout return: poll /api/premium/status tot is_premium=true
  // (webhook moet binnen ~30s premium activeren in MongoDB)
  async function pollPremiumStatus(attempts) {
    attempts = attempts || 0;
    if (attempts > 12) {  // 12 * 2.5s = 30s max
      return showReturnToast('Betaling ontvangen, maar status wordt nog verwerkt. Vernieuw over 1 min.', false);
    }
    try {
      var s = await fetchStatus(true);  // force refresh, bypass cache
      if (s && s.is_premium) {
        try { localStorage.removeItem('dy_premium_pending'); localStorage.removeItem(LS_CACHE); } catch (e) { /* ignore */ }
        return showReturnToast('Welkom bij Premium! 👑 Alle AI-features zijn onbeperkt.', true);
      }
    } catch (e) { /* ignore */ }
    setTimeout(function () { pollPremiumStatus(attempts + 1); }, 2500);
  }

  // Behoud oude pollStatus voor backwards compat — verwijst nu naar nieuwe Shopify-flow
  async function pollStatus(sessionId, attempts) {
    return pollPremiumStatus(attempts);
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

  function checkReturnFromShopify() {
    var u = new URL(window.location.href);
    var sid = u.searchParams.get('session_id');
    var p = u.searchParams.get('premium');
    if (!sid && !p) return;
    if (p === 'success') {
      // Shopify-flow: geen session_id meer nodig, poll gewoon de premium status
      pollPremiumStatus(0);
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
  // v60.1.59: vervangt vorige alert/portal-call door volwaardige in-app
  // beheer-modal. Geen 501-alert meer - graceful fallback voor alle states.
  async function openCustomerPortal() {
    var modal = document.getElementById('dy-prem-manage-overlay');
    if (modal) { modal.remove(); }
    var overlay = document.createElement('div');
    overlay.id = 'dy-prem-manage-overlay';
    overlay.setAttribute('data-testid', 'prem-manage-overlay');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(11,9,5,.78);' +
      'backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;' +
      'animation:dyPremFade .2s ease;font-family:"DM Sans",system-ui,sans-serif';
    overlay.innerHTML =
      '<style>' +
        '@keyframes dyPremFade{from{opacity:0}to{opacity:1}}' +
        '@keyframes dyPremSlide{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
        '.dy-prem-card{background:#1e1a0f;border:1px solid rgba(212,145,10,.28);border-radius:18px;max-width:480px;width:100%;color:#fcf8ef;padding:28px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6);animation:dyPremSlide .25s ease}' +
        '.dy-prem-card .dy-prem-eyebrow{font:600 11px/1 "DM Sans",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#d4910a;margin:0 0 8px}' +
        '.dy-prem-card h2{font:400 1.55rem/1.15 "DM Serif Display","Cormorant Garamond",Georgia,serif;margin:0 0 6px}' +
        '.dy-prem-card .dy-prem-sub{margin:0 0 18px;color:rgba(252,248,239,.65);font-size:.85rem}' +
        '.dy-prem-card .dy-prem-pill{display:inline-block;padding:5px 11px;border-radius:100px;font:600 .7rem/1.2 "DM Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;margin-right:6px;margin-bottom:6px}' +
        '.dy-prem-card .dy-prem-pill.ok{background:rgba(34,197,94,.18);color:#5fd592}' +
        '.dy-prem-card .dy-prem-pill.warn{background:rgba(245,158,11,.18);color:#f5b94a}' +
        '.dy-prem-card .dy-prem-pill.test{background:rgba(212,145,10,.18);color:#d4910a}' +
        '.dy-prem-card .dy-prem-pill.fail{background:rgba(239,68,68,.18);color:#ff8585}' +
        '.dy-prem-kv{display:grid;grid-template-columns:1fr 1.2fr;gap:8px 14px;font-size:.86rem;margin:14px 0 20px;padding:14px 16px;background:rgba(255,255,255,.03);border-radius:12px;border:1px solid rgba(252,248,239,.06)}' +
        '.dy-prem-kv dt{color:rgba(252,248,239,.55);font-weight:500}' +
        '.dy-prem-kv dd{margin:0;color:#fcf8ef;word-break:break-word}' +
        '.dy-prem-feat{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:0 0 18px}' +
        '.dy-prem-feat li{list-style:none;display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);border-radius:8px;font-size:.78rem;color:rgba(252,248,239,.92)}' +
        '.dy-prem-feat li::before{content:"";width:6px;height:6px;border-radius:50%;background:#5fd592;flex-shrink:0}' +
        '.dy-prem-actions{display:flex;flex-direction:column;gap:8px}' +
        '.dy-prem-btn{font:600 .88rem/1 "DM Sans",sans-serif;padding:12px 18px;border-radius:100px;cursor:pointer;border:none;transition:all .15s ease;text-decoration:none;text-align:center;display:inline-block}' +
        '.dy-prem-btn.primary{background:#d4910a;color:#1e1a0f}' +
        '.dy-prem-btn.primary:hover{background:#b87807;transform:translateY(-1px)}' +
        '.dy-prem-btn.ghost{background:transparent;color:#fcf8ef;border:1px solid rgba(252,248,239,.16)}' +
        '.dy-prem-btn.ghost:hover{border-color:#d4910a;color:#d4910a}' +
        '.dy-prem-btn.danger{background:transparent;color:#ff8585;border:1px solid rgba(239,68,68,.3)}' +
        '.dy-prem-btn.danger:hover{background:rgba(239,68,68,.08)}' +
        '.dy-prem-close{position:absolute;top:14px;right:18px;font-size:24px;line-height:1;color:rgba(252,248,239,.45);background:none;border:none;cursor:pointer;padding:6px}' +
        '.dy-prem-close:hover{color:#fcf8ef}' +
      '</style>' +
      '<div class="dy-prem-card" style="position:relative" role="dialog" aria-modal="true" data-testid="prem-manage-card">' +
        '<button class="dy-prem-close" data-testid="prem-manage-close" aria-label="Sluiten" onclick="document.getElementById(\'dy-prem-manage-overlay\').remove()">×</button>' +
        '<p class="dy-prem-eyebrow">Premium account</p>' +
        '<h2>Beheer je abonnement</h2>' +
        '<div data-testid="prem-manage-body" id="dy-prem-manage-body">' +
          '<p class="dy-prem-sub">Status laden…</p>' +
        '</div>' +
      '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Load status (force-fresh) + render
    var status = await fetchStatus(true);
    renderManageBody(status || { is_premium: false });
  }

  function _formatDate(iso) {
    if (!iso || iso === 'admin-override') return null;
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return null; }
  }
  function _esc(s) { var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }

  function renderManageBody(status) {
    var body = document.getElementById('dy-prem-manage-body');
    if (!body) return;
    var isPrem = !!(status && status.is_premium);
    var plan = (status && (status.plan || '')) || '';
    var src = isPrem
      ? (plan === 'premium_admin'  ? 'admin-toegang'
        : plan === 'premium_grant' ? 'handmatig toegekend'
        : plan === 'premium_monthly' ? 'Shopify (€4,99/maand)'
        : plan === 'premium_monthly_shopify' ? 'Shopify (€4,99/maand)'
        : plan === 'premium_yearly_shopify' ? 'Shopify (jaar-abonnement)'
        : 'actief')
      : null;
    var activated = _formatDate(status && status.activated_at);
    var expires   = _formatDate(status && status.expires_at);
    var emailNow  = (status && status.email) || getEmailFromAuth() || getUserKey();

    if (!isPrem) {
      body.innerHTML =
        '<p class="dy-prem-sub">Je hebt op dit moment <strong>geen actief Premium abonnement</strong>. Ontgrendel onbeperkt try-on, AI Style Score &amp; meer.</p>' +
        '<div class="dy-prem-kv" data-testid="prem-status-block">' +
          '<dt>Status</dt><dd><span class="dy-prem-pill fail">Niet actief</span></dd>' +
          '<dt>Account</dt><dd>' + _esc(emailNow || ' - ') + '</dd>' +
        '</div>' +
        '<div class="dy-prem-actions">' +
          '<button class="dy-prem-btn primary" data-testid="prem-cta-upgrade" onclick="document.getElementById(\'dy-prem-manage-overlay\').remove(); PP_Premium.openUpgrade();">Word Premium - €4,99/maand</button>' +
          '<button class="dy-prem-btn ghost" onclick="document.getElementById(\'dy-prem-manage-overlay\').remove()">Sluiten</button>' +
        '</div>';
      return;
    }

    var pillClass = plan === 'premium_admin' ? 'test' : 'ok';
    var pillLabel = plan === 'premium_admin' ? 'Admin' : 'Actief';

    var manageBtns = '';
    if (plan === 'premium_monthly' || plan === 'premium_monthly_shopify' || plan === 'premium_yearly_shopify') {
      // Shopify-paid user: ondersteuning via e-mail tot Shopify Customer Portal live is
      var mailto = 'mailto:info@doubleyousmallandtall.nl?subject=' +
        encodeURIComponent('Opzeggen Premium - ' + (emailNow || '')) +
        '&body=' + encodeURIComponent('Hoi, ik wil mijn Premium abonnement opzeggen.\nE-mail: ' + (emailNow || ''));
      manageBtns =
        '<a class="dy-prem-btn ghost" href="' + mailto + '" data-testid="prem-mailto-cancel">Opzeggen via e-mail</a>';
    } else if (plan === 'premium_admin') {
      manageBtns = '<p class="dy-prem-sub" style="margin:0">Deze toegang is verleend via admin-override. Beheer via Admin → Premium.</p>';
    } else {
      // Grant / unknown source
      manageBtns =
        '<p class="dy-prem-sub" style="margin:0 0 4px">Toegang handmatig toegekend. Neem contact op met support voor wijzigingen.</p>' +
        '<a class="dy-prem-btn ghost" href="mailto:info@doubleyousmallandtall.nl?subject=Premium%20account%20vraag">Contact support</a>';
    }

    // Volgende factuur datum: alleen tonen voor abonnement-gebaseerde Premium-users.
    // De expires_at vertegenwoordigt het einde van de huidige periode,
    // wat tegelijk de eerstvolgende incasso-datum is.
    var isShopifySub = (plan === 'premium_monthly' || plan === 'premium_monthly_shopify' || plan === 'premium_yearly_shopify');
    var volgendeFactuur = isShopifySub ? _formatDate(status && status.expires_at) : null;

    body.innerHTML =
      '<p class="dy-prem-sub">Bedankt dat je Premium gebruikt. Hier zie je je status, vervaldatum en beheeropties.</p>' +
      '<div class="dy-prem-kv" data-testid="prem-status-block">' +
        '<dt>Status</dt><dd><span class="dy-prem-pill ' + pillClass + '">' + pillLabel + '</span></dd>' +
        '<dt>Plan</dt><dd>' + _esc(src || ' - ') + '</dd>' +
        (activated ? '<dt>Sinds</dt><dd>' + _esc(activated) + '</dd>' : '') +
        (expires   ? '<dt>' + (isShopifySub ? 'Periode tot' : 'Vervalt op') + '</dt><dd>' + _esc(expires) + '</dd>' : '') +
        (volgendeFactuur ? '<dt>Volgende factuur</dt><dd data-testid="prem-volgende-factuur">' + _esc(volgendeFactuur) + ' (€4,99 via Shopify)</dd>' : '') +
        '<dt>Account</dt><dd>' + _esc(emailNow || ' - ') + '</dd>' +
      '</div>' +
      '<ul class="dy-prem-feat" data-testid="prem-feat-list">' +
        '<li>Virtual Try-on</li>' +
        '<li>AI Style Score</li>' +
        '<li>AI Fit Chat</li>' +
        '<li>Vergelijkbaar zoeken</li>' +
        '<li>Outfit analyse</li>' +
        '<li>Premium badge</li>' +
      '</ul>' +
      '<div class="dy-prem-actions">' +
        manageBtns +
        '<button class="dy-prem-btn ghost" data-testid="prem-manage-dismiss" onclick="document.getElementById(\'dy-prem-manage-overlay\').remove()">Doorgaan</button>' +
      '</div>';
  }


  // ─── Card-hub menu integratie (vervangt vorige floating pill) ────
  // Voegt "👑 Upgrade naar Premium" dynamisch toe aan de bestaande
  // drie-puntjes hub popover (extra-menu-v3.js) - zodat geen overlap
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
        '<span class="dy-card-hub-item-pill" aria-hidden="true">€4,99/m</span>';
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

      // v60.1.62: ALTIJD force-fresh fetch bij menu-open (geen stale cache)
      // Voor premium users: label aanpassen naar "Beheer abonnement"
      fetchStatus(true).then(function (s) {
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
      // Card-hub menu item (Premium upgrade entry - vervangt floating pill)
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
  // v60.1.59 alias - gebruikt in inline onclick van manage-modal
  window.PP_Premium = window.DY.premium;

  // ─── Init ────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    checkReturnFromShopify();
    injectIntoCardHub();
    injectIntoGarderobe();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
