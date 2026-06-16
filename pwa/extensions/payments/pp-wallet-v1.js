/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Klant Wallet Module (v1.1.0 - Shopify direct checkout)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Toevoegingen ZONDER bestaande code te wijzigen:
 *   - Nieuwe route 'wallet' via DY.toonPagina wrapper
 *   - Knop in hamburger-menu (auto-inject als die bestaat)
 *   - Renders: huidig saldo + transactie-history + "Saldo opwaarderen" buttons
 *
 * Werking (v1.1.0):
 *   - Top-up bedragen zijn vaste Shopify producten (€25 / €50 / €100 / €250)
 *   - Iedere knop bouwt direct: https://{SHOP_DOMAIN}/cart/{VARIANT_ID}:1?attributes[...]
 *     Zo slaat de gebruiker de Shopify storefront over en gaat direct naar checkout.
 *   - De uid van het ingelogde merk + amount_cents reizen mee als cart-attributes
 *     en komen in `note_attributes` van de Shopify Order terecht.
 *   - Backend webhook /api/wallet/webhook/shopify pakt deze attributes op,
 *     verifieert HMAC en credit `users/{uid}.wallet_balance` via Firebase Admin.
 *
 * CONFIG (PP_SHOPIFY_TOPUPS): vul je 4 variant-IDs in onderaan dit bestand.
 *   - Eenmalig instellen → daarna alles automatisch.
 *
 * Override via Firestore (optioneel, geen redeploy nodig):
 *   admin_settings/global.shopify_config = {
 *     shop_domain: 'doubleyousmallandtall.nl',
 *     variants: { '25': '12345', '50': '23456', '100': '34567', '250': '45678' }
 *   }
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  // ────────── HARD-CODED CONFIG (mag je hier aanpassen) ──────────
  // Vul de Variant-IDs in zodra je de 4 Shopify producten hebt aangemaakt.
  // Variant-ID ophalen → zie SETUP_SHOPIFY.md (Shopify Admin → Product → Variant URL).
  var PP_SHOPIFY_TOPUPS = {
    shop_domain: 'doubleyousmallandtall.nl',  // jouw custom domein
    variants: {
      '25':  '57524873855320',   // Variant-ID voor €25 top-up
      '50':  '57524878410072',   // Variant-ID voor €50 top-up
      '100': '57524916879704',   // Variant-ID voor €100 top-up
      '250': '57524918616408'    // Variant-ID voor €250 top-up
    },
    return_path: '/?pagina=wallet&topup=success'
  };
  // ───────────────────────────────────────────────────────────────

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

      // 2. Shopify topup config (lokaal default + Firestore override)
      var settingsSnap = await db().collection('admin_settings').doc('global').get();
      var settings = settingsSnap.exists ? settingsSnap.data() : {};
      var shopCfg = Object.assign({}, PP_SHOPIFY_TOPUPS, settings.shopify_config || {});
      shopCfg.variants = Object.assign({}, PP_SHOPIFY_TOPUPS.variants, (settings.shopify_config || {}).variants || {});
      // Topup is enabled zodra er minimaal 1 variant-ID is ingevuld
      var topupEnabled = Object.keys(shopCfg.variants).some(function(k){ return !!shopCfg.variants[k]; });
      // Cache config for topup()
      window.PP_SHOPIFY_TOPUPS_RESOLVED = shopCfg;

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
        // Geen transacties of geen rechten - laat history leeg
        try { console.warn('[wallet] payments query:', e.code); } catch(_){}
      }

      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'brand_dashboard\')" data-testid="wallet-back">&larr; Dashboard</button>' +
          '<div class="bp-wallet-hero" data-testid="wallet-hero">' +
            '<span class="bp-header-eyebrow">Merken wallet</span>' +
            '<h1>Saldo</h1>' +
            '<div class="bp-wallet-saldo" data-testid="wallet-saldo">' +
              '<span class="bp-wallet-saldo-valuta">' + esc(currency === 'EUR' ? '€' : currency) + '</span>' +
              '<span class="bp-wallet-saldo-num">' + balance.toFixed(2) + '</span>' +
            '</div>' +
            '<div class="bp-wallet-acties">' +
              (topupEnabled
                ? '<button class="bp-btn bp-btn-primair" onclick="PP_Wallet.openTopup()" data-testid="wallet-topup-btn">Saldo opwaarderen</button>'
                : '<button class="bp-btn bp-btn-primair" disabled title="Opwaarderen wordt binnenkort beschikbaar" data-testid="wallet-topup-disabled">Opwaarderen (binnenkort)</button>'
              ) +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_Wallet.refresh()" data-testid="wallet-refresh">↻ Vernieuwen</button>' +
            '</div>' +
            (!topupEnabled
              ? '<p class="bp-mini" style="margin-top:8px;opacity:0.7">De betaalfunctie wordt geactiveerd zodra de Shopify-checkout is geconfigureerd.</p>'
              : '') +
          '</div>' +

          // ── Tabs ─────────────────────────────────────────────
          '<div class="bp-wallet-tabs" data-testid="wallet-tabs">' +
            '<button class="bp-wallet-tab on" data-tab="overzicht" onclick="PP_Wallet.switchTab(this,\'overzicht\')" data-testid="wallet-tab-overzicht">Overzicht</button>' +
            '<button class="bp-wallet-tab" data-tab="opwaarderen" onclick="PP_Wallet.switchTab(this,\'opwaarderen\')" data-testid="wallet-tab-opwaarderen">Opwaarderen</button>' +
            '<button class="bp-wallet-tab" data-tab="transacties" onclick="PP_Wallet.switchTab(this,\'transacties\')" data-testid="wallet-tab-transacties">Transacties</button>' +
          '</div>' +

          // Tab content: Overzicht (default open)
          '<div class="bp-wallet-tabpanel" data-panel="overzicht" data-testid="wallet-panel-overzicht">' +
            '<div class="bp-stat-grid" style="margin-top:14px">' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Saldo</div><div class="bp-stat-num">€' + balance.toFixed(2) + '</div></div>' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Transacties</div><div class="bp-stat-num">' + txRows.length + '</div></div>' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Valuta</div><div class="bp-stat-num">' + esc(currency) + '</div></div>' +
            '</div>' +
            '<p class="bp-mini" style="margin-top:14px">Je wallet wordt automatisch bijgewerkt na een succesvolle betaling via Shopify. Bij vragen: neem contact op met support.</p>' +
          '</div>' +

          // Tab content: Opwaarderen
          '<div class="bp-wallet-tabpanel" data-panel="opwaarderen" style="display:none" data-testid="wallet-panel-opwaarderen">' +
            '<h2 class="bp-section-titel" style="margin-top:18px">Kies een bedrag</h2>' +
            (topupEnabled
              ? '<div class="bp-topup-grid">' +
                  [25,50,100,250].filter(function(amt){
                    return !!shopCfg.variants[String(amt)];
                  }).map(function(amt){
                    return '<button class="bp-topup-bedrag" onclick="PP_Wallet.topup(' + amt + ')" data-testid="wallet-topup-' + amt + '">€ ' + amt + '</button>';
                  }).join('') +
                '</div>' +
                '<p class="bp-mini" style="margin-top:14px">Je wordt doorgestuurd naar de Shopify checkout op <strong>' + esc(shopCfg.shop_domain) + '</strong>. Het saldo wordt automatisch bijgeschreven zodra de betaling is bevestigd.</p>'
              : '<div class="bp-empty"><div class="bp-empty-titel">Opwaarderen tijdelijk uit</div>' +
                '<div>De Shopify-koppeling wordt op dit moment geconfigureerd. Probeer later opnieuw of neem contact op met support voor handmatige opwaardering.</div></div>'
            ) +
          '</div>' +

          // Tab content: Transacties
          '<div class="bp-wallet-tabpanel" data-panel="transacties" style="display:none" data-testid="wallet-panel-transacties">' +
            (txRows.length
              ? '<div class="bp-tabel-scroll" style="margin-top:14px"><table class="bp-tabel" data-testid="wallet-tx-tabel"><thead><tr><th>Datum</th><th>Type</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>' + txRows.join('') + '</tbody></table></div>'
              : '<div class="bp-empty"><div class="bp-empty-titel">Nog geen transacties</div><div>Je transactiehistorie verschijnt hier na je eerste opwaardering.</div></div>'
            ) +
          '</div>' +
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
  // Bouwt een directe Shopify checkout-URL:
  //   https://{shop_domain}/cart/{variant_id}:1?attributes[wallet_topup_uid]=...&attributes[wallet_topup_amount_cents]=...&return_to=...
  // Hierdoor slaat de gebruiker de storefront over en gaat direct naar checkout.
  // De cart-attributes komen na betaling als `note_attributes` in de Shopify Order webhook.
  async function topup(amount) {
    try {
      var u = uid();
      if (!u) { toast('Log eerst in', true); return; }
      if (!amount) { toast('Geen bedrag gekozen', true); return; }

      // Probeer eerst de resolved config (gevuld door renderWallet). Anders herlees uit Firestore.
      var cfg = window.PP_SHOPIFY_TOPUPS_RESOLVED;
      if (!cfg) {
        var s = await db().collection('admin_settings').doc('global').get();
        var ov = (s.exists && s.data() && s.data().shopify_config) || {};
        cfg = Object.assign({}, PP_SHOPIFY_TOPUPS, ov);
        cfg.variants = Object.assign({}, PP_SHOPIFY_TOPUPS.variants, ov.variants || {});
      }

      var variantId = cfg.variants[String(amount)];
      if (!variantId) {
        toast('Bedrag €' + amount + ' nog niet beschikbaar — neem contact op met support', true);
        return;
      }

      var domain = (cfg.shop_domain || 'doubleyousmallandtall.nl').replace(/^https?:\/\//,'').replace(/\/$/,'');
      var amountCents = String(Math.round(Number(amount) * 100));
      var returnTo = window.location.origin + (cfg.return_path || '/?pagina=wallet&topup=success');

      // Shopify cart attributes — exact syntax: attributes[name]=value
      var params = [
        'attributes%5Bwallet_topup_uid%5D=' + encodeURIComponent(u),
        'attributes%5Bwallet_topup_amount_cents%5D=' + encodeURIComponent(amountCents),
        'attributes%5Bwallet_topup_amount_eur%5D=' + encodeURIComponent(String(amount)),
        'return_to=' + encodeURIComponent(returnTo)
      ];
      var url = 'https://' + domain + '/cart/' + encodeURIComponent(variantId) + ':1?' + params.join('&');

      // Optioneel: log pending-betaling lokaal (UI-feedback bij terugkeer)
      try {
        await db().collection('payments').add({
          uid: u,
          type: 'topup',
          amount_cents: Number(amountCents),
          currency: 'EUR',
          status: 'pending_checkout',
          source: 'shopify',
          shop_domain: domain,
          variant_id: variantId,
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch(e) {
        // Geen rechten / offline → niet blokkerend
        try { console.warn('[wallet] kon pending payment niet loggen:', e.code || e.message); } catch(_){}
      }

      // Mobile-first: same-tab nav voorkomt popup-blockers
      var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
      if (isMobile) {
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch(e) {
      toast('Fout: ' + (e.message || e), true);
    }
  }

  function switchTab(btn, panel) {
    try {
      var tabs = document.querySelectorAll('.bp-wallet-tab');
      tabs.forEach(function(t) { t.classList.remove('on'); });
      btn.classList.add('on');
      var panels = document.querySelectorAll('.bp-wallet-tabpanel');
      panels.forEach(function(p) {
        p.style.display = (p.getAttribute('data-panel') === panel) ? '' : 'none';
      });
    } catch(e) {}
  }

  function refresh() { renderWallet(); }

  // Open de Opwaarderen-tab vanuit elke knop
  function openTopup() {
    try {
      var btn = document.querySelector('.bp-wallet-tab[data-tab="opwaarderen"]');
      if (btn) { switchTab(btn, 'opwaarderen'); return; }
      // Fallback: re-render en wacht
      renderWallet().then(function(){
        setTimeout(function(){
          var b = document.querySelector('.bp-wallet-tab[data-tab="opwaarderen"]');
          if (b) switchTab(b, 'opwaarderen');
        }, 50);
      });
    } catch(e) {}
  }

  // ── ROUTE REGISTRATIE via wrapper (geen BP_PAGES mutatie) ─────────
  // v1.0.4: Force-reset _laatstGerenderd + render lock zodat herhaalde
  // navigatie naar 'wallet' altijd opnieuw initialiseert.
  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_wallet_wrapped) return;
    window.DY._pp_wallet_wrapped = true;
    var orig = window.DY.toonPagina;
    window.DY.toonPagina = function(pagina) {
      if (pagina === 'wallet') {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        return renderWallet();
      }
      return orig.apply(this, arguments);
    };
    // v1.0.6: Fix bootstrap race - als URL al deze route bevat, force-render
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('pagina') === 'wallet') {
        window.DY.navigeer('wallet');
      }
    } catch(e) {}
  }

  // ── MENU INJECTIE - wallet alleen voor brand-users zichtbaar maken ─
  function injectMenuLink() {
    // Hamburger menu - alleen tonen als user een brand-doc heeft
    var menu = document.querySelector('#extra-menu-list, .extra-menu-list, [data-testid="extra-menu"]');
    if (menu && !menu.querySelector('[data-testid="menu-wallet"]') && isLogged()) {
      // Lazy check: alleen tonen voor brands
      db().collection('brands').doc(uid()).get().then(function(snap) {
        if (!snap.exists) return;
        var li = document.createElement('li');
        li.innerHTML =
          '<button class="extra-menu-btn" onclick="window.DY.navigeer(\'wallet\'); var m=this.closest(\'.extra-menu-overlay\'); if(m) m.style.display=\'none\'" data-testid="menu-wallet">' +
            '<i class="fa-solid fa-wallet" style="margin-right:8px"></i>Mijn wallet' +
          '</button>';
        menu.appendChild(li);
      }).catch(function(){});
    }
    // Brand dashboard: voeg wallet card toe aan quick-grid
    injectDashboardCard();
  }

  // Injecteer Wallet card in brand_dashboard quick-grid (na Merkprofiel)
  function injectDashboardCard() {
    try {
      if (!window.DY || window.DY.pagina !== 'brand_dashboard') return;
      var grid = document.querySelector('.bp-quick-grid');
      if (!grid) return;
      if (grid.querySelector('[data-testid="brand-dash-wallet"]')) return;

      var card = document.createElement('a');
      card.href = 'javascript:void(0)';
      card.className = 'bp-quick';
      card.setAttribute('data-testid', 'brand-dash-wallet');
      card.onclick = function() { window.DY.navigeer('wallet'); };
      card.innerHTML =
        '<div class="bp-quick-icon">💰</div>' +
        '<div class="bp-quick-titel">Wallet</div>' +
        '<div class="bp-quick-sub">Saldo & opwaarderen</div>';
      grid.appendChild(card);
    } catch(e) { /* noop */ }
  }

  function init() {
    registerRoute();
    // Observer voor late-loaded hamburger menu
    var obs = new MutationObserver(injectMenuLink);
    obs.observe(document.body, { childList: true, subtree: true });
    injectMenuLink();
    // ── Topup-return: ?topup=success → toast + re-render na 1.5s (geeft webhook tijd) ──
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('topup') === 'success') {
        if (window.DY && DY.toast) DY.toast('Bedankt! Je betaling is ontvangen. Saldo wordt binnen 1 minuut bijgewerkt.');
        // Verwijder de query zodat refresh deze niet opnieuw triggert
        try {
          var url = new URL(window.location.href);
          url.searchParams.delete('topup');
          history.replaceState(null, '', url.toString());
        } catch(_){}
        // Force-render wallet na korte delay
        setTimeout(function(){
          if (window.DY && DY.navigeer) DY.navigeer('wallet');
        }, 1500);
        // Tweede refresh na 8s voor de zekerheid
        setTimeout(function(){
          if (window.PP_Wallet && PP_Wallet.refresh) PP_Wallet.refresh();
        }, 8000);
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }

  window.PP_Wallet = {
    renderWallet: renderWallet,
    topup:        topup,
    openTopup:    openTopup,
    refresh:      refresh,
    switchTab:    switchTab,
    VERSION:      '1.1.0'
  };
})();
