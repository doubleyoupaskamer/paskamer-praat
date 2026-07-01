/**
 * POST BOOSTS EXPIRE — Cloudflare Worker
 * DoubleYou / Paskamer Praat  •  v1.0.0 (juli 2026)
 *
 * DOEL
 *   Zet automatisch elke geboostte post terug naar "niet-geboost" zodra
 *   `boost_until` gepasseerd is. Zonder deze worker blijven posts eeuwig
 *   in de sponsored-feed hangen en blijven brands ervoor betalen zonder
 *   dat de boost technisch nog actief is.
 *
 * CRON
 *   "0 * * * *"  (elk uur op :00)  → uurprecisie is voldoende
 *
 * ENV VARIABLES (Cloudflare Dashboard):
 *   FIREBASE_PROJECT_ID   = doubleyou-journal
 *   FIREBASE_SERVICE_KEY  = <base64 service account JSON>
 *   WORKER_SECRET         = <random secret voor /run>
 *
 * IDEMPOTENTIE
 *   Query filter is `boost_active == true` AND `boost_until <= now`.
 *   Reeds gede-booste posts hebben boost_active=false en worden overgeslagen.
 *
 * SCHRIJFT NAAR:
 *   posts/{postId}         → boost_active=false, boost_expired_at=<iso>
 *   post_boosts/{boostId}  → status='expired', expired_at=<iso>  (indien gekoppeld)
 *   worker_audit_log       → 1 entry per run met counters
 *
 * SECURITY
 *   Service account bypasst Firestore rules (server-side). WORKER_SECRET is
 *   alleen nodig voor handmatige /run trigger vanaf admin dashboard.
 */

const BATCH_SIZE = 500;
const WORKER_VERSION = 'v1.0.0';

// ═══════════════════════ FIRESTORE CLIENT (shared) ══════════════════════

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
    this._token = data.access_token;
    this._tokenExp = nu + data.expires_in;
    return this._token;
  }

  async _maakJWT(key) {
    const nu = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nu,
      exp: nu + 3600
    };
    const b64url = (obj) => btoa(JSON.stringify(obj))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const toSign = b64url(header) + '.' + b64url(payload);
    const pemBody = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
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
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return toSign + '.' + b64sig;
  }

  get baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  async runQuery(query) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}:runQuery`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: query })
    });
    if (!res.ok) throw new Error(`runQuery fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async patchDoc(collection, docId, fieldMask, data) {
    const token = await this.getToken();
    const maskParam = fieldMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const url = `${this.baseUrl}/${collection}/${docId}?${maskParam}`;
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`patchDoc fout ${collection}/${docId}: ${res.status}`);
    return res.json();
  }

  async addDoc(collection, data) {
    const token = await this.getToken();
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(`${this.baseUrl}/${collection}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`addDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function fromFirestoreValue(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return parseInt(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const out = {};
    for (const [k, fv] of Object.entries(v.mapValue.fields || {})) out[k] = fromFirestoreValue(fv);
    return out;
  }
  return null;
}
function docToObject(doc) {
  if (!doc || !doc.fields) return null;
  const obj = { _id: doc.name ? doc.name.split('/').pop() : null };
  for (const [k, v] of Object.entries(doc.fields)) obj[k] = fromFirestoreValue(v);
  return obj;
}

// ═══════════════════════ WORKER ENTRYPOINT ══════════════════════════════

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ status: 'ok', ts: new Date().toISOString(), version: WORKER_VERSION });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      if ((request.headers.get('Authorization') || '') !== `Bearer ${env.WORKER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      return json(await runBoostExpire(env));
    }
    return new Response('Post Boosts Expire Worker ' + WORKER_VERSION, { status: 200 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBoostExpire(env));
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ═══════════════════════ KERN ══════════════════════════════════════════

async function runBoostExpire(env) {
  const runStart = new Date();
  const db = new FirestoreClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_SERVICE_KEY);
  const nowIso = runStart.toISOString();
  let expiredCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    // Query: alle posts met boost_active=true én boost_until <= now
    // Zowel `posts` als `feed_posts` collecties checken (schema-verschil door legacy)
    for (const collection of ['posts', 'feed_posts']) {
      try {
        const result = await db.runQuery({
          from: [{ collectionId: collection }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'boost_active' }, op: 'EQUAL', value: { booleanValue: true } } },
                { fieldFilter: { field: { fieldPath: 'boost_until' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: nowIso } } }
              ]
            }
          },
          limit: BATCH_SIZE
        });

        for (const row of (result || [])) {
          if (!row.document) continue;
          const post = docToObject(row.document);
          if (!post) continue;

          try {
            // De-boost het post-document
            await db.patchDoc(collection, post._id, ['boost_active', 'boost_expired_at'], {
              boost_active: false,
              boost_expired_at: nowIso
            });

            // Markeer het gekoppelde boost-doc (indien aanwezig) als expired
            if (post.boost_id) {
              await db.patchDoc('post_boosts', post.boost_id, ['status', 'expired_at'], {
                status: 'expired',
                expired_at: nowIso
              }).catch((e) => { errors.push(`post_boosts/${post.boost_id}: ${e.message}`); });
            }

            expiredCount++;
          } catch (e) {
            errorCount++;
            errors.push(`${collection}/${post._id}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`collection ${collection} query: ${e.message}`);
      }
    }

    // Audit log
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION,
      workerName: 'post-boosts-expire',
      runAt: nowIso,
      duurMs: Date.now() - runStart.getTime(),
      status: errorCount === 0 ? 'ok' : 'partial',
      expiredCount,
      errorCount,
      errors: errors.slice(0, 10)  // cap voor field-size
    }).catch(() => { /* audit failure niet fatal */ });

    console.log(`[boost-expire] Verwerkt: ${expiredCount} posts gede-boost, ${errorCount} fouten`);
    return { status: 'ok', expiredCount, errorCount, errors: errors.slice(0, 10), version: WORKER_VERSION };
  } catch (e) {
    console.error('[boost-expire] Fatale fout:', e.message);
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION,
      workerName: 'post-boosts-expire',
      runAt: nowIso,
      status: 'error',
      error: e.message
    }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}
