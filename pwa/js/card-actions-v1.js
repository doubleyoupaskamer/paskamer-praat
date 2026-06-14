// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat — Card Actions v1 (v50)
//
// Handlers voor de 8 nieuwe items in het card-hub menu van extra-menu-v3.js:
//   - tryon     → Virtual Try-On modal openen met outfit-foto pre-filled
//   - score     → Force fresh outfit-score voor deze kaart (manual trigger)
//   - share     → Web Share API met affiliate-tag, fallback clipboard
//   - bewaar    → LocalStorage bookmark + Firestore sync indien auth
//   - similar   → Zalando-zoek opening met outfit-context
//   - verberg   → LocalStorage hide-list + kaart verwijderen uit DOM
//   - report    → Modal met redenen → Firestore /reports
//   - block     → LocalStorage block-list + Firestore /users/{uid}/blocked
//
// Non-invasief: leest alleen DOM van bestaande feed-kaarten, gebruikt
// publieke API van andere v47/v48 modules (DY.tryOn, DY.aiHealth),
// en Firestore via window.firebase als beschikbaar.
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  if (window.__ppCardActionsInit) return;
  window.__ppCardActionsInit = true;

  var LS_SAVED   = 'dy_saved_posts';
  var LS_HIDDEN  = 'dy_hidden_posts';
  var LS_BLOCKED = 'dy_blocked_users';
  var TOAST_ID   = 'dy-card-toast';

  // ─── DOM extraction helpers ────────────────────────────────────────
  function getInfo(card) {
    if (!card) return null;
    var img = card.querySelector('img');
    var auteur = card.querySelector('.dy-reel-auteur');
    var tekst  = card.querySelector('.dy-reel-tekst, .dy-reel-content p');
    var link   = card.querySelector('a[href*="/p/"], a[href*="post"]');
    var pid = card.getAttribute('data-post-id') ||
              card.getAttribute('data-id') ||
              (img && img.src ? img.src.split('?')[0] : null) ||
              ('card-' + Math.random().toString(36).slice(2, 10));
    var authorName = auteur ? (auteur.querySelector('a, .naam, span') || auteur).textContent.trim() : 'gebruiker';
    var authorUid  = (auteur && auteur.getAttribute('data-uid')) || null;
    var shareUrl   = link ? new URL(link.getAttribute('href'), location.origin).href : location.href;
    return {
      pid: pid.slice(0, 200),
      imgUrl: img ? img.src : '',
      author: authorName.slice(0, 80),
      authorUid: authorUid,
      caption: tekst ? tekst.textContent.trim().slice(0, 200) : '',
      shareUrl: shareUrl
    };
  }

  // ─── Tiny toast (brand-aligned) ────────────────────────────────────
  function toast(msg, kind) {
    var prev = document.getElementById(TOAST_ID);
    if (prev) prev.remove();
    var el = document.createElement('div');
    el.id = TOAST_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:calc(env(safe-area-inset-top,0) + 18px)',
      'transform:translateX(-50%) translateY(-10px)',
      'background:linear-gradient(135deg,var(--ink,#1e1a0f) 0%, #2a2515 100%)',
      'color:var(--cream,#fdf8f0)',
      'padding:11px 18px',
      'border-radius:14px',
      'border:1px solid rgba(198,125,6,0.32)',
      'box-shadow:0 12px 32px rgba(30,26,15,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
      'font:500 14px/1.3 "DM Sans",system-ui,sans-serif',
      'z-index:2147483647',
      'opacity:0',
      'transition:opacity .2s ease, transform .2s ease',
      'max-width:88vw', 'text-align:center'
    ].join(';');
    if (kind === 'err') {
      el.style.background = 'linear-gradient(135deg,#7a1d10,#5a1408)';
      el.style.borderColor = 'rgba(255,193,178,0.22)';
    } else if (kind === 'ok') {
      el.style.background = 'linear-gradient(135deg,#0e4a26,#08341a)';
      el.style.borderColor = 'rgba(178,234,200,0.22)';
    }
    document.body.appendChild(el);
    requestAnimationFrame(function() {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(function() {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(function() { try { el.remove(); } catch (e) {} }, 250);
    }, 2400);
  }

  // ─── Firebase helpers (best-effort, gracefull fallback) ────────────
  function getFirestore() {
    try {
      if (window.firebase && window.firebase.firestore) return window.firebase.firestore();
    } catch (e) {}
    return null;
  }
  function getUid() {
    try {
      if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
        return window.firebase.auth().currentUser.uid;
      }
    } catch (e) {}
    return null;
  }

  function logEvent(name, data) {
    try {
      var db = getFirestore(); if (!db) return;
      db.collection('kai_events').add({
        type: name,
        data: data || {},
        ts: (window.firebase && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp())
          ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
      }).catch(function() {});
    } catch (e) {}
  }

  // ─── LocalStorage list-helpers ─────────────────────────────────────
  function getList(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }
  function addToList(key, val) {
    var l = getList(key);
    if (l.indexOf(val) < 0) { l.unshift(val); l = l.slice(0, 500); localStorage.setItem(key, JSON.stringify(l)); }
    return l;
  }
  function removeFromList(key, val) {
    var l = getList(key).filter(function(x) { return x !== val; });
    localStorage.setItem(key, JSON.stringify(l));
    return l;
  }

  // ─── Modal builder (brand-aligned, WCAG AA contrast op licht én dark) ──
  function modal(title, bodyHTML, onConfirm, confirmLabel) {
    var existing = document.getElementById('dy-card-modal');
    if (existing) existing.remove();
    var m = document.createElement('div');
    m.id = 'dy-card-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(20,17,8,0.82);backdrop-filter:blur(8px) saturate(120%);-webkit-backdrop-filter:blur(8px) saturate(120%)';
    m.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="dy-card-modal-title" class="dy-notif-surface dy-card-modal-frame" style="' +
        'background:radial-gradient(60% 50% at 0% 0%,rgba(254,237,182,0.45),transparent 60%),' +
                  'radial-gradient(70% 60% at 100% 100%,rgba(232,185,74,0.16),transparent 65%),' +
                  'linear-gradient(160deg,var(--cream,#fdf8f0),var(--warm,#f5edda));' +
        'color:var(--ink,#1e1a0f);border-radius:20px;padding:24px 22px 18px;width:100%;max-width:420px;' +
        'border:1px solid rgba(198,125,6,0.20);' +
        'box-shadow:0 24px 56px rgba(30,26,15,0.42), inset 0 1px 0 rgba(255,255,255,0.55);">' +
        '<h3 id="dy-card-modal-title" class="dy-card-modal-title" style="margin:0 0 12px;font:700 18px/1.25 \'DM Sans\',system-ui;color:var(--ink,#1e1a0f)">' + title + '</h3>' +
        '<div data-body class="dy-card-modal-body" style="color:var(--ink-soft,#3a3018);font:400 14px/1.55 \'DM Sans\',system-ui">' + bodyHTML + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
          '<button type="button" data-act="cancel" class="dy-card-modal-cancel" style="background:transparent;color:var(--ink,#1e1a0f);border:1px solid rgba(198,125,6,0.30);padding:10px 16px;border-radius:10px;font:600 14px \'DM Sans\';cursor:pointer">Annuleer</button>' +
          '<button type="button" data-act="confirm" class="dy-card-modal-confirm" style="background:linear-gradient(135deg,var(--ink,#1e1a0f),#2a2515);color:var(--cream,#fdf8f0);border:1px solid rgba(198,125,6,0.32);padding:10px 18px;border-radius:10px;font:600 14px \'DM Sans\';cursor:pointer;box-shadow:0 6px 16px rgba(30,26,15,0.36)">' + (confirmLabel || 'Bevestig') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    function close() { try { m.remove(); } catch (e) {} }
    m.addEventListener('click', function(e) {
      if (e.target === m) return close();
      var act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') return close();
      if (act.dataset.act === 'confirm') { try { onConfirm && onConfirm(m); } catch (err) {} close(); }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    return m;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Action handlers
  // ═══════════════════════════════════════════════════════════════════

  function actTryon(card) {
    var info = getInfo(card);
    if (!info || !info.imgUrl) { toast('Geen outfit-foto gevonden in deze post', 'err'); return; }
    if (window.DY && window.DY.tryOn && typeof window.DY.tryOn.openWithOutfit === 'function') {
      window.DY.tryOn.openWithOutfit(info.imgUrl);
      logEvent('cardaction_tryon', { pid: info.pid });
    } else {
      toast('Try-On module nog niet geladen', 'err');
    }
  }

  function actScore(card) {
    var info = getInfo(card);
    if (!info) { toast('Kaart niet gevonden', 'err'); return; }
    if (window.DY && window.DY.outfitScore && typeof window.DY.outfitScore.scoreCard === 'function') {
      window.DY.outfitScore.scoreCard(card, { force: true });
      toast('AI analyseert je look... ✨', 'ok');
      logEvent('cardaction_score', { pid: info.pid });
    } else {
      toast('Style Score module nog niet geladen', 'err');
    }
  }

  function actShare(card) {
    var info = getInfo(card);
    if (!info) return;
    var url = info.shareUrl;
    // Affiliate-tagger v46 doet de rest indien Zalando-link
    var shareData = {
      title: 'Paskamer Praat — ' + info.author,
      text: info.caption ? info.caption : 'Bekijk deze look op Paskamer Praat',
      url: url
    };
    if (navigator.share) {
      navigator.share(shareData).then(function() {
        toast('Gedeeld!', 'ok');
        logEvent('cardaction_share', { pid: info.pid, method: 'native' });
      }).catch(function(err) {
        if (err && err.name !== 'AbortError') copyFallback(url, info.pid);
      });
    } else {
      copyFallback(url, info.pid);
    }
  }
  function copyFallback(url, pid) {
    try {
      navigator.clipboard.writeText(url).then(function() {
        toast('Link gekopieerd', 'ok');
        logEvent('cardaction_share', { pid: pid, method: 'clipboard' });
      });
    } catch (e) { toast('Kopieer link: ' + url); }
  }

  function actBewaar(card) {
    var info = getInfo(card);
    if (!info) return;
    var saved = getSaved();
    var idx = saved.findIndex(function(s) { return s.pid === info.pid; });
    if (idx >= 0) {
      saved.splice(idx, 1);
      writeSaved(saved);
      toast('Verwijderd uit garderobe');
      logEvent('cardaction_unsave', { pid: info.pid });
    } else {
      saved.unshift({
        pid: info.pid,
        imgUrl: info.imgUrl,
        author: info.author,
        caption: info.caption,
        shareUrl: info.shareUrl,
        ts: Date.now()
      });
      saved = saved.slice(0, 500);
      writeSaved(saved);
      // Toast met action-link naar garderobe
      toastWithAction(
        'Opgeslagen in jouw garderobe ✨',
        'Bekijk',
        function() { openGarderobe(); }
      );
      logEvent('cardaction_save', { pid: info.pid });
    }
    // Best-effort Firestore sync
    var uid = getUid(); var db = getFirestore();
    if (uid && db) {
      try {
        var ref = db.collection('users').doc(uid).collection('saved').doc(info.pid);
        if (idx >= 0) ref.delete().catch(function() {});
        else ref.set({
          pid: info.pid, imgUrl: info.imgUrl, author: info.author,
          caption: info.caption, shareUrl: info.shareUrl,
          ts: (window.firebase && window.firebase.firestore.FieldValue && window.firebase.firestore.FieldValue.serverTimestamp())
            ? window.firebase.firestore.FieldValue.serverTimestamp() : new Date()
        }).catch(function() {});
      } catch (e) {}
    }
  }

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(LS_SAVED) || '[]'); } catch (e) { return []; }
  }
  function writeSaved(arr) {
    try { localStorage.setItem(LS_SAVED, JSON.stringify(arr)); } catch (e) {}
    // Sync via custom event zodat openstaande garderobe-view live updatet
    window.dispatchEvent(new CustomEvent('dy-garderobe-updated', { detail: { count: arr.length } }));
  }

  function actSimilar(card) {
    var info = getInfo(card);
    if (!info) return;
    // Bouw zoekquery uit caption keywords (geen hashtags/mentions) + fallback "plus size outfit"
    var q = (info.caption || '').replace(/[#@][\w-]+/g, '').replace(/\s+/g, ' ').trim();
    // Eerste 4 woorden voor zoek-precisie (Zalando preferred)
    var words = q.split(' ').filter(function(w) { return w.length >= 3; }).slice(0, 4);
    q = words.length ? words.join(' ') : 'dames outfit';
    // Huidige Zalando NL zoek-URL (2026): /?q=
    var url = 'https://www.zalando.nl/?q=' + encodeURIComponent(q);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Affiliate-tagger v46 onderschept de outbound click en voegt &tag= toe
    logEvent('cardaction_similar', { pid: info.pid, q: q });
  }

  function actVerberg(card) {
    var info = getInfo(card);
    if (!info) return;
    addToList(LS_HIDDEN, info.pid);
    if (card && card.parentNode) {
      card.style.transition = 'opacity .3s ease, transform .3s ease, max-height .35s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.96)';
      setTimeout(function() {
        card.style.maxHeight = '0';
        card.style.margin = '0';
        card.style.padding = '0';
        card.style.overflow = 'hidden';
      }, 280);
      setTimeout(function() { try { card.remove(); } catch (e) {} }, 700);
    }
    toast('Niet meer tonen');
    logEvent('cardaction_hide', { pid: info.pid });
  }

  function actReport(card) {
    var info = getInfo(card);
    if (!info) return;
    var html =
      '<p style="margin:0 0 12px;color:inherit">Waarom rapporteer je deze post?</p>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
      ['Ongepaste inhoud', 'Spam / reclame', 'Pesterijen', 'Onjuiste informatie', 'Anders']
        .map(function(r, i) {
          return '<label class="dy-card-modal-radio" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.50);border:1px solid rgba(198,125,6,0.20);border-radius:10px;cursor:pointer;color:var(--ink,#1e1a0f)">' +
            '<input type="radio" name="report-reden" value="' + r + '"' + (i === 0 ? ' checked' : '') + ' style="accent-color:var(--clay,#c67d06)">' +
            '<span>' + r + '</span></label>';
        }).join('') +
      '</div>';
    modal('Rapporteer deze post', html, function(m) {
      var radio = m.querySelector('input[name="report-reden"]:checked');
      var reden = radio ? radio.value : 'Anders';
      // Dual-write: Firestore (indien auth) + Backend (altijd)
      var db = getFirestore(); var uid = getUid();
      if (db) {
        try {
          db.collection('reports').add({
            pid: info.pid, author: info.author, reden: reden,
            reporter: uid || 'anoniem', ts: new Date(), shareUrl: info.shareUrl
          }).catch(function() {});
        } catch (e) {}
      }
      // Server-side queue: gegarandeerde opslag in MongoDB moderation_reports
      var apiBase = (window.DY && window.DY.aiHealth && window.DY.aiHealth.apiBase)
        ? window.DY.aiHealth.apiBase()
        : 'https://paskamer-stability.preview.emergentagent.com';
      fetch(apiBase + '/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id:      info.pid,
          reason:       reden,
          author:       info.author,
          reporter_uid: uid || null,
          share_url:    info.shareUrl,
          note:         null
        })
      }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(j) {
          if (j && j.ok) {
            logEvent('cardaction_report_queued', { report_id: j.report_id, pid: info.pid, reden: reden });
          }
        })
        .catch(function() { /* offline-safe — Firestore + LS hide blijven werken */ });
      // Verberg lokaal direct
      addToList(LS_HIDDEN, info.pid);
      if (card && card.parentNode) {
        card.style.transition = 'opacity .25s ease';
        card.style.opacity = '0';
        setTimeout(function() { try { card.remove(); } catch (e) {} }, 320);
      }
      toast('Rapport ontvangen — bedankt 🙏', 'ok');
      logEvent('cardaction_report', { pid: info.pid, reden: reden });
    }, 'Rapporteer');
  }

  function actBlock(card) {
    var info = getInfo(card);
    if (!info) return;
    modal(
      'Gebruiker blokkeren?',
      '<p style="color:inherit;line-height:1.55">Je ziet vanaf nu geen posts, stories of zoekresultaten meer van <strong style="color:var(--clay-d,#a56605)">' + escapeHtml(info.author) + '</strong>. Dit kun je terugdraaien in instellingen.</p>',
      function() {
        var key = info.authorUid || info.author;
        addToList(LS_BLOCKED, key);
        // Verberg alle huidige posts/stories/zoekresultaten van deze gebruiker
        applyBlockFilter(info.author, info.authorUid);
        // Firestore sync
        var db = getFirestore(); var myUid = getUid();
        if (db && myUid) {
          try { db.collection('users').doc(myUid).collection('blocked').doc(key).set({
            key: key, author: info.author, authorUid: info.authorUid || null, ts: new Date()
          }).catch(function() {}); } catch (e) {}
        }
        // Broadcast event zodat andere modules (messaging, search) kunnen reageren
        window.dispatchEvent(new CustomEvent('dy-user-blocked', { detail: { author: info.author, uid: info.authorUid } }));
        toast(info.author + ' geblokkeerd', 'ok');
        logEvent('cardaction_block', { author: info.author, uid: info.authorUid });
      },
      'Blokkeer'
    );
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Breed selector-set: feed-cards, stories, profile-tegels, zoekresultaten, messaging-rijen
  var BLOCK_SELECTORS = [
    '.dy-reel-item',
    '.dy-story-item',
    '.dy-story',
    '.dy-zoek-resultaat',
    '.dy-search-result',
    '.dy-profile-card',
    '.dy-bericht-rij',
    '.dy-message-row',
    '[data-author]',
    '[data-author-uid]'
  ];

  function applyBlockFilter(author, uid) {
    var sel = BLOCK_SELECTORS.join(',');
    document.querySelectorAll(sel).forEach(function(el) {
      var elAuthor = el.getAttribute('data-author') ||
        (el.querySelector('.dy-reel-auteur, .dy-story-auteur, .naam, .author-name') || {}).textContent || '';
      var elUid = el.getAttribute('data-author-uid') || el.getAttribute('data-uid') || '';
      if ((author && elAuthor.trim() === author) || (uid && elUid === uid)) {
        // Vind de hoogste herkenbare container
        var container = el.closest('.dy-reel-item, .dy-story-item, .dy-zoek-resultaat, .dy-bericht-rij') || el;
        container.style.display = 'none';
        container.setAttribute('data-pp-blocked', '1');
      }
    });
  }

  // ─── Toast met actie-link (voor "Bekijk garderobe") ─────────────────
  function toastWithAction(msg, actionLabel, onClick) {
    var prev = document.getElementById(TOAST_ID); if (prev) prev.remove();
    var el = document.createElement('div');
    el.id = TOAST_ID;
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:calc(env(safe-area-inset-top,0) + 18px)',
      'transform:translateX(-50%) translateY(-10px)',
      'background:linear-gradient(135deg,#0e4a26,#08341a)',
      'color:#fff',
      'padding:11px 8px 11px 18px',
      'border-radius:14px',
      'border:1px solid rgba(178,234,200,0.22)',
      'box-shadow:0 12px 32px rgba(14,74,38,0.42), inset 0 1px 0 rgba(255,255,255,0.08)',
      'font:500 14px/1.3 "DM Sans",system-ui,sans-serif',
      'z-index:2147483647', 'opacity:0',
      'transition:opacity .2s ease, transform .2s ease',
      'display:flex', 'align-items:center', 'gap:10px', 'max-width:88vw'
    ].join(';');
    el.innerHTML = '<span>' + msg + '</span>' +
      '<button type="button" data-act style="background:rgba(255,255,255,0.18);color:#fff;border:1px solid rgba(255,255,255,0.22);padding:6px 12px;border-radius:8px;font:600 13px \'DM Sans\';cursor:pointer">' + actionLabel + '</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
    var done = false;
    el.querySelector('[data-act]').addEventListener('click', function() { done = true; el.remove(); try { onClick(); } catch (e) {} });
    setTimeout(function() {
      if (done) return;
      el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(function() { try { el.remove(); } catch (e) {} }, 250);
    }, 4500);
  }

  // ─── "Mijn Garderobe" overlay (lijst van opgeslagen looks) ─────────
  var GARDEROBE_ID = 'dy-garderobe-overlay';
  function openGarderobe() {
    var existing = document.getElementById(GARDEROBE_ID);
    if (existing) existing.remove();
    var saved = getSaved();
    var ov = document.createElement('div');
    ov.id = GARDEROBE_ID;
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483645;display:flex;align-items:stretch;justify-content:center;padding:0;background:rgba(20,17,8,0.82);backdrop-filter:blur(8px) saturate(120%);-webkit-backdrop-filter:blur(8px) saturate(120%);';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="dy-garderobe-title" class="dy-notif-surface" style="' +
        'background:radial-gradient(60% 50% at 0% 0%,rgba(254,237,182,0.45),transparent 60%),' +
                  'radial-gradient(70% 60% at 100% 100%,rgba(232,185,74,0.16),transparent 65%),' +
                  'linear-gradient(160deg,var(--cream,#fdf8f0),var(--warm,#f5edda));' +
        'color:var(--ink,#1e1a0f);' +
        'width:100%;max-width:520px;margin:auto;border-radius:24px 24px 0 0;' +
        'border:1px solid rgba(198,125,6,0.18);' +
        'box-shadow:0 24px 56px rgba(30,26,15,0.42), inset 0 1px 0 rgba(255,255,255,0.55);' +
        'overflow:hidden;display:flex;flex-direction:column;max-height:90vh">' +
        '<header style="padding:18px 20px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(198,125,6,0.18)">' +
          '<div>' +
            '<small style="display:block;text-transform:uppercase;letter-spacing:.1em;font:600 11px \'DM Sans\';color:var(--clay-d,#a56605)">Jouw verzameling</small>' +
            '<h2 id="dy-garderobe-title" style="margin:4px 0 0;font:700 22px/1.15 \'DM Sans\',system-ui;color:var(--ink,#1e1a0f)">Mijn Garderobe</h2>' +
            '<small data-count style="color:var(--ink-muted,#7a6a3a);font:500 12px \'DM Sans\'">' + saved.length + ' opgeslagen looks</small>' +
          '</div>' +
          '<button type="button" data-close aria-label="Sluiten" style="background:rgba(198,125,6,0.10);color:var(--ink,#1e1a0f);border:1px solid rgba(198,125,6,0.20);width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px;line-height:1">×</button>' +
        '</header>' +
        '<div data-body style="padding:14px 14px calc(env(safe-area-inset-bottom,0) + 20px);overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1"></div>' +
      '</div>';
    document.body.appendChild(ov);
    renderGarderobe(ov, saved);

    function close() { ov.style.opacity = '0'; setTimeout(function() { try { ov.remove(); } catch (e) {} }, 220); }
    ov.style.transition = 'opacity .2s ease';
    ov.addEventListener('click', function(e) {
      if (e.target === ov) return close();
      var c = e.target.closest('[data-close]'); if (c) return close();
      var rm = e.target.closest('[data-remove]');
      if (rm) {
        var pid = rm.getAttribute('data-remove');
        var arr = getSaved().filter(function(s) { return s.pid !== pid; });
        writeSaved(arr);
        // Re-render
        renderGarderobe(ov, arr);
        return;
      }
      var openBtn = e.target.closest('[data-open]');
      if (openBtn) {
        var url = openBtn.getAttribute('data-open');
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    logEvent('garderobe_opened', { count: saved.length });
  }

  function renderGarderobe(ov, saved) {
    var body = ov.querySelector('[data-body]');
    var count = ov.querySelector('[data-count]');
    if (count) count.textContent = saved.length + ' opgeslagen looks';
    if (!saved.length) {
      body.innerHTML =
        '<div style="text-align:center;padding:48px 24px;color:var(--ink-soft,#3a3018)">' +
        '<div style="font-size:48px;line-height:1;margin-bottom:16px">🪞</div>' +
        '<strong style="display:block;font:600 16px \'DM Sans\';color:var(--ink,#1e1a0f);margin-bottom:8px">Nog geen looks opgeslagen</strong>' +
        '<p style="margin:0;font:400 14px/1.5 \'DM Sans\'">Tik op de drie puntjes bij een outfit-card en kies <strong>Bewaar</strong> om hem hier terug te vinden.</p>' +
        '</div>';
      return;
    }
    var grid = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';
    saved.forEach(function(s) {
      var img = s.imgUrl ? '<img src="' + escapeHtml(s.imgUrl) + '" loading="lazy" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:rgba(198,125,6,0.08)">'
                         : '<div style="aspect-ratio:3/4;background:rgba(198,125,6,0.12);display:flex;align-items:center;justify-content:center;color:var(--clay-d,#a56605);font-size:28px">👗</div>';
      grid += '<div style="position:relative;border-radius:14px;overflow:hidden;border:1px solid rgba(198,125,6,0.18);background:rgba(255,255,255,0.42);box-shadow:0 4px 12px rgba(30,26,15,0.12)">' +
        img +
        '<div style="padding:8px 10px 10px;background:linear-gradient(180deg,transparent,rgba(253,248,240,0.96))">' +
          '<strong style="display:block;font:600 12px/1.3 \'DM Sans\';color:var(--ink,#1e1a0f);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(s.author || 'Look') + '</strong>' +
          '<div style="display:flex;gap:4px;margin-top:6px">' +
            (s.shareUrl ? '<button type="button" data-open="' + escapeHtml(s.shareUrl) + '" aria-label="Bekijk look" style="flex:1;background:linear-gradient(135deg,var(--ink,#1e1a0f),#2a2515);color:var(--cream,#fdf8f0);border:0;padding:6px 8px;border-radius:7px;font:600 11px \'DM Sans\';cursor:pointer">Bekijk</button>' : '') +
            '<button type="button" data-remove="' + escapeHtml(s.pid) + '" aria-label="Verwijder" style="background:rgba(192,57,43,0.12);color:#7a1d10;border:1px solid rgba(192,57,43,0.22);width:30px;height:28px;border-radius:7px;cursor:pointer;font-size:14px">🗑</button>' +
          '</div>' +
        '</div>' +
        '</div>';
    });
    grid += '</div>';
    body.innerHTML = grid;
  }

  // ─── Init: filter feed bij elke nieuwe kaart (hidden/blocked) ──────
  function applyHiddenFilters() {
    var hidden  = getList(LS_HIDDEN);
    var blocked = getList(LS_BLOCKED);
    if (!hidden.length && !blocked.length) return;
    // Brede selector-set zodat feed + stories + zoek + profielen + messaging gefilterd worden
    document.querySelectorAll(BLOCK_SELECTORS.join(',') + ', .dy-reel-item:not([data-card-filtered])').forEach(function(card) {
      if (card.hasAttribute('data-card-filtered') || card.hasAttribute('data-pp-blocked')) return;
      var info = getInfo(card);
      if (!info) return;
      var hideHidden  = hidden.indexOf(info.pid) >= 0;
      var hideBlocked = blocked.indexOf(info.author) >= 0 ||
                        (info.authorUid && blocked.indexOf(info.authorUid) >= 0);
      if (hideHidden || hideBlocked) {
        card.style.display = 'none';
        card.setAttribute('data-card-filtered', '1');
        if (hideBlocked) card.setAttribute('data-pp-blocked', '1');
      }
    });
  }

  function startObserver() {
    var rafId = 0;
    var obs = new MutationObserver(function() {
      if (rafId) return;
      rafId = requestAnimationFrame(function() { rafId = 0; applyHiddenFilters(); });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Expose ────────────────────────────────────────────────────────
  window.DY = window.DY || {};
  window.DY.cardActions = {
    tryon:   actTryon,
    score:   actScore,
    /* v60.1.41: 'outfit_analyse' triggert de bestaande DY._feedOutfitReview
       pipeline (opent overlay, draait AI analyse). Pure verplaatsing van
       trigger-locatie, onderliggende AI/analyse flow ongewijzigd.
       v60.1.43 FIX: selector was '.dy-reel-bg' wat de wrapping DIV matcht
       (geen src) → foto kwam null binnen → "Voeg een foto toe" werd getoond.
       Nu specifieke selectors voor het echte image/video-element. */
    outfit_analyse: function(kaart) {
      if (!kaart) return;
      var docId = kaart.dataset && (kaart.dataset.docId || kaart.dataset.docid || kaart.getAttribute('data-doc-id'));
      if (!docId) return;
      // Specifieke selectors — eerst hoofdfoto, dan video (poster), dan blurred fallback,
      // dan eventuele overlay hero-media. AVATAR img is bewust uitgesloten.
      var mediaEl = kaart.querySelector(
        '.dy-reel-bg-img-main, .dy-reel-bg-video, .dy-reel-bg-blur, .dy-sd-hero-media'
      );
      var foto = null;
      if (mediaEl) {
        foto = mediaEl.currentSrc
            || mediaEl.src
            || mediaEl.getAttribute('src')
            || mediaEl.getAttribute('poster')
            || null;
        // Negeer lege/empty/data-uri-placeholder
        if (foto && (foto === 'about:blank' || foto.indexOf('data:image/svg') === 0)) {
          foto = null;
        }
      }
      if (window.DY && typeof window.DY._feedOutfitReview === 'function') {
        window.DY._feedOutfitReview(docId, foto);
      }
    },
    share:   actShare,
    bewaar:  actBewaar,
    similar: actSimilar,
    verberg: actVerberg,
    report:  actReport,
    block:   actBlock,
    // Public utilities
    openGarderobe: openGarderobe,
    savedCount:    function() { return getSaved().length; },
    // Internal
    _getInfo: getInfo,
    _toast:   toast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { applyHiddenFilters(); startObserver(); });
  } else {
    applyHiddenFilters();
    startObserver();
  }
})();
