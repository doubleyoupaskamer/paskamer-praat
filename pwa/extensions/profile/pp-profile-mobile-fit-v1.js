/* Doubleyou - Mobiele profiel overflow fix v1
 *
 * v60.1.85: Op smalle mobiele schermen viel een blok in het
 * gebruikersprofiel buiten beeld (horizontale overflow).
 * Oorzaak: enkele flex-containers en lange teksten (email, naam,
 * lange titels) konden de viewport-breedte overschrijden zonder
 * proper containment.
 *
 * Deze module injecteert defensieve CSS regels die alleen op
 * smalle schermen (<= 720px) actief zijn en uitsluitend mobile
 * overflow problemen in de profielpagina oplossen. Layout-intent
 * blijft volledig behouden; alleen "max-width / word-break /
 * min-width:0 / box-sizing" worden afgedwongen op de bestaande
 * elementen.
 */
(function () {
  'use strict';
  if (window.__PP_PROFILE_MOBILE_FIT_V1__) return;
  window.__PP_PROFILE_MOBILE_FIT_V1__ = true;

  var STYLE_ID = 'pp-profile-mobile-fit';
  if (document.getElementById(STYLE_ID)) return;

  var css =
    // Algemene container: voorkom horizontal overflow van wrap
    '.dy-profiel-wrap{max-width:100vw;overflow-x:hidden;box-sizing:border-box}' +
    '.dy-profiel-wrap *{min-width:0}' +
    // Hero: zorg dat geen kind buiten de viewport valt
    '.dy-profiel-hero{box-sizing:border-box;max-width:100%;' +
      'padding-left:max(16px,env(safe-area-inset-left,16px));' +
      'padding-right:max(16px,env(safe-area-inset-right,16px))}' +
    // Acties-blok onder de hero (privacy/voorwaarden/merkenportaal/wallet/logout):
    // ALTIJD kolom-stacking zodat geïnjecteerde knoppen (brand-portal, b2c-wallet)
    // niet meer clippen door horizontale flex-row layout. Wordt op alle viewports
    // toegepast omdat de inhoud bedoeld is als verticaal menu.
    '.dy-profiel-acties{max-width:100%;box-sizing:border-box;' +
      'display:flex;flex-direction:column;gap:8px;align-items:stretch}' +
    '.dy-profiel-acties > .dy-btn,' +
    '.dy-profiel-acties > button{width:100%;min-width:0;box-sizing:border-box;' +
      'white-space:normal;overflow:hidden;text-overflow:ellipsis}' +
    '@media (max-width:720px){' +
      // Naam-wrap: laat lange namen wrappen ipv overflowen
      '.dy-profiel-naam-wrap{max-width:100%;flex-wrap:wrap;justify-content:center}' +
      '.dy-profiel-naam{max-width:100%;word-break:break-word;overflow-wrap:anywhere;' +
        'text-align:center}' +
      // Email kan lang zijn (bv. info@doubleyousmallandtall.nl)
      '.dy-profiel-email{max-width:100%;word-break:break-all;overflow-wrap:anywhere;' +
        'text-align:center;padding:0 8px}' +
      '.dy-profiel-email-note{max-width:100%;text-align:center;padding:0 8px}' +
      // Stats rij: voorkom dat 3 cijfers + 2 separators buiten beeld vallen
      '.dy-profiel-sociaal-stats{max-width:100%;flex-wrap:nowrap;' +
        'justify-content:space-around;padding:0 8px;box-sizing:border-box}' +
      '.dy-profiel-stat-item{flex:1 1 0;min-width:0;text-align:center}' +
      '.dy-profiel-stat-num{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'display:block}' +
      // Actie-knoppen rij: wrap netjes op zeer smalle schermen
      '.dy-profiel-hero-acties{flex-wrap:wrap;gap:8px;padding:0 8px;' +
        'box-sizing:border-box;max-width:100%}' +
      '.dy-profiel-btn-bewerk,.dy-profiel-btn-berichten{min-width:0;flex:1 1 140px;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      // Badges wrap (de scrollbare strip): forceer horizontal scroll ipv overflow
      '.dy-profiel-badges-wrap{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}' +
      '.dy-profiel-badges-wrap::-webkit-scrollbar{display:none}' +
      // Extra padding op mobiel
      '.dy-profiel-acties{padding-left:16px;padding-right:16px}' +
      // PS dropdown panels (Volgend / Volgers)
      '.dy-ps-dd-wrap{max-width:100%;box-sizing:border-box}' +
      // Niveau badge: laat wrappen
      '.dy-profiel-niveau-badge{max-width:100%;word-break:break-word;text-align:center;' +
        'padding:0 8px}' +
    '}';

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
