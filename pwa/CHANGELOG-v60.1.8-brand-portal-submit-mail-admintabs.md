# Paskamer Praat — Brand Portal v60.1.8

## Wijzigingen in deze release

### 🐛 Bug fix: registratieformulier "submit doet niets"
- Submit-handler herschreven met diagnostiek: console.log + console.error op elke stap
- Fout-meldingen scrollen automatisch in beeld (zodat de gebruiker ziet *waarom* het mislukt)
- Extra foutcodes toegevoegd: `auth/operation-not-allowed`, `permission-denied`
- Dubbel-check op e-mail tolereert nu permission-denied (vóór auth) en gaat door
- Submit-knop heeft nu een **click-fallback** naast het `submit`-event (voor iOS / overlays)

### ✉️ E-mail notificaties bij merkaanvraag
Bij elke succesvolle registratie worden **twee** e-mails verstuurd via de bestaande
Cloudflare mail-worker (`black-grass-c05c.doubleyou-journal.workers.dev/mail`):

1. **Bevestiging naar de aanvrager** (uit het ingevulde e-mailveld)
   - Onderwerp: `Je merkaanvraag bij Paskamer Praat is ontvangen`
   - Bevat aanvraag-ID, categorie, website
2. **Notificatie naar admin** (`info@doubleyousmallandtall.nl`)
   - Onderwerp: `Nieuwe merkaanvraag: <bedrijfsnaam>`
   - Bevat alle ingevulde velden + directe link naar `?pagina=admin_brands`

E-mails zijn *best-effort* — een mislukte mail blokkeert de registratie niet
(de Firestore-write is leidend).

### 🛠️ Admin-tabs zichtbaar in bestaand admin-dashboard
Het bestaande admin-paneel had vijf tabs (Overzicht, Gebruikers, PWA, Monetization,
Activiteit). Brand Portal voegt nu **drie extra tabs** toe via MutationObserver
DOM-injectie:

- **🏷️ Merken** → navigeert naar `?pagina=admin_brands` (goedkeuren/afwijzen/blokkeren)
- **📢 Campagnes** → navigeert naar `?pagina=admin_campagnes` (pauzeren/hervatten/budget)
- **€ Inkomsten** → navigeert naar `?pagina=admin_inkomsten` (revenue dashboard)

Geen wijzigingen aan `pwa-v463-*.js` — de tabs worden ge-injecteerd vanuit
`brand-portal-v1.js` zodra `DY.pagina === 'admin'`.

## Gewijzigde bestanden
- `js/brand-portal-v1.js` (submit + mail + admin-tabs)
- `index.html` (versie-bumps `?v=`)
- `sw.js` (`VERSION` bump → cache invalidation)

## Deployment
1. Download: `https://paskamer-stability.preview.emergentagent.com/paskamerpraat-pwa-v60.1.8-brand-portal.zip`
2. Upload de inhoud naar Cloudflare Pages
3. Geen Firestore rules update nodig (rules v11 blijft geldig)
4. **Test**: ga naar `/?pagina=brand_register`, vul het formulier in, klik versturen.
   Je zou twee e-mails moeten ontvangen + de aanvraag verschijnt in
   `/?pagina=admin_brands`.

## Test admin-flow
1. Log in als admin (email-gebaseerd via bestaande `DY._isAdmin()`)
2. Navigeer naar **Admin** via je bestaande hamburgermenu → je ziet nu naast
   Overzicht/Gebruikers/PWA/Monetization/Activiteit ook **Merken / Campagnes /
   Inkomsten** tabs
3. Klik op **Merken** → lijst van aanvragen, met Goedkeuren / Afwijzen / Blokkeer
4. Klik op **Campagnes** → admin-overzicht met Pauzeer / Hervat / Budget / Beëindig
