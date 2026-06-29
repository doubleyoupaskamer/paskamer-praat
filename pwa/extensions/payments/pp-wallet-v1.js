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

  // v1.3.0 (2026-02-23): HARD AMOUNT WHITELIST voor B2B Merken Campagnewallet.
  // Voorkomt dat per-ongeluk B2C-bedragen via Firestore-override
  // (admin_settings/global.shopify_config.variants) lekken in de
  // merken-checkout. Iedere amount die NIET in deze set zit wordt
  // genegeerd, ook al staat hij in de variant-map.
  var B2B_ALLOWED_AMOUNTS = { 25: 1, 50: 1, 100: 1, 250: 1 };

  // ────────── B2B MERKEN WALLET PAKKETTEN ──────────
  // Centraal beheerd: één bron van waarheid voor naam, omschrijving en
  // verwachte impact per opwaardeer-bedrag. Override mogelijk via Firestore
  // (admin_settings/global.b2b_packages) zonder redeploy.
  // Schema: { id, name, amount, credits, duration, description, expectedImpact, active }
  var PP_B2B_PACKAGES_DEFAULT = [
    {
      id: 'starter-25',
      name: 'Starter Campagne',
      amount: 25,
      credits: '€25 campagne-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor merken die hun zichtbaarheid binnen Paskamerpraat willen testen. Met dit instapbedrag kun je je eerste advertentie of placement opzetten en kennismaken met de mogelijkheden van de community.',
      expectedImpact: 'Beperkte testronde voor één campagne of placement.',
      active: true
    },
    {
      id: 'groei-50',
      name: 'Groei Campagne',
      amount: 50,
      credits: '€50 campagne-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor merken die meer impact willen maken binnen de community. Geschikt voor het draaien van meerdere placements of een langere campagne met voldoende ruimte voor optimalisatie.',
      expectedImpact: 'Meer campagne-impressies en ruimte voor A/B-testing.',
      active: true,
      popular: true
    },
    {
      id: 'pro-100',
      name: 'Pro Campagne',
      amount: 100,
      credits: '€100 campagne-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor merken die structureel zichtbaar willen zijn. Dit pakket biedt voldoende budget voor uitgebreide campagnes, meerdere productgroepen en consistente aanwezigheid binnen de feed.',
      expectedImpact: 'Sterke aanwezigheid en hogere kans op brand-recognition.',
      active: true
    },
    {
      id: 'ultimate-250',
      name: 'Ultimate Campagne',
      amount: 250,
      credits: '€250 campagne-saldo',
      duration: 'Eénmalig saldo',
      description: 'Voor merken die maximale zichtbaarheid willen binnen Paskamerpraat. Ideaal voor seizoenscampagnes, productlanceringen en langlopende strategische placements met de meeste ruimte voor optimalisatie.',
      expectedImpact: 'Maximale campagne-impact en langlopende zichtbaarheid.',
      active: true
    }
  ];

  // Vaste transparantie-tekst onder de pakketten (zichtbaar vóór aankoop).
  var PP_B2B_DISCLOSURE = 'Campagne-saldo wordt gebruikt voor placements, advertenties en boosts binnen Paskamerpraat. Het daadwerkelijke bereik kan verschillen afhankelijk van campagne-instellingen, doelgroep en interactie van community-leden.';

  // Render-helper: combineert beschikbare variants met pakket-config en bouwt kaart-grid.
  function _renderB2BPackagesHTML(shopCfg, settings) {
    var override = (settings && settings.b2b_packages && Array.isArray(settings.b2b_packages) && settings.b2b_packages.length)
      ? settings.b2b_packages
      : PP_B2B_PACKAGES_DEFAULT;
    var packages = override.filter(function (p) { return p && p.active !== false; });
    // v1.3.0: STRICT whitelist filter - alleen B2B-toegestane bedragen
    // (€25/€50/€100/€250) renderen, ook bij Firestore-override of typo.
    var availableAmounts = Object.keys(shopCfg.variants).filter(function (k) {
      return !!shopCfg.variants[k] && B2B_ALLOWED_AMOUNTS[Number(k)];
    }).map(function (k) { return Number(k); });

    var byAmount = {};
    packages.forEach(function (p) { if (p && p.amount != null) byAmount[String(p.amount)] = p; });

    return availableAmounts.sort(function (a, b) { return a - b; }).map(function (amt) {
      var p = byAmount[String(amt)] || {
        id: 'topup-' + amt,
        name: '€ ' + amt + ' Wallet Top-up',
        amount: amt,
        credits: '€' + amt + ' campagne-saldo',
        duration: 'Eénmalig saldo',
        description: '',
        expectedImpact: ''
      };
      var popular = !!p.popular;
      return (
        '<article class="pp-b2c-pkg-card' + (popular ? ' pp-b2c-pkg-popular' : '') + '" data-testid="wallet-pkg-' + esc(p.id || ('amt-' + amt)) + '">' +
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
          '<button class="bp-btn bp-btn-primair pp-b2c-pkg-cta" onclick="PP_Wallet.topup(' + amt + ')" data-testid="wallet-topup-' + amt + '">' +
            'Opwaarderen' +
          '</button>' +
        '</article>'
      );
    }).join('');
  }

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
          // v1.6.0 (2026-02-23): Layout afgestemd op publieke Campagne-pakketten
          // landingspagina (pp-merken-pakketten-v1.js) zodat het merkenportaal
          // EXACT dezelfde visuele identiteit gebruikt — "VOOR MERKEN" eyebrow,
          // hero-blok "Campagne-pakketten", intro-tekst en dezelfde 4 cards
          // (Starter/Groei/Pro/Ultimate met VERWACHTING blokken en POPULAR badge).
          // CTA op iedere card roept PP_Wallet.topup(amount) aan → coming-soon popup.
          '<div class="bp-wallet-tabpanel" data-panel="opwaarderen" style="display:none" data-testid="wallet-panel-opwaarderen">' +
            (topupEnabled
              ? '<div class="bp-wallet-hero pp-b2b-campagne-hero" data-testid="wallet-campagne-hero">' +
                  '<span class="bp-header-eyebrow">Voor merken</span>' +
                  '<h2>Campagne-pakketten</h2>' +
                  '<p class="bp-sub">Kies het pakket dat past bij je doelen. Saldo wordt gebruikt voor advertenties, placements en boosts binnen Paskamerpraat.</p>' +
                '</div>' +
                '<div class="pp-b2c-pkg-grid" data-testid="wallet-pkg-grid">' +
                  _renderB2BPackagesHTML(shopCfg, settings) +
                '</div>' +
                '<p class="pp-b2c-disclosure" data-testid="wallet-disclosure">' + esc(PP_B2B_DISCLOSURE) + '</p>'
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
  // v1.5.0 (2026-02-23): COMING-SOON POPUP HERSTELD met BRAND-CONTEXT EYEBROW.
  // Klik op een B2B-pakket → toont contextuele popup met eyebrow
  // "MERKEN CAMPAGNE WALLET" + meldtekst "Opwaarderen pas mogelijk na
  // lancering". Géén directe checkout-flow tot launch.
  //
  // De onderliggende Shopify-checkout-code blijft intact (na de popup-
  // branch) zodat verwijderen van de intercept genoeg is om opwaarderen
  // live te zetten zodra de officiële launch-datum bekend is.
  //
  // CONTEXT-ISOLATIE: source 'b2b' wordt expliciet meegegeven aan
  // PP_TopupComingSoon zodat de popup visueel labelt als merken-context;
  // dit voorkomt verwarring met de B2C wallet popup (zelfde basis-
  // component, andere eyebrow + naam).
  async function topup(amount) {
    try {
      if (window.PP_TopupComingSoon && PP_TopupComingSoon.show) {
        // v1.3.0 amount-guard ook hier toepassen (defense-in-depth):
        // zelfs als de popup-laag uit staat, een verkeerd bedrag
        // mag NOOIT een B2B-checkout triggeren.
        if (!B2B_ALLOWED_AMOUNTS[Number(amount)]) {
          toast('Ongeldig bedrag voor merken-wallet. Kies €25, €50, €100 of €250.', true);
          try { console.warn('[wallet] B2B blocked invalid amount:', amount); } catch (_) {}
          return;
        }
        var b2bPkgName = null;
        try {
          var defs = PP_B2B_PACKAGES_DEFAULT.filter(function (p) {
            return p && p.amount === Number(amount);
          });
          if (defs.length) b2bPkgName = defs[0].name;
        } catch (_) {}
        PP_TopupComingSoon.show({
          naam: b2bPkgName || ('Merken Campagne Wallet €' + amount),
          prijs: Number(amount),
          source: 'b2b'
        });
        return;
      }
    } catch (e) { /* fallthrough naar bestaande flow */ }

    try {
      var u = uid();
      if (!u) { toast('Log eerst in', true); return; }
      if (!amount) { toast('Geen bedrag gekozen', true); return; }

      // v1.3.0: STRICT amount-guard. Merken-wallet accepteert UITSLUITEND
      // €25/€50/€100/€250. Voorkomt dat een Firestore-override of UI-fout
      // een B2C-bedrag (€5/€10/€15) door de B2B-checkout pusht.
      if (!B2B_ALLOWED_AMOUNTS[Number(amount)]) {
        toast('Ongeldig bedrag voor merken-wallet. Kies €25, €50, €100 of €250.', true);
        try { console.warn('[wallet] B2B blocked invalid amount:', amount); } catch (_) {}
        return;
      }

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
        toast('Bedrag €' + amount + ' nog niet beschikbaar. Neem contact op met support', true);
        return;
      }

      var domain = (cfg.shop_domain || 'doubleyousmallandtall.nl').replace(/^https?:\/\//,'').replace(/\/$/,'');
      var amountCents = String(Math.round(Number(amount) * 100));
      var returnTo = window.location.origin + (cfg.return_path || '/?pagina=wallet&topup=success');

      // v1.2.0: pak de email + displayName van de INGELOGDE Firebase user, zodat de
      // Shopify checkout niet auto-fills met een eerder Shop Pay device-email.
      var fbUser = (window.firebase && firebase.auth) ? firebase.auth().currentUser : null;
      var userEmail = (fbUser && fbUser.email) ? fbUser.email : '';
      var userName  = (fbUser && (fbUser.displayName || '')) || '';

      // Shopify cart attributes - exact syntax: attributes[name]=value
      // checkout[email] forceert het juiste email-veld i.p.v. Shop Pay device-cache.
      var params = [
        'attributes%5Bwallet_topup_uid%5D=' + encodeURIComponent(u),
        'attributes%5Bwallet_topup_amount_cents%5D=' + encodeURIComponent(amountCents),
        'attributes%5Bwallet_topup_amount_eur%5D=' + encodeURIComponent(String(amount)),
        'attributes%5Bwallet_topup_account_email%5D=' + encodeURIComponent(userEmail),
        'return_to=' + encodeURIComponent(returnTo)
      ];
      // Force checkout email (override Shop Pay cache) - pas toevoegen als email bekend is
      if (userEmail) {
        params.push('checkout%5Bemail%5D=' + encodeURIComponent(userEmail));
        params.push('checkout%5Bnote%5D=' + encodeURIComponent('Wallet top-up voor uid=' + u + ' account=' + userEmail));
      }
      if (userName) {
        params.push('checkout%5Bshipping_address%5D%5Bfirst_name%5D=' + encodeURIComponent(userName));
      }
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

  // v1.8.0 (2026-02-23): openWallet() = DIRECTE wallet-render bypass.
  // Schakelt de hele navigatie-chain (DY.navigeer → DY.toonPagina →
  // pp-wallet wrap → renderWallet) uit en rendert IMMEDIATE de B2B
  // wallet. Defense against ALLE absorptie-mechanismen in legacy code:
  //   - brand-portal-v1.js _renderLock (2s window absorbeert non-BP routes)
  //   - pp-nav-fix-v1.js wrapNavigeer (kan stale-state cleanup blokkeren)
  //   - Cloudflare service worker die OUDE pp-wallet cached
  // Bijwerkingen die we ZELF doen (anders zou de SPA in inconsistente
  // state komen):
  //   - DY.pagina = 'wallet' (zodat injectMenuLink en andere observers
  //     weten dat we op de wallet zijn)
  //   - DY._laatstGerenderd = null (force re-render)
  //   - BP._renderLock = false (cleared)
  //   - history.pushState met ?pagina=wallet (deep-link werkt)
  function openWallet() {
    try {
      if (window.DY) {
        try { window.DY.pagina = 'wallet'; } catch (_) {}
        try { window.DY._laatstGerenderd = null; } catch (_) {}
        try { if (window.DY.brandPortal) window.DY.brandPortal._renderLock = false; } catch (_) {}
      }
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('pagina', 'wallet');
        history.pushState(null, '', url.toString());
      } catch (_) {}
      renderWallet();
    } catch (e) {
      try { console.warn('[wallet] openWallet faalde, fallback naar navigeer:', e); } catch (_) {}
      try { if (window.DY && DY.navigeer) DY.navigeer('wallet'); } catch (_) {}
    }
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
  // v1.7.0 (2026-02-23): Hardened tegen rerouting naar B2C wallet.
  //   - <button> i.p.v. <a href="javascript:void(0)"> voor 1-op-1 parity
  //     met de andere bp-quick knoppen in brand-portal-v1.js (consistente
  //     CSS-grid plaatsing).
  //   - Inline onclick attribuut zodat de DOM-inspector DE ROUTE TOONT en
  //     het attribuut robuust is tegen re-renders die DOM-properties
  //     wegblazen. Voorheen: alleen .onclick = fn → onzichtbaar in DOM
  //     en kwetsbaar voor renderlocks die het element vervangen.
  //   - Verzilvert _renderLock proactief vlak vóór navigatie zodat
  //     concurrent brand-portal renders de wallet-call niet kunnen
  //     absorberen.
  function injectDashboardCard() {
    try {
      if (!window.DY || window.DY.pagina !== 'brand_dashboard') return;
      var grid = document.querySelector('.bp-quick-grid');
      if (!grid) return;
      if (grid.querySelector('[data-testid="brand-dash-wallet"]')) return;

      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'bp-quick';
      card.setAttribute('data-testid', 'brand-dash-wallet');
      // v1.8.0: Inline onclick roept PP_Wallet.openWallet() aan voor
      // DIRECTE render-bypass. Skipt DY.navigeer / DY.toonPagina chain
      // volledig, dus geen enkele wrap (brand-portal _renderLock,
      // pp-nav-fix, etc.) kan de call absorberen. Fallback naar navigeer
      // staat IN openWallet() voor het geval pp-wallet niet geladen is.
      card.setAttribute(
        'onclick',
        "try{if(window.PP_Wallet&&PP_Wallet.openWallet){PP_Wallet.openWallet();return false;}}catch(e){};" +
        "try{if(window.DY&&DY.brandPortal){DY.brandPortal._renderLock=false;}}catch(e){};" +
        "window.DY.navigeer('wallet');"
      );
      card.innerHTML =
        '<div class="bp-quick-icon">💰</div>' +
        '<div class="bp-quick-titel">Wallet</div>' +
        '<div class="bp-quick-sub">Saldo & opwaarderen</div>';
      grid.appendChild(card);
    } catch(e) { /* noop */ }
  }

  // v1.7.0: Document-level capture-phase click delegator als defense-in-depth.
  // Vangt ELKE klik op [data-testid="brand-dash-wallet"] (of nested children)
  // en forceert navigeer('wallet') OOK als de inline-onclick verloren is
  // (bv. door een re-render race condition tussen brand-portal en pp-wallet).
  // Capture phase = vóór alle bubbling listeners → onomzeilbaar door
  // andere event handlers.
  function setupWalletClickDelegator() {
    if (window.__ppWalletDelegatorInstalled) return;
    window.__ppWalletDelegatorInstalled = true;
    document.addEventListener('click', function (e) {
      try {
        var target = e.target;
        if (!target || target.nodeType !== 1) return;
        var btn = target.closest('[data-testid="brand-dash-wallet"]');
        if (!btn) return;
        // v1.8.0: Direct PP_Wallet.openWallet() i.p.v. navigeer chain.
        // Bypass ALLE legacy wrappers. Capture-phase + idempotent.
        e.preventDefault();
        e.stopPropagation();
        if (window.PP_Wallet && typeof PP_Wallet.openWallet === 'function') {
          PP_Wallet.openWallet();
          return;
        }
        // Hard fallback als pp-wallet niet geladen
        try { if (window.DY && DY.brandPortal) DY.brandPortal._renderLock = false; } catch (_) {}
        try { if (window.DY && DY._laatstGerenderd) window.DY._laatstGerenderd = null; } catch (_) {}
        if (window.DY && typeof DY.navigeer === 'function') {
          DY.navigeer('wallet');
        }
      } catch (_) { /* noop */ }
    }, true); // capture phase = onomzeilbaar
  }

  function init() {
    registerRoute();
    setupWalletClickDelegator();
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
    openWallet:   openWallet,
    topup:        topup,
    openTopup:    openTopup,
    refresh:      refresh,
    switchTab:    switchTab,
    B2B_ALLOWED_AMOUNTS: B2B_ALLOWED_AMOUNTS,
    VERSION:      '1.8.0'
  };
})();
