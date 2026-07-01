# v60.1.11 Auth Race Condition Fix (CRITICAL)

## 🔴 Root Cause
Niet-hoofdaccounts konden wél inloggen via Firebase, maar werden binnen 500-1200ms teruggestuurd naar de loginpagina.

**De échte oorzaak:** een race condition tussen `dy-presence.js` en `guest-auth-v1.js`.

```
[t=0ms]    Initial page load, geen Firebase sessie nog
[t=50ms]   dy-presence.js onAuthStateChanged listener vuurt met user=null
           → schedule: setTimeout(_anonSignIn, 500)
[t=100ms]  User opent /login en klikt "Inloggen"
[t=400ms]  signInWithEmailAndPassword resolved → real user ingelogd
           → onAuthStateChanged vuurt met REAL user
           → dy-presence stops heartbeat, start nieuwe
           ⚠ MAAR: het setTimeout van t=50ms STAAT NOG STEEDS GEPLAND!
[t=550ms]  _anonSignIn() vuurt → firebase.auth().signInAnonymously()
           → Firebase signs out the real user
           → onAuthStateChanged vuurt met anonymous user
           → firebase-1778591866.js ziet isAnonymous=true → DY.user = null
           → onAuthReady(null) → renders gast-pagina → terug naar login
```

**Waarom werkt het hoofdaccount wel?**
Het hoofdaccount heeft een **persistente Firebase sessie** in IndexedDB die al hersteld is voordat dy-presence's null-state fire kan triggeren. Bij elke initial pageload van het hoofdaccount is `fbAuth.currentUser` direct beschikbaar geen null window, geen race.

**Waarom faalden brand-portal accounts?**
Vers gemaakte accounts via `createUserWithEmailAndPassword` hebben nog géén persistente sessie tijdens hun éérste login. Ze gaan altijd door de race-conditie heen.

## ✅ Fix (3 lagen)

### Laag 1 `dy-presence.js`
```js
var _anonSignInTimer = null;  // ← nieuwe handle

// In onAuthStateChanged listener:
if (_anonSignInTimer) {
  clearTimeout(_anonSignInTimer);
  _anonSignInTimer = null;
}
// ...
// Bij user=null:
_anonSignInTimer = setTimeout(_anonSignIn, 500);  // ← bewaar handle
```

Zodra een echte user verschijnt, wordt de pending `_anonSignIn` direct geannuleerd.

### Laag 2 `dy-presence.js` `_anonSignIn()` defensieve guard
```js
function _anonSignIn() {
  // CRITICAL: check vlak vóór signInAnonymously of er ondertussen
  // een echte user is. Als ja → abort, NIET inloggen als anon.
  var cu = fbAuth.currentUser;
  if (cu && !cu.isAnonymous) return;
  // ... rest
}
```

### Laag 3 `guest-auth-v1.js` parallel guard
Zelfde defensieve check in `signInAnon()` en `init()` zodat als de 1200ms wait halverwege wordt onderbroken door een real-user login, we niet alsnog anon inloggen.

## Acceptatiecriteria

✅ Iedere gebruiker kan individueel inloggen
✅ Sessie blijft actief na login (geen 500-1200ms knockout meer)
✅ Hoofdaccount blijft werken (geen regressie)
✅ Niet-hoofdaccounts blijven werken bij refresh / nieuw tab
✅ Geen redirect terug naar login
✅ `DY.user` blijft de echte user, `DY.profile` blijft geladen
✅ Geen JS errors (`node --check` OK)

## Niet gewijzigd
- Geen wijziging in `firebase-1778591866.js` (onAuthStateChanged listener)
- Geen wijziging in `pwa-v463-1780765770.js` (onAuthReady)
- Geen wijziging in brand-portal of admin logic
- Geen wijziging in route guards
- Geen wijziging in Firestore rules
- Geen wijziging in UI / layout

## Rollback plan
Als deze fix problemen veroorzaakt:
1. Vervang `dy-presence.js` en `guest-auth-v1.js` met versies uit v60.1.10 ZIP
2. Bump `sw.js` VERSION zodat browser oude cache invalideert
3. Beide files zijn additieve patches origineel gedrag blijft beschikbaar door alleen 3 regels te verwijderen

## Tests
- **Test 1**: Login met hoofdaccount → blijf ingelogd ✓
- **Test 2**: Registreer brand → login met dat account → blijf ingelogd ✓
- **Test 3**: Refresh pagina ingelogd → blijf ingelogd ✓
- **Test 4**: Open nieuwe tab ingelogd → blijf ingelogd ✓
- **Test 5**: Logout → ga naar login → login opnieuw → blijf ingelogd ✓
- **Test 6**: Incognito mode → registreer → login → blijf ingelogd ✓
