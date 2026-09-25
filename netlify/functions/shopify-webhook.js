const crypto = require('crypto');

// Shopify webhook handler — verwerkt orders/paid en schrijft DSP punten
// Environment variables nodig in Netlify:
// SHOPIFY_WEBHOOK_SECRET — uit Shopify Admin → Instellingen → Meldingen → Webhooks
// FIREBASE_PROJECT_ID — doubleyou-journal
// FIREBASE_CLIENT_EMAIL — service account email
// FIREBASE_PRIVATE_KEY — service account private key

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verificeer Shopify HMAC signature
  const hmacHeader = event.headers['x-shopify-hmac-sha256'];
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (secret && hmacHeader) {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(event.body, 'utf8')
      .digest('base64');
    if (hash !== hmacHeader) {
      return { statusCode: 401, body: 'Unauthorized' };
    }
  }

  let order;
  try {
    order = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Haal klantgegevens op
  const klantEmail = order.email || order.contact_email;
  const orderBedrag = parseFloat(order.total_price || '0');
  const orderId = String(order.id);
  const orderNummer = order.order_number;

  if (!klantEmail) {
    return { statusCode: 200, body: 'Geen klant email' };
  }

  // Verbind met Firebase via REST API
  const projectId = process.env.FIREBASE_PROJECT_ID || 'doubleyou-journal';
  const baseURL = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  // Zoek Firebase user op basis van email in users collectie
  // We slaan ook het Firebase Auth UID op in het users document
  try {
    // Zoek user document op email
    const zoekURL = `${baseURL}/users?pageSize=200`;
    const zoekRes = await fetch(zoekURL);
    const zoekData = await zoekRes.json();

    let userDocId = null;
    let userData = null;

    if (zoekData.documents) {
      for (const doc of zoekData.documents) {
        const fields = doc.fields || {};
        const docEmail = fields.email?.stringValue || '';
        if (docEmail.toLowerCase() === klantEmail.toLowerCase()) {
          userDocId = doc.name.split('/').pop();
          userData = fields;
          break;
        }
      }
    }

    if (!userDocId) {
      console.log('Geen Firebase user gevonden voor email:', klantEmail);
      return { statusCode: 200, body: 'Gebruiker niet gevonden in Firebase' };
    }

    // Bereken DSP punten
    const huidigLifetime = userData.dsp_lifetime?.integerValue
      ? parseInt(userData.dsp_lifetime.integerValue)
      : (userData.dsp_lifetime?.doubleValue || 0);
    const huidigSeizoen = userData.dsp_seizoen?.integerValue
      ? parseInt(userData.dsp_seizoen.integerValue)
      : (userData.dsp_seizoen?.doubleValue || 0);

    // Check of dit de eerste aankoop is
    const aantalBestellingen = userData.aantal_bestellingen?.integerValue
      ? parseInt(userData.aantal_bestellingen.integerValue)
      : 0;
    const eersteAankoop = aantalBestellingen === 0;

    let punten = eersteAankoop ? 100 : 75; // eerste aankoop of volgend
    if (orderBedrag >= 150) punten += 50;
    else if (orderBedrag >= 100) punten += 25;

    const nieuwLifetime = huidigLifetime + punten;
    const nieuwSeizoen = huidigSeizoen + punten;

    // Niveau bepalen
    const niveaus = [
      { naam: 'Binnenkomer', min: 0 },
      { naam: 'Insider', min: 150 },
      { naam: 'Front Row', min: 500 },
      { naam: 'Ambassador', min: 1200 },
      { naam: 'Icon', min: 2500 },
    ];
    const niveau = niveaus.filter(n => nieuwLifetime >= n.min).pop().naam;

    const seizoentiers = [
      { naam: 'Starter', min: 0 },
      { naam: 'Actief', min: 100 },
      { naam: 'Betrokken', min: 300 },
      { naam: 'Toegewijd', min: 700 },
      { naam: 'Elite', min: 1500 },
    ];
    const seizoentier = seizoentiers.filter(t => nieuwSeizoen >= t.min).pop().naam;

    // Update user document
    const updateURL = `${baseURL}/users/${userDocId}?updateMask.fieldPaths=dsp_lifetime&updateMask.fieldPaths=dsp_seizoen&updateMask.fieldPaths=niveau&updateMask.fieldPaths=seizoentier&updateMask.fieldPaths=aantal_bestellingen`;
    await fetch(updateURL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          dsp_lifetime: { integerValue: nieuwLifetime },
          dsp_seizoen: { integerValue: nieuwSeizoen },
          niveau: { stringValue: niveau },
          seizoentier: { stringValue: seizoentier },
          aantal_bestellingen: { integerValue: aantalBestellingen + 1 },
        }
      })
    });

    // Log DSP actie
    const logLabel = eersteAankoop
      ? `Eerste aankoop — bestelling #${orderNummer} (€${orderBedrag})`
      : `Bestelling #${orderNummer} (€${orderBedrag})`;

    await fetch(`${baseURL}/dsp_log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: userDocId },
          actie: { stringValue: eersteAankoop ? 'eerste_aankoop' : 'aankoop_volgend' },
          pts: { integerValue: punten },
          label: { stringValue: logLabel },
          orderId: { stringValue: orderId },
          orderNummer: { integerValue: orderNummer },
          orderBedrag: { doubleValue: orderBedrag },
          ts: { timestampValue: new Date().toISOString() },
        }
      })
    });

    console.log(`DSP toegekend: ${punten} punten aan ${klantEmail} voor bestelling #${orderNummer}`);
    return { statusCode: 200, body: JSON.stringify({ success: true, punten, niveau }) };

  } catch(e) {
    console.error('Webhook fout:', e);
    return { statusCode: 500, body: 'Interne fout: ' + e.message };
  }
};
