/* PASKAMER PRAAT - Auto Reload on SW Update (v1.0.0)
 *
 * Luistert naar SW_UPDATED-berichten van de service worker en herlaad
 * de pagina eenmalig zodat gebruikers automatisch de meest actuele
 * content, styles en scripts zien direct na een deploy - zonder
 * handmatige refresh.
 *
 * Safeguards:
 * - sessionStorage-vlag voorkomt reload-loops binnen dezelfde sessie
 * - Reload alleen als de VERSION daadwerkelijk verschilt van eerder
 * - Geen reload direct na eerste page-load (skip de initiele activation)
 *
 * 100% additief.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  var SEEN_KEY = 'pp_sw_last_version';
  var RELOADED_KEY = 'pp_sw_reload_pending';

  function shouldReload(newVersion) {
    if (!newVersion) return false;
    try {
      var prev = sessionStorage.getItem(SEEN_KEY);
      if (!prev) {
        // Eerste keer deze sessie: onthoud versie, geen reload nodig.
        sessionStorage.setItem(SEEN_KEY, newVersion);
        return false;
      }
      if (prev === newVersion) return false;
      // Versie is veranderd tijdens deze sessie: reload nodig.
      sessionStorage.setItem(SEEN_KEY, newVersion);
      return true;
    } catch (_) { return false; }
  }

  function safeReload() {
    // Voorkom reload-storm door binnen 3 seconden meerdere SW_UPDATED events
    try {
      var pending = sessionStorage.getItem(RELOADED_KEY);
      if (pending && (Date.now() - parseInt(pending, 10)) < 3000) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch (_) {}
    try {
      // Milde vertraging zodat any pending werk kan afronden.
      setTimeout(function () {
        try { console.log('[pp-auto-reload] verse SW-versie, reload voor actuele content'); } catch (_) {}
        location.reload();
      }, 400);
    } catch (_) {
      location.reload();
    }
  }

  navigator.serviceWorker.addEventListener('message', function (evt) {
    var msg = evt && evt.data;
    if (!msg || msg.type !== 'SW_UPDATED') return;
    if (shouldReload(msg.version)) safeReload();
  });

  // Detecteer ook wanneer een controllerchange plaatsvindt (nieuwe SW pakt
  // controle over deze client). Belt-and-suspenders naast SW_UPDATED.
  var initialControllerChanged = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (initialControllerChanged) return;
    initialControllerChanged = true;
    // Bij eerste controllerchange na SW upgrade: reload
    try {
      var flag = sessionStorage.getItem('pp_sw_controller_seen');
      if (flag === '1') safeReload();
      else sessionStorage.setItem('pp_sw_controller_seen', '1');
    } catch (_) { safeReload(); }
  });
})();
