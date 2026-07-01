/**
 * PASKAMER PRAAT — Combined Cloudflare Worker
 * DoubleYou / Paskamer Praat  •  v1.0.0 (februari 2026)
 *
 * BUNDELT 4 CRON-TAKEN IN 1 WORKER:
 *   1. Post van de Week (pvdw)             — zondag 23:00 UTC
 *   2. Boost expiry (post-boosts-expire)   — elk uur
 *   3. Brand campaign auto-complete        — elk uur
 *   4. Studio stale sessions cleanup       — elke 15 min
 *
 * CLOUDFLARE DASHBOARD — CRON TRIGGERS INSTELLEN
 *   Workers & Pages → deze Worker → Triggers → Cron Triggers → Add
 *     • "0 23 * * SUN"   → Post van de Week (zondag 23:00 UTC)
 *     • "0 * * * *"      → Boost expiry + brand auto-complete (elk uur)
 *     • "*\/15 * * * *"   → Studio cleanup (elke 15 min)
 *
 *   LET OP: Cloudflare gebruikt Quartz-cron (1=zondag, 7=zaterdag) — NIET Unix cron.
 *   Dus "0" voor day-of-week is ONGELDIG. Gebruik "SUN" of "1" voor zondag.
 *
 * ENV VARIABLES (allemaal onder Settings → Variables)
 *   FIREBASE_PROJECT_ID   = doubleyou-journal
 *   FIREBASE_SERVICE_KEY  = <base64 service account JSON>
 *   WORKER_SECRET         = <random secret voor /run>
 *   WORKER_ADMIN_EMAIL    = admin@paskamerpraat.nl        (optioneel — pvdw admin mail)
 *   WORKER_APP_URL        = https://paskamerpraat.nl      (optioneel — pvdw deeplink)
 *   MAX_SESSION_MS        = 21600000                       (optioneel — studio 6u default)
 *   STALE_MS              = 1800000                        (optioneel — studio 30min default)
 *   DELETE_SUBCOLLECTIONS = 'false'                        (optioneel — studio chat/reactions delete)
 *
 * HANDMATIG TRIGGEREN (voor testen vanaf admin dashboard):
 *   POST /run?task=pvdw           Authorization: Bearer <WORKER_SECRET>
 *   POST /run?task=boost          "
 *   POST /run?task=autocomplete   "
 *   POST /run?task=studio         "
 *   POST /run?task=all            (draait alles achter elkaar)
 *
 * HEALTH CHECK:
 *   GET /health   → { status, ts, version, tasks[] }
 */

const WORKER_VERSION = 'pp-combined-v1.1.0-scheduled-lives';

// ═══════════════════════ CONFIG PER TAAK ══════════════════════════════

const PVDW_MIN_LIKES          = 25;
const PVDW_STORIES_BATCH_SIZE = 500;
const PVDW_DSP_BONUS          = 50;

const BOOST_BATCH_SIZE        = 500;

const AUTOCOMPLETE_BATCH_SIZE = 100;

const STUDIO_MAX_MS_DEFAULT   = 6 * 60 * 60 * 1000;
const STUDIO_STALE_MS_DEFAULT = 30 * 60 * 1000;
const STUDIO_BATCH_SIZE       = 200;

// ═══════════════════════ SHARED FIRESTORE CLIENT ══════════════════════

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

  get baseUrl()   { return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`; }
  get commitUrl() { return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`; }

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

  async getDoc(collection, docId) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}/${collection}/${docId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getDoc fout: ${res.status}`);
    return res.json();
  }

  async setDoc(collection, docId, data) {
    const token = await this.getToken();
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(`${this.baseUrl}/${collection}/${docId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`setDoc fout: ${res.status} ${await res.text()}`);
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

  async incrementFields(collection, docId, fieldDeltas) {
    const token = await this.getToken();
    const docPath = `projects/${this.projectId}/databases/(default)/documents/${collection}/${docId}`;
    const fieldTransforms = Object.entries(fieldDeltas).map(([fieldPath, delta]) => ({
      fieldPath,
      increment: Number.isInteger(delta) ? { integerValue: String(delta) } : { doubleValue: delta }
    }));
    const body = { writes: [{ transform: { document: docPath, fieldTransforms } }] };
    const res = await fetch(this.commitUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`incrementFields fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async listCollection(parentPath, collectionId, pageSize = 200) {
    const token = await this.getToken();
    const url = `${this.baseUrl}/${parentPath}/${collectionId}?pageSize=${pageSize}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return { documents: [] };
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
}

// ═══════════════════════ VALUE MARSHALLING ══════════════════════════════

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
      return json({
        status: 'ok',
        ts: new Date().toISOString(),
        version: WORKER_VERSION,
        tasks: ['pvdw', 'boost', 'autocomplete', 'studio', 'schedule']
      });
    }

    if (url.pathname === '/run' && request.method === 'POST') {
      if ((request.headers.get('Authorization') || '') !== `Bearer ${env.WORKER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const task = url.searchParams.get('task') || 'all';
      const db = new FirestoreClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_SERVICE_KEY);
      return json(await routeTask(task, db, env));
    }

    return new Response('Paskamer Praat Combined Worker ' + WORKER_VERSION, { status: 200 });
  },

  async scheduled(event, env, ctx) {
    const db = new FirestoreClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_SERVICE_KEY);
    const cron = event.cron;
    console.log(`[combined-worker] cron fired: "${cron}"`);

    // Route op basis van cron pattern
    // NB: Cloudflare Quartz cron — day-of-week 1=zondag, 7=zaterdag (NIET Unix cron)
    if (cron === '0 23 * * SUN' || cron === '0 23 * * 1') {
      ctx.waitUntil(runPvdw(db, env));
    } else if (cron === '0 * * * *') {
      // Hourly cron draait boost-expiry + brand-autocomplete parallel
      ctx.waitUntil(Promise.all([
        runBoostExpire(db, env),
        runAutoComplete(db, env)
      ]));
    } else if (cron === '*/15 * * * *') {
      // Elke 15 min: studio cleanup + scheduled reminders/no-show in parallel
      ctx.waitUntil(Promise.all([
        runStudioCleanup(db, env),
        runScheduleReminders(db, env)
      ]));
    } else {
      // Onbekende cron → log en run "all" als fail-safe
      console.warn(`[combined-worker] Onbekende cron "${cron}", run all`);
      ctx.waitUntil(routeTask('all', db, env));
    }
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function routeTask(task, db, env) {
  switch (task) {
    case 'pvdw':         return { task, result: await runPvdw(db, env) };
    case 'boost':        return { task, result: await runBoostExpire(db, env) };
    case 'autocomplete': return { task, result: await runAutoComplete(db, env) };
    case 'studio':       return { task, result: await runStudioCleanup(db, env) };
    case 'schedule':     return { task, result: await runScheduleReminders(db, env) };
    case 'all': {
      const [pvdw, boost, autocomplete, studio, schedule] = await Promise.all([
        runPvdw(db, env).catch(e => ({ status: 'error', error: e.message })),
        runBoostExpire(db, env).catch(e => ({ status: 'error', error: e.message })),
        runAutoComplete(db, env).catch(e => ({ status: 'error', error: e.message })),
        runStudioCleanup(db, env).catch(e => ({ status: 'error', error: e.message })),
        runScheduleReminders(db, env).catch(e => ({ status: 'error', error: e.message }))
      ]);
      return { task: 'all', pvdw, boost, autocomplete, studio, schedule };
    }
    default:
      return { status: 'error', error: `Onbekende task "${task}". Gebruik: pvdw|boost|autocomplete|studio|schedule|all` };
  }
}

// ═══════════════════════ 1. POST VAN DE WEEK ══════════════════════════

function pvdwVorigeWeekId(nu) {
  const gisteren = new Date(nu.getTime() - 24 * 60 * 60 * 1000);
  return pvdwIsoWeekId(gisteren);
}
function pvdwIsoWeekId(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNr = Math.ceil((((d - jaarStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNr).padStart(2, '0');
}
function pvdwWeekBereikVanId(weekId) {
  const [jaarStr, weekStr] = weekId.split('-W');
  const jaar = parseInt(jaarStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const jan4Dag = jan4.getUTCDay() || 7;
  const maandagW1 = new Date(jan4.getTime() - (jan4Dag - 1) * 86400000);
  const maandag = new Date(maandagW1.getTime() + (week - 1) * 7 * 86400000);
  const amsOffsetMs = pvdwGetAmsOffset(maandag);
  const weekStartUTC = maandag.getTime() - amsOffsetMs;
  const weekEndUTC   = weekStartUTC + (7 * 86400000) - 1;
  return {
    start: new Date(weekStartUTC),
    end:   new Date(weekEndUTC),
    startIso: new Date(weekStartUTC).toISOString(),
    endIso:   new Date(weekEndUTC).toISOString(),
  };
}
function pvdwGetAmsOffset(datum) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false, timeZoneName: 'short'
    });
    const utcHour = datum.getUTCHours();
    const parts = formatter.formatToParts(datum);
    const amsHour = parseInt(parts.find(p => p.type === 'hour').value);
    const diff = ((amsHour - utcHour) + 24) % 24;
    return diff * 60 * 60 * 1000;
  } catch (e) {
    return 2 * 60 * 60 * 1000;
  }
}

function pvdwIsPostEligible(p) {
  if (!p) return false;
  if (p.verborgen === true) return false;
  if (p.modStatus === 'verwijderd') return false;
  if (p.modStatus === 'gerapporteerd') return false;
  if (p.modStatus === 'blocked') return false;
  if (p._likesCount < PVDW_MIN_LIKES) return false;
  return true;
}
function pvdwSelecteerWinnaar(posts) {
  const kandidaten = posts.filter(pvdwIsPostEligible);
  if (kandidaten.length === 0) return null;
  kandidaten.sort((a, b) => (b._likesCount !== a._likesCount) ? b._likesCount - a._likesCount : (a.tsMs || 0) - (b.tsMs || 0));
  return kandidaten[0];
}

async function pvdwNotifyAdmin(db, winnaar, weekId, bereik) {
  try {
    await db.addDoc('brand_admin_log', {
      actie: 'pvdw_winnaar_geselecteerd', weekId,
      weekStart: bereik.startIso, weekEnd: bereik.endIso,
      winnaarUid: winnaar.userId || winnaar.authorId || null,
      winnaarNaam: winnaar.authorName || winnaar.displayName || 'Onbekend',
      postId: winnaar._id, likesCount: winnaar._likesCount, dspBonus: PVDW_DSP_BONUS,
      redenWinst: `Hoogste likes-score (${winnaar._likesCount}) in week ${weekId}, ≥${PVDW_MIN_LIKES} likes drempel gepasseerd, niet verborgen/gemodereerd`,
      gelezen: false, loggedBy: WORKER_VERSION, ts: new Date().toISOString(),
    });
  } catch (e) { console.error('[pvdw] admin notification mislukt:', e.message); }
}

async function pvdwNotifyWinnaar(db, winnaar, weekId, bereik, appUrl) {
  const uid = winnaar.userId || winnaar.authorId;
  if (!uid) return;
  try {
    const deeplink = (appUrl || 'https://paskamerpraat.nl') + '/post-van-de-week?week=' + encodeURIComponent(weekId);
    await db.addDoc('meldingen', {
      userId: uid, reporterUid: uid, type: 'pvdw_winnaar',
      titel: '🏆 Je hebt Post van de Week gewonnen!',
      bericht: `Gefeliciteerd! Jouw post heeft ${winnaar._likesCount} likes gekregen en is de Post van de Week (${weekId}). Je hebt ${PVDW_DSP_BONUS} DSP-punten verdiend.`,
      weekId, weekStart: bereik.startIso, weekEnd: bereik.endIso,
      postId: winnaar._id, likesCount: winnaar._likesCount, dspBonus: PVDW_DSP_BONUS,
      deeplink, gelezen: false, ts: new Date().toISOString(),
    });
  } catch (e) { console.error('[pvdw] winnaar notification mislukt:', e.message); }
}

async function pvdwSendAdminMail(db, adminEmail, winnaar, weekId, bereik) {
  if (!adminEmail) return;
  try {
    const uid = winnaar.userId || winnaar.authorId || 'onbekend';
    const naam = winnaar.authorName || winnaar.displayName || 'Onbekend';
    const subject = `[Paskamer Praat] Post van de Week winnaar — ${weekId}`;
    const html = `<h2>Post van de Week — winnaar geselecteerd</h2><p><strong>Week:</strong> ${weekId} (${bereik.startIso.slice(0, 10)} t/m ${bereik.endIso.slice(0, 10)})</p><p><strong>Winnaar:</strong> ${naam} (uid: <code>${uid}</code>)</p><p><strong>Post:</strong> <code>${winnaar._id}</code></p><p><strong>Likes:</strong> ${winnaar._likesCount}</p><p><strong>DSP-bonus uitgekeerd:</strong> ${PVDW_DSP_BONUS}</p><p><strong>Reden:</strong> Hoogste likes ≥ ${PVDW_MIN_LIKES}, niet verborgen/gemodereerd</p><hr><p style="color:#888;font-size:12px">Automatisch verzonden door ${WORKER_VERSION}</p>`;
    await db.addDoc('mail', {
      to: [adminEmail],
      message: { subject, html, text: `Winnaar Post van de Week ${weekId}: ${naam} (${uid}) — post ${winnaar._id} met ${winnaar._likesCount} likes. DSP +${PVDW_DSP_BONUS}.` }
    });
  } catch (e) { console.error('[pvdw] admin mail mislukt:', e.message); }
}

async function runPvdw(db, env) {
  const runStart = new Date();
  const weekId = pvdwVorigeWeekId(runStart);
  const bereik = pvdwWeekBereikVanId(weekId);
  let auditStatus = 'ok', auditMsg = '', resultaat = {};

  try {
    const bestaand = await db.getDoc('weekly_rankings', weekId);
    if (bestaand && bestaand.fields) {
      const status = fromFirestoreValue(bestaand.fields.status);
      if (status === 'selected' || status === 'geen_winnaar') {
        auditStatus = 'skipped'; auditMsg = `Week ${weekId} al verwerkt (status: ${status})`;
        resultaat = { skipped: true, weekId, status };
      } else {
        resultaat = await pvdwVerwerkWeek(db, weekId, bereik, env);
        auditMsg = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : `Geen winnaar (< ${PVDW_MIN_LIKES} likes of allen verborgen/gemodereerd)`;
      }
    } else {
      resultaat = await pvdwVerwerkWeek(db, weekId, bereik, env);
      auditMsg = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : `Geen winnaar (< ${PVDW_MIN_LIKES} likes of allen verborgen/gemodereerd)`;
    }
  } catch (e) {
    auditStatus = 'error'; auditMsg = e.message; resultaat = { error: e.message };
    await db.setDoc('weekly_rankings', weekId, { weekId, status: 'pending', error: e.message, updatedAt: new Date().toISOString() }).catch(() => {});
  }

  await db.addDoc('worker_audit_log', {
    weekId, workerName: 'pvdw', workerVersion: WORKER_VERSION,
    runAt: runStart.toISOString(), duurMs: Date.now() - runStart.getTime(),
    status: auditStatus, bericht: auditMsg,
    weekStart: bereik.startIso, weekEnd: bereik.endIso
  }).catch(e => console.error('[pvdw] audit log schrijven mislukt:', e.message));

  return { weekId, status: auditStatus, bericht: auditMsg, ...resultaat };
}

async function pvdwVerwerkWeek(db, weekId, bereik, env) {
  await db.setDoc('weekly_rankings', weekId, {
    weekId, status: 'pending', weekStart: bereik.startIso, weekEnd: bereik.endIso,
    updatedAt: new Date().toISOString()
  });

  const queryResult = await db.runQuery({
    from: [{ collectionId: 'stories' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'tsMs' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(bereik.start.getTime()) } } },
      { fieldFilter: { field: { fieldPath: 'tsMs' }, op: 'LESS_THAN_OR_EQUAL',    value: { integerValue: String(bereik.end.getTime()) } } }
    ] } },
    limit: PVDW_STORIES_BATCH_SIZE
  });

  const posts = (queryResult || []).filter(r => r.document).map(r => {
    const obj = docToObject(r.document); if (!obj) return null;
    const likesObj = (obj.likes && typeof obj.likes === 'object') ? obj.likes : {};
    obj._likesCount = Object.keys(likesObj).length;
    return obj;
  }).filter(Boolean);

  const totaal = posts.length;
  const verborgenCount = posts.filter(p => p.verborgen === true).length;
  const gemodereerdCount = posts.filter(p => p.modStatus === 'verwijderd' || p.modStatus === 'gerapporteerd' || p.modStatus === 'blocked').length;
  const eligibleVoorRank = posts.filter(pvdwIsPostEligible);
  const eligiblePosts = eligibleVoorRank.map(p => ({
    postId: p._id, likesCount: p._likesCount,
    authorId: p.userId || p.authorId || null,
    authorName: p.authorName || p.displayName || null,
    createdAt: p.createdAt || null, tsMs: p.tsMs || null
  }));

  const winnaar = pvdwSelecteerWinnaar(posts);
  if (!winnaar) {
    await db.setDoc('weekly_rankings', weekId, {
      weekId, status: 'geen_winnaar', weekStart: bereik.startIso, weekEnd: bereik.endIso,
      totaalPosts: totaal, verborgenPosts: verborgenCount, gemodereerdPosts: gemodereerdCount,
      eligiblePosts, updatedAt: new Date().toISOString()
    });
    try {
      await db.addDoc('brand_admin_log', {
        actie: 'pvdw_geen_winnaar', weekId, weekStart: bereik.startIso, weekEnd: bereik.endIso,
        totaalPosts: totaal, reden: `Geen post haalde de ${PVDW_MIN_LIKES}-likes drempel (of allen verborgen/gemodereerd)`,
        gelezen: false, loggedBy: WORKER_VERSION, ts: new Date().toISOString()
      });
    } catch (e) { /* audit log niet fatal */ }
    return { winnaar: null, totaalPosts: totaal, eligiblePosts };
  }

  const winnaarsData = {
    weekId, status: 'selected',
    postId: winnaar._id, likesCount: winnaar._likesCount,
    authorId: winnaar.userId || winnaar.authorId || null,
    authorName: winnaar.authorName || winnaar.displayName || null,
    postCreatedAt: winnaar.createdAt || null,
    weekStart: bereik.startIso, weekEnd: bereik.endIso,
    totaalPosts: totaal, verborgenPosts: verborgenCount, gemodereerdPosts: gemodereerdCount,
    eligiblePosts, selectedAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await db.setDoc('weekly_rankings', weekId, winnaarsData);

  const auteurId = winnaar.userId || winnaar.authorId;
  if (auteurId) {
    await db.addDoc('dsp_log', {
      uid: auteurId, actie: 'pvdw_winnaar', pts: PVDW_DSP_BONUS,
      label: `Post van de Week (${weekId}) — ${PVDW_DSP_BONUS} DSP bonus`,
      postId: winnaar._id, weekId, ts: new Date().toISOString()
    }).catch(e => console.error('[pvdw] dsp_log fout:', e.message));
    await db.incrementFields('users', auteurId, {
      dsp_lifetime: PVDW_DSP_BONUS, dsp_seizoen: PVDW_DSP_BONUS
    }).catch(e => console.error('[pvdw] DSP totals fout:', e.message));
  }

  await Promise.all([
    pvdwNotifyAdmin(db, winnaar, weekId, bereik),
    pvdwNotifyWinnaar(db, winnaar, weekId, bereik, env.WORKER_APP_URL),
    pvdwSendAdminMail(db, env.WORKER_ADMIN_EMAIL, winnaar, weekId, bereik)
  ]);

  return { winnaar: winnaarsData, totaalPosts: totaal, eligiblePosts };
}

// ═══════════════════════ 2. POST BOOSTS EXPIRE ══════════════════════════

async function runBoostExpire(db, env) {
  const runStart = new Date();
  const nowIso = runStart.toISOString();
  let expiredCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    for (const collection of ['posts', 'feed_posts']) {
      try {
        const result = await db.runQuery({
          from: [{ collectionId: collection }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'boost_active' }, op: 'EQUAL',                value: { booleanValue: true } } },
            { fieldFilter: { field: { fieldPath: 'boost_until' },  op: 'LESS_THAN_OR_EQUAL',   value: { timestampValue: nowIso } } }
          ] } },
          limit: BOOST_BATCH_SIZE
        });

        for (const row of (result || [])) {
          if (!row.document) continue;
          const post = docToObject(row.document);
          if (!post) continue;

          try {
            await db.patchDoc(`${collection}/${post._id}`, ['boost_active', 'boost_expired_at'], {
              boost_active: false,
              boost_expired_at: nowIso
            });

            if (post.boost_id) {
              await db.patchDoc(`post_boosts/${post.boost_id}`, ['status', 'expired_at'], {
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

    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'post-boosts-expire',
      runAt: nowIso, duurMs: Date.now() - runStart.getTime(),
      status: errorCount === 0 ? 'ok' : 'partial',
      expiredCount, errorCount, errors: errors.slice(0, 10)
    }).catch(() => {});

    console.log(`[boost-expire] ${expiredCount} posts gede-boost, ${errorCount} fouten`);
    return { status: 'ok', expiredCount, errorCount, errors: errors.slice(0, 10) };
  } catch (e) {
    console.error('[boost-expire] Fatale fout:', e.message);
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'post-boosts-expire',
      runAt: nowIso, status: 'error', error: e.message
    }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}

// ═══════════════════════ 3. BRAND AUTO-COMPLETE ══════════════════════════

async function runAutoComplete(db, env) {
  const runStart = new Date();
  const nowIso = runStart.toISOString();
  let totaalGevonden = 0;
  let totaalCompleted = 0;
  let foutCount = 0;
  const verwerkt = [];

  try {
    const statussen = ['live', 'paused'];
    let alleVerlopen = [];

    for (const status of statussen) {
      const result = await db.runQuery({
        from: [{ collectionId: 'campaigns' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'status' },    op: 'EQUAL',              value: { stringValue: status } } },
          { fieldFilter: { field: { fieldPath: 'eindDatum' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: nowIso } } }
        ] } },
        limit: AUTOCOMPLETE_BATCH_SIZE
      });

      const docs = (result || []).filter(r => r.document).map(r => docToObject(r.document)).filter(Boolean);
      alleVerlopen = alleVerlopen.concat(docs);
    }

    totaalGevonden = alleVerlopen.length;
    console.log(`[autocomplete] ${totaalGevonden} verlopen campagnes gevonden`);

    for (const camp of alleVerlopen) {
      try {
        await db.patchDoc(`campaigns/${camp._id}`, ['status', 'laatsteUpdate', 'autoCompletedAt', 'autoCompletedBy'], {
          status: 'completed',
          laatsteUpdate: runStart,
          autoCompletedAt: runStart,
          autoCompletedBy: 'worker:' + WORKER_VERSION
        });

        await db.addDoc('brand_admin_log', {
          type: 'campaign_auto_completed',
          campaignId: camp._id,
          brandId: camp.brandId || null,
          brandNaam: camp.brandNaam || null,
          naam: camp.naam || null,
          vorigeStatus: camp.status,
          eindDatum: camp.eindDatum instanceof Date ? camp.eindDatum.toISOString() : (camp.eindDatum || null),
          door: 'worker', ts: runStart.toISOString()
        }).catch(e => console.warn('[autocomplete] audit skip:', e.message));

        verwerkt.push({
          campaignId: camp._id, brandNaam: camp.brandNaam || null,
          naam: camp.naam || null, vorigeStatus: camp.status
        });
        totaalCompleted++;
      } catch (e) {
        foutCount++;
        console.error(`[autocomplete] Campagne ${camp._id} mislukt:`, e.message);
      }
    }
  } catch (e) {
    console.error('[autocomplete] Worker error:', e.message);
    await db.addDoc('brand_admin_log', {
      type: 'autocomplete_worker_error', bericht: e.message,
      door: 'worker', ts: runStart.toISOString()
    }).catch(() => {});
    return { status: 'error', bericht: e.message, duurMs: Date.now() - runStart.getTime() };
  }

  if (totaalCompleted > 0 || foutCount > 0) {
    await db.addDoc('brand_admin_log', {
      type: 'autocomplete_run_summary',
      totaalGevonden, totaalCompleted, foutCount,
      duurMs: Date.now() - runStart.getTime(),
      runAt: runStart.toISOString(),
      door: 'worker', ts: new Date().toISOString()
    }).catch(() => {});
  }

  console.log(`[autocomplete] Klaar: ${totaalCompleted}/${totaalGevonden} (${foutCount} fouten)`);
  return { status: 'ok', totaalGevonden, totaalCompleted, foutCount, verwerkt, duurMs: Date.now() - runStart.getTime() };
}

// ═══════════════════════ 4. STUDIO CLEANUP ══════════════════════════════

async function runStudioCleanup(db, env) {
  const runStart = new Date();
  const nowMs = runStart.getTime();
  const nowIso = runStart.toISOString();
  const maxAgeMs = parseInt(env.MAX_SESSION_MS || STUDIO_MAX_MS_DEFAULT);
  const staleMs  = parseInt(env.STALE_MS       || STUDIO_STALE_MS_DEFAULT);
  const deleteSubcollections = (env.DELETE_SUBCOLLECTIONS === 'true');

  let endedCount = 0;
  let subcollectionsDeleted = 0;
  const errors = [];

  try {
    const result = await db.runQuery({
      from: [{ collectionId: 'live_sessions' }],
      where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'live' } } },
      limit: STUDIO_BATCH_SIZE
    });

    for (const row of (result || [])) {
      if (!row.document) continue;
      const session = docToObject(row.document);
      if (!session) continue;

      const startedAt = session.startedAt instanceof Date ? session.startedAt.getTime() : null;
      const updateTime = session._updateTime ? new Date(session._updateTime).getTime() : null;

      let staleReason = null;
      if (startedAt && (nowMs - startedAt) > maxAgeMs) {
        staleReason = 'max_duration_exceeded';
      } else if (updateTime && (nowMs - updateTime) > staleMs) {
        staleReason = 'no_recent_activity';
      }
      if (!staleReason) continue;

      try {
        await db.patchDoc(`live_sessions/${session._id}`, ['status', 'endedAt', 'endedReason'], {
          status: 'ended', endedAt: nowIso, endedReason: 'auto_stale_' + staleReason
        });
        endedCount++;

        if (deleteSubcollections) {
          for (const sub of ['chat', 'reactions']) {
            try {
              const list = await db.listCollection(`live_sessions/${session._id}`, sub, 300);
              for (const d of (list.documents || [])) {
                const path = d.name.split('/documents/')[1];
                await db.deleteDoc(path).catch(() => {});
                subcollectionsDeleted++;
              }
            } catch (e) { errors.push(`subcol ${session._id}/${sub}: ${e.message}`); }
          }
        }
      } catch (e) {
        errors.push(`live_sessions/${session._id}: ${e.message}`);
      }
    }

    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'studio-cleanup',
      runAt: nowIso, duurMs: Date.now() - runStart.getTime(),
      status: errors.length === 0 ? 'ok' : 'partial',
      endedCount, subcollectionsDeleted, errorCount: errors.length,
      errors: errors.slice(0, 10)
    }).catch(() => {});

    console.log(`[studio-cleanup] ${endedCount} sessies gesloten, ${subcollectionsDeleted} sub-docs verwijderd, ${errors.length} fouten`);
    return { status: 'ok', endedCount, subcollectionsDeleted, errors: errors.slice(0, 10) };
  } catch (e) {
    console.error('[studio-cleanup] Fatale fout:', e.message);
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'studio-cleanup',
      runAt: nowIso, status: 'error', error: e.message
    }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}

// ═══════════════════════ 5. SCHEDULED LIVE REMINDERS + NO-SHOW ═══════

const SCHEDULE_REMINDER_WINDOW_MS = 15 * 60 * 1000; // T-15 min
const SCHEDULE_NO_SHOW_MS         = 30 * 60 * 1000; // no-show na +30min

async function runScheduleReminders(db, env) {
  const runStart = new Date();
  const nowMs = runStart.getTime();
  const nowIso = runStart.toISOString();
  let remindersSent = 0;
  let noShowsClosed = 0;
  const errors = [];

  try {
    // Query 1: scheduled sessies met scheduledFor in [now, now+30min]
    // → verstuur T-15 reminders naar subscribers die notified15min=false hebben
    const windowStart = new Date(nowMs - 5 * 60 * 1000).toISOString();       // -5 min grace
    const windowEnd   = new Date(nowMs + SCHEDULE_REMINDER_WINDOW_MS).toISOString();

    const upcoming = await db.runQuery({
      from: [{ collectionId: 'live_sessions' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'status' },       op: 'EQUAL',                value: { stringValue: 'scheduled' } } },
        { fieldFilter: { field: { fieldPath: 'scheduledFor' }, op: 'LESS_THAN_OR_EQUAL',   value: { timestampValue: windowEnd } } },
        { fieldFilter: { field: { fieldPath: 'scheduledFor' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: windowStart } } }
      ] } },
      limit: 100
    });

    for (const row of (upcoming || [])) {
      if (!row.document) continue;
      const s = docToObject(row.document);
      if (!s) continue;
      const scheduledMs = s.scheduledFor instanceof Date ? s.scheduledFor.getTime() : null;
      if (!scheduledMs) continue;
      // Alleen sessies binnen T-15 (of iets meer als eerste run vertraagd was)
      if (scheduledMs - nowMs > SCHEDULE_REMINDER_WINDOW_MS) continue;

      // Haal subscribers op die nog geen T-15 notif hebben
      const remRes = await db.listCollection(`live_sessions/${s._id}`, 'reminders', 200);
      const remDocs = (remRes.documents || []).map(d => docToObject(d)).filter(Boolean);
      const toNotify = remDocs.filter(r => r.notified15min !== true);
      if (toNotify.length === 0) continue;

      // Verstuur meldingen batch-gewijs (max 50 per commit is veilig)
      const whenLocal = new Date(scheduledMs).toISOString();
      for (let i = 0; i < toNotify.length; i += 50) {
        const chunk = toNotify.slice(i, i + 50);
        await Promise.all(chunk.map(async r => {
          try {
            await db.addDoc('meldingen', {
              userId: r.uid,
              reporterUid: r.uid,
              type: 'live_scheduled_soon',
              titel: '🔔 Bijna live!',
              bericht: (s.hostName || 'Iemand') + ' gaat over 15 minuten live: "' + (s.title || 'Live sessie') + '"',
              sessionId: s._id,
              hostUid: s.hostUid || null,
              hostName: s.hostName || null,
              scheduledFor: whenLocal,
              deeplink: '/?pagina=live&aankomend=' + s._id,
              gelezen: false,
              ts: nowIso
            });
            // Markeer reminder als notified
            await db.patchDoc(`live_sessions/${s._id}/reminders/${r.uid}`,
              ['notified15min', 'notified15minAt'],
              { notified15min: true, notified15minAt: nowIso }
            );
            remindersSent++;
          } catch (e) {
            errors.push(`reminder ${s._id}/${r.uid}: ${e.message}`);
          }
        }));
      }
    }

    // Query 2: scheduled sessies waarvan scheduledFor > 30 min geleden was en
    // host is niet écht live gegaan → auto-cancel als "no-show"
    const noShowThreshold = new Date(nowMs - SCHEDULE_NO_SHOW_MS).toISOString();
    const noShows = await db.runQuery({
      from: [{ collectionId: 'live_sessions' }],
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'status' },       op: 'EQUAL',           value: { stringValue: 'scheduled' } } },
        { fieldFilter: { field: { fieldPath: 'scheduledFor' }, op: 'LESS_THAN',        value: { timestampValue: noShowThreshold } } }
      ] } },
      limit: 50
    });

    for (const row of (noShows || [])) {
      if (!row.document) continue;
      const s = docToObject(row.document);
      if (!s) continue;
      try {
        await db.patchDoc(`live_sessions/${s._id}`, ['status', 'endedAt', 'endedReason'], {
          status: 'cancelled',
          endedAt: nowIso,
          endedReason: 'no_show_auto'
        });
        noShowsClosed++;

        // Notify subscribers: "helaas heeft de host de live niet opgestart"
        const remRes = await db.listCollection(`live_sessions/${s._id}`, 'reminders', 200);
        const remDocs = (remRes.documents || []).map(d => docToObject(d)).filter(Boolean);
        for (let i = 0; i < remDocs.length; i += 50) {
          const chunk = remDocs.slice(i, i + 50);
          await Promise.all(chunk.map(async r => {
            try {
              await db.addDoc('meldingen', {
                userId: r.uid,
                reporterUid: r.uid,
                type: 'live_no_show',
                titel: 'Live geannuleerd',
                bericht: 'Helaas heeft ' + (s.hostName || 'de host') + ' de geplande live "' + (s.title || 'sessie') + '" niet opgestart.',
                sessionId: s._id,
                hostUid: s.hostUid || null,
                hostName: s.hostName || null,
                gelezen: false,
                ts: nowIso
              });
            } catch (e) {
              errors.push(`no-show notify ${s._id}/${r.uid}: ${e.message}`);
            }
          }));
        }
      } catch (e) {
        errors.push(`no-show close ${s._id}: ${e.message}`);
      }
    }

    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'schedule-reminders',
      runAt: nowIso, duurMs: Date.now() - runStart.getTime(),
      status: errors.length === 0 ? 'ok' : 'partial',
      remindersSent, noShowsClosed, errorCount: errors.length,
      errors: errors.slice(0, 10)
    }).catch(() => {});

    console.log(`[schedule-reminders] sent=${remindersSent} noshow=${noShowsClosed} errors=${errors.length}`);
    return { status: 'ok', remindersSent, noShowsClosed, errors: errors.slice(0, 10) };
  } catch (e) {
    console.error('[schedule-reminders] Fatale fout:', e.message);
    await db.addDoc('worker_audit_log', {
      workerVersion: WORKER_VERSION, workerName: 'schedule-reminders',
      runAt: nowIso, status: 'error', error: e.message
    }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}
