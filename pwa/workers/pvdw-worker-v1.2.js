/**
 * POST VAN DE WEEK — Cloudflare Worker
 * DoubleYou / Paskamer Praat  •  v1.2.0 (februari 2026)
 *
 * v1.2.0 wijzigingen:
 *   + notifyAdmin()    → brand_admin_log entry
 *   + notifyWinnaar()  → meldingen entry (in-app)
 *   + sendAdminMail()  → mail/{id} doc (Firebase Trigger Email)
 *
 * Env Variables (Cloudflare Dashboard):
 *   FIREBASE_PROJECT_ID   = doubleyou-journal
 *   FIREBASE_SERVICE_KEY  = <base64 service account JSON>
 *   WORKER_SECRET         = <random secret voor /run>
 *   WORKER_ADMIN_EMAIL    = admin@paskamerpraat.nl  (optioneel)
 *   WORKER_APP_URL        = https://paskamerpraat.nl (optioneel)
 *
 * Cron: "0 23 * * 0"  (zondag 23:00 UTC = maandag 00:00 NL in winter)
 */

const MIN_LIKES          = 25;
const STORIES_BATCH_SIZE = 500;
const DSP_BONUS          = 50;

// ─── WEEK UTILS ─────────────────────────────────────────────

function vorigeWeekId(nu) {
  const gisteren = new Date(nu.getTime() - 24 * 60 * 60 * 1000);
  return isoWeekId(gisteren);
}

function isoWeekId(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const dag = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dag);
  const jaarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNr = Math.ceil((((d - jaarStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNr).padStart(2, '0');
}

function weekBereikVanId(weekId) {
  const [jaarStr, weekStr] = weekId.split('-W');
  const jaar = parseInt(jaarStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(Date.UTC(jaar, 0, 4));
  const jan4Dag = jan4.getUTCDay() || 7;
  const maandagW1 = new Date(jan4.getTime() - (jan4Dag - 1) * 86400000);
  const maandag = new Date(maandagW1.getTime() + (week - 1) * 7 * 86400000);
  const amsOffsetMs = getAmsOffset(maandag);
  const weekStartUTC = maandag.getTime() - amsOffsetMs;
  const weekEndUTC   = weekStartUTC + (7 * 86400000) - 1;
  return {
    start: new Date(weekStartUTC),
    end:   new Date(weekEndUTC),
    startIso: new Date(weekStartUTC).toISOString(),
    endIso:   new Date(weekEndUTC).toISOString(),
  };
}

function getAmsOffset(datum) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam',
      hour: 'numeric', hour12: false,
      timeZoneName: 'short'
    });
    const utcHour = datum.getUTCHours();
    const parts = formatter.formatToParts(datum);
    const amsHour = parseInt(parts.find(p => p.type === 'hour').value);
    const diff = ((amsHour - utcHour) + 24) % 24;
    return diff * 60 * 60 * 1000;
  } catch(e) {
    return 2 * 60 * 60 * 1000;
  }
}

// ─── FIRESTORE CLIENT ───────────────────────────────────────
class FirestoreClient {
  constructor(projectId, serviceKeyBase64) {
    this.projectId = projectId; this.serviceKeyBase64 = serviceKeyBase64;
    this._token = null; this._tokenExp = 0;
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
    this._token = data.access_token; this._tokenExp = nu + data.expires_in;
    return this._token;
  }
  async _maakJWT(key) {
    const nu = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = { iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: nu, exp: nu + 3600 };
    const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const toSign = b64url(header) + '.' + b64url(payload);
    const pemBody = key.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
    const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('pkcs8', keyBytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(toSign));
    const b64sig = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    return toSign + '.' + b64sig;
  }
  get baseUrl() { return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`; }
  get commitUrl() { return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`; }
  async runQuery(query) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}:runQuery`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: query }) });
    if (!res.ok) throw new Error(`Firestore query fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
  async getDoc(collection, docId) {
    const token = await this.getToken();
    const res = await fetch(`${this.baseUrl}/${collection}/${docId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getDoc fout: ${res.status}`);
    return res.json();
  }
  async setDoc(collection, docId, data) {
    const token = await this.getToken();
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(`${this.baseUrl}/${collection}/${docId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`setDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
  async addDoc(collection, data) {
    const token = await this.getToken();
    const body = { fields: toFirestoreFields(data) };
    const res = await fetch(`${this.baseUrl}/${collection}`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`addDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
  async incrementFields(collection, docId, fieldDeltas) {
    const token = await this.getToken();
    const docPath = `projects/${this.projectId}/databases/(default)/documents/${collection}/${docId}`;
    const fieldTransforms = Object.entries(fieldDeltas).map(([fieldPath, delta]) => ({ fieldPath, increment: Number.isInteger(delta) ? { integerValue: String(delta) } : { doubleValue: delta } }));
    const body = { writes: [{ transform: { document: docPath, fieldTransforms } }] };
    const res = await fetch(this.commitUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`incrementFields fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

function toFirestoreFields(obj) { const fields = {}; for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v); return fields; }
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
  if ('mapValue' in v) { const out = {}; for (const [k, fv] of Object.entries(v.mapValue.fields || {})) out[k] = fromFirestoreValue(fv); return out; }
  return null;
}
function docToObject(d) { if (!d || !d.fields) return null; const obj = { _id: d.name ? d.name.split('/').pop() : null }; for (const [k, v] of Object.entries(d.fields)) obj[k] = fromFirestoreValue(v); return obj; }

// ─── RULE ENGINE ────────────────────────────────────────────
function isPostEligible(p) {
  if (!p) return false;
  if (p.verborgen === true) return false;
  if (p.modStatus === 'verwijderd') return false;
  if (p.modStatus === 'gerapporteerd') return false;
  if (p.modStatus === 'blocked') return false;
  if (p._likesCount < MIN_LIKES) return false;
  return true;
}
function selecteerWinnaar(posts) {
  const kandidaten = posts.filter(isPostEligible);
  if (kandidaten.length === 0) return null;
  kandidaten.sort((a, b) => (b._likesCount !== a._likesCount) ? b._likesCount - a._likesCount : (a.tsMs || 0) - (b.tsMs || 0));
  return kandidaten[0];
}

// ─── v1.2 NOTIFICATIONS ─────────────────────────────────────
async function notifyAdmin(db, winnaar, weekId, bereik) {
  try {
    await db.addDoc('brand_admin_log', {
      actie: 'pvdw_winnaar_geselecteerd', weekId,
      weekStart: bereik.startIso, weekEnd: bereik.endIso,
      winnaarUid: winnaar.userId || winnaar.authorId || null,
      winnaarNaam: winnaar.authorName || winnaar.displayName || 'Onbekend',
      postId: winnaar._id, likesCount: winnaar._likesCount, dspBonus: DSP_BONUS,
      redenWinst: `Hoogste likes-score (${winnaar._likesCount}) in week ${weekId}, ≥${MIN_LIKES} likes drempel gepasseerd, niet verborgen/gemodereerd`,
      gelezen: false, loggedBy: 'pvdw-worker-v1.2.0', ts: new Date().toISOString(),
    });
  } catch (e) { console.error('[pvdw] admin notification mislukt:', e.message); }
}

async function notifyWinnaar(db, winnaar, weekId, bereik, appUrl) {
  const uid = winnaar.userId || winnaar.authorId;
  if (!uid) return;
  try {
    const deeplink = (appUrl || 'https://paskamerpraat.nl') + '/post-van-de-week?week=' + encodeURIComponent(weekId);
    await db.addDoc('meldingen', {
      userId: uid, reporterUid: uid, type: 'pvdw_winnaar',
      titel: '🏆 Je hebt Post van de Week gewonnen!',
      bericht: `Gefeliciteerd! Jouw post heeft ${winnaar._likesCount} likes gekregen en is de Post van de Week (${weekId}). Je hebt ${DSP_BONUS} DSP-punten verdiend.`,
      weekId, weekStart: bereik.startIso, weekEnd: bereik.endIso,
      postId: winnaar._id, likesCount: winnaar._likesCount, dspBonus: DSP_BONUS,
      deeplink, gelezen: false, ts: new Date().toISOString(),
    });
  } catch (e) { console.error('[pvdw] winnaar notification mislukt:', e.message); }
}

async function sendAdminMail(db, adminEmail, winnaar, weekId, bereik) {
  if (!adminEmail) return;
  try {
    const uid = winnaar.userId || winnaar.authorId || 'onbekend';
    const naam = winnaar.authorName || winnaar.displayName || 'Onbekend';
    const subject = `[Paskamer Praat] Post van de Week winnaar — ${weekId}`;
    const html = `<h2>Post van de Week — winnaar geselecteerd</h2><p><strong>Week:</strong> ${weekId} (${bereik.startIso.slice(0,10)} t/m ${bereik.endIso.slice(0,10)})</p><p><strong>Winnaar:</strong> ${naam} (uid: <code>${uid}</code>)</p><p><strong>Post:</strong> <code>${winnaar._id}</code></p><p><strong>Likes:</strong> ${winnaar._likesCount}</p><p><strong>DSP-bonus uitgekeerd:</strong> ${DSP_BONUS}</p><p><strong>Reden:</strong> Hoogste likes ≥ ${MIN_LIKES}, niet verborgen/gemodereerd</p><hr><p style="color:#888;font-size:12px">Automatisch verzonden door pvdw-worker v1.2.0</p>`;
    await db.addDoc('mail', { to: [adminEmail], message: { subject, html, text: `Winnaar Post van de Week ${weekId}: ${naam} (${uid}) — post ${winnaar._id} met ${winnaar._likesCount} likes. DSP +${DSP_BONUS}.` } });
  } catch (e) { console.error('[pvdw] admin mail mislukt:', e.message); }
}

// ─── WORKER MAIN ────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response(JSON.stringify({ status: 'ok', ts: new Date().toISOString(), version: 'v1.2.0' }), { headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/run' && request.method === 'POST') {
      if ((request.headers.get('Authorization') || '') !== `Bearer ${env.WORKER_SECRET}`) return new Response('Unauthorized', { status: 401 });
      return new Response(JSON.stringify(await runPvdwWorker(env), null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Post van de Week Worker v1.2.0', { status: 200 });
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(runPvdwWorker(env)); }
};

async function runPvdwWorker(env) {
  const runStart = new Date();
  const weekId = vorigeWeekId(runStart);
  const bereik = weekBereikVanId(weekId);
  let auditStatus = 'ok', auditMsg = '', resultaat = {};
  const db = new FirestoreClient(env.FIREBASE_PROJECT_ID, env.FIREBASE_SERVICE_KEY);
  try {
    const bestaand = await db.getDoc('weekly_rankings', weekId);
    if (bestaand && bestaand.fields) {
      const status = fromFirestoreValue(bestaand.fields.status);
      if (status === 'selected' || status === 'geen_winnaar') {
        auditStatus = 'skipped'; auditMsg = `Week ${weekId} al verwerkt (status: ${status})`;
        resultaat = { skipped: true, weekId, status };
      } else {
        resultaat = await verwerkWeek(db, weekId, bereik, env);
        auditMsg = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : `Geen winnaar (< ${MIN_LIKES} likes of allen verborgen/gemodereerd)`;
      }
    } else {
      resultaat = await verwerkWeek(db, weekId, bereik, env);
      auditMsg = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : `Geen winnaar (< ${MIN_LIKES} likes of allen verborgen/gemodereerd)`;
    }
  } catch(e) {
    auditStatus = 'error'; auditMsg = e.message; resultaat = { error: e.message };
    await db.setDoc('weekly_rankings', weekId, { weekId, status: 'pending', error: e.message, updatedAt: new Date().toISOString() }).catch(() => {});
  }
  await db.addDoc('worker_audit_log', {
    weekId, runAt: runStart.toISOString(), duurMs: Date.now() - runStart.getTime(),
    status: auditStatus, bericht: auditMsg, weekStart: bereik.startIso, weekEnd: bereik.endIso,
    workerVersion: 'v1.2.0'
  }).catch(e => console.error('[pvdw] audit log schrijven mislukt:', e.message));
  return { weekId, status: auditStatus, bericht: auditMsg, ...resultaat };
}

async function verwerkWeek(db, weekId, bereik, env) {
  await db.setDoc('weekly_rankings', weekId, { weekId, status: 'pending', weekStart: bereik.startIso, weekEnd: bereik.endIso, updatedAt: new Date().toISOString() });
  const queryResult = await db.runQuery({
    from: [{ collectionId: 'stories' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'tsMs' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(bereik.start.getTime()) } } },
      { fieldFilter: { field: { fieldPath: 'tsMs' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(bereik.end.getTime()) } } }
    ] } },
    limit: STORIES_BATCH_SIZE
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
  const eligibleVoorRank = posts.filter(isPostEligible);
  const eligiblePosts = eligibleVoorRank.map(p => ({ postId: p._id, likesCount: p._likesCount, authorId: p.userId || p.authorId || null, authorName: p.authorName || p.displayName || null, createdAt: p.createdAt || null, tsMs: p.tsMs || null }));
  const winnaar = selecteerWinnaar(posts);
  if (!winnaar) {
    await db.setDoc('weekly_rankings', weekId, { weekId, status: 'geen_winnaar', weekStart: bereik.startIso, weekEnd: bereik.endIso, totaalPosts: totaal, verborgenPosts: verborgenCount, gemodereerdPosts: gemodereerdCount, eligiblePosts, updatedAt: new Date().toISOString() });
    try { await db.addDoc('brand_admin_log', { actie: 'pvdw_geen_winnaar', weekId, weekStart: bereik.startIso, weekEnd: bereik.endIso, totaalPosts: totaal, reden: `Geen post haalde de ${MIN_LIKES}-likes drempel (of allen verborgen/gemodereerd)`, gelezen: false, loggedBy: 'pvdw-worker-v1.2.0', ts: new Date().toISOString() }); } catch (e) {}
    return { winnaar: null, totaalPosts: totaal, eligiblePosts };
  }
  const winnaarsData = { weekId, status: 'selected', postId: winnaar._id, likesCount: winnaar._likesCount, authorId: winnaar.userId || winnaar.authorId || null, authorName: winnaar.authorName || winnaar.displayName || null, postCreatedAt: winnaar.createdAt || null, weekStart: bereik.startIso, weekEnd: bereik.endIso, totaalPosts: totaal, verborgenPosts: verborgenCount, gemodereerdPosts: gemodereerdCount, eligiblePosts, selectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await db.setDoc('weekly_rankings', weekId, winnaarsData);
  const auteurId = winnaar.userId || winnaar.authorId;
  if (auteurId) {
    await db.addDoc('dsp_log', { uid: auteurId, actie: 'pvdw_winnaar', pts: DSP_BONUS, label: `Post van de Week (${weekId}) — ${DSP_BONUS} DSP bonus`, postId: winnaar._id, weekId, ts: new Date().toISOString() }).catch(e => console.error('[pvdw] dsp_log fout:', e.message));
    await db.incrementFields('users', auteurId, { dsp_lifetime: DSP_BONUS, dsp_seizoen: DSP_BONUS }).catch(e => console.error('[pvdw] DSP totals fout:', e.message));
  }
  await Promise.all([
    notifyAdmin(db, winnaar, weekId, bereik),
    notifyWinnaar(db, winnaar, weekId, bereik, env.WORKER_APP_URL),
    sendAdminMail(db, env.WORKER_ADMIN_EMAIL, winnaar, weekId, bereik)
  ]);
  return { winnaar: winnaarsData, totaalPosts: totaal, eligiblePosts };
}
