/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Legal Footer Injector (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 * Voegt op iedere pagina een discrete voorwaarden-footer toe en bewaakt
 * dat ingelogde merken hun acceptatie-versie hebben geregistreerd.
 *
 * Niet-invasief: alleen additie, geen wijzigingen aan legacy of styling.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var FOOTER_ID = 'pp-legal-footer';
  var STYLE_ID  = 'pp-legal-style';
  var TOS_VERSION = '2.0';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      // v60.1.79: solid dark background + duidelijke contrast, ongeacht
      // de pagina eronder (was transparent, gaf cream doorlek op mobiel).
      '#pp-legal-footer{position:relative;z-index:1;' +
        'background:#0a0806;' +
        'color:rgba(252,248,239,.78);' +
        'font:500 11px/1.6 "DM Sans",system-ui,sans-serif;' +
        'padding:20px 16px calc(110px + env(safe-area-inset-bottom,0px));' +
        'text-align:center;' +
        'border-top:1px solid rgba(212,145,10,.18);' +
        'margin-top:32px;' +
        'letter-spacing:.01em}' +
      '#pp-legal-footer .pp-legal-mark{display:block;margin:0 auto 14px;' +
        'width:36px;height:36px;border-radius:50%;' +
        'background:radial-gradient(circle at 30% 30%,rgba(232,200,120,.18),rgba(212,145,10,.06) 60%,transparent 75%);' +
        'border:1px solid rgba(212,145,10,.35);' +
        'color:#e8c878;' +
        'font:700 18px/34px "Playfair Display",Georgia,serif;' +
        'text-align:center;letter-spacing:0;' +
        'text-shadow:0 0 8px rgba(212,145,10,.25);' +
        'transition:transform .35s ease,border-color .25s ease,color .25s ease}' +
      '#pp-legal-footer .pp-legal-mark:hover{transform:rotate(-6deg) scale(1.05);' +
        'border-color:rgba(212,145,10,.6);color:#f4d98c}' +
      '#pp-legal-footer .pp-legal-row{display:inline-flex;flex-wrap:wrap;' +
        'justify-content:center;align-items:center;gap:4px 0;max-width:560px;margin:0 auto}' +
      '#pp-legal-footer a{color:#fcf8ef;text-decoration:none;' +
        'margin:0 8px;padding:4px 2px;' +
        'border-bottom:1px dotted rgba(252,248,239,.28);' +
        'transition:color .15s ease,border-color .15s ease}' +
      '#pp-legal-footer a:hover,#pp-legal-footer a:focus{color:#d4910a;' +
        'border-bottom-color:#d4910a;outline:none}' +
      '#pp-legal-footer .pp-legal-sep{color:rgba(212,145,10,.45);' +
        'margin:0 2px;font-weight:600}' +
      '#pp-legal-footer .pp-legal-copy{display:block;margin-top:12px;' +
        'color:rgba(252,248,239,.45);font-size:10.5px;line-height:1.5}' +
      '@media (max-width:520px){' +
        '#pp-legal-footer{padding-top:18px;font-size:11.5px}' +
        '#pp-legal-footer a{margin:3px 6px;display:inline-block}' +
        '#pp-legal-footer .pp-legal-sep{margin:0 1px}' +
      '}' +
      /* v60.1.84: desktop grid breekt af bij sidebar. Footer moet
         de volledige breedte beslaan in de body-grid (kolom 1/-1). */
      '@media (min-width:1024px){' +
        '#pp-legal-footer{grid-column:1 / -1}' +
      '}' +
      '#pp-legal-banner{position:fixed;bottom:80px;left:16px;right:16px;max-width:520px;margin:0 auto;background:#1e1a0f;border:1px solid rgba(212,145,10,.4);border-radius:14px;padding:14px 16px;color:#fcf8ef;font:500 13px/1.45 "DM Sans",sans-serif;box-shadow:0 20px 40px -10px rgba(0,0,0,.6);z-index:9998;animation:ppLegalSlide .35s ease}' +
      '@keyframes ppLegalSlide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}' +
      '#pp-legal-banner .pp-lb-title{font-weight:700;color:#d4910a;margin-bottom:4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}' +
      '#pp-legal-banner p{margin:0 0 10px;color:rgba(252,248,239,.85)}' +
      '#pp-legal-banner .pp-lb-actions{display:flex;gap:8px;justify-content:flex-end}' +
      '#pp-legal-banner button,#pp-legal-banner a{font:600 12px/1 "DM Sans",sans-serif;padding:8px 14px;border-radius:100px;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:all .15s ease}' +
      '#pp-legal-banner .pp-lb-accept{background:#d4910a;color:#1e1a0f;border:none}' +
      '#pp-legal-banner .pp-lb-accept:hover{background:#b87807}' +
      '#pp-legal-banner .pp-lb-read{background:transparent;color:#fcf8ef;border:1px solid rgba(252,248,239,.18)}' +
      '#pp-legal-banner .pp-lb-read:hover{border-color:#d4910a;color:#d4910a}';
    document.head.appendChild(s);
  }

  // ── Helper: bepaal of we op de homepagina zitten ────────────────────
  function isHomePagina() {
    // 1. DY router source of truth: DY.pagina === 'home'
    try {
      if (window.DY && typeof window.DY.pagina === 'string') {
        return window.DY.pagina === 'home';
      }
    } catch (e) { /* noop */ }
    // 2. Fallback voor pre-DY load: kijk naar URL queryparam ?pagina=
    try {
      var sp = new URLSearchParams(location.search);
      var p = sp.get('pagina');
      if (p) return p === 'home';
    } catch (e) { /* noop */ }
    // 3. Geen pagina parameter en root path = home
    return location.pathname === '/' || location.pathname === '/index.html';
  }

  function updateFooterVisibility() {
    var el = document.getElementById(FOOTER_ID);
    if (!el) return;
    el.style.display = isHomePagina() ? '' : 'none';
  }

  function injectFooter() {
    if (document.getElementById(FOOTER_ID)) {
      updateFooterVisibility();
      return;
    }
    // Voorkom dubbele injectie op /voorwaarden zelf
    if (location.pathname.indexOf('/voorwaarden') === 0) return;
    var f = document.createElement('footer');
    f.id = FOOTER_ID;
    f.setAttribute('data-testid', 'pp-legal-footer');
    f.innerHTML =
      '<div class="pp-legal-mark" aria-hidden="true">W</div>' +
      '<div class="pp-legal-row">' +
        '<a href="/voorwaarden/#reglement" data-testid="footer-reglement">Gebruikersreglement</a>' +
        '<span class="pp-legal-sep">·</span>' +
        '<a href="/voorwaarden/#aup" data-testid="footer-aup">Acceptable Use</a>' +
        '<span class="pp-legal-sep">·</span>' +
        '<a href="/voorwaarden/#privacy" data-testid="footer-privacy">Privacy &amp; Cookies</a>' +
        '<span class="pp-legal-sep">·</span>' +
        '<a href="/voorwaarden/#av" data-testid="footer-av">Algemene Voorwaarden</a>' +
        '<span class="pp-legal-sep">·</span>' +
        '<a href="/voorwaarden/#campagnes" data-testid="footer-campagnes">Campagnevoorwaarden</a>' +
      '</div>' +
      '<div class="pp-legal-copy" data-pp-copy>\u00A9 ' + (new Date()).getFullYear() + ' '
        + ((window.PP_BRAND && window.PP_BRAND.organisation) || 'Doubleyou Tailored for Tall & Plus Size')
        + ' · ' + ((window.PP_BRAND && window.PP_BRAND.version) || 'v60.1.79') + '</div>';
    // Append aan body, niet aan dy-main, om scroll-snap conflicten te vermijden
    document.body.appendChild(f);
    updateFooterVisibility();
  }

  // ── TOS-acceptatie bewaking voor ingelogde merken ───────────────────
  function checkTosAcceptance() {
    if (!window.DY || !DY.user || !DY.profile) return;
    // Alleen voor merken
    if (!DY.profile.isBrand) return;
    var accepted = DY.profile.tos_version_accepted;
    if (accepted === TOS_VERSION) return;
    // Toon banner als nog niet geaccepteerd
    if (document.getElementById('pp-legal-banner')) return;
    showAcceptanceBanner();
  }

  function showAcceptanceBanner() {
    var b = document.createElement('div');
    b.id = 'pp-legal-banner';
    b.setAttribute('role', 'alertdialog');
    b.setAttribute('data-testid', 'pp-legal-banner');
    b.innerHTML =
      '<div class="pp-lb-title">Voorwaarden update - v' + TOS_VERSION + '</div>' +
      '<p>Onze voorwaarden zijn bijgewerkt. Lees en accepteer om campagnes en producten te beheren.</p>' +
      '<div class="pp-lb-actions">' +
        '<a class="pp-lb-read" href="/voorwaarden/" data-testid="banner-read">Lezen</a>' +
        '<button class="pp-lb-accept" data-testid="banner-accept">Akkoord</button>' +
      '</div>';
    document.body.appendChild(b);
    b.querySelector('.pp-lb-accept').addEventListener('click', acceptTos);
  }

  async function acceptTos() {
    try {
      if (window.DY && DY.db && DY.user) {
        await DY.db.collection('users').doc(DY.user.uid).set({
          tos_version_accepted: TOS_VERSION,
          tos_accepted_at: new Date().toISOString(),
          aup_version_accepted: TOS_VERSION,
          privacy_version_accepted: TOS_VERSION,
        }, { merge: true });
        if (DY.profile) {
          DY.profile.tos_version_accepted = TOS_VERSION;
        }
      }
    } catch (e) { console.warn('[pp-legal] tos accept faalde:', e); }
    var b = document.getElementById('pp-legal-banner');
    if (b) b.remove();
    if (window.DY && DY.toast) DY.toast('Bedankt - voorwaarden geaccepteerd');
  }

  function init() {
    ensureStyle();
    // v60.1.81: Footer alleen tonen op de homepage (DY.pagina === 'home').
    // Andere pagina's krijgen geen footer-blok meer.
    injectFooter();
    // Cleanup: verwijder een eventueel reeds geinjecteerd footer-element
    // van een vorige cached versie (voorkomt dubbele footer).
    var staleNodes = document.querySelectorAll('#' + FOOTER_ID);
    if (staleNodes.length > 1) {
      for (var i = 1; i < staleNodes.length; i++) staleNodes[i].remove();
    }
    // Navigatie hooks: zichtbaarheid van footer bijwerken bij elke
    // routewissel. DY heeft geen eigen route-event, dus we combineren:
    //   1. hashchange + popstate (URL changes)
    //   2. clicks op .dy-nav-item / .dy-sb-item / [data-pagina]
    //   3. periodieke poll (1.5s) als safety net voor DY.pagina mutaties
    window.addEventListener('hashchange',  updateFooterVisibility);
    window.addEventListener('popstate',    updateFooterVisibility);
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== document) {
        if (t.matches && (t.matches('[data-pagina]') ||
                          t.matches('.dy-nav-item') ||
                          t.matches('.dy-sb-item'))) {
          setTimeout(updateFooterVisibility, 80);
          return;
        }
        t = t.parentNode;
      }
    }, true);
    setInterval(updateFooterVisibility, 1500);

    // Re-check bij navigatie/userchange
    setTimeout(checkTosAcceptance, 2000);
    document.addEventListener('pp:login', function() { setTimeout(checkTosAcceptance, 1500); });
    document.addEventListener('pp:userchange', function() { setTimeout(checkTosAcceptance, 1500); });
    document.addEventListener('pp:refreshed', function() { checkTosAcceptance(); updateFooterVisibility(); });
    document.addEventListener('pp:logout', function() {
      var b = document.getElementById('pp-legal-banner');
      if (b) b.remove();
      updateFooterVisibility();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }

  window.PP_Legal = {
    showBanner: showAcceptanceBanner,
    accept: acceptTos,
    VERSION: '1.0.0',
    TOS_VERSION: TOS_VERSION,
  };
})();
