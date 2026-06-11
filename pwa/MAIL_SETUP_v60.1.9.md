# Mail Setup voor Brand Portal — v60.1.9

## Wat is er veranderd?
De vorige versie probeerde via een Cloudflare Worker (`black-grass-c05c.doubleyou-journal.workers.dev/mail`) te mailen. **Die worker is offline / DNS-onbereikbaar**, daarom faalden de mails met `TypeError: Failed to fetch`.

Vanaf v60.1.9 schrijven we de mail in plaats daarvan naar een **Firestore `mail` collection**. Dit is de officiële standaard van de **Firebase "Trigger Email" Extension** — geen CORS, geen DNS-issues, gewoon een Firestore-write.

## Stap 1 — Update Firestore rules (REQUIRED)
Voeg deze rule toe aan je `firestore.rules` (staat al klaar in de ZIP):

```firestore
match /mail/{mailId} {
  allow read:   if isAdmin();
  allow create: if isIngelogd();
  allow update: if isAdmin();
  allow delete: if isAdmin();
}
```

Deploy:
```bash
firebase deploy --only firestore:rules
```

## Stap 2 — Installeer de "Trigger Email" extension (REQUIRED voor echte verzending)
Zonder deze extension wordt de mail wél in Firestore opgeslagen maar **niet daadwerkelijk verstuurd**.

```bash
firebase ext:install firebase/firestore-send-email
```

Of via de Firebase Console:
1. Open Firebase Console → **Extensions**
2. Zoek **"Trigger Email"** (door Firebase) en klik **Install**
3. Configuratie:
   - **SMTP connection URI**: bijvoorbeeld
     - SendGrid: `smtps://apikey:JE_SENDGRID_KEY@smtp.sendgrid.net:465`
     - Resend SMTP: `smtps://resend:JE_RESEND_KEY@smtp.resend.com:465`
     - Gmail SMTP: `smtps://JE_EMAIL:APP_PASSWORD@smtp.gmail.com:465`
   - **Email documents collection**: `mail` (DEFAULT — laat zo)
   - **Default FROM address**: `Paskamer Praat <no-reply@paskamerpraat.nl>`
   - **Users collection** (optioneel): laat leeg
   - **Templates collection** (optioneel): laat leeg

4. Klik **Install extension** (duurt 3–5 minuten)

## Stap 3 — Test
1. Open een Incognito venster → `/?pagina=brand_register`
2. Vul het formulier in met een echt mailadres
3. Klik **Aanvraag versturen**
4. Check:
   - Firebase Console → **Firestore** → collection `mail` → er moet 2 documenten verschijnen (1 voor user, 1 voor admin)
   - Elk document krijgt na een paar seconden een `delivery` subfield toegevoegd door de extension met de status (`SUCCESS` / error)
   - Check `info@doubleyousmallandtall.nl` inbox + spam folder
   - User mail komt aan in het opgegeven e-mailadres

## Troubleshooting

### "PERMISSION_DENIED" bij schrijven naar `mail`
→ Firestore rules zijn niet gedeployed. Run stap 1 opnieuw.

### Mail document staat in Firestore maar wordt niet verstuurd
→ Extension niet geïnstalleerd. Doe stap 2.

### Extension geeft `delivery.state: "ERROR"` met SMTP-melding
→ SMTP credentials kloppen niet. Check:
- SendGrid API key heeft "Mail Send" permission
- Resend API key is geldig
- Gmail vereist een **App Password**, niet je gewone wachtwoord (zie Google Account → Security → 2FA → App Passwords)

### Mails komen in spam
→ Configureer SPF + DKIM voor je domein. Voor SendGrid: zie hun "Sender Authentication" wizard.

## Alternatief: behoud bestaande Cloudflare mail-worker
Als je liever je oude worker weer wilt gebruiken, redeploy hem en zorg dat hij CORS-headers heeft:

```js
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://paskamerpraat.nl',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
```

Dan moet je in `brand-portal-v1.js` `BP.stuurRegistratieMails` terug naar de `fetch()`-variant. Maar de Firestore-route is robuuster en heeft minder dependencies.
