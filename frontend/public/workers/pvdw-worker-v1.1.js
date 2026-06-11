/**
 * POST VAN DE WEEK — Cloudflare Worker
 * DoubleYou / Paskamer Praat  •  v1.1.0 (februari 2026)
 *
 * WIJZIGINGEN T.O.V. v1.0.0:
 *   + Filter verborgen/gemodereerde posts (verborgen=true, modStatus='verwijderd'/'gerapporteerd')
 *   + DSP-bonus wordt nu OOK opgeteld bij users/{uid}.dsp_lifetime + dsp_seizoen
 *     via FieldTransform increment (atomic), zodat winnaar direct op leaderboard verschijnt
 *
 * GEEN andere wijzigingen — alle bestaande logica intact (idempotency, audit log,
 * timezone handling, week-bereik berekening).
 *
 * DEPLOY-INSTRUCTIES:
 *   1. Ga naar Cloudflare Dashboard → Workers & Pages → Workers
 *   2. Maak nieuwe Worker: "doubleyou-pvdw-worker" (of update bestaande)
 *   3. Plak deze code
 *   4. Sla Environment Variables op:
 *        FIREBASE_PROJECT_ID   = doubleyou-journal
 *        FIREBASE_SERVICE_KEY  = <base64-encoded service account JSON>
 *        WORKER_SECRET         = <random secret voor /run endpoint>
 *   5. Voeg Cron Trigger toe: "0 23 * * 0"  (zondag 23:00 UTC = maandag 00:00 AMS)
 *
 * FIRESTORE COLLECTIONS (alleen lezen/schrijven):
 *   - stories            (read)
 *   - weekly_rankings    (read/write)
 *   - worker_audit_log   (write)
 *   - dsp_log            (write)
 *   - users/{uid}        (increment dsp_lifetime + dsp_seizoen) ← NIEUW v1.1
 *
 * IDEMPOTENTIE:
 *   Elke run schrijft naar weekly_rankings/{weekId}
 *   Als {weekId} al bestaat met status='selected': run overgeslagen (idempotent)
 */

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const MIN_LIKES          = 25;       // minimum likes voor kwalificatie
const STORIES_BATCH_SIZE = 500;      // max posts per Firestore query-run
const DSP_BONUS          = 50;       // DSP punten voor winnaar
const TZ_OFFSET_MS       = 2 * 60 * 60 * 1000; // Europe/Amsterdam (CEST, UTC+2)
// Let op: gebruik UTC+1 (3600000) in winter (CET). Worker loopt zon 23:00 UTC.
// Bij twijfel: weekStart/End worden altijd server-side berekend op basis van weeknummer.

// ─────────────────────────────────────────────────────────────
// WEEK UTILITIES (ongewijzigd t.o.v. v1.0)
// ─────────────────────────────────────────────────────────────

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
  const weekStartUTC  = maandag.getTime() - amsOffsetMs;
  const weekEndUTC    = weekStartUTC + (7 * 86400000) - 1;
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
    const parts   = formatter.formatToParts(datum);
    const amsHour = parseInt(parts.find(p => p.type === 'hour').value);
    const diff    = ((amsHour - utcHour) + 24) % 24;
    return diff * 60 * 60 * 1000;
  } catch(e) {
    return 2 * 60 * 60 * 1000;
  }
}

// ─────────────────────────────────────────────────────────────
// FIREBASE REST API CLIENT
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
  get commitUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`;
  }

  async runQuery(query) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}:runQuery`;
    const res   = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ structuredQuery: query })
    });
    if (!res.ok) throw new Error(`Firestore query fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async getDoc(collection, docId) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}/${collection}/${docId}`;
    const res   = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getDoc fout: ${res.status}`);
    return res.json();
  }

  async setDoc(collection, docId, data) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}/${collection}/${docId}`;
    const body  = { fields: toFirestoreFields(data) };
    const res   = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`setDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async addDoc(collection, data) {
    const token = await this.getToken();
    const url   = `${this.baseUrl}/${collection}`;
    const body  = { fields: toFirestoreFields(data) };
    const res   = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`addDoc fout: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * v1.1 NIEUW — Atomaire field increment via commit endpoint.
   * Voorkomt race conditions wanneer winnaar gelijktijdig elders DSP krijgt.
   * fieldDeltas = { dsp_lifetime: 50, dsp_seizoen: 50 }
   */
  async incrementFields(collection, docId, fieldDeltas) {
    const token = await this.getToken();
    const docPath = `projects/${this.projectId}/databases/(default)/documents/${collection}/${docId}`;
    const fieldTransforms = Object.entries(fieldDeltas).map(([fieldPath, delta]) => ({
      fieldPath,
      increment: Number.isInteger(delta)
        ? { integerValue: String(delta) }
        : { doubleValue: delta }
    }));
    const body = {
      writes: [{
        transform: {
          document: docPath,
          fieldTransforms
        }
      }]
    };
    const res = await fetch(this.commitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`incrementFields fout: ${res.status} ${await res.text()}`);
    return res.json();
  }
}

// ─────────────────────────────────────────────────────────────
// FIRESTORE VALUE MARSHALLING (ongewijzigd)
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
  for (const [k, v] of Object.entries(firestoreDoc.fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

// ─────────────────────────────────────────────────────────────
// RULE ENGINE — Post van de Week selectie
// ─────────────────────────────────────────────────────────────

/**
 * v1.1: filter verborgen/gemodereerde posts UIT voordat selectie plaatsvindt.
 * Voorheen kon een door admin verwijderde/gerapporteerde post nog winnen.
 */
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
  kandidaten.sort(function(a, b) {
    if (b._likesCount !== a._likesCount) return b._likesCount - a._likesCount;
    return (a.tsMs || 0) - (b.tsMs || 0);
  });
  return kandidaten[0];
}

// ─────────────────────────────────────────────────────────────
// WORKER MAIN
// ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ts: new Date().toISOString(), version: 'v1.1.0' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/run' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      if (authHeader !== `Bearer ${env.WORKER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const resultaat = await runPvdwWorker(env);
      return new Response(JSON.stringify(resultaat, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Post van de Week Worker v1.1.0', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPvdwWorker(env));
  }
};

// ─────────────────────────────────────────────────────────────
// KERN: runPvdwWorker
// ─────────────────────────────────────────────────────────────

async function runPvdwWorker(env) {
  const runStart = new Date();
  const weekId   = vorigeWeekId(runStart);
  const bereik   = weekBereikVanId(weekId);
  let auditStatus = 'ok';
  let auditMsg    = '';
  let resultaat   = {};

  const db = new FirestoreClient(
    env.FIREBASE_PROJECT_ID,
    env.FIREBASE_SERVICE_KEY
  );

  try {
    const bestaand = await db.getDoc('weekly_rankings', weekId);
    if (bestaand && bestaand.fields) {
      const status = fromFirestoreValue(bestaand.fields.status);
      if (status === 'selected' || status === 'geen_winnaar') {
        auditStatus = 'skipped';
        auditMsg    = `Week ${weekId} al verwerkt (status: ${status})`;
        resultaat   = { skipped: true, weekId, status };
      } else {
        resultaat = await verwerkWeek(db, weekId, bereik);
        auditMsg  = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : 'Geen winnaar (< 25 likes of allen verborgen/gemodereerd)';
      }
    } else {
      resultaat = await verwerkWeek(db, weekId, bereik);
      auditMsg  = resultaat.winnaar ? `Winnaar: ${resultaat.winnaar.postId} (${resultaat.winnaar.likesCount} likes)` : 'Geen winnaar (< 25 likes of allen verborgen/gemodereerd)';
    }
  } catch(e) {
    auditStatus = 'error';
    auditMsg    = e.message;
    resultaat   = { error: e.message };
    await db.setDoc('weekly_rankings', weekId, {
      weekId,
      status: 'pending',
      error: e.message,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }

  await db.addDoc('worker_audit_log', {
    weekId,
    runAt:       runStart.toISOString(),
    duurMs:      Date.now() - runStart.getTime(),
    status:      auditStatus,
    bericht:     auditMsg,
    weekStart:   bereik.startIso,
    weekEnd:     bereik.endIso,
    workerVersion: 'v1.1.0',
  }).catch(e => console.error('[pvdw] audit log schrijven mislukt:', e.message));

  console.log(`[pvdw] Week ${weekId}: ${auditStatus} — ${auditMsg}`);
  return { weekId, status: auditStatus, bericht: auditMsg, ...resultaat };
}

// ─────────────────────────────────────────────────────────────
// verwerkWeek: fetch → filter → select → persist
// ─────────────────────────────────────────────────────────────

async function verwerkWeek(db, weekId, bereik) {
  await db.setDoc('weekly_rankings', weekId, {
    weekId,
    status:    'pending',
    weekStart: bereik.startIso,
    weekEnd:   bereik.endIso,
    updatedAt: new Date().toISOString(),
  });

  const queryResult = await db.runQuery({
    from: [{ collectionId: 'stories' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'tsMs' },
              op: 'GREATER_THAN_OR_EQUAL',
              value: { integerValue: String(bereik.start.getTime()) }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: 'tsMs' },
              op: 'LESS_THAN_OR_EQUAL',
              value: { integerValue: String(bereik.end.getTime()) }
            }
          }
        ]
      }
    },
    limit: STORIES_BATCH_SIZE
  });

  const posts = (queryResult || [])
    .filter(r => r.document)
    .map(r => {
      const obj = docToObject(r.document);
      if (!obj) return null;
      const likesObj = (obj.likes && typeof obj.likes === 'object') ? obj.likes : {};
      obj._likesCount = Object.keys(likesObj).length;
      return obj;
    })
    .filter(Boolean);

  // v1.1: tellen voor audit/log
  const totaal           = posts.length;
  const verborgenCount   = posts.filter(p => p.verborgen === true).length;
  const gemodereerdCount = posts.filter(p => p.modStatus === 'verwijderd' || p.modStatus === 'gerapporteerd' || p.modStatus === 'blocked').length;
  const eligibleVoorRank = posts.filter(isPostEligible);

  console.log(`[pvdw] Week ${weekId}: ${totaal} totaal, ${verborgenCount} verborgen, ${gemodereerdCount} gemodereerd, ${eligibleVoorRank.length} eligible (≥${MIN_LIKES} likes, niet verborgen, niet gemodereerd)`);

  const eligiblePosts = eligibleVoorRank.map(p => ({
    postId:     p._id,
    likesCount: p._likesCount,
    authorId:   p.userId || p.authorId || null,
    authorName: p.authorName || p.displayName || null,
    createdAt:  p.createdAt || null,
    tsMs:       p.tsMs || null,
  }));

  const winnaar = selecteerWinnaar(posts);

  if (!winnaar) {
    await db.setDoc('weekly_rankings', weekId, {
      weekId,
      status:            'geen_winnaar',
      weekStart:         bereik.startIso,
      weekEnd:           bereik.endIso,
      totaalPosts:       totaal,
      verborgenPosts:    verborgenCount,
      gemodereerdPosts:  gemodereerdCount,
      eligiblePosts:     eligiblePosts,
      updatedAt:         new Date().toISOString(),
    });
    return { winnaar: null, totaalPosts: totaal, eligiblePosts };
  }

  const winnaarsData = {
    weekId,
    status:            'selected',
    postId:            winnaar._id,
    likesCount:        winnaar._likesCount,
    authorId:          winnaar.userId || winnaar.authorId || null,
    authorName:        winnaar.authorName || winnaar.displayName || null,
    postCreatedAt:     winnaar.createdAt || null,
    weekStart:         bereik.startIso,
    weekEnd:           bereik.endIso,
    totaalPosts:       totaal,
    verborgenPosts:    verborgenCount,
    gemodereerdPosts:  gemodereerdCount,
    eligiblePosts:     eligiblePosts,
    selectedAt:        new Date().toISOString(),
    updatedAt:         new Date().toISOString(),
  };
  await db.setDoc('weekly_rankings', weekId, winnaarsData);

  // ── DSP-bonus uitkeren ──────────────────────────────────────
  const auteurId = winnaar.userId || winnaar.authorId;
  if (auteurId) {
    // 1. dsp_log (audit trail) — bestaand gedrag
    await db.addDoc('dsp_log', {
      uid:     auteurId,
      actie:   'pvdw_winnaar',
      pts:     DSP_BONUS,
      label:   `Post van de Week (${weekId}) — ${DSP_BONUS} DSP bonus`,
      postId:  winnaar._id,
      weekId,
      ts:      new Date().toISOString(),
    }).catch(e => console.error('[pvdw] DSP bonus dsp_log schrijven mislukt:', e.message));

    // 2. v1.1 NIEUW — atomic increment van users/{uid}.dsp_lifetime + dsp_seizoen
    //    Zonder dit verschijnt de winnaar niet op de leaderboard.
    await db.incrementFields('users', auteurId, {
      dsp_lifetime: DSP_BONUS,
      dsp_seizoen:  DSP_BONUS
    }).catch(e => console.error('[pvdw] DSP totals increment mislukt:', e.message));

    console.log(`[pvdw] DSP bonus uitgekeerd aan ${auteurId}: +${DSP_BONUS} (lifetime + seizoen)`);
  }

  return { winnaar: winnaarsData, totaalPosts: totaal, eligiblePosts };
}
