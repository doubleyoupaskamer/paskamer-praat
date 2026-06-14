/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat — Klant Wallet Module (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Toevoegingen ZONDER bestaande code te wijzigen:
 *   - Nieuwe route 'wallet' via DY.toonPagina wrapper
 *   - Knop in hamburger-menu (auto-inject als die bestaat)
 *   - Renders: huidig saldo + transactie-history + "Saldo opwaarderen" button
 *
 * Werking:
 *   - Leest users/{uid}.wallet_balance via Firestore (rules: self-read)
 *   - Leest payments.where('uid','==', user) voor history
 *   - Topup-button opent Shopify hosted checkout URL in nieuw tab
 *     (URL configurable via admin_settings/global.shopify_config.topup_checkout_url)
 *
 * Backend-onafhankelijk:
 *   Voor MVP werkt de UI ZONDER backend Shopify integratie. Admin moet
 *   handmatig wallet adjust doen via admin_wallet na betaling. Met
 *   firebase-admin SDK + webhook setup wordt dit automatisch.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isLogged() { return !!(window.DY && window.DY.user && window.DY.user.uid); }
  function uid()      { return (window.DY && window.DY.user && window.DY.user.uid) || null; }
  function db()       { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function loader()   { return '<div class="bp-loader">Wallet laden...</div>'; }
  function toast(msg, err) {
    if (window.DY && typeof window.DY.toast === 'function') return window.DY.toast(msg, err);
  }

  // ── HOOFD-RENDER ───────────────────────────────────────────────────
  async function renderWallet() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.style.background = '#0a0806';
    main.style.paddingBottom = '90px';
    main.innerHTML = '<div class="bp-page">' + loader() + '</div>';

    if (!isLogged()) {
      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<h1>Wallet</h1>' +
          '<div class="bp-empty">' +
            '<div class="bp-empty-titel">Niet ingelogd</div>' +
            '<div>Log in om je saldo en transacties te bekijken.</div>' +
            '<button class="bp-btn bp-btn-primair" style="margin-top:14px" onclick="window.DY.navigeer(\'login\')" data-testid="wallet-login-cta">Inloggen</button>' +
          '</div>' +
        '</div>';
      return;
    }

    try {
      var u = uid();
      // 1. Saldo + valuta uit user doc
      var userSnap = await db().collection('users').doc(u).get();
      var userData = userSnap.exists ? userSnap.data() : {};
      var balance = Number(userData.wallet_balance || 0);
      var currency = userData.wallet_currency || 'EUR';

      // 2. Topup URL uit admin_settings (fallback: empty → toon "binnenkort beschikbaar")
      var settingsSnap = await db().collection('admin_settings').doc('global').get();
      var settings = settingsSnap.exists ? settingsSnap.data() : {};
      var shopCfg = settings.shopify_config || {};
      var topupUrl = shopCfg.topup_checkout_url || '';
      var topupEnabled = (settings.feature_flags || {}).wallet_topup_enabled === true && !!topupUrl;

      // 3. Recente transacties uit payments collectie (max 20)
      var txRows = [];
      try {
        var paySnap = await db().collection('payments')
          .where('uid','==', u).orderBy('created_at','desc').limit(20).get();
        paySnap.forEach(function(d) {
          var p = d.data();
          var amount = (p.amount_cents || 0) / 100;
          var sign = amount >= 0 ? '+' : '';
          var typeLabel = ({
            topup:        'Opwaardering',
            spend:        'Campagne uitgave',
            refund:       'Terugbetaling',
            manual_adjust:'Handmatige correctie',
            campaign_charge:'Campagne kosten'
          })[p.type] || p.type;
          var statusBadge = '<span class="bp-badge bp-badge-' + esc(p.status || 'pending') + '">' + esc(p.status || '?') + '</span>';
          var dateStr = (p.created_at && p.created_at.toDate)
            ? p.created_at.toDate().toLocaleDateString('nl-NL', { year:'numeric', month:'short', day:'numeric' })
            : (typeof p.created_at === 'string' ? p.created_at.slice(0,10) : '-');
          txRows.push(
            '<tr data-testid="wallet-tx-' + esc(d.id) + '">' +
              '<td>' + esc(dateStr) + '</td>' +
              '<td>' + esc(typeLabel) + '</td>' +
              '<td class="bp-tx-amount ' + (amount >= 0 ? 'positive' : 'negative') + '">' + sign + '€ ' + amount.toFixed(2) + '</td>' +
              '<td>' + statusBadge + '</td>' +
            '</tr>'
          );
        });
      } catch(e) {
        // Geen transacties of geen rechten — laat history leeg
        try { console.warn('[wallet] payments query:', e.code); } catch(_){}
      }

      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.history.length > 1 ? window.history.back() : window.DY.navigeer(\'feed\')" data-testid="wallet-back">&larr; Terug</button>' +
          '<div class="bp-wallet-hero" data-testid="wallet-hero">' +
            '<span class="bp-header-eyebrow">Jouw wallet</span>' +
            '<h1>Saldo</h1>' +
            '<div class="bp-wallet-saldo" data-testid="wallet-saldo">' +
              '<span class="bp-wallet-saldo-valuta">' + esc(currency === 'EUR' ? '€' : currency) + '</span>' +
              '<span class="bp-wallet-saldo-num">' + balance.toFixed(2) + '</span>' +
            '</div>' +
            '<div class="bp-wallet-acties">' +
              (topupEnabled
                ? '<button class="bp-btn bp-btn-primair" onclick="PP_Wallet.topup()" data-testid="wallet-topup-btn">Saldo opwaarderen</button>'
                : '<button class="bp-btn bp-btn-primair" disabled title="Opwaarderen wordt binnenkort beschikbaar" data-testid="wallet-topup-disabled">Opwaarderen (binnenkort)</button>'
              ) +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_Wallet.refresh()" data-testid="wallet-refresh">↻ Vernieuwen</button>' +
            '</div>' +
            (!topupEnabled
              ? '<p class="bp-mini" style="margin-top:8px;opacity:0.7">De betaalfunctie wordt geactiveerd zodra de Shopify-checkout is geconfigureerd.</p>'
              : '') +
          '</div>' +

          '<h2 class="bp-section-titel" style="margin-top:28px">Transacties</h2>' +
          (txRows.length
            ? '<div class="bp-tabel-scroll"><table class="bp-tabel" data-testid="wallet-tx-tabel"><thead><tr><th>Datum</th><th>Type</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>' + txRows.join('') + '</tbody></table></div>'
            : '<div class="bp-empty"><div class="bp-empty-titel">Nog geen transacties</div><div>Je transactiehistorie verschijnt hier na je eerste opwaardering.</div></div>'
          ) +
        '</div>';
    } catch(e) {
      main.innerHTML =
        '<div class="bp-page">' +
          '<div class="bp-empty">' +
            '<div class="bp-empty-titel">Fout bij laden</div>' +
            '<div>' + esc(e.message || 'Onbekende fout') + '</div>' +
            '<button class="bp-btn bp-btn-primair" style="margin-top:14px" onclick="PP_Wallet.refresh()">Opnieuw proberen</button>' +
          '</div>' +
        '</div>';
    }
  }

  // ── TOPUP ──────────────────────────────────────────────────────────
  async function topup() {
    try {
      var s = await db().collection('admin_settings').doc('global').get();
      var url = (s.exists && s.data() && s.data().shopify_config || {}).topup_checkout_url;
      if (!url) { toast('Opwaarderen nog niet beschikbaar', true); return; }
      // Append uid + return_url als query params zodat Shopify webhook ze terug stuurt
      var u = encodeURIComponent(uid() || '');
      var ret = encodeURIComponent(window.location.origin + '/?pagina=wallet');
      var sep = url.indexOf('?') === -1 ? '?' : '&';
      window.open(url + sep + 'wallet_uid=' + u + '&return_url=' + ret, '_blank', 'noopener');
    } catch(e) {
      toast('Fout: ' + e.message, true);
    }
  }

  function refresh() { renderWallet(); }

  // ── ROUTE REGISTRATIE via wrapper (geen BP_PAGES mutatie) ─────────
  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_wallet_wrapped) return;
    window.DY._pp_wallet_wrapped = true;
    var orig = window.DY.toonPagina;
    window.DY.toonPagina = function(pagina) {
      if (pagina === 'wallet') {
        window.DY.pagina = pagina;
        return renderWallet();
      }
      return orig.apply(this, arguments);
    };
  }

  // ── MENU INJECTIE (vindt hamburger of profile-area en injecteer link) ─
  function injectMenuLink() {
    // Probeer hamburger-menu
    var menu = document.querySelector('#extra-menu-list, .extra-menu-list, [data-testid="extra-menu"]');
    if (menu && !menu.querySelector('[data-testid="menu-wallet"]')) {
      var li = document.createElement('li');
      li.innerHTML =
        '<button class="extra-menu-btn" onclick="window.DY.navigeer(\'wallet\'); var m=this.closest(\'.extra-menu-overlay\'); if(m) m.style.display=\'none\'" data-testid="menu-wallet">' +
          '<i class="fa-solid fa-wallet" style="margin-right:8px"></i>Mijn wallet' +
        '</button>';
      menu.appendChild(li);
    }
  }

  function init() {
    registerRoute();
    // Observer voor late-loaded hamburger menu
    var obs = new MutationObserver(injectMenuLink);
    obs.observe(document.body, { childList: true, subtree: true });
    injectMenuLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  window.PP_Wallet = {
    renderWallet: renderWallet,
    topup:        topup,
    refresh:      refresh,
    VERSION:      '1.0.0'
  };
})();
