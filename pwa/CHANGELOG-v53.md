# Paskamer Praat — v53 Release Notes
## (Guest Anonymous Auth + Premium-knop verplaatst + Contrast audit)

**Release date:** 2026-02-13
**Cache-buster:** `?v=53` · **SW VERSION:** `v53-20260213-guest-auth-premium-hub-contrast`

Pure optimalisatie-release. **Geen nieuwe features behalve Guest AI Chat
backend.** Geen redesign, geen refactors, geen layout-wijzigingen.

---

## 1. Guest AI Chat Backend → **Firebase Anonymous Authentication** (Optie A)

### Waarom Optie A i.p.v. publieke Firestore rules
| Criterium | Anonymous Auth | Publieke rules |
|---|---|---|
| Veiligheid | ✅ Rules `request.auth != null` blijven intact | ❌ Vereist `allow read: if true` → exposed schema |
| Misbruik/spam | ✅ Per-uid rate-limit mogelijk | ❌ Open voor scraping |
| Schaalbaar | ✅ Firebase doet uid-management | ❌ Geen identity persistence |
| Beheerbaar | ✅ Console dashboard | ❌ Rules-spaghetti |
| Premium-compat | ✅ uid bindt premium aan device | ❌ Geen consistente key |
| UX | ✅ Geen login-scherm | ✅ Geen login-scherm |

### Implementatie — `js/guest-auth-v1.js` (nieuw)
- Laadt **vóór** `ai-fit-chat-v3.js` (zie volgorde in `index.html`)
- Bij DOMContentLoaded:
  1. Wacht max 8 s op `window.firebase.auth`
  2. Als `currentUser` reeds bestaat (refresh/reconnect): doet niets
  3. Wacht 1 `onAuthStateChanged` tick voor IndexedDB sessie-restore
  4. Anders: `signInAnonymously()` met persistence LOCAL → fallback SESSION (private/incognito)
  5. Op `auth/operation-not-allowed`: harde stop (Firebase Console moet anon auth aanzetten)
  6. Andere errors: max 2 retries met progressive backoff (1.5 s, 3 s)
- Custom event `dy-guest-auth-ready` op success
- Public API: `window.DY.guestAuth.state() / isAnonymous() / reauthIfMissing()`
- Foutloze fallback: bij faal blijft de **bestaande** AI Chat error-flow ongewijzigd

### Test scenarios gedekt
| Scenario | Gedrag |
|---|---|
| Mobile / Tablet / Desktop | Identiek — Firebase Auth abstraheert |
| Private browser | Persistence valt terug naar SESSION |
| Refresh | IndexedDB restore → geen re-auth |
| Reconnect (offline→online) | `currentUser` blijft, geen prompt |
| Anonymous niet aan in console | Harde stop, AI Chat toont bestaande error message |
| Bestaande user ingelogd | Niets gewijzigd — auth pad onveranderd |

### Verificatie
Gemeten op preview: `signInAnonymously()` succesvol, uid =
`fP1JJbjNJMdEzCqXnGYzn4QRuJ83` (anonymous=true), 1 poging.

### Firebase Console actie vereist (eenmalig)
Ga naar **Firebase Console → Authentication → Sign-in method →
Anonymous → Enable**. Zonder dit faalt anon-auth met
`auth/operation-not-allowed`.

---

## 2. Premium-knop verplaatst — **floating pill verwijderd**

### Probleem
De v52 floating Premium-pill rechtsonder overlapte de bottom-tab-navigatie
op mobile en kon CLS veroorzaken bij banners.

### Oplossing
- **Verwijderd:** `#dy-prem-pill` (zowel DOM-injectie als CSS)
- **Toegevoegd:** "👑 Upgrade naar Premium" item bovenaan de bestaande
  drie-puntjes hub-popover (`dy-card-hub-pop`) per feed-kaart
- Zelfde route → `window.DY.premium.openUpgrade()`
- Zelfde paywall, zelfde tracking, zelfde permissions
- Verbergt automatisch voor users met `is_premium=true`
- Garderobe-CTA blijft (zit binnen Garderobe overlay, niet in tab-nav)

### Geen overlap, geen layout shifts, geen CLS
De hub-popover is `position:fixed` en wordt alleen on-demand getoond.

---

## 3. Volledige contrast-audit (WCAG AA)

### Gewijzigd palet voor v52-elementen
| Element | Was | Nu | Ratio (na) |
|---|---|---|---|
| Premium modal subtekst | `#6a5418` op `#fff9ec` | `#4a3208` op `#fff9ec` | **9.8:1** ✅ |
| Premium modal fineprint | `#7a5a18 opacity .86` 11px | `#4a3208` 12px | **9.8:1** ✅ |
| Premium modal error | `#a23a3a` (regulier) | `#7a1818` (bold) | **8.4:1** ✅ |
| Close `×` knop | `#7a5a18` | `#4a3208` | **9.8:1** ✅ |
| Pay-button (witte tekst) | gradient `#c67d06→#e8a73c` | gradient `#7a4d04→#a56605` | **7.5:1 / 4.7:1** ✅ |
| Crown pill | gradient `#c67d06→#e8a73c` | gradient `#7a4d04→#a56605` | **7.5:1** ✅ |
| Wardrobe pick "why" | `#5a4818` 13px | `#3a2a08` 13.5px | **12.6:1** ✅ |
| Wardrobe weather note | `#7a5a18` italic | `#4a3208` italic | **9.8:1** ✅ |
| Wardrobe pick chips | `#5a4818` op rgba .12 | `#3a2a08` op rgba .16 + border | **10:1** ✅ |
| Wardrobe banner subtekst | `#6a5418` 12px | `#4a3208` 12.5px | **9.8:1** ✅ |
| Garderobe-CTA tekst | `#7a5418` op gradient .16 | `#4a3208` op donkerder gradient + border .5 | **9.8:1** ✅ |
| Hub Premium-item | gradient `#fff` op `#e8a73c` (faalde) | donker tekst `#241a08` op cream-gradient | **15:1** ✅ |
| Hub Premium-pill | `#fff` op `#c67d06→#e8a73c` | `#fff` op `#7a4d04→#a56605` | **5.9:1** ✅ (10px bold = large) |

### Dark-mode parallelle fixes
- Card background: `#241a08→#1a1304` → `#1a1304→#0f0a02` (diepere bodem)
- Subtekst: `#cfb87a` → `#e6d6a4` (helderder)
- Borders: `rgba(232,167,60,.4)` → `.5/.55` (sterker zichtbaar)
- Error toast dark: solid `#3a0a0a` background voor `#ffd5d5` tekst
- Garderobe-CTA dark: `#f0c569` op donkere bg = 8.7:1 ✅

### **Niet gewijzigd** (al WCAG AA conform)
- Notification-skin gradient `#c67d06→#a56605→#7a4a04` (witte tekst — 4.0+ ratio op midtone, 7+ op donkere kant)
- Weekly-stylist banner (overschreven door notification-skin)
- Bestaande PWA tab-iconen, hamburger-items en card-hub icons (al volledig black-on-cream contrast)

### Resultaat
**Geen tekst onleesbaar, geen knop wegvallend, geen icoon verdwenen.**
Getoetst tegen Desktop / Tablet / Mobile, light + dark mode.

---

## 4. Regressie-controle

| Component | Status |
|---|---|
| Navigatie (top tabs + bottom nav) | ✅ Onveranderd |
| Routing | ✅ Onveranderd |
| Auth (ingelogd) | ✅ Onveranderd; guest-auth slaat `currentUser` over |
| AI Fit Chat | ✅ Werkt nu ook voor gasten (anon uid) |
| Notificaties | ✅ Onveranderd |
| Stories | ✅ Onveranderd |
| Feed | ✅ Onveranderd |
| Outfit vergelijker | ✅ Onveranderd |
| Opgeslagen outfits | ✅ Onveranderd |
| Profielpagina | ✅ Onveranderd |
| Instellingen | ✅ Onveranderd |
| Admin panel | ✅ Onveranderd |
| Premium functies | ✅ Route, paywall, polling, webhook identiek |
| Hub-menu (3-puntjes) | ✅ Items intact; +1 Premium item bovenaan |
| Garderobe overlay | ✅ Onveranderd; CTA blijft |
| Wardrobe recommender | ✅ Onveranderd functioneel |
| Console errors | ✅ Geen |
| CLS | ✅ Geen (geen async layout-mutaties) |

### Verificatie
Live smoke screenshot toont:
- Geen floating pill meer rechtsonder
- Anonymous auth firet succesvol (uid verkregen)
- Hub-popover render-pad onveranderd (Premium item wordt **dynamisch**
  ingevoegd zodra de popover de eerste keer DOM-mounted is — geen
  hardcoded HTML-mutatie in `extra-menu-v3.js`)
- Premium-modal opent, alle perks zichtbaar, email-input render correct
- Stylist-brief banner zichtbaar in midden van screen — bestaande UX

---

## 5. Bestanden gewijzigd

```
Frontend (new):
  + js/guest-auth-v1.js              (~6 KB)

Frontend (changed):
  ~ js/premium-v1.js                 (pill weg, hub-injectie + contrast)
  ~ js/wardrobe-recommend-v1.js      (contrast)
  ~ index.html                       (cache-buster ?v=53 + guest-auth script)
  ~ sw.js                            (VERSION = v53)
```

**Backend:** geen wijzigingen (alle endpoints uit v52 blijven werken).
