/**
 * PASKAMER STUDIO — Stale Sessions Cleanup Worker
 * DoubleYou / Paskamer Praat  •  v1.0.0 (juli 2026)
 *
 * DOEL
 *   Sluit automatisch live_sessions af die "stale" zijn:
 *     • startedAt is > MAX_SESSION_MS oud (fail-safe: browser crash, netwerk-verlies)
 *     • OF: laatste heartbeat/update is > STALE_MS oud (viewer counter/reactions
 *       worden namelijk elke minuut ge-increment door actieve players)
 *
 *   Zonder deze worker blijven sessies eeuwig in `status='live'` staan als de
 *   host tab crasht of het `beforeunload`-hook faalt (mobiel Safari, iOS, ...).
 *
 * CRON
 *   "*\/15 * * * *"  (elke 15 minuten)
 *
 * ENV VARIABLES
 *   FIREBASE_PROJECT_ID   = doubleyou-journal
 *   FIREBASE_SERVICE_KEY  = <base64 service account JSON>
 *   WORKER_SECRET         = <random secret voor /run>
 *
 * DREMPELS (aanpasbaar via env, defaults hieronder):
 *   MAX_SESSION_MS   = 6 uur     (harde absolute limiet — geen live gaat langer)
 *   STALE_MS         = 30 min    (geen recente update = dood)
 *
 * SCHRIJFT NAAR:
 *   live_sessions/{id}    → status='ended', endedAt=<iso>, endedReason='auto_stale'
 *   worker_audit_log      → 1 entry per run met counters
 *
 * OPTIONEEL — CHAT/REACTIONS CLEANUP:
 *   Standaard blijven chat/reactions bewaard voor replay-doeleinden (fase 2).
 *   Zet env DELETE_SUBCOLLECTIONS='true' om ook alle chat/reactions te wissen
 *   na sessie-sluiting (zwaardere run, ~1 write per doc).
 */

const MAX_SESSION_MS_DEFAULT = 6 * 60 * 60 * 1000;   // 6 uur
const STALE_MS_DEFAULT       = 30 * 60 * 1000;       // 30 min
const BATCH_SIZE             = 200;
const WORKER_VERSION         = 'v1.0.0';

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

  async listCollection(parentPath, collectionId, pageSize = 200) {
    const token = await this.getToken();
    const url = `${this.baseUrl}/${parentPath}/${collectionId}?pageSize=${pageSize}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return { documents: [] };
    return res.json();
  }

  async patchDoc(path, fieldMask, data) {
    const token = await this.getToken();
    const maskParam = fieldMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const url = `${this.baseUrl}/${path}?${maskParam}`;
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`patchDoc fout ${path}: ${res.status}`);
    return res.json();
  }

  async deleteDoc(path) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}/${path}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok && res.status !== 404) throw new Error(`deleteDoc fout ${path}: ${res.status}`);
    return true;
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
  const obj = {
    _id: doc.name ? doc.name.split('/').pop() : null,
    _updateTime: doc.updateTime || null
  };
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
      return json(await runStudioCleanup(env));
    }
    return new Response('Paskamer Studio Cleanup Worker ' + WORKER_VERSION, { status: 200 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runStudioCleanup(env));
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// ═══════════════════════ KERN ══════════════════════════════════════════

async function runStudioCleanup(env) {
  const runStart = new Date();
  const db = new FirestoreClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_SERVICE_KEY);
  const nowMs = runStart.getTime();
  const nowIso = runStart.toISOString();
  const maxAgeMs = parseInt(env.MAX_SESSION_MS || MAX_SESSION_MS_DEFAULT);
  const staleMs = parseInt(env.STALE_MS || STALE_MS_DEFAULT);
  const deleteSubcollections = (env.DELETE_SUBCOLLECTIONS === 'true');

  let endedCount = 0;
  let subcollectionsDeleted = 0;
  const errors = [];

  try {
    // Query: alle live sessies. Filter op status='live' (kan geen composite met updateTime, dus fetch alles).
    // In productie: composite index (status ASC, startedAt DESC) is al bekend.
    const result = await db.runQuery({
      from: [{ collectionId: 'live_sessions' }],
      where: {
        fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'live' } }
      },
      limit: BATCH_SIZE
    });

    for (const row of (result || [])) {
      if (!row.document) continue;
      const session = docToObject(row.document);
      if (!session) continue;

      // Bepaal "hoe oud" — startedAt is Timestamp
      const startedAt = session.startedAt instanceof Date ? session.startedAt.getTime() : null;
      const updateTime = session._updateTime ? new Date(session._updateTime).getTime() : null;

      // Stale detectie:
      //   • startedAt > MAX_SESSION_MS oud  → absolute limiet
      //   • updateTime > STALE_MS oud       → geen heartbeat meer
      let staleReason = null;
      if (startedAt && (nowMs - startedAt) > maxAgeMs) {
        staleReason = 'max_duration_exceeded';
      } else if (updateTime && (nowMs - updateTime) > staleMs) {
        staleReason = 'no_recent_activity';
      }

      if (!staleReason) continue;

      try {
        await db.patchDoc(
          `live_sessions/${session._id}`,
          ['status', 'endedAt', 'endedReason'],
          {
            status: 'ended',
            endedAt: nowIso,
            endedReason: 'auto_stale_' + staleReason
          }
        );
        endedCount++;

        // Optioneel: chat + reactions subcollecties opruimen
        if (deleteSubcollections) {
          for (const sub of ['chat', 'reactions']) {
            try {
              const list = await db.listCollection(`live_sessions/${session._id}`, sub, 300);
              for (const d of (list.documents || [])) {
                const path = d.name.split('/documents/')[1];
                await db.deleteDoc(path).catch(() => { /* individueel doc kan falen, geen fatale */ });
                subcollectionsDeleted++;
              }
            } catch (e) { errors.push(`subcol ${session._id}/${sub}: ${e.message}`); }
          }
        }
      } catch (e) {
        errors.push(`live_sessions/${session._id}: ${e.message}`);
      }
    }

    // Audit
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION,
      workerName: 'studio-cleanup',
      runAt: nowIso,
      duurMs: Date.now() - runStart.getTime(),
      status: errors.length === 0 ? 'ok' : 'partial',
      endedCount,
      subcollectionsDeleted,
      errorCount: errors.length,
      errors: errors.slice(0, 10)
    }).catch(() => {});

    console.log(`[studio-cleanup] ${endedCount} sessies gesloten, ${subcollectionsDeleted} sub-docs verwijderd, ${errors.length} fouten`);
    return { status: 'ok', endedCount, subcollectionsDeleted, errors: errors.slice(0, 10), version: WORKER_VERSION };
  } catch (e) {
    console.error('[studio-cleanup] Fatale fout:', e.message);
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION,
      workerName: 'studio-cleanup',
      runAt: nowIso,
      status: 'error',
      error: e.message
    }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}
