/* ═══════════════════════════════════════════════════════════════════════
 * Doubleyou — B2C Post Boost Module (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Strikt ADDITIEF: voegt nieuwe modal/flow toe, géén bestaande UI veranderen.
 *
 * Functionaliteit:
 *   - PP_Boost.openModal(postId, postOwnerId)  — toont boost-modal
 *   - PP_Boost.activateBoost(postId, pkg)      — trekt saldo af + activeert
 *   - PP_Boost.getB2CBalance()                 — leest users/{uid}.b2c_wallet_balance
 *
 * Pakketten (override via admin_settings/global.boost_packages):
 *   starter: 24u  · €1,99  · weight 1.5x
 *   groei:   72u  · €4,99  · weight 2.5x
 *   premium: 168u · €9,99  · weight 4.0x
 *
 * Veiligheid:
 *   - Alleen eigenaar kan boost activeren (post.userId === currentUser.uid)
 *   - Wallet-aftrek server-side gevalideerd via /api/boost/activate
 *   - Geen frontend saldo-manipulatie mogelijk
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';
  if (window.PP_Boost) return;

  var DEFAULT_PACKAGES = {
    starter: { naam: 'Starter Boost', uur: 24,  prijs_cents: 199,  weight: 1.5, badge: '🚀', kleur: '#c67d06' },
    groei:   { naam: 'Groei Boost',   uur: 72,  prijs_cents: 499,  weight: 2.5, badge: '🚀', kleur: '#a86b00' },
    premium: { naam: 'Premium Boost', uur: 168, prijs_cents: 999,  weight: 4.0, badge: '✨', kleur: '#1e1a0f' }
  };

  function fb() { return window.firebase; }
  function db() { return fb() && fb().firestore ? fb().firestore() : null; }
  function uid() { var u = fb() && fb().auth && fb().auth().currentUser; return u ? u.uid : null; }
  function toast(msg, err) { try { window.DY && DY.toast && DY.toast(msg, !!err); } catch(e){} }
  function esc(s) { var d=document.createElement('div'); d.textContent=String(s==null?'':s); return d.innerHTML; }

  async function getPackages() {
    try {
      var s = await db().collection('admin_settings').doc('global').get();
      var data = s.exists ? s.data() : {};
      return Object.assign({}, DEFAULT_PACKAGES, data.boost_packages || {});
    } catch(e) { return DEFAULT_PACKAGES; }
  }

  async function getB2CBalance() {
    try {
      var u = uid(); if (!u) return 0;
      var snap = await db().collection('users').doc(u).get();
      var d = snap.exists ? snap.data() : {};
      return Number(d.b2c_wallet_balance || 0);
    } catch(e) { return 0; }
  }

  async function openModal(postId, postOwnerId) {
    var u = uid();
    if (!u) { toast('Log eerst in', true); return; }
    if (postOwnerId && postOwnerId !== u) {
      toast('Je kunt alleen je eigen posts boosten', true);
      return;
    }
    var balance = await getB2CBalance();
    var packages = await getPackages();

    closeModal();
    var modal = document.createElement('div');
    modal.id = 'pp-boost-modal';
    modal.className = 'pp-boost-modal-overlay';
    modal.setAttribute('data-testid', 'boost-modal');

    var pkgHtml = Object.keys(packages).map(function(key){
      var p = packages[key];
      var prijsEur = (p.prijs_cents / 100).toFixed(2).replace('.', ',');
      var voldoende = (balance * 100) >= p.prijs_cents;
      var disabled = voldoende ? '' : 'disabled';
      var labelDuur = p.uur >= 24 ? Math.round(p.uur/24) + ' dag' + (p.uur >= 48 ? 'en' : '') : p.uur + ' uur';
      return (
        '<button class="pp-boost-pkg ' + (voldoende ? '' : 'pp-boost-pkg-locked') + '" ' +
        'data-pkg="' + esc(key) + '" ' + disabled + ' ' +
        'data-testid="boost-pkg-' + esc(key) + '" ' +
        'onclick="PP_Boost._selectPkg(\'' + esc(postId) + '\',\'' + esc(key) + '\')">' +
        '<div class="pp-boost-pkg-badge">' + esc(p.badge) + '</div>' +
        '<div class="pp-boost-pkg-name">' + esc(p.naam) + '</div>' +
        '<div class="pp-boost-pkg-duur">' + esc(labelDuur) + ' extra zichtbaar</div>' +
        '<div class="pp-boost-pkg-weight">+' + Math.round((p.weight - 1) * 100) + '% bereik</div>' +
        '<div class="pp-boost-pkg-prijs">€' + prijsEur + '</div>' +
        (voldoende ? '' : '<div class="pp-boost-pkg-lock">Saldo te laag</div>') +
        '</button>'
      );
    }).join('');

    var topupNeeded = balance < 1.99;
    modal.innerHTML =
      '<div class="pp-boost-modal-inner" onclick="event.stopPropagation()">' +
      '<button class="pp-boost-close" onclick="PP_Boost.closeModal()" aria-label="Sluiten" data-testid="boost-close">&times;</button>' +
      '<h2 class="pp-boost-title">🚀 Geef je outfit extra zichtbaarheid</h2>' +
      '<p class="pp-boost-lead">Boost je eigen post om meer mensen in de community te bereiken. Hoe hoger het pakket, hoe langer en breder je post wordt getoond.</p>' +
      '<div class="pp-boost-balance" data-testid="boost-balance">' +
        '<span class="pp-boost-balance-label">Jouw saldo</span>' +
        '<span class="pp-boost-balance-value">€' + balance.toFixed(2).replace('.',',') + '</span>' +
      '</div>' +
      (topupNeeded
        ? '<div class="pp-boost-topup-hint">' +
          'Onvoldoende saldo? <button class="pp-boost-topup-btn" onclick="PP_Boost.openTopup()" data-testid="boost-topup-btn">Wallet opwaarderen →</button>' +
          '</div>'
        : '') +
      '<div class="pp-boost-pkgs">' + pkgHtml + '</div>' +
      '<p class="pp-boost-fineprint">Boosts respecteren de community-regels. Verlopen boosts worden automatisch beëindigd. Geen restitutie na activatie.</p>' +
      '</div>';
    modal.onclick = closeModal;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    var m = document.getElementById('pp-boost-modal');
    if (m) m.parentNode.removeChild(m);
    document.body.style.overflow = '';
  }

  async function _selectPkg(postId, pkgKey) {
    var packages = await getPackages();
    var pkg = packages[pkgKey];
    if (!pkg) { toast('Pakket niet gevonden', true); return; }
    var balance = await getB2CBalance();
    if ((balance * 100) < pkg.prijs_cents) {
      toast('Saldo te laag voor dit pakket', true);
      return;
    }
    if (!confirm('Activeer "' + pkg.naam + '" voor €' + (pkg.prijs_cents/100).toFixed(2).replace('.', ',') + '?\n\nJouw saldo wordt direct met dit bedrag verlaagd.')) return;

    // Server-side activeren via backend (transactional: saldo aftrek + post update + boost record)
    try {
      var token = await fb().auth().currentUser.getIdToken();
      var apiBase = (window.DY && DY.config && DY.config.apiBase) || '';
      var r = await fetch(apiBase + '/api/boost/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ postId: postId, packageKey: pkgKey })
      });
      var d = await r.json();
      if (!r.ok || !d.ok) {
        toast('Activeren mislukt: ' + (d.detail || d.error || r.status), true);
        return;
      }
      toast('🚀 Je post wordt nu extra zichtbaar tot ' + new Date(d.expiresAt).toLocaleString('nl-NL'));
      closeModal();
      // Refresh feed na 1s
      setTimeout(function(){ try { window.DY && DY.refreshFeed && DY.refreshFeed(); } catch(e){} }, 1000);
    } catch(e) {
      toast('Netwerkfout: ' + (e.message || e), true);
    }
  }

  function openTopup() {
    // Navigeer naar B2C wallet topup (gebruikt bestaande pp-wallet pattern)
    closeModal();
    try {
      if (window.DY && DY.navigeer) DY.navigeer('wallet');
      else window.location.hash = '#wallet';
    } catch(e){}
  }

  // ── Boost-knop in post-eigenaar menu (auto-inject) ─────────────────
  // Wordt aangeroepen door pwa-v463 als het post-menu wordt gerenderd.
  // Returns HTML-string voor de boost-knop, of '' als niet eigenaar.
  function getBoostButton(postId, postOwnerId) {
    var u = uid();
    if (!u || u !== postOwnerId) return '';
    return '<button class="dy-post-menu-item" onclick="PP_Boost.openModal(\'' + esc(postId) + '\',\'' + esc(postOwnerId) + '\');event.stopPropagation()" data-testid="post-boost-btn-' + esc(postId) + '">' +
           '<span class="dy-post-menu-icon">🚀</span> Boost post' +
           '</button>';
  }

  window.PP_Boost = {
    openModal:      openModal,
    closeModal:     closeModal,
    openTopup:      openTopup,
    getB2CBalance:  getB2CBalance,
    getBoostButton: getBoostButton,
    _selectPkg:     _selectPkg,
    VERSION:        '1.0.0'
  };
})();
