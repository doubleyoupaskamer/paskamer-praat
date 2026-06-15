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
  var TOS_VERSION = '1.0';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#pp-legal-footer{position:relative;z-index:1;background:transparent;color:rgba(252,248,239,.45);font:500 11px/1.5 "DM Sans",system-ui,sans-serif;padding:24px 16px 110px;text-align:center;border-top:1px solid rgba(252,248,239,.06);margin-top:40px}' +
      '#pp-legal-footer a{color:rgba(252,248,239,.7);text-decoration:none;margin:0 6px;border-bottom:1px dotted rgba(252,248,239,.18);padding-bottom:1px}' +
      '#pp-legal-footer a:hover{color:#d4910a;border-bottom-color:#d4910a}' +
      '#pp-legal-footer .pp-legal-sep{opacity:.4}' +
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

  function injectFooter() {
    if (document.getElementById(FOOTER_ID)) return;
    // Voorkom dubbele injectie op /voorwaarden zelf
    if (location.pathname.indexOf('/voorwaarden') === 0) return;
    var f = document.createElement('footer');
    f.id = FOOTER_ID;
    f.setAttribute('data-testid', 'pp-legal-footer');
    f.innerHTML =
      '<a href="/voorwaarden/#reglement" data-testid="footer-reglement">Gebruikersreglement</a>' +
      '<span class="pp-legal-sep">·</span>' +
      '<a href="/voorwaarden/#aup" data-testid="footer-aup">Acceptable Use</a>' +
      '<span class="pp-legal-sep">·</span>' +
      '<a href="/voorwaarden/#privacy" data-testid="footer-privacy">Privacy &amp; Cookies</a>' +
      '<span class="pp-legal-sep">·</span>' +
      '<a href="/voorwaarden/#av" data-testid="footer-av">Algemene Voorwaarden</a>' +
      '<span class="pp-legal-sep">·</span>' +
      '<a href="/voorwaarden/#campagnes" data-testid="footer-campagnes">Campagnevoorwaarden</a>' +
      '<div style="margin-top:8px;opacity:.6" data-pp-copy>\u00A9 ' + (new Date()).getFullYear() + ' '
        + ((window.PP_BRAND && window.PP_BRAND.organisation) || 'Doubleyou Tailored for Tall & Plus Size')
        + ' - Doubleyou ' + ((window.PP_BRAND && window.PP_BRAND.version) || 'v60.1.75') + '</div>';
    // Append aan body, niet aan dy-main, om scroll-snap conflicten te vermijden
    document.body.appendChild(f);
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
    // v60.1.78: Legal footer-blok verwijderd op verzoek van gebruiker
    // (zag er slordig uit op mobiel en stoorde de scroll-flow).
    // De TOS-acceptatie bewaking blijft actief voor merken; alleen het
    // zichtbare voorwaarden-blok onderaan iedere pagina is uitgezet.
    // injectFooter();   // <- opzettelijk uitgeschakeld
    // Opruimen: verwijder een eventueel reeds geinjecteerd footer-element
    // dat van een vorige cached versie nog in de DOM zou zitten.
    var stale = document.getElementById(FOOTER_ID);
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    // Re-check bij navigatie/userchange
    setTimeout(checkTosAcceptance, 2000);
    document.addEventListener('pp:login', function() { setTimeout(checkTosAcceptance, 1500); });
    document.addEventListener('pp:userchange', function() { setTimeout(checkTosAcceptance, 1500); });
    document.addEventListener('pp:refreshed', function() { checkTosAcceptance(); });
    document.addEventListener('pp:logout', function() {
      var b = document.getElementById('pp-legal-banner');
      if (b) b.remove();
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
