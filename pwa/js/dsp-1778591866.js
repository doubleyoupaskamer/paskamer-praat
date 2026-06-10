// DSP Punten Systeem — volledig reglement
window.DY = window.DY || {};

// Lifetime niveaus
DY.NIVEAUS = [
  { naam: 'Binnenkomer', emoji: '🚪', min: 0,    max: 149,  voordelen: 'Community, verhalen, reageren' },
  { naam: 'Insider',     emoji: '🎫', min: 150,  max: 499,  voordelen: 'Sneak peeks, lotingen' },
  { naam: 'Front Row',  emoji: '⭐', min: 500,  max: 1199, voordelen: '24u early access' },
  { naam: 'Ambassador', emoji: '💎', min: 1200, max: 2499, voordelen: '48u early access, feedback panel' },
  { naam: 'Icon',       emoji: '👑', min: 2500, max: Infinity, voordelen: 'Inner circle, productinvloed' }
];

// Seizoenstiers
DY.SEIZOENTIERS = [
  { naam: 'Starter',    emoji: '🌱', min: 0,    max: 99,   voordelen: 'Toegang tot de community, verhalen lezen en reageren' },
  { naam: 'Actief',     emoji: '🔥', min: 100,  max: 299,  voordelen: 'Deelnemen aan lotingen, stemmen op nieuwe stijlen' },
  { naam: 'Betrokken',  emoji: '⭐', min: 300,  max: 699,  voordelen: 'Sneak peeks van nieuwe collecties, kans op featured verhaal' },
  { naam: 'Toegewijd',  emoji: '💫', min: 700,  max: 1499, voordelen: '24u early access op drops, behind the scenes content' },
  { naam: 'Elite',      emoji: '👑', min: 1500, max: Infinity, voordelen: '48u early access, exclusief producttest panel, inner circle' }
];

// Acties en punten
DY.ACTIES = {
  // Community
  verhaal_plaatsen:     { pts: 15, label: 'Verhaal geplaatst', cat: 'community', limit: '1/dag' },
  verhaal_bonus_120:    { pts: 5,  label: 'Verhaal 120+ woorden bonus', cat: 'community', limit: null },
  foto_verhaal:         { pts: 10, label: "Foto toegevoegd aan verhaal", cat: 'community', limit: null },
  reactie_plaatsen:     { pts: 3,  label: 'Reactie geplaatst', cat: 'community', limit: '3/dag' },
  reactie_ontvangen:    { pts: 2,  label: 'Reactie ontvangen', cat: 'community', limit: null },
  likes_5:              { pts: 10, label: '5 likes ontvangen', cat: 'community', limit: null },
  likes_20:             { pts: 25, label: '20 likes ontvangen', cat: 'community', limit: null },
  // Aankopen
  eerste_aankoop:       { pts: 100, label: 'Eerste aankoop', cat: 'aankoop', limit: 'eenmalig' },
  aankoop_volgend:      { pts: 75,  label: 'Bestelling geplaatst', cat: 'aankoop', limit: null },
  aankoop_100:          { pts: 25,  label: 'Bestelling boven €100', cat: 'aankoop', limit: null },
  aankoop_150:          { pts: 50,  label: 'Bestelling boven €150', cat: 'aankoop', limit: null },
  review_plaatsen:      { pts: 20,  label: 'Review geplaatst', cat: 'aankoop', limit: null },
  review_foto:          { pts: 40,  label: 'Review met foto', cat: 'aankoop', limit: null },
  wishlist_toevoegen:   { pts: 5,   label: 'Wishlist item toegevoegd', cat: 'aankoop', limit: '5/maand' },
  wishlist_gekocht:     { pts: 20,  label: 'Wishlist item gekocht', cat: 'aankoop', limit: null },
  restock_aanmelding:   { pts: 10,  label: 'Restock aanmelding', cat: 'aankoop', limit: null },
  // Meedenken
  stem_kleur:           { pts: 10, label: 'Gestemd op nieuwe kleur', cat: 'meedenken', limit: '5/dag' },
  stem_pasvorm:         { pts: 10, label: 'Gestemd op nieuwe pasvorm', cat: 'meedenken', limit: '5/dag' },
  enquete:              { pts: 15, label: 'Enquête ingevuld', cat: 'meedenken', limit: null },
  waitlist:             { pts: 10, label: 'Waitlist aangemeld', cat: 'meedenken', limit: 'eenmalig' },
  sample_feedback:      { pts: 40, label: 'Sample feedback gegeven', cat: 'meedenken', limit: null },
  producttest:          { pts: 60, label: 'Producttest panel deelgenomen', cat: 'meedenken', limit: null },
  // Delen
  verhaal_delen:        { pts: 5, label: 'Verhaal gedeeld', cat: 'community', limit: '3/dag' },
  // Stories
  story_plaatsen:       { pts: 10, label: 'Story geplaatst', cat: 'community', limit: '3/dag' },
  story_met_media:      { pts: 5,  label: 'Story met foto/video', cat: 'community', limit: '3/dag' },
  // Lookbook
  look_plaatsen:        { pts: 20, label: 'Look geplaatst', cat: 'community', limit: '2/dag' },
  look_liked:           { pts: 5,  label: '5 likes op look ontvangen', cat: 'community', limit: null },
  like_ontvangen_story: { pts: 2,  label: 'Like ontvangen op verhaal', cat: 'community', limit: null },
  deel_verhaal:         { pts: 5,  label: 'Verhaal gedeeld', cat: 'community', limit: '3/dag' },
  // Loyaliteit
  streak_3:             { pts: 10,  label: '3 dagen op rij actief', cat: 'loyaliteit', limit: null },
  streak_7:             { pts: 25,  label: '7 dagen op rij actief', cat: 'loyaliteit', limit: null },
  streak_30:            { pts: 100, label: '30 dagen op rij actief', cat: 'loyaliteit', limit: null },
};

// Niveau bepalen op basis van lifetime punten

// ── BADGES ─────────────────────────────────────────────────────────
DY.BADGES = [
  // Community
  { id: 'eerste_verhaal',    emoji: '✍️',  naam: 'Eerste verhaal',      omschrijving: 'Je eerste verhaal geplaatst',          check: (p, log) => log.some(l => l.actie === 'verhaal_plaatsen') },
  { id: 'vijf_verhalen',     emoji: '📖',  naam: 'Verteller',           omschrijving: '5 verhalen geplaatst',                 check: (p, log) => log.filter(l => l.actie === 'verhaal_plaatsen').length >= 5 },
  { id: 'eerste_look',       emoji: '👗',  naam: 'Eerste fitcheck',     omschrijving: 'Je eerste fitcheck geplaatst',          check: (p, log) => log.some(l => l.actie === 'look_plaatsen') },
  { id: 'tien_looks',        emoji: '✨',  naam: 'Style icon',          omschrijving: '10 fitchecks geplaatst',               check: (p, log) => log.filter(l => l.actie === 'look_plaatsen').length >= 10 },
  { id: 'eerste_reactie',    emoji: '💬',  naam: 'Gesprekspartner',     omschrijving: 'Je eerste reactie geplaatst',           check: (p, log) => log.some(l => l.actie === 'reactie_plaatsen') },
  { id: 'eerste_deel',       emoji: '🔗',  naam: 'Verspreider',         omschrijving: 'Een verhaal gedeeld',                  check: (p, log) => log.some(l => l.actie === 'verhaal_delen') },
  // Punten mijlpalen
  { id: 'dsp_100',           emoji: '⭐',  naam: 'Honderd punten',      omschrijving: '100 DSP punten bereikt',               check: (p) => (p.dsp_lifetime || 0) >= 100 },
  { id: 'dsp_500',           emoji: '🌟',  naam: 'Vijfhonderd punten',  omschrijving: '500 DSP punten bereikt',               check: (p) => (p.dsp_lifetime || 0) >= 500 },
  { id: 'dsp_1500',          emoji: '💫',  naam: 'Duizend vijfhonderd', omschrijving: '1500 DSP punten bereikt — Elite lid',   check: (p) => (p.dsp_lifetime || 0) >= 1500 },
  // Loyaliteit
  { id: 'streak_7',          emoji: '🔥',  naam: 'Wekelijkse vaste',    omschrijving: '7 dagen op rij actief',                check: (p) => (p.streak || 0) >= 7 },
  { id: 'streak_30',         emoji: '💪',  naam: 'Maandvast',           omschrijving: '30 dagen op rij actief',               check: (p) => (p.streak || 0) >= 30 },
  // Aankopen
  { id: 'eerste_aankoop',    emoji: '🛍️', naam: 'Eerste aankoop',      omschrijving: 'Eerste bestelling bij DoubleYou',       check: (p, log) => log.some(l => l.actie === 'eerste_aankoop') },
  // Special
  { id: 'ambassador',        emoji: '👑',  naam: 'Ambassador',          omschrijving: 'Ambassador niveau bereikt',            check: (p) => (p.dsp_lifetime || 0) >= 3000 },
];

DY.checkBadges = async function(uid, profiel, log) {
  const huidig = profiel.badges || [];
  const nieuw = [];
  for (const badge of DY.BADGES) {
    if (!huidig.includes(badge.id) && badge.check(profiel, log)) {
      nieuw.push(badge.id);
    }
  }
  if (nieuw.length > 0) {
    const alle = [...huidig, ...nieuw];
    await DY.db.collection('users').doc(uid).update({ badges: alle });
    profiel.badges = alle;
    // Toon badge melding
    for (const id of nieuw) {
      const b = DY.BADGES.find(x => x.id === id);
      if (b) DY.toonBadgeMelding(b);
    }
  }
};

DY.toonBadgeMelding = function(badge) {
  // Badge wordt getoond via de centrale DSP popup queue
  DY._dspQueue = DY._dspQueue || [];
  DY._dspQueue.push({ type: 'badge', badge });
  if (!DY._dspPopupActief) DY._verwerkDspQueue();
};

DY.getNiveau = function(pts) {
  for (let i = DY.NIVEAUS.length - 1; i >= 0; i--) {
    if (pts >= DY.NIVEAUS[i].min) return DY.NIVEAUS[i];
  }
  return DY.NIVEAUS[0];
};

// Seizoentier bepalen
DY.getSeizoenTier = function(pts) {
  for (let i = DY.SEIZOENTIERS.length - 1; i >= 0; i--) {
    if (pts >= DY.SEIZOENTIERS[i].min) return DY.SEIZOENTIERS[i];
  }
  return DY.SEIZOENTIERS[0];
};

// Voortgang naar volgend niveau (percentage)
DY.getNiveauProgress = function(pts) {
  const niveau = DY.getNiveau(pts);
  const idx = DY.NIVEAUS.findIndex(n => n.naam === niveau.naam);
  if (idx === DY.NIVEAUS.length - 1) return 100;
  const volgend = DY.NIVEAUS[idx + 1];
  const range = volgend.min - niveau.min;
  const progress = pts - niveau.min;
  return Math.min(100, Math.round((progress / range) * 100));
};

// Punten toekennen
DY.geefPunten = async function(actieKey, extraData = {}) {
  if (!DY.user || !DY.profile) return;
  const actie = DY.ACTIES[actieKey];
  if (!actie) return;

  const uid = DY.user.uid;
  const ref = DY.db.collection('users').doc(uid);

  // Controleer limieten
  if (actie.limit === 'eenmalig') {
    const check = await DY.db.collection('dsp_log')
      .where('uid', '==', uid)
      .where('actie', '==', actieKey)
      .limit(1).get();
    if (!check.empty) return;
  }

  if (actie.limit && actie.limit.includes('/maand')) {
    const max = parseInt(actie.limit);
    const nu = new Date();
    const eersteVanMaand = new Date(nu.getFullYear(), nu.getMonth(), 1);
    const check = await DY.db.collection('dsp_log')
      .where('uid', '==', uid)
      .where('actie', '==', actieKey)
      .limit(max + 5)
      .get();
    const maandLogs = check.docs.filter(d => {
      const ts = d.data().ts;
      const date = ts?.toDate ? ts.toDate() : new Date(ts || 0);
      return date >= eersteVanMaand;
    });
    if (maandLogs.length >= max) return;
  }

  if (actie.limit && actie.limit.includes('/dag')) {
    const max = parseInt(actie.limit);
    const vandaag = new Date();
    vandaag.setHours(0,0,0,0);
    // Haal logs op zonder timestamp filter om samengestelde index te vermijden
    const check = await DY.db.collection('dsp_log')
      .where('uid', '==', uid)
      .where('actie', '==', actieKey)
      .limit(max + 5)
      .get();
    // Filter client-side op vandaag
    const vandaagLogs = check.docs.filter(d => {
      const ts = d.data().ts;
      const date = ts?.toDate ? ts.toDate() : new Date(ts || 0);
      return date >= vandaag;
    });
    if (vandaagLogs.length >= max) return;
  }

  const nieuw_lifetime = (DY.profile.dsp_lifetime || 0) + actie.pts;
  const nieuw_seizoen  = (DY.profile.dsp_seizoen || 0) + actie.pts;
  const nieuw_niveau   = DY.getNiveau(nieuw_lifetime).naam;
  const nieuw_tier     = DY.getSeizoenTier(nieuw_seizoen).naam;

  // Update Firestore
  await ref.update({
    dsp_lifetime: nieuw_lifetime,
    dsp_seizoen:  nieuw_seizoen,
    dspPoints:    nieuw_lifetime,
    punten:       nieuw_lifetime,
    niveau:       nieuw_niveau,
    seizoentier:  nieuw_tier,
    laatste_actief: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Log de actie
  await DY.db.collection('dsp_log').add({
    uid,
    actie: actieKey,
    pts: actie.pts,
    label: actie.label,
    ts: firebase.firestore.FieldValue.serverTimestamp(),
    ...extraData
  });

  // Update local state
  DY.profile.dsp_lifetime = nieuw_lifetime;
  DY.profile.dsp_seizoen  = nieuw_seizoen;
  DY.profile.niveau        = nieuw_niveau;
  DY.profile.seizoentier   = nieuw_tier;

  // Niveau omhoog? Toon melding
  DY.toonPuntenMelding(actie.pts, actie.label);

  return actie.pts;
};


// ── PUNTEN TERUGTREKKEN ────────────────────────────────────────────
DY.ontneemPunten = async function(actieKey, extraData = {}) {
  if (!DY.user || !DY.profile) return;
  const actie = DY.ACTIES[actieKey];
  if (!actie) return;

  const uid = DY.user.uid;
  const ref = DY.db.collection('users').doc(uid);

  // Check of deze actie ooit is gelogd — zo niet, niets aftrekken
  const logCheck = await DY.db.collection('dsp_log')
    .where('uid', '==', uid)
    .where('actie', '==', actieKey)
    .limit(10)
    .get();
  if (logCheck.empty) return;

  // Verwijder het meest recente log (client-side sorteren)
  const gesorteerd = logCheck.docs.sort((a, b) => {
    const ta = a.data().ts?.toDate ? a.data().ts.toDate() : new Date(0);
    const tb = b.data().ts?.toDate ? b.data().ts.toDate() : new Date(0);
    return tb - ta;
  });
  await gesorteerd[0].ref.delete();

  const nieuw_lifetime = Math.max(0, (DY.profile.dsp_lifetime || 0) - actie.pts);
  const nieuw_seizoen  = Math.max(0, (DY.profile.dsp_seizoen || 0) - actie.pts);
  const nieuw_niveau   = DY.getNiveau(nieuw_lifetime).naam;
  const nieuw_tier     = DY.getSeizoenTier(nieuw_seizoen).naam;

  await ref.update({
    dsp_lifetime: nieuw_lifetime,
    dsp_seizoen:  nieuw_seizoen,
    dspPoints:    nieuw_lifetime,
    punten:       nieuw_lifetime,
    niveau:       nieuw_niveau,
    seizoentier:  nieuw_tier,
  });

  DY.profile.dsp_lifetime = nieuw_lifetime;
  DY.profile.dsp_seizoen  = nieuw_seizoen;
  DY.profile.niveau        = nieuw_niveau;
  DY.profile.seizoentier   = nieuw_tier;

  DY.toonOntneemMelding(actie.pts, actie.label);
};

// Negatieve punten popup
DY.toonOntneemMelding = function(pts, label) {
  DY._dspQueue = DY._dspQueue || [];
  DY._dspQueue.push({ type: 'ontneem', pts, label });
  if (!DY._dspPopupActief) DY._verwerkDspQueue();
};

// Puntenmelding — centraal via popup queue
DY.toonPuntenMelding = function(pts, label) {
  DY._dspQueue = DY._dspQueue || [];
  DY._dspQueue.push({ type: 'punten', pts, label });
  if (!DY._dspPopupActief) DY._verwerkDspQueue();
};

// DSP log ophalen voor profiel pagina
DY.getDSPLog = async function(uid, limit = 20) {
  // Geen orderBy om samengestelde index te vermijden — sorteer client-side
  const snap = await DY.db.collection('dsp_log')
    .where('uid', '==', uid)
    .limit(50)
    .get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => {
    const da = a.ts?.toDate ? a.ts.toDate() : new Date(0);
    const db = b.ts?.toDate ? b.ts.toDate() : new Date(0);
    return db - da;
  });
  return items.slice(0, limit);
};

// Seizoen label
DY.seizoenLabel = function(s) {
  return { lente: '🌸 Lente', zomer: '☀️ Zomer', herfst: '🍂 Herfst', winter: '❄️ Winter' }[s] || s;
};

// ── ALIASSEN EN HELPERS ────────────────────────────────────────────
// registreerActie = alias voor geefPunten (voor consistentie)
DY.registreerActie = async function(actieKey, extraData) {
  return await DY.geefPunten(actieKey, extraData || {});
};

// DY.toast — algemene notificatie (zonder DSP punten) — blijft als lichte toast
DY.toast = function(tekst) {
  document.querySelectorAll('.dy-toast-info').forEach(t => t.remove());

  const el = document.createElement('div');
  el.className = 'dy-toast dy-toast-info';
  el.innerHTML = '<span class="dy-toast-label">' + tekst + '</span>';
  document.body.appendChild(el);

  el.getBoundingClientRect();
  el.classList.add('visible');

  setTimeout(function() {
    el.classList.remove('visible');
    setTimeout(function() { if (el.parentNode) el.remove(); }, 400);
  }, 2800);
};

// ── DSP POPUP ENGINE ────────────────────────────────────────────────
DY._dspQueue = [];
DY._dspPopupActief = false;

DY._verwerkDspQueue = function() {
  if (DY._dspQueue.length === 0) { DY._dspPopupActief = false; return; }
  DY._dspPopupActief = true;
  const item = DY._dspQueue.shift();
  DY._toonDspPopup(item);
};

DY._sluitDspPopup = function() {
  const overlay = document.getElementById('dy-dsp-overlay');
  if (!overlay) return;
  overlay.classList.remove('dy-dsp-overlay--in');
  overlay.classList.add('dy-dsp-overlay--out');
  setTimeout(function() {
    if (overlay.parentNode) overlay.remove();
    // Volgende in queue
    setTimeout(function() { DY._verwerkDspQueue(); }, 120);
  }, 380);
};

DY._toonDspPopup = function(item) {
  // Verwijder eventueel nog aanwezige popup
  const bestaand = document.getElementById('dy-dsp-overlay');
  if (bestaand) bestaand.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dy-dsp-overlay';
  overlay.className = 'dy-dsp-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  let inner = '';

  if (item.type === 'punten') {
    const profilePts = (DY.profile && DY.profile.dsp_lifetime) ? DY.profile.dsp_lifetime : 0;
    const niveau = DY.getNiveau(profilePts);
    const progress = DY.getNiveauProgress(profilePts);
    const volgende = profilePts < 2500 ? DY.NIVEAUS[DY.NIVEAUS.findIndex(n => n.naam === niveau.naam) + 1] : null;

    inner = `
      <div class="dy-dsppop dy-dsppop--pos">
        <button class="dy-dsppop-close" aria-label="Sluiten" onclick="DY._sluitDspPopup()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="dy-dsppop-glow"></div>
        <div class="dy-dsppop-icon-wrap">
          <div class="dy-dsppop-icon">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(198,125,6,0.12)"/><path d="M12 6l1.5 4.5H18l-3.75 2.7 1.42 4.3L12 15.1l-3.67 2.4 1.42-4.3L6 10.5h4.5z" fill="#c67d06"/></svg>
          </div>
          <div class="dy-dsppop-pts-badge">+${item.pts}</div>
        </div>
        <div class="dy-dsppop-body">
          <p class="dy-dsppop-kop">Punten verdiend</p>
          <p class="dy-dsppop-label">${item.label}</p>
          <div class="dy-dsppop-totaal">
            <span class="dy-dsppop-totaal-num">${profilePts.toLocaleString('nl-NL')}</span>
            <span class="dy-dsppop-totaal-label">DSP totaal</span>
          </div>
          <div class="dy-dsppop-niveau-bar-wrap">
            <div class="dy-dsppop-niveau-info">
              <span>${niveau.emoji} ${niveau.naam}</span>
              ${volgende ? `<span>${volgende.emoji} ${volgende.naam}</span>` : '<span>👑 Maximaal niveau</span>'}
            </div>
            <div class="dy-dsppop-bar-bg">
              <div class="dy-dsppop-bar-fill" style="width: 0%" data-target="${progress}"></div>
            </div>
            ${volgende ? `<p class="dy-dsppop-next">Nog <strong>${volgende.min - profilePts} punten</strong> tot ${volgende.naam}</p>` : '<p class="dy-dsppop-next">Je bent op het hoogste niveau 🏆</p>'}
          </div>
        </div>
        <button class="dy-dsppop-btn" onclick="DY._sluitDspPopup()">Doorgaan</button>
      </div>`;
  } else if (item.type === 'ontneem') {
    inner = `
      <div class="dy-dsppop dy-dsppop--neg">
        <button class="dy-dsppop-close" aria-label="Sluiten" onclick="DY._sluitDspPopup()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="dy-dsppop-icon-wrap">
          <div class="dy-dsppop-icon dy-dsppop-icon--neg">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="rgba(192,57,43,0.12)"/><path d="M15 9l-6 6M9 9l6 6" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/></svg>
          </div>
          <div class="dy-dsppop-pts-badge dy-dsppop-pts-badge--neg">−${item.pts}</div>
        </div>
        <div class="dy-dsppop-body">
          <p class="dy-dsppop-kop dy-dsppop-kop--neg">Punten afgetrokken</p>
          <p class="dy-dsppop-label">${item.label} ongedaan gemaakt</p>
        </div>
        <button class="dy-dsppop-btn dy-dsppop-btn--neg" onclick="DY._sluitDspPopup()">Begrepen</button>
      </div>`;
  } else if (item.type === 'badge') {
    inner = `
      <div class="dy-dsppop dy-dsppop--badge">
        <button class="dy-dsppop-close" aria-label="Sluiten" onclick="DY._sluitDspPopup()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="dy-dsppop-glow dy-dsppop-glow--badge"></div>
        <div class="dy-dsppop-badge-emoji">${item.badge.emoji}</div>
        <div class="dy-dsppop-body">
          <p class="dy-dsppop-sub">Badge verdiend</p>
          <p class="dy-dsppop-kop">${item.badge.naam}</p>
          <p class="dy-dsppop-label">${item.badge.omschrijving}</p>
        </div>
        <button class="dy-dsppop-btn" onclick="DY._sluitDspPopup()">Nice 🎉</button>
      </div>`;
  }

  overlay.innerHTML = inner;
  document.body.appendChild(overlay);

  // Trap focus
  const focusTrap = overlay.querySelector('.dy-dsppop-close');
  if (focusTrap) setTimeout(() => focusTrap.focus(), 80);

  // Animeer in
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      overlay.classList.add('dy-dsp-overlay--in');
      // Animeer progress bar na intrede
      const fill = overlay.querySelector('.dy-dsppop-bar-fill');
      if (fill) {
        setTimeout(function() {
          fill.style.width = fill.dataset.target + '%';
        }, 450);
      }
    });
  });

  // Sluit op overlay klik (niet op het popup zelf)
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) DY._sluitDspPopup();
  });
};


