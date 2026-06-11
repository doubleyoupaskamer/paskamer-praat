/**
 * BRAND PORTAL — Campaign Auto-Complete Worker
 * DoubleYou / Paskamer Praat  •  v1.0.0 (februari 2026)
 *
 * DOEL:
 *   Zet automatisch elke campagne op status='completed' zodra de eindDatum
 *   gepasseerd is, zodat brands geen rapportages blijven zien voor verlopen
 *   campagnes en de admin-lijst overzichtelijk blijft.
 *
 * DRAAIFREQUENTIE:
 *   1× per uur is ruim voldoende (campagnes worden niet seconde-precies
 *   afgesloten — uurprecisie volstaat). Iedere 6 uur is ook prima.
 *   Cron expression: "0 * * * *"  (elk uur op 00 minuten)
 *
 * IDEMPOTENTIE:
 *   Filter is `status in ['live','paused']` + `eindDatum <= now`. Reeds
 *   completed/draft/review campagnes worden NOOIT aangeraakt. Run is dus
 *   altijd veilig opnieuw uit te voeren.
 *
 * DEPLOY-INSTRUCTIES:
 *   1. Cloudflare Dashboard → Workers & Pages → Workers
 *   2. Nieuwe Worker: "doubleyou-brand-autocomplete-worker"
 *   3. Plak deze code
 *   4. Environment Variables:
 *        FIREBASE_PROJECT_ID   = doubleyou-journal
 *        FIREBASE_SERVICE_KEY  = <base64 service account JSON, zelfde als pvdw>
 *        WORKER_SECRET         = <random secret voor /run endpoint>
 *   5. Cron Trigger: "0 * * * *"  (elk uur)
 *
 * FIRESTORE COLLECTIONS:
 *   - campaigns           (read + write status)
 *   - brand_admin_log     (audit log write)
 */

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;  // max campagnes per run (ruim genoeg voor MVP)

// ─────────────────────────────────────────────────────────────
// FIREBASE REST API CLIENT (identiek aan pvdw worker — hergebruik)
// ─────────────────────────────────────────────────────────────

class FirestoreClient {
  constructor(projectId, serviceKeyBase64) {
    this.projectId = projectId;
    this.serviceKeyBase64 = serviceKeyBase64;
    this._token = null;
    this._tokenExp = 0;
  }

  async getToken() {
    const nu = Date.now() / 1000;
    if (this._token && nu < this._tokenExp - 60) return this._token;
    const keyJson = JSON.parse(atob(this.serviceKeyBase64));
    const jwt = await this._maakJWT(keyJson);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });
    if (!res.ok) throw new Error('Token ophalen mislukt: ' + res.status);
    const data = await res.json();
    this._token    = data.access_token;
    this._tokenExp = nu + data.expires_in;
    return this._token;
  }

  async _maakJWT(key) {
    const nu  = Math.floor(Date.now() / 1000);
    const header  = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud:  'https://oauth2.googleapis.com/token',
      iat:  nu,
      exp:  nu + 3600
    };
    const b64url = (obj) => btoa(JSON.stringify(obj))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const toSign = b64url(header) + '.' + b64url(payload);
    const pemBody  = key.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
    const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyBytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      new TextEncoder().encode(toSign)
    );
    const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    return toSign + '.' + b64sig;
  }

  get baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  async runQuery(query) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}:runQuery`;
    const res   = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: query })
    });
    if (!res.ok) throw new Error(`Firestore query fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Update enkel de status + laatsteUpdate + autoCompletedAt velden.
   * Gebruikt updateMask zodat overige velden (impressies/clicks/spend) onveranderd
   * blijven. Voorkomt accidentele overwrites.
   */
  async updateStatusFields(collection, docId, fields) {
    const token = await this.getToken();
    const masks = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url   = `${this.baseUrl}/${collection}/${docId}?${masks}`;
    const body  = { fields: toFirestoreFields(fields) };
    const res   = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`updateStatusFields fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async addDoc(collection, data) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}/${collection}`;
    const body  = { fields: toFirestoreFields(data) };
    const res   = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`addDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE VALUE MARSHALLING
// ─────────────────────────────────────────────────────────────

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean')        return { booleanValue: v };
  if (typeof v === 'number')         return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')         return { stringValue: v };
  if (v instanceof Date)             return { timestampValue: v.toISOString() };
  if (Array.isArray(v))              return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object')         return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}

function fromFirestoreValue(v) {
  if (!v) return null;
  if ('nullValue'     in v) return null;
  if ('booleanValue'  in v) return v.booleanValue;
  if ('integerValue'  in v) return parseInt(v.integerValue);
  if ('doubleValue'   in v) return v.doubleValue;
  if ('stringValue'   in v) return v.stringValue;
  if ('timestampValue'in v) return new Date(v.timestampValue);
  if ('arrayValue'    in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue'      in v) {
    const out = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) out[k] = fromFirestoreValue(fv);
    return out;
  }
  return null;
}

function docToObject(firestoreDoc) {
  if (!firestoreDoc || !firestoreDoc.fields) return null;
  const obj = { _id: firestoreDoc.name ? firestoreDoc.name.split('/').pop() : null };
  for (const [k, v] of Object.entries(firestoreDoc.fields)) obj[k] = fromFirestoreValue(v);
  return obj;
}

// ─────────────────────────────────────────────────────────────
// WORKER MAIN
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        ts: new Date().toISOString(),
        version: 'brand-autocomplete-v1.0.0'
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      if (authHeader !== `Bearer ${env.WORKER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const resultaat = await runAutoComplete(env);
      return new Response(JSON.stringify(resultaat, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Brand Portal Auto-Complete Worker v1.0.0', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAutoComplete(env));
  }
};

// ─────────────────────────────────────────────────────────────
// KERN: runAutoComplete
// ─────────────────────────────────────────────────────────────

async function runAutoComplete(env) {
  const runStart = new Date();
  const nu = runStart.toISOString();
  let totaalGevonden = 0;
  let totaalCompleted = 0;
  let foutCount = 0;
  const verwerkt = [];

  const db = new FirestoreClient(
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_SERVICE_KEY
  );

  try {
    // ── Query campaigns waar eindDatum gepasseerd is + status in [live, paused] ──
    //
    // LET OP: Firestore native query ondersteunt geen `in` operator i.c.m. een
    // ander field-filter zonder composite index. Daarom doen we 2 losse queries
    // (live + paused) en mergen we de resultaten. Beide queries hebben dezelfde
    // eindDatum-filter dus de query is goedkoop.
    const statussen = ['live', 'paused'];
    let alleVerlopen = [];

    for (const status of statussen) {
      const result = await db.runQuery({
        from: [{ collectionId: 'campaigns' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'status' },
                  op: 'EQUAL',
                  value: { stringValue: status }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'eindDatum' },
                  op: 'LESS_THAN_OR_EQUAL',
                  value: { timestampValue: nu }
                }
              }
            ]
          }
        },
        limit: BATCH_SIZE
      });

      const docs = (result || [])
        .filter(r => r.document)
        .map(r => docToObject(r.document))
        .filter(Boolean);

      alleVerlopen = alleVerlopen.concat(docs);
    }

    totaalGevonden = alleVerlopen.length;
    console.log(`[brand-autocomplete] ${totaalGevonden} verlopen campagnes gevonden`);

    // ── Verwerk elk verlopen campagne ────────────────────────────
    for (const camp of alleVerlopen) {
      try {
        // Update alleen status + laatsteUpdate + autoCompletedAt fields
        // (updateMask zorgt dat overige velden niet aangeraakt worden)
        await db.updateStatusFields('campaigns', camp._id, {
          status:           'completed',
          laatsteUpdate:    runStart,
          autoCompletedAt:  runStart,
          autoCompletedBy:  'worker:brand-autocomplete-v1.0.0'
        });

        // Audit log
        await db.addDoc('brand_admin_log', {
          type:        'campaign_auto_completed',
          campaignId:  camp._id,
          brandId:     camp.brandId || null,
          brandNaam:   camp.brandNaam || null,
          naam:        camp.naam || null,
          vorigeStatus: camp.status,
          eindDatum:   camp.eindDatum instanceof Date ? camp.eindDatum.toISOString() : (camp.eindDatum || null),
          door:        'worker',
          ts:          runStart.toISOString(),
        }).catch(e => console.warn('[brand-autocomplete] audit log skip:', e.message));

        verwerkt.push({
          campaignId: camp._id,
          brandNaam:  camp.brandNaam || null,
          naam:       camp.naam || null,
          vorigeStatus: camp.status,
        });
        totaalCompleted++;
      } catch(e) {
        foutCount++;
        console.error(`[brand-autocomplete] Campagne ${camp._id} mislukt:`, e.message);
      }
    }

  } catch(e) {
    console.error('[brand-autocomplete] Worker error:', e.message);
    // Schrijf audit voor de runfout
    await db.addDoc('brand_admin_log', {
      type:    'autocomplete_worker_error',
      bericht: e.message,
      door:    'worker',
      ts:      runStart.toISOString(),
    }).catch(() => {});
    return {
      status: 'error',
      bericht: e.message,
      duurMs: Date.now() - runStart.getTime(),
    };
  }

  // ── Run-summary audit ────────────────────────────────────────
  // Alleen audit-summary schrijven als er ÉCHT iets verwerkt is, om de
  // brand_admin_log niet onnodig te vullen (worker draait elk uur).
  if (totaalCompleted > 0 || foutCount > 0) {
    await db.addDoc('brand_admin_log', {
      type:           'autocomplete_run_summary',
      totaalGevonden: totaalGevonden,
      totaalCompleted: totaalCompleted,
      foutCount:      foutCount,
      duurMs:         Date.now() - runStart.getTime(),
      runAt:          runStart.toISOString(),
      door:           'worker',
      ts:             new Date().toISOString(),
    }).catch(() => {});
  }

  console.log(`[brand-autocomplete] Klaar: ${totaalCompleted}/${totaalGevonden} verwerkt (${foutCount} fouten)`);
  return {
    status: 'ok',
    totaalGevonden,
    totaalCompleted,
    foutCount,
    verwerkt,
    duurMs: Date.now() - runStart.getTime(),
  };
}
