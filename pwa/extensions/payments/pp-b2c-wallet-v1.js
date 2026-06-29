/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - B2C Klant Wallet Module (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Strikt GESCHEIDEN van B2B Merken Wallet (pp-wallet-v1.js):
 *   - B2B wallet     → users/{uid}.wallet_balance        (merken portaal)
 *   - B2C wallet     → users/{uid}.b2c_wallet_balance    (boost-functionaliteit)
 *
 * Functionaliteit:
 *   - Nieuwe route 'b2c_wallet' via DY.toonPagina wrapper
 *   - "Mijn Wallet" knop in profiel-menu (auto-inject voor alle ingelogde users)
 *   - Toont saldo (b2c_wallet_balance) + topup-knoppen €5/€10/€15/€25/€50
 *   - Topup via directe Shopify checkout (variant-IDs te configureren)
 *
 * Variant-IDs: zie PP_B2C_TOPUPS hieronder. Vul in zodra Shopify producten zijn aangemaakt.
 * Override via Firestore: admin_settings/global.b2c_shopify_config (idem als B2B)
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.PP_B2CWallet) return;

  // ────────── B2C TOPUP CONFIG ──────────
  // Shopify Variant-IDs voor B2C wallet top-up producten (live).
  // Override mogelijk via admin_settings/global.b2c_shopify_config (geen redeploy nodig).
  var PP_B2C_TOPUPS = {
    shop_domain: 'doubleyousmallandtall.nl',
    variants: {
      '5':  '57532652224856',   // €5 top-up
      '10': '57532666642776',   // €10 top-up
      '15': '57532675227992',   // €15 top-up
      '25': '57532676768088',   // €25 top-up
      '50': '57532683321688'    // €50 top-up
    },
    return_path: '/?pagina=b2c_wallet&topup=success'
  };

  // v1.1.0 (2026-02-23): HARD AMOUNT WHITELIST voor B2C Klant Wallet.
  // Strikte tegenhanger van B2B_ALLOWED_AMOUNTS in pp-wallet-v1.js. Hier
  // zijn ALLEEN consumenten-boost-bedragen toegestaan; B2B campagne-bedragen
  // (€100/€250) mogen NOOIT in de B2C-checkout terechtkomen.
  var B2C_ALLOWED_AMOUNTS = { 5: 1, 10: 1, 15: 1, 25: 1, 50: 1 };

  // ────────── B2C WALLET BOOST PAKKETTEN ──────────
  // Centraal beheerd: één bron van waarheid voor naam, omschrijving en
  // verwachte impact per opwaardeer-bedrag. Override mogelijk via Firestore
  // (admin_settings/global.b2c_packages) zonder redeploy.
  // Schema: { id, name, amount, credits, duration, description, expectedImpact, active }
  var PP_B2C_PACKAGES_DEFAULT = [
    {
      id: 'starter-5',
      name: 'Starter Boost',
      amount: 5,
      credits: '€5 boost-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor gebruikers die hun outfit of post een eerste extra zetje willen geven. Met deze boost krijgt jouw post tijdelijk extra zichtbaarheid binnen de community. Ideaal om nieuwe mensen kennis te laten maken met jouw stijl en om meer kansen te creëren op likes, reacties en profielbezoeken.',
      expectedImpact: 'Kleine extra zichtbaarheid voor één specifieke post.',
      active: true
    },
    {
      id: 'groei-10',
      name: 'Groei Boost',
      amount: 10,
      credits: '€10 boost-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor gebruikers die hun stijl vaker zichtbaar willen maken. Deze boost geeft jouw post meer ruimte om ontdekt te worden door relevante gebruikers en vergroot de kans op interactie binnen de community.',
      expectedImpact: 'Meer zichtbaarheid en een langere actieve periode dan Starter Boost.',
      active: true
    },
    {
      id: 'plus-15',
      name: 'Plus Boost',
      amount: 15,
      credits: '€15 boost-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor gebruikers die meer aandacht willen voor hun content. Ideaal voor outfits waarvan je extra feedback, inspiratie en interactie wilt ontvangen. Jouw post krijgt een sterkere ondersteuning binnen de beschikbare boostmogelijkheden.',
      expectedImpact: 'Hogere zichtbaarheid en meer kansen op engagement.',
      active: true,
      popular: true
    },
    {
      id: 'pro-25',
      name: 'Pro Boost',
      amount: 25,
      credits: '€25 boost-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor gebruikers die hun beste outfits extra willen laten opvallen. Dit pakket is geschikt voor belangrijke posts en looks waarvan je wilt dat ze langer zichtbaar blijven binnen de community.',
      expectedImpact: 'Uitgebreidere zichtbaarheid en meer kansen op likes, reacties en opgeslagen outfits.',
      active: true
    },
    {
      id: 'ultimate-50',
      name: 'Ultimate Boost',
      amount: 50,
      credits: '€50 boost-saldo',
      duration: 'Eénmalig saldo',
      description: 'De krachtigste boost voor gebruikers die hun stijl maximaal onder de aandacht willen brengen. Geef jouw favoriete outfit de meeste ondersteuning binnen het boost systeem en vergroot de kans dat meer gebruikers jouw stijl ontdekken.',
      expectedImpact: 'Maximale boostondersteuning binnen de beschikbare mogelijkheden.',
      active: true
    }
  ];

  // Vaste transparantie-tekst onder de pakketten (zichtbaar vóór aankoop).
  var PP_B2C_DISCLOSURE = 'Een boost vergroot de zichtbaarheid van je post binnen Paskamerpraat. Het daadwerkelijke bereik kan verschillen afhankelijk van content, activiteit en interesses van andere gebruikers.';
  // ──────────────────────────────────────

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function isLogged() { return !!(window.DY && window.DY.user && window.DY.user.uid); }
  function uid() { return (window.DY && window.DY.user && window.DY.user.uid) || null; }
  function db() { return window.firebase && window.firebase.firestore ? window.firebase.firestore() : null; }
  function toast(msg, err) { try { window.DY && DY.toast && DY.toast(msg, !!err); } catch (e) {} }

  // ── HOOFD-RENDER ───────────────────────────────────────────────────
  async function renderB2CWallet() {
    var main = document.getElementById('dy-main');
    if (!main) return;
    main.style.background = '#0a0806';
    main.style.paddingBottom = '90px';
    main.innerHTML = '<div class="bp-page"><div class="bp-loader">Wallet laden...</div></div>';

    if (!isLogged()) {
      main.innerHTML =
        '<div class="bp-page bp-page-form">' +
          '<h1>Mijn Wallet</h1>' +
          '<div class="bp-empty">' +
            '<div class="bp-empty-titel">Niet ingelogd</div>' +
            '<div>Log in om je saldo en boost-historie te bekijken.</div>' +
            '<button class="bp-btn bp-btn-primair" style="margin-top:14px" onclick="window.DY.navigeer(\'login\')" data-testid="b2c-wallet-login-cta">Inloggen</button>' +
          '</div>' +
        '</div>';
      return;
    }

    try {
      var u = uid();
      // 1. Saldo uit user doc
      var userSnap = await db().collection('users').doc(u).get();
      var userData = userSnap.exists ? userSnap.data() : {};
      var balance = Number(userData.b2c_wallet_balance || 0);
      var currency = 'EUR';

      // 2. Shopify topup config (lokaal default + Firestore override)
      var settingsSnap = await db().collection('admin_settings').doc('global').get();
      var settings = settingsSnap.exists ? settingsSnap.data() : {};
      var b2cCfg = Object.assign({}, PP_B2C_TOPUPS, settings.b2c_shopify_config || {});
      b2cCfg.variants = Object.assign({}, PP_B2C_TOPUPS.variants, (settings.b2c_shopify_config || {}).variants || {});
      var topupEnabled = Object.keys(b2cCfg.variants).some(function (k) { return !!b2cCfg.variants[k]; });
      window.PP_B2C_TOPUPS_RESOLVED = b2cCfg;

      // 3. Recente boost-uitgaven + topups uit payments (B2C-only)
      var txRows = [];
      try {
        var paySnap = await db().collection('payments')
          .where('uid', '==', u).orderBy('created_at', 'desc').limit(20).get();
        paySnap.forEach(function (d) {
          var p = d.data();
          // Filter: alleen B2C-relevante transacties
          if (p.wallet_type && p.wallet_type !== 'b2c') return;
          if (!p.wallet_type && p.type === 'topup' && p.source !== 'shopify_b2c') return;
          var amount = (p.amount_cents || 0) / 100;
          var sign = amount >= 0 ? '+' : '';
          var typeLabel = ({
            topup:        'Opwaardering',
            boost_charge: 'Post boost',
            spend:        'Uitgave',
            refund:       'Terugbetaling',
            manual_adjust:'Handmatige correctie'
          })[p.type] || p.type;
          var statusBadge = '<span class="bp-badge bp-badge-' + esc(p.status || 'pending') + '">' + esc(p.status || '?') + '</span>';
          var dateStr = (p.created_at && p.created_at.toDate)
            ? p.created_at.toDate().toLocaleDateString('nl-NL', { year: 'numeric', month: 'short', day: 'numeric' })
            : (typeof p.created_at === 'string' ? p.created_at.slice(0, 10) : '-');
          txRows.push(
            '<tr data-testid="b2c-wallet-tx-' + esc(d.id) + '">' +
              '<td>' + esc(dateStr) + '</td>' +
              '<td>' + esc(typeLabel) + '</td>' +
              '<td class="bp-tx-amount ' + (amount >= 0 ? 'positive' : 'negative') + '">' + sign + '€ ' + amount.toFixed(2) + '</td>' +
              '<td>' + statusBadge + '</td>' +
            '</tr>'
          );
        });
      } catch (e) {
        try { console.warn('[b2c-wallet] payments query:', e.code); } catch (_) {}
      }

      main.innerHTML =
        '<div class="bp-page">' +
          '<button class="bp-back" onclick="window.DY.navigeer(\'profiel\')" data-testid="b2c-wallet-back">&larr; Profiel</button>' +
          '<div class="bp-wallet-hero" data-testid="b2c-wallet-hero">' +
            '<span class="bp-header-eyebrow">Mijn Wallet</span>' +
            '<h1>Saldo</h1>' +
            '<div class="bp-wallet-saldo" data-testid="b2c-wallet-saldo">' +
              '<span class="bp-wallet-saldo-valuta">€</span>' +
              '<span class="bp-wallet-saldo-num">' + balance.toFixed(2) + '</span>' +
            '</div>' +
            '<div class="bp-wallet-acties">' +
              (topupEnabled
                ? '<button class="bp-btn bp-btn-primair" onclick="PP_B2CWallet.openTopup()" data-testid="b2c-wallet-topup-btn">Saldo opwaarderen</button>'
                : '<button class="bp-btn bp-btn-primair" disabled title="Opwaarderen wordt binnenkort beschikbaar" data-testid="b2c-wallet-topup-disabled">Opwaarderen (binnenkort)</button>'
              ) +
              '<button class="bp-btn bp-btn-ghost" onclick="PP_B2CWallet.refresh()" data-testid="b2c-wallet-refresh">↻ Vernieuwen</button>' +
            '</div>' +
            (!topupEnabled
              ? '<p class="bp-mini" style="margin-top:8px;opacity:0.7">Opwaarderen wordt geactiveerd zodra de Shopify-koppeling is geconfigureerd.</p>'
              : '') +
          '</div>' +

          // ── Tabs ─────────────────────────────────────────────
          '<div class="bp-wallet-tabs" data-testid="b2c-wallet-tabs">' +
            '<button class="bp-wallet-tab on" data-tab="overzicht" onclick="PP_B2CWallet.switchTab(this,\'overzicht\')" data-testid="b2c-wallet-tab-overzicht">Overzicht</button>' +
            '<button class="bp-wallet-tab" data-tab="opwaarderen" onclick="PP_B2CWallet.switchTab(this,\'opwaarderen\')" data-testid="b2c-wallet-tab-opwaarderen">Opwaarderen</button>' +
            '<button class="bp-wallet-tab" data-tab="transacties" onclick="PP_B2CWallet.switchTab(this,\'transacties\')" data-testid="b2c-wallet-tab-transacties">Transacties</button>' +
          '</div>' +

          // Overzicht
          '<div class="bp-wallet-tabpanel" data-panel="overzicht" data-testid="b2c-wallet-panel-overzicht">' +
            '<div class="bp-stat-grid" style="margin-top:14px">' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Saldo</div><div class="bp-stat-num">€' + balance.toFixed(2) + '</div></div>' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Transacties</div><div class="bp-stat-num">' + txRows.length + '</div></div>' +
              '<div class="bp-stat-kaart"><div class="bp-stat-label">Valuta</div><div class="bp-stat-num">' + esc(currency) + '</div></div>' +
            '</div>' +
            '<p class="bp-mini" style="margin-top:14px">Met je wallet kun je je eigen posts boosten zodat meer mensen in de community ze zien. Saldo wordt automatisch bijgewerkt na een succesvolle betaling via Shopify.</p>' +
          '</div>' +

          // Opwaarderen
          '<div class="bp-wallet-tabpanel" data-panel="opwaarderen" style="display:none" data-testid="b2c-wallet-panel-opwaarderen">' +
            '<h2 class="bp-section-titel" style="margin-top:18px">Kies een boost-pakket</h2>' +
            (topupEnabled
              ? '<div class="pp-b2c-pkg-grid" data-testid="b2c-wallet-pkg-grid">' +
                  _renderPackagesHTML(b2cCfg, settings) +
                '</div>' +
                '<p class="pp-b2c-disclosure" data-testid="b2c-wallet-disclosure">' + esc(PP_B2C_DISCLOSURE) + '</p>' +
                '<p class="bp-mini" style="margin-top:10px">Je wordt doorgestuurd naar de Shopify checkout op <strong>' + esc(b2cCfg.shop_domain) + '</strong>. Het saldo wordt automatisch bijgeschreven zodra de betaling is bevestigd.</p>'
              : '<div class="bp-empty"><div class="bp-empty-titel">Opwaarderen tijdelijk uit</div>' +
                '<div>De Shopify-koppeling wordt op dit moment geconfigureerd. Neem contact op met support voor handmatige opwaardering of probeer het later opnieuw.</div></div>'
            ) +
          '</div>' +

          // Transacties
          '<div class="bp-wallet-tabpanel" data-panel="transacties" style="display:none" data-testid="b2c-wallet-panel-transacties">' +
            (txRows.length
              ? '<div class="bp-tabel-scroll" style="margin-top:14px"><table class="bp-tabel" data-testid="b2c-wallet-tx-tabel"><thead><tr><th>Datum</th><th>Type</th><th>Bedrag</th><th>Status</th></tr></thead><tbody>' + txRows.join('') + '</tbody></table></div>'
              : '<div class="bp-empty"><div class="bp-empty-titel">Nog geen transacties</div><div>Je transactiehistorie verschijnt hier na je eerste opwaardering of post-boost.</div></div>'
            ) +
          '</div>' +
        '</div>';
    } catch (e) {
      main.innerHTML =
        '<div class="bp-page">' +
          '<div class="bp-empty">' +
            '<div class="bp-empty-titel">Fout bij laden</div>' +
            '<div>' + esc(e.message || 'Onbekende fout') + '</div>' +
            '<button class="bp-btn bp-btn-primair" style="margin-top:14px" onclick="PP_B2CWallet.refresh()">Opnieuw proberen</button>' +
          '</div>' +
        '</div>';
    }
  }

  // ── PAKKET-KAART RENDERING ────────────────────────────────────────
  // Combineert default-pakketten met optionele Firestore-override en
  // filtert op beschikbare Shopify variants. Bestaande variants zonder
  // pakket-config blijven werken via een veilige fallback (default kaart).
  function _resolvePackages(settings) {
    var override = (settings && settings.b2c_packages) ? settings.b2c_packages : null;
    var base = (override && Array.isArray(override) && override.length) ? override : PP_B2C_PACKAGES_DEFAULT;
    return base.filter(function (p) { return p && p.active !== false; });
  }

  function _renderPackagesHTML(b2cCfg, settings) {
    var packages = _resolvePackages(settings);
    // v1.1.0: STRICT whitelist filter - alleen B2C-toegestane bedragen
    // (€5/€10/€15/€25/€50) renderen, ook bij Firestore-override.
    var availableAmounts = Object.keys(b2cCfg.variants).filter(function (k) {
      return !!b2cCfg.variants[k] && B2C_ALLOWED_AMOUNTS[Number(k)];
    }).map(function (k) { return Number(k); });

    // Index pakketten op amount voor snelle lookup
    var byAmount = {};
    packages.forEach(function (p) { if (p && p.amount != null) byAmount[String(p.amount)] = p; });

    // Render één kaart per beschikbaar bedrag, in oplopende volgorde
    return availableAmounts.sort(function (a, b) { return a - b; }).map(function (amt) {
      var p = byAmount[String(amt)];
      // Veilige fallback voor variants zonder pakket-config
      if (!p) {
        p = {
          id: 'topup-' + amt,
          name: '€ ' + amt + ' Wallet Top-up',
          amount: amt,
          credits: '€' + amt + ' boost-saldo',
          duration: 'Eénmalig saldo',
          description: '',
          expectedImpact: ''
        };
      }
      var popular = !!p.popular;
      return (
        '<article class="pp-b2c-pkg-card' + (popular ? ' pp-b2c-pkg-popular' : '') + '" data-testid="b2c-wallet-pkg-' + esc(p.id || ('amt-' + amt)) + '">' +
          (popular ? '<div class="pp-b2c-pkg-badge">Populair</div>' : '') +
          '<header class="pp-b2c-pkg-head">' +
            '<h3 class="pp-b2c-pkg-naam">' + esc(p.name || ('€ ' + amt)) + '</h3>' +
            '<div class="pp-b2c-pkg-prijs">€ ' + Number(amt).toFixed(0) + '</div>' +
          '</header>' +
          (p.description
            ? '<p class="pp-b2c-pkg-beschr">' + esc(p.description) + '</p>'
            : '') +
          (p.expectedImpact
            ? '<div class="pp-b2c-pkg-verwacht">' +
                '<span class="pp-b2c-pkg-verwacht-label">Verwachting</span>' +
                '<span class="pp-b2c-pkg-verwacht-tekst">' + esc(p.expectedImpact) + '</span>' +
              '</div>'
            : '') +
          '<button class="bp-btn bp-btn-primair pp-b2c-pkg-cta" onclick="PP_B2CWallet.topup(' + amt + ')" data-testid="b2c-wallet-topup-' + amt + '">' +
            'Wallet opwaarderen' +
          '</button>' +
        '</article>'
      );
    }).join('');
  }

  // ── TOPUP ──────────────────────────────────────────────────────────
  // v1.3.0 (2026-02-23): COMING-SOON POPUP HERSTELD met B2C CONTEXT EYEBROW.
  // Spiegel van pp-wallet-v1.js v1.5.0. Source 'b2c' wordt expliciet
  // meegegeven zodat de popup visueel labelt als consumenten-context.
  async function topup(amount) {
    try {
      if (window.PP_TopupComingSoon && PP_TopupComingSoon.show) {
        // Defense-in-depth amount-guard
        if (!B2C_ALLOWED_AMOUNTS[Number(amount)]) {
          toast('Ongeldig bedrag voor klant-wallet. Kies €5, €10, €15, €25 of €50.', true);
          try { console.warn('[b2c-wallet] B2C blocked invalid amount:', amount); } catch (_) {}
          return;
        }
        var pkgName = null;
        try {
          var defaults = PP_B2C_PACKAGES_DEFAULT.filter(function (p) {
            return p && p.amount === Number(amount);
          });
          if (defaults.length) pkgName = defaults[0].name;
        } catch (_) {}
        PP_TopupComingSoon.show({
          naam: pkgName || ('Mijn Wallet €' + amount),
          prijs: Number(amount),
          source: 'b2c'
        });
        return;
      }
    } catch (e) { /* fallthrough naar bestaande flow */ }

    try {
      var u = uid();
      if (!u) { toast('Log eerst in', true); return; }
      if (!amount) { toast('Geen bedrag gekozen', true); return; }

      // v1.1.0: STRICT amount-guard. Klant-wallet accepteert UITSLUITEND
      // €5/€10/€15/€25/€50. Voorkomt dat een B2B campagne-bedrag (€100/€250)
      // door de B2C-checkout glipt.
      if (!B2C_ALLOWED_AMOUNTS[Number(amount)]) {
        toast('Ongeldig bedrag voor klant-wallet. Kies €5, €10, €15, €25 of €50.', true);
        try { console.warn('[b2c-wallet] B2C blocked invalid amount:', amount); } catch (_) {}
        return;
      }

      var cfg = window.PP_B2C_TOPUPS_RESOLVED;
      if (!cfg) {
        var s = await db().collection('admin_settings').doc('global').get();
        var ov = (s.exists && s.data() && s.data().b2c_shopify_config) || {};
        cfg = Object.assign({}, PP_B2C_TOPUPS, ov);
        cfg.variants = Object.assign({}, PP_B2C_TOPUPS.variants, ov.variants || {});
      }

      var variantId = cfg.variants[String(amount)];
      if (!variantId) {
        toast('Bedrag €' + amount + ' nog niet beschikbaar. Neem contact op met support', true);
        return;
      }

      var domain = (cfg.shop_domain || 'doubleyousmallandtall.nl').replace(/^https?:\/\//, '').replace(/\/$/, '');
      var amountCents = String(Math.round(Number(amount) * 100));
      var returnTo = window.location.origin + (cfg.return_path || '/?pagina=b2c_wallet&topup=success');

      var fbUser = (window.firebase && firebase.auth) ? firebase.auth().currentUser : null;
      var userEmail = (fbUser && fbUser.email) ? fbUser.email : '';
      var userName  = (fbUser && (fbUser.displayName || '')) || '';

      // B2C-marker attributes - webhook gebruikt b2c_wallet_topup_* prefix om
      // te detecteren dat dit een B2C top-up is (i.p.v. merken-wallet).
      var params = [
        'attributes%5Bb2c_wallet_topup_uid%5D=' + encodeURIComponent(u),
        'attributes%5Bb2c_wallet_topup_amount_cents%5D=' + encodeURIComponent(amountCents),
        'attributes%5Bb2c_wallet_topup_amount_eur%5D=' + encodeURIComponent(String(amount)),
        'attributes%5Bb2c_wallet_topup_account_email%5D=' + encodeURIComponent(userEmail),
        'return_to=' + encodeURIComponent(returnTo)
      ];
      if (userEmail) {
        params.push('checkout%5Bemail%5D=' + encodeURIComponent(userEmail));
        params.push('checkout%5Bnote%5D=' + encodeURIComponent('B2C Wallet top-up voor uid=' + u + ' account=' + userEmail));
      }
      if (userName) {
        params.push('checkout%5Bshipping_address%5D%5Bfirst_name%5D=' + encodeURIComponent(userName));
      }
      var url = 'https://' + domain + '/cart/' + encodeURIComponent(variantId) + ':1?' + params.join('&');

      // Pending-betaling lokaal loggen
      try {
        await db().collection('payments').add({
          uid: u,
          type: 'topup',
          wallet_type: 'b2c',
          amount_cents: Number(amountCents),
          currency: 'EUR',
          status: 'pending_checkout',
          source: 'shopify_b2c',
          shop_domain: domain,
          variant_id: variantId,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        try { console.warn('[b2c-wallet] kon pending payment niet loggen:', e.code || e.message); } catch (_) {}
      }

      var isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
      if (isMobile) {
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      toast('Fout: ' + (e.message || e), true);
    }
  }

  function switchTab(btn, panel) {
    try {
      var tabs = document.querySelectorAll('.bp-wallet-tab');
      tabs.forEach(function (t) { t.classList.remove('on'); });
      btn.classList.add('on');
      var panels = document.querySelectorAll('.bp-wallet-tabpanel');
      panels.forEach(function (p) {
        p.style.display = (p.getAttribute('data-panel') === panel) ? '' : 'none';
      });
    } catch (e) {}
  }

  function refresh() { renderB2CWallet(); }

  function openTopup() {
    try {
      var btn = document.querySelector('.bp-wallet-tab[data-tab="opwaarderen"]');
      if (btn) { switchTab(btn, 'opwaarderen'); return; }
      renderB2CWallet().then(function () {
        setTimeout(function () {
          var b = document.querySelector('.bp-wallet-tab[data-tab="opwaarderen"]');
          if (b) switchTab(b, 'opwaarderen');
        }, 50);
      });
    } catch (e) {}
  }

  // ── ROUTE REGISTRATIE via wrapper ─────────────────────────────────
  function registerRoute() {
    if (!window.DY || typeof window.DY.toonPagina !== 'function') return;
    if (window.DY._pp_b2c_wallet_wrapped) return;
    window.DY._pp_b2c_wallet_wrapped = true;
    var orig = window.DY.toonPagina;
    window.DY.toonPagina = function (pagina) {
      if (pagina === 'b2c_wallet') {
        window.DY._laatstGerenderd = null;
        if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false;
        window.DY.pagina = pagina;
        return renderB2CWallet();
      }
      return orig.apply(this, arguments);
    };
    // Bootstrap-race fix: als URL al deze route bevat, force-render
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('pagina') === 'b2c_wallet') {
        window.DY.navigeer('b2c_wallet');
      }
    } catch (e) {}
  }

  // ── INJECT "Mijn Wallet" knop in profiel-menu ──────────────────────
  // Plaatst de knop in de eerste .dy-profiel-acties container (privacy-blok),
  // ZICHTBAAR voor alle ingelogde users - gescheiden van het B2B merkenportaal.
  function injecteerProfielKnop() {
    try {
      var main = document.getElementById('dy-main');
      if (!main) return;
      if (!window.DY || DY.pagina !== 'profiel') return;
      if (!isLogged()) return;
      if (main.querySelector('#pp-b2c-wallet-knop')) return;
      var acties = main.querySelector('.dy-profiel-acties');
      if (!acties) return;
      var knop = document.createElement('button');
      knop.id = 'pp-b2c-wallet-knop';
      knop.className = 'dy-btn dy-btn-ghost';
      knop.style.cssText = 'justify-content:flex-start;gap:8px;width:100%';
      knop.setAttribute('data-testid', 'b2c-wallet-menu-btn');
      knop.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>' +
        'Mijn Wallet';
      knop.onclick = function () { if (window.DY && DY.navigeer) DY.navigeer('b2c_wallet'); };
      // Plaats ná de Merkenportaal-knop (als die bestaat), anders bovenaan
      var bpKnop = acties.querySelector('#bp-profiel-knop');
      if (bpKnop && bpKnop.nextSibling) {
        acties.insertBefore(knop, bpKnop.nextSibling);
      } else {
        acties.insertBefore(knop, acties.firstChild);
      }
    } catch (e) { /* noop */ }
  }

  function init() {
    registerRoute();
    var obs = new MutationObserver(injecteerProfielKnop);
    obs.observe(document.body, { childList: true, subtree: true });
    injecteerProfielKnop();

    // Topup-return: ?topup=success → toast + re-render
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('pagina') === 'b2c_wallet' && qs.get('topup') === 'success') {
        if (window.DY && DY.toast) DY.toast('Bedankt! Je betaling is ontvangen. Saldo wordt binnen 1 minuut bijgewerkt.');
        try {
          var url = new URL(window.location.href);
          url.searchParams.delete('topup');
          history.replaceState(null, '', url.toString());
        } catch (_) {}
        setTimeout(function () {
          if (window.DY && DY.navigeer) DY.navigeer('b2c_wallet');
        }, 1500);
        setTimeout(function () {
          if (window.PP_B2CWallet && PP_B2CWallet.refresh) PP_B2CWallet.refresh();
        }, 8000);
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 250);
  }

  window.PP_B2CWallet = {
    renderWallet: renderB2CWallet,
    topup:        topup,
    openTopup:    openTopup,
    refresh:      refresh,
    switchTab:    switchTab,
    B2C_ALLOWED_AMOUNTS: B2C_ALLOWED_AMOUNTS,
    VERSION:      '1.3.0'
  };
})();
