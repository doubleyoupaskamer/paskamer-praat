/* Doubleyou - Centrale Brand Config v1
 * Een single source of truth voor app-branding (naam, tagline, versie).
 * Andere extensies en legacy code kunnen via window.PP_BRAND lezen.
 *
 * Vervangt hardcoded "Doubleyou", "v60.1.x" en datums in UI-laag.
 */
(function () {
  'use strict';
  if (window.PP_BRAND) return;

  // Versie wordt bij elke release gebumpt; UI leest hier vanaf.
  var APP_VERSION = 'v60.1.83';

  function formatDateNL(d) {
    try {
      var date = (d instanceof Date) ? d : new Date(d || Date.now());
      return date.toLocaleDateString('nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch (e) {
      return '';
    }
  }

  window.PP_BRAND = Object.freeze({
    appName:      'Doubleyou',
    tagline:      'Tailored for Tall & Plus Size',
    fullName:     'Doubleyou - Tailored for Tall & Plus Size',
    organisation: 'Doubleyou Tailored for Tall & Plus Size',
    domain:       'paskamerpraat.nl',   // technische host - blijft
    version:      APP_VERSION,
    contactEmail: 'info@doubleyousmallandtall.nl',
    formatDate:   formatDateNL
  });

  // Live update legacy DOM-elementen die nog hardcoded teksten hebben.
  function applyToDom() {
    try {
      // Document title alleen bijwerken als hij nog de oude naam bevat
      // en niet door een routerendering is overschreven (heeft "|" of "-").
      if (document.title && /Doubleyou/i.test(document.title)) {
        document.title = document.title.replace(/Doubleyou/gi, 'Doubleyou');
      }
      // Legal-footer copyright update (mocht het er nog staan)
      var footer = document.querySelector('.pp-legal-footer');
      if (footer) {
        var copy = footer.querySelector('[data-pp-copy]');
        if (copy) {
          copy.textContent = '\u00A9 ' + (new Date()).getFullYear() + ' '
            + window.PP_BRAND.organisation + ' - ' + window.PP_BRAND.version;
        }
      }
    } catch (e) { /* graceful */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyToDom);
  } else {
    applyToDom();
  }
})();
