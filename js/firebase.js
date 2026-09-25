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

// Auth state listener — wacht tot app.js volledig geladen is
auth.onAuthStateChanged(async (user) => {
  window.DY.user = user;
  if (user) {
    try { await DY.loadProfile(user.uid); } catch(e) {}
  }
  function fireReady() {
    if (typeof DY.onAuthReady === 'function') {
      DY.onAuthReady(user);
    }
  }
  // Kleine delay zodat app.js altijd klaar is
  setTimeout(fireReady, 50);
});

// Profiel laden of aanmaken
DY.loadProfile = async function(uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const newProfile = {
      uid,
      email: DY.user.email,
      displayName: DY.user.displayName || DY.user.email.split('@')[0],
      avatar: DY.user.photoURL || null,
      dsp_lifetime: 10, // Waitlist bonus
      dsp_seizoen: 10,
      niveau: 'Binnenkomer',
      seizoentier: 'Starter',
      seizoen: DY.huidigSeizoen(),
      streak: 0,
      laatste_actief: firebase.firestore.FieldValue.serverTimestamp(),
      aangemeld: firebase.firestore.FieldValue.serverTimestamp(),
      badges: []
    };
    await ref.set(newProfile);
    window.DY.profile = newProfile;
  } else {
    window.DY.profile = snap.data();
    // Seizoensreset checken
    await DY.checkSeizoenReset(ref);
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
