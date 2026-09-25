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
  { naam: 'Starter',    min: 0,    max: 99,   voordelen: 'Community toegang' },
  { naam: 'Actief',     min: 100,  max: 299,  voordelen: 'Lotingen, stemmen' },
  { naam: 'Betrokken',  min: 300,  max: 699,  voordelen: 'Sneak peeks, featured kans' },
  { naam: 'Toegewijd',  min: 700,  max: 1499, voordelen: 'Early access, behind the scenes' },
  { naam: 'Elite',      min: 1500, max: Infinity, voordelen: 'Eerste toegang, producttest' }
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
  // Loyaliteit
  streak_3:             { pts: 10,  label: '3 dagen op rij actief', cat: 'loyaliteit', limit: null },
  streak_7:             { pts: 25,  label: '7 dagen op rij actief', cat: 'loyaliteit', limit: null },
  streak_30:            { pts: 100, label: '30 dagen op rij actief', cat: 'loyaliteit', limit: null },
};

// Niveau bepalen op basis van lifetime punten
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

// Puntenmelding tonen
DY.toonPuntenMelding = function(pts, label) {
  const el = document.createElement('div');
  el.className = 'dy-toast dy-toast-dsp';
  el.innerHTML = `<span class="dy-toast-pts">+${pts} DSP</span><span class="dy-toast-label">${label}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('visible'), 10);
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 3000);
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
