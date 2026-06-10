// Firebase configuratie DoubleYou
const firebaseConfig = {
  apiKey: "AIzaSyD28TOHwxX8gMWKbdaLZDtTVZh3V9BHcA8",
  authDomain: "doubleyou-journal.firebaseapp.com",
  projectId: "doubleyou-journal",
  storageBucket: "doubleyou-journal.firebasestorage.app",
  messagingSenderId: "271740812679",
  appId: "1:271740812679:web:ae49188253c573892f6722",
  measurementId: "G-BT8XBEHGES"
};

// Initialiseer Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Huidige gebruiker state
window.DY = window.DY || {};
window.DY.db = db;
window.DY.auth = auth;
window.DY.user = null;
window.DY.profile = null;

// Auth state listener — directe en betrouwbare auth sync
auth.onAuthStateChanged(async (user) => {
  // Update user direct — geen vertraging
  window.DY.user = user;

  if (user && !user.isAnonymous) {
    // Zet minimaal profiel direct zodat app direct kan starten
    if (!window.DY.profile || window.DY.profile.uid !== user.uid) {
      window.DY.profile = {
        uid: user.uid,
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'gebruiker'),
        email: user.email,
        avatar: user.photoURL || null,
        _minimaal: true  // markeer als minimaal — wordt overschreven door loadProfile
      };
    }
    // Laad volledig profiel op achtergrond — blokkeert de app NIET
    DY.loadProfile(user.uid).catch(function() {});
  } else if (user && user.isAnonymous) {
    // Anonieme Firebase Auth sessie — alleen voor presence tracking
    window.DY.user    = null;  // App ziet anonieme users als uitgelogd
    window.DY.profile = null;
    // WEL onAuthReady aanroepen zodat gast UI direct laadt (was 8s vertraging)
  } else {
    // Uitgelogd
    window.DY.user    = null;
    window.DY.profile = null;
  }

  // Anonieme users worden als gast behandeld — stuur null door aan de app
  // Dit voorkomt een dubbele onAuthReady aanroep na logout (presence triggert anonSignIn)
  var _authArg = (user && user.isAnonymous) ? null : user;

  // Sla auth result op — app-final.js pikt het op zodra het geladen is
  window.DY._pendingAuthUser  = _authArg;
  window.DY._pendingAuthReady = true;

  // Als onAuthReady al beschikbaar is, roep direct aan
  if (typeof DY.onAuthReady === 'function') {
    DY.onAuthReady(_authArg);
  }
  // Anders: app-final.js roept onAuthReady zelf aan via DY._verwerkPendingAuth()
});

// Profiel laden of aanmaken
DY.loadProfile = async function(uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const newProfile = {
      uid,
      email: DY.user.email,
      displayName: DY.user.displayName || (DY.user.email ? DY.user.email.split('@')[0] : 'gebruiker'),
      avatar: DY.user.photoURL || null,
      dsp_lifetime: 10,
      dsp_seizoen: 10,
      niveau: 'Binnenkomer',
      seizoentier: 'Starter',
      seizoen: DY.huidigSeizoen(),
      streak: 0,
      laatste_actief: firebase.firestore.FieldValue.serverTimestamp(),
      aangemeld: firebase.firestore.FieldValue.serverTimestamp(),
      badges: [],
      volgend: {},   // uid → true (accounts die ik volg)
      volgers: {}    // uid → true (accounts die mij volgen)
    };
    // Voeg akkoord-velden toe als ze aanwezig zijn (gezet tijdens registratie)
    if (window._dyRegAkkoord) {
      newProfile.acceptedTerms    = window._dyRegAkkoord.acceptedTerms;
      newProfile.acceptedTermsAt  = window._dyRegAkkoord.acceptedTermsAt;
      newProfile.ageConfirmed     = window._dyRegAkkoord.ageConfirmed;
      newProfile.ageConfirmedAt   = window._dyRegAkkoord.ageConfirmedAt;
      window._dyRegAkkoord = null;
    }
    await ref.set(newProfile);
    window.DY.profile = newProfile;

    // Automatisch inschrijven op mailing list bij nieuwe registratie
    try {
      await db.collection('mailing_list').doc(uid).set({
        uid:          uid,
        email:        DY.user.email,
        aangemaaktOp: firebase.firestore.FieldValue.serverTimestamp(),
        optOut:       false
      }, { merge: true });
    } catch(e) { /* Niet-kritiek: mailing list inschrijving mislukt de registratie niet */ }
  } else {
    const data = snap.data();

    // Synchroniseer veldnamen — website gebruikt dspPoints of punten, app gebruikt dsp_lifetime
    if (!data.dsp_lifetime && (data.dspPoints || data.punten)) {
      const legacy = data.dspPoints || data.punten || 0;
      data.dsp_lifetime = legacy;
      data.dsp_seizoen = data.dsp_seizoen || legacy;
      // Update in Firestore zodat beide velden bestaan
      await ref.update({
        dsp_lifetime: legacy,
        dsp_seizoen: data.dsp_seizoen || legacy
      });
    }

    // Zorg dat volgend en volgers altijd bestaan
    if (!data.volgend || !data.volgers) {
      const patch = {};
      if (!data.volgend) { patch.volgend = {}; data.volgend = {}; }
      if (!data.volgers) { patch.volgers = {}; data.volgers = {}; }
      await ref.update(patch).catch(function(){});
    }
    window.DY.profile = data;
    // Seizoensreset checken
    await DY.checkSeizoenReset(ref);
    // Streak checken bij elke login
    await DY.checkStreak(ref);
  }
};

// Huidig meteorologisch seizoen
DY.huidigSeizoen = function() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return 'lente';
  if (m >= 6 && m <= 8) return 'zomer';
  if (m >= 9 && m <= 11) return 'herfst';
  return 'winter';
};


// Streak bijhouden — elke dag dat je inlogt telt mee
DY.checkStreak = async function(ref) {
  const nu = new Date();
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  
  const laatste = DY.profile.laatste_actief;
  if (!laatste) return;
  
  const laasteDate = laatste?.toDate ? laatste.toDate() : new Date(laatste);
  const gisteren = new Date(vandaag);
  gisteren.setDate(gisteren.getDate() - 1);
  
  const laatsteDag = new Date(laasteDate.getFullYear(), laasteDate.getMonth(), laasteDate.getDate());
  
  // Al vandaag ingelogd — geen streak update nodig
  if (laatsteDag.getTime() === vandaag.getTime()) return;
  
  let nieuweStreak = DY.profile.streak || 0;
  
  if (laatsteDag.getTime() === gisteren.getTime()) {
    // Gisteren actief — streak omhoog
    nieuweStreak += 1;
  } else {
    // Streak verbroken
    nieuweStreak = 1;
  }
  
  await ref.update({
    streak: nieuweStreak,
    laatste_actief: firebase.firestore.FieldValue.serverTimestamp()
  });
  DY.profile.streak = nieuweStreak;
  
  // Streakpunten toekennen
  if (nieuweStreak === 3) await DY.geefPunten('streak_3');
  if (nieuweStreak === 7) await DY.geefPunten('streak_7');
  if (nieuweStreak === 30) await DY.geefPunten('streak_30');
};

// Seizoensreset: als het seizoen veranderd is, reset seizoenspunten
DY.checkSeizoenReset = async function(ref) {
  const huidig = DY.huidigSeizoen();
  if (DY.profile.seizoen !== huidig) {
    await ref.update({
      dsp_seizoen: 0,
      seizoen: huidig,
      seizoentier: 'Starter'
    });
    DY.profile.dsp_seizoen = 0;
    DY.profile.seizoen = huidig;
    DY.profile.seizoentier = 'Starter';
  }
};

// Login met email/wachtwoord
DY.login = async function(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
};

// Registreren
DY.register = async function(email, password, naam) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await cred.user.updateProfile({ displayName: naam });
  return cred;
};

// Uitloggen
DY.logout = function() {
  return auth.signOut();
};

// Wachtwoord reset
DY.resetPassword = function(email) {
  return auth.sendPasswordResetEmail(email);
};
