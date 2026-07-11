/* PASKAMER PRAAT. Merkenportaal Review Flow (v1.0.0)
 * Additieve reviews per merk. Slaat op in Firestore collection 'reviews'
 * met reviewType='brand' + brandId. Wordt getoond binnen de brand-detail
 * pagina (BP.toonMerkDetail) via MutationObserver injectie.
 * 100% additief - geen legacy code gewijzigd.
 */
(function () {
  'use strict';
  var COLL = 'reviews';
  var TYPE = 'brand';
  var SECTION_ID = 'pp-br-sectie';

  function auth() { try { return firebase.auth(); } catch (_) { return null; } }
  function db() { try { return firebase.firestore(); } catch (_) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(ts) { try { var d = ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null; return d && !isNaN(d) ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch (_) { return ''; } }
  function stars(n, sz) { sz = sz || 14; var o = ''; for (var i = 1; i <= 5; i++) { o += '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" fill="' + (i <= n ? '#f0b340' : 'rgba(253,245,227,0.2)') + '"><path d="M12 2l3.09 6.26 6.91 1-5 4.87 1.18 6.87L12 17.77 5.82 21l1.18-6.87-5-4.87 6.91-1z"/></svg>'; } return o; }
  function isAnon() { try { var u = auth() && auth().currentUser; return !u || u.isAnonymous === true; } catch (_) { return true; } }
  function requireLogin() {
    if (window.PP_AiGuard && typeof PP_AiGuard.check === 'function') { try { PP_AiGuard.check(); } catch (_) {} return; }
    if (window.DY && DY.auth && typeof DY.auth.open === 'function') { try { DY.auth.open(); } catch (_) {} return; }
    if (window.DY && typeof DY.navigeer === 'function') { try { DY.navigeer('login'); } catch (_) {} }
  }

  function currentBrandId() {
    try {
      var back = document.querySelector('.bp-back');
      var hero = document.querySelector('.bp-merk-hero');
      if (!hero) return null;
      // brandId is niet direct in DOM aanwezig, dus lees uit URL of state:
      var qs = new URLSearchParams(location.search || '');
      var id = qs.get('brand') || qs.get('brandId') || qs.get('merk');
      if (id) return id;
      // Lees fallback uit product-links (data-testid brand-product-XYZ leidt niet
      // tot brandId; gebruik daarvoor globale BP-state via DY.brandPortal._huidigMerkId).
      if (window.DY && DY.brandPortal && DY.brandPortal._huidigMerkId) return DY.brandPortal._huidigMerkId;
      return null;
    } catch (_) { return null; }
  }

  function buildSection(brandId) {
    var wrap = document.createElement('section');
    wrap.id = SECTION_ID;
    wrap.className = 'pp-br-sectie';
    wrap.setAttribute('data-testid', 'pp-brand-reviews-sectie');
    wrap.setAttribute('data-brand-id', brandId);
    wrap.innerHTML =
      '<div class="pp-br-kop">' +
        '<div>' +
          '<h2 class="pp-br-titel">Reviews</h2>' +
          '<p class="pp-br-sub">Deel je ervaring met dit merk.</p>' +
        '</div>' +
        '<button type="button" class="pp-br-nieuw" data-role="pp-br-open" data-testid="pp-br-open-btn">+ Plaats review</button>' +
      '</div>' +
      '<div class="pp-br-stats" id="pp-br-stats" data-testid="pp-br-stats"></div>' +
      '<div class="pp-br-lijst" id="pp-br-lijst" data-testid="pp-br-lijst"><div class="pp-br-loading">Reviews laden...</div></div>';
    wrap.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-role') === 'pp-br-open') {
        if (isAnon()) { requireLogin(); return; }
        openSubmit(brandId);
      }
    });
    return wrap;
  }

  async function loadReviews(brandId) {
    var lijst = document.getElementById('pp-br-lijst');
    var statsEl = document.getElementById('pp-br-stats');
    if (!lijst) return;
    var d = db();
    if (!d) { lijst.innerHTML = '<div class="pp-br-empty">Kon reviews niet laden.</div>'; return; }
    try {
      var snap = await d.collection(COLL)
        .where('reviewType', '==', TYPE)
        .where('brandId', '==', brandId)
        .limit(100).get();
      var docs = snap.docs || [];
      // Sorteer client-side op ts desc (voorkomt composite-index requirement)
      docs.sort(function (a, b) {
        var ta = ((a.data() || {}).ts && (a.data().ts).toMillis) ? a.data().ts.toMillis() : 0;
        var tb = ((b.data() || {}).ts && (b.data().ts).toMillis) ? b.data().ts.toMillis() : 0;
        return tb - ta;
      });
      // Stats
      if (statsEl) {
        if (!docs.length) { statsEl.innerHTML = ''; }
        else {
          var sum = 0, n = 0;
          docs.forEach(function (dc) { var r = (dc.data() || {}).rating || 0; if (r > 0) { sum += r; n++; } });
          var g = n ? sum / n : 0;
          statsEl.innerHTML = '<div class="pp-br-avg"><span class="pp-br-avg-num" data-testid="pp-br-avg-num">' + g.toFixed(1) + '</span><span>' + stars(Math.round(g), 16) + '</span><span class="pp-br-avg-count">op basis van <strong>' + docs.length + '</strong> ' + (docs.length === 1 ? 'review' : 'reviews') + '</span></div>';
        }
      }
      if (!docs.length) { lijst.innerHTML = '<div class="pp-br-empty" data-testid="pp-br-empty">Nog geen reviews. Wees de eerste!</div>'; return; }
      lijst.innerHTML = docs.map(function (dc) {
        var r = dc.data() || {};
        return '<article class="pp-br-kaart" data-testid="pp-br-review-card">' +
          '<div class="pp-br-k-top"><div class="pp-br-k-auteur" data-pp-live-name data-pp-uid="' + esc(r.userId || '') + '">' + esc(r.authorName || 'Anoniem') + '</div><div class="pp-br-k-datum">' + esc(fmt(r.ts)) + '</div></div>' +
          '<div class="pp-br-k-stars">' + stars(r.rating || 0, 15) + '</div>' +
          '<p class="pp-br-k-tekst">' + esc(r.tekst || '') + '</p>' +
        '</article>';
      }).join('');
    } catch (e) {
      lijst.innerHTML = '<div class="pp-br-empty">Kon reviews niet laden.</div>';
      try { console.warn('[pp-brand-reviews] load fout', e && (e.code || e.message)); } catch (_) {}
    }
  }

  function openSubmit(brandId) {
    if (document.getElementById('pp-br-modal')) return;
    var m = document.createElement('div');
    m.id = 'pp-br-modal'; m.className = 'pp-br-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('data-testid', 'pp-br-submit-modal');
    m.innerHTML = '<div class="pp-br-modal-inner">' +
      '<button type="button" class="pp-br-close" data-role="close" aria-label="Sluiten" data-testid="pp-br-close">&times;</button>' +
      '<h2>Plaats merk-review</h2>' +
      '<p class="pp-br-modal-sub">Deel je ervaring met dit merk (pasvorm, kwaliteit, service).</p>' +
      '<label class="pp-br-lbl">Beoordeling</label>' +
      '<div class="pp-br-star-picker" id="pp-br-star-picker" data-testid="pp-br-star-picker">' +
        [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-star="' + i + '" data-testid="pp-br-star-' + i + '" aria-label="' + i + ' sterren">' + stars(i, 20) + '</button>'; }).join('') +
      '</div>' +
      '<label class="pp-br-lbl" for="pp-br-tekst">Je ervaring</label>' +
      '<textarea id="pp-br-tekst" rows="4" placeholder="Wat vond je van pasvorm, materiaal en service? (min 10 tekens)" data-testid="pp-br-tekst"></textarea>' +
      '<div class="pp-br-error" id="pp-br-err" data-testid="pp-br-err"></div>' +
      '<div class="pp-br-modal-acts">' +
        '<button type="button" class="pp-br-btn pp-br-btn-ghost" data-role="close" data-testid="pp-br-cancel">Annuleer</button>' +
        '<button type="button" class="pp-br-btn pp-br-btn-primair" data-role="submit" data-testid="pp-br-submit">Plaatsen</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(m);
    var rating = 0;
    m.querySelector('#pp-br-star-picker').addEventListener('click', function (e) {
      var t = e.target.closest('[data-star]'); if (!t) return;
      rating = parseInt(t.getAttribute('data-star'), 10) || 0;
      Array.from(this.querySelectorAll('[data-star]')).forEach(function (b) { b.classList.toggle('active', parseInt(b.getAttribute('data-star'), 10) <= rating); });
    });
    m.addEventListener('click', function (e) {
      var r = e.target && e.target.getAttribute && e.target.getAttribute('data-role');
      if (r === 'close' || e.target === m) { closeSubmit(); }
      else if (r === 'submit') { doSubmit(brandId, rating); }
    });
  }
  function closeSubmit() { var m = document.getElementById('pp-br-modal'); if (m && m.parentNode) m.parentNode.removeChild(m); }

  async function doSubmit(brandId, rating) {
    var err = document.getElementById('pp-br-err'); err.textContent = '';
    if (isAnon()) { requireLogin(); return; }
    var tekst = (document.getElementById('pp-br-tekst').value || '').trim();
    if (!rating) { err.textContent = 'Kies een beoordeling (1-5 sterren).'; return; }
    if (tekst.length < 10) { err.textContent = 'Vul minimaal 10 tekens in.'; return; }
    var d = db(); var u = auth().currentUser;
    if (!d || !u) { err.textContent = 'Niet ingelogd.'; return; }
    var data = {
      userId: u.uid,
      authorName: u.displayName || (u.email ? u.email.split('@')[0] : 'Gebruiker'),
      reviewType: TYPE,
      brandId: brandId,
      rating: rating,
      tekst: tekst,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      var btn = document.querySelector('[data-role="submit"]'); if (btn) { btn.disabled = true; btn.textContent = 'Plaatsen...'; }
      await d.collection(COLL).add(data);
      closeSubmit(); loadReviews(brandId);
    } catch (e) {
      err.textContent = 'Opslaan mislukt.';
      try { console.warn('[pp-brand-reviews] submit fout', e && (e.code || e.message)); } catch (_) {}
    }
  }

  function alreadyInjected() { return !!document.getElementById(SECTION_ID); }

  function tryInject() {
    var hero = document.querySelector('.bp-merk-hero');
    if (!hero) return;
    var page = hero.closest('.bp-page');
    if (!page) return;
    if (alreadyInjected()) return;
    var brandId = currentBrandId();
    if (!brandId) {
      // Poging via observer: sla brandId op vanuit BP.toonMerkDetail call door
      // een lichte monkeypatch (idempotent). Dit is een fallback.
      brandId = window.__pp_bp_currentBrandId || null;
    }
    if (!brandId) return;
    var section = buildSection(brandId);
    page.appendChild(section);
    loadReviews(brandId);
  }

  // Monkey-patch BP.toonMerkDetail om brandId zichtbaar te maken (additief).
  function patchBP() {
    try {
      if (!window.DY || !DY.brandPortal || DY.brandPortal.__ppReviewsPatched) return;
      var orig = DY.brandPortal.toonMerkDetail;
      if (typeof orig !== 'function') return;
      DY.brandPortal.toonMerkDetail = function (brandId) {
        try { window.__pp_bp_currentBrandId = brandId; DY.brandPortal._huidigMerkId = brandId; } catch (_) {}
        return orig.apply(this, arguments);
      };
      DY.brandPortal.__ppReviewsPatched = true;
    } catch (_) {}
  }

  function startObserver() {
    patchBP();
    var main = document.getElementById('dy-main') || document.body;
    if (!main) return;
    var mo = new MutationObserver(function () {
      patchBP();
      tryInject();
    });
    mo.observe(main, { childList: true, subtree: true });
    tryInject();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  window.PP_BrandReviews = { VERSION: '1.0.0', COLLECTION: COLL, TYPE: TYPE, inject: tryInject };
})();
