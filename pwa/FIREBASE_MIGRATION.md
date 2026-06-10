# Firebase migratie: compat 9.23 → modular v11

## Waarom
- **compat v9.23 SDK**: ~280 KB gzip, geen tree-shaking, end-of-life voor nieuwe features.
- **modular v11**: ~80–120 KB na tree-shaking (alleen wat je écht gebruikt). Sneller op slechtere verbindingen, betere Core Web Vitals.

**Verwachte besparing op Paskamer Praat:** 150–200 KB JavaScript op de first paint.

## Stap 1 — Verwijder de 4 CDN script-tags

In `index.html` regels 720–723, verwijder:

```html
<script defer src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>
```

Vervang door één enkele import in je gebundelde firebase init (zie stap 3).

## Stap 2 — Installeer modular SDK

Als je een bundler hebt (Vite/Webpack/Rollup):
```bash
npm install firebase@11
```

Geen bundler? Gebruik de ESM via esm.sh of skypack op de top van je init bestand:
```js
import { initializeApp } from 'https://esm.sh/firebase@11/app';
```
Dit lukt alleen als je je init-bestand als `<script type="module">` laadt.

## Stap 3 — Migreer init en API calls

### Voor (compat — wat je nu hebt)
```js
const app = firebase.initializeApp(config);
const auth = firebase.auth();
const db   = firebase.firestore();
const stor = firebase.storage();

// usage
firebase.firestore().collection('verhalen').doc(id).get()
  .then(snap => { ... });

firebase.auth().onAuthStateChanged(u => { ... });

firebase.firestore().collection('verhalen')
  .where('lengte','==','190-200').orderBy('ts','desc').limit(20).get();
```

### Na (modular v11)
```js
// js/firebase-init.js  (laad als <script type="module">)
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs,
         query, where, orderBy, limit, addDoc, updateDoc,
         deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const app  = initializeApp(window._fbConfig); // bewaar config buiten bundle
const auth = getAuth(app);
const db   = getFirestore(app);
const stor = getStorage(app);

// usage
const snap = await getDoc(doc(db, 'verhalen', id));

onAuthStateChanged(auth, u => { ... });

const q = query(
  collection(db, 'verhalen'),
  where('lengte','==','190-200'),
  orderBy('ts','desc'),
  limit(20)
);
const snap = await getDocs(q);

// expose voor legacy callers
window.DY = window.DY || {};
window.DY.fb = { app, auth, db, stor };
```

## Stap 4 — Vervang `firebase.X` calls in `js/pwa-v463-*.js`

Zoek-en-vervang patronen (heel veel zoek-vervang werk in 25k regels JS):

| Compat | Modular |
|---|---|
| `firebase.auth()` | `DY.fb.auth` |
| `firebase.firestore()` | `DY.fb.db` |
| `firebase.storage()` | `DY.fb.stor` |
| `.collection('x')` | `collection(db,'x')` |
| `.doc('x')` | `doc(db,'col','x')` |
| `.get()` | `getDoc(ref)` of `getDocs(query)` |
| `.set(data)` | `setDoc(ref,data)` |
| `.update(data)` | `updateDoc(ref,data)` |
| `.add(data)` | `addDoc(coll,data)` |
| `.delete()` | `deleteDoc(ref)` |
| `firebase.firestore.FieldValue.serverTimestamp()` | `serverTimestamp()` |
| `.onSnapshot(cb)` | `onSnapshot(ref,cb)` |
| `firebase.auth.GoogleAuthProvider` | `GoogleAuthProvider` (import) |

## Stap 5 — Update CSP

In `_headers` mag je dan `https://www.gstatic.com` weghalen uit `script-src` (mits je ook geen andere scripts van gstatic laadt). Behoud `https://*.googleapis.com` en `https://firestore.googleapis.com` in `connect-src` — modular SDK gebruikt dezelfde endpoints.

## Stap 6 — Test grondig

1. Login / register / logout
2. Feed laden + filteren
3. Verhaal posten (Firestore write + Storage upload)
4. Realtime updates (`onSnapshot`)
5. Notifications (FCM gebruikt nog dezelfde service worker)
6. PWA install + offline

## Pragmatisch alternatief

Als de migratie te groot is om in één keer te doen: je kunt **compat blijven gebruiken** maar upgraden naar **v10.14 of v11 compat**. Dat geeft je ~30–50 KB winst en bugfixes zonder code-changes. Vervang in `index.html`:

```html
<script defer src="https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore-compat.js"></script>
<script defer src="https://www.gstatic.com/firebasejs/11.0.2/firebase-storage-compat.js"></script>
```

(Versie 11 ondersteunt compat nog altijd — geen breaking changes vanaf v9.)
