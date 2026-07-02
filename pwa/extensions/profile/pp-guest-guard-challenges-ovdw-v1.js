/* ═══════════════════════════════════════════════════════════════════════
 * PASKAMER PRAAT — Guest Guard: Challenges & OVDW (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Schermt de "Challenges" en "Post van de week" tabs af voor niet-
 * ingelogde bezoekers. Gebruikt dezelfde login-popup als andere gated
 * features (DY.toonLoginPrompt).
 *
 * Volledig additief — géén wijziging aan bestaande core-code of buttons.
 * Werkwijze:
 *   1) Hijack DY.navigeer: als target 'challenges' of 'ovdw' is en de
 *      user niet ingelogd is, toon login-prompt en breek af.
 *   2) Extra vangnet: capture-phase click delegator die dezelfde
 *      controle op de originele buttons uitvoert (voor edge-cases
 *      waar DY.navigeer via een andere pad wordt aangeroepen).
 *
 * v1.0.0 — 2 juli 2026
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ppGuestGuardChallengesOvdwInit) return;
  window.__ppGuestGuardChallengesOvdwInit = true;

  var GATED_PAGES = { 'challenges': true, 'ovdw': true };

  var REDENEN = {
    'challenges': 'Log in om deel te nemen aan challenges en de leaderboard te bekijken.',
    'ovdw': 'Log in om Post van de week te bekijken en op community-outfits te stemmen.'
  };

  function isGast() {
    try {
      var u = window.DY && DY.user;
      if (!u) return true;
      if (u.isAnonymous === true) return true;
      if (!u.uid) return true;
      return false;
    } catch (_) { return true; }
  }

  function toonPrompt(reden) {
    try {
      if (window.DY && typeof DY.toonLoginPrompt === 'function') {
        DY.toonLoginPrompt(reden);
        return true;
      }
      if (window.DY && typeof DY.toonLogin === 'function') {
        DY.toonLogin();
        return true;
      }
    } catch (_) {}
    return false;
  }

  // ─── 1) DY.navigeer hijack ──────────────────────────────────────────
  function installNavigateGuard() {
    if (!window.DY || typeof DY.navigeer !== 'function') return false;
    if (DY.__ppGuestGuardWrapped) return true;

    var orig = DY.navigeer;
    DY.navigeer = function (target) {
      try {
        if (target && GATED_PAGES[target] && isGast()) {
          toonPrompt(REDENEN[target] || 'Log in om deze functie te gebruiken.');
          return;
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    DY.__ppGuestGuardWrapped = true;
    return true;
  }

  // ─── 2) Click delegator (vangnet) ───────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('button, a');
    if (!btn) return;
    var onclickAttr = btn.getAttribute('onclick') || '';
    var target = null;
    if (/DY\.navigeer\(['"]challenges['"]\)/.test(onclickAttr)) target = 'challenges';
    else if (/DY\.navigeer\(['"]ovdw['"]\)/.test(onclickAttr)) target = 'ovdw';
    if (!target) return;
    if (!isGast()) return; // ingelogde user → laat onclick doorlopen
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toonPrompt(REDENEN[target]);
  }, true);

  // ─── Init: probeer navigeer-hook zodra DY beschikbaar is ────────────
  var attempts = 0;
  var iv = setInterval(function () {
    if (installNavigateGuard() || attempts++ > 40) clearInterval(iv);
  }, 250);

  window.PP_GuestGuardChallengesOvdw = { VERSION: '1.0.0' };
})();
