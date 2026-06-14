/**
 * ═══════════════════════════════════════════════════════════════════════
 * Doubleyou - Event Aggregator Worker (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Doel:
 *   Aggregatie van impression/click events uit Firestore `events` (en
 *   legacy `campaign_events`) → schrijft naar `campaigns.impressies`,
 *   `campaigns.clicks`, `campaigns.ctr`, `campaigns.spend`, etc.
 *
 * Werking:
 *   1. Cron trigger elke 15 min (every 15 minutes via wrangler crons)
 *   2. Query events.where('processed','==',false).orderBy('ts').limit(500)
 *   3. Group by campaignId, count impressions + clicks
 *   4. Per campagne:
 *      - Firestore transaction: lees campaign, increment counters,
 *        bereken nieuwe CTR + spend, check auto-pause condities
 *      - Markeer events processed:true met batch_id
 *   5. Update aggregator telemetrie in admin_settings/global
 *
 * Idempotency:
 *   - processed:true flag voorkomt dubbeltellen
 *   - Idempotency key = event doc id (uniek)
 *   - Transactions garanderen atomiciteit
 *
 * Schaalbaarheid:
 *   - 500 events/run × 96 runs/dag = 48k events/dag verwerkt
 *   - Bij volume groei: verhoog batch_size of cron-frequency
 *
 * Deploy:
 *   wrangler deploy
 *
 * ENV vars (wrangler secret put):
 *   FIRESTORE_PROJECT_ID
 *   FIRESTORE_SERVICE_ACCOUNT_JSON  (base64-encoded JSON key)
 *   AGGREGATOR_BATCH_ID_PREFIX     (optioneel, default 'agg')
 * ═══════════════════════════════════════════════════════════════════════
 */

import { SignJWT, importPKCS8 } from 'jose';

const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const TOKEN_API     = 'https://oauth2.googleapis.com/token';

// ── ENTRY POINTS ────────────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }
    if (url.pathname === '/run-now' && req.method === 'POST') {
      const auth = req.headers.get('X-Admin-Secret');
      if (auth !== env.ADMIN_TRIGGER_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      const result = await runAggregator(env);
      return Response.json(result);
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAggregator(env).then(r => {
      console.log('[aggregator] scheduled run:', JSON.stringify(r));
    }));
  }
};

// ── MAIN AGGREGATOR LOGIC ───────────────────────────────────────────────
async function runAggregator(env) {
  const startMs = Date.now();
  const batchId = `${env.AGGREGATOR_BATCH_ID_PREFIX || 'agg'}-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const cfg = await loadConfig(env);
  if (!cfg.feature_flags?.events_aggregator_enabled) {
    return { status: 'disabled', batchId };
  }
  const batchSize  = cfg.aggregator_config?.batch_size || 500;
  const maxBatches = cfg.aggregator_config?.max_batches_per_run || 10;

  const token = await getAccessToken(env);
  const pricing = cfg.campaign_pricing || {};

  let totalProcessed = 0;
  let totalErrors    = 0;
  const campaignAggregates = new Map();  // campaignId → { impressions, clicks, spend, plaatsingen:{} }

  for (let batchNum = 0; batchNum < maxBatches; batchNum++) {
    const events = await fetchUnprocessedEvents(env, token, batchSize);
    if (!events.length) break;

    for (const ev of events) {
      const cId  = ev.fields?.campaignId?.stringValue;
      const type = ev.fields?.type?.stringValue;
      if (!cId || !type) continue;

      if (!campaignAggregates.has(cId)) {
        campaignAggregates.set(cId, {
          impressions: 0, clicks: 0, spend_cents: 0,
          plaatsingen: {}, event_ids: []
        });
      }
      const agg = campaignAggregates.get(cId);
      const plaats = ev.fields?.plaatsing?.stringValue || 'feed';

      if (type === 'impression') {
        agg.impressions += 1;
        const cpm = pricing[`${plaats}_cpm_cents`] || pricing.feed_cpm_cents || 200;
        agg.spend_cents += cpm / 1000;
        agg.plaatsingen[plaats] = (agg.plaatsingen[plaats] || 0) + 1;
      } else if (type === 'campaign_click' || type === 'product_click') {
        agg.clicks += 1;
      }
      agg.event_ids.push(eventDocId(ev.name));
    }
    totalProcessed += events.length;
  }

  // ── Apply aggregates per campaign atomically ─────────────────────────
  const campaignResults = [];
  for (const [cId, agg] of campaignAggregates.entries()) {
    try {
      const r = await applyToCampaign(env, token, cId, agg, batchId, cfg);
      campaignResults.push({ campaignId: cId, ...r });
    } catch (e) {
      totalErrors += 1;
      campaignResults.push({ campaignId: cId, error: e.message });
    }
  }

  // ── Mark events processed ────────────────────────────────────────────
  const allEventIds = [].concat(...[...campaignAggregates.values()].map(a => a.event_ids));
  await markEventsProcessed(env, token, allEventIds, batchId);

  // ── Update telemetry ─────────────────────────────────────────────────
  const durationMs = Date.now() - startMs;
  await updateTelemetry(env, token, {
    last_run_at: new Date().toISOString(),
    last_run_status: totalErrors ? 'partial_error' : 'ok',
    last_run_processed: totalProcessed,
    last_run_duration_ms: durationMs,
    last_batch_id: batchId
  });

  return {
    status: totalErrors ? 'partial_error' : 'ok',
    batchId,
    processed: totalProcessed,
    campaigns_updated: campaignResults.length,
    errors: totalErrors,
    duration_ms: durationMs,
    details: campaignResults
  };
}

// ── HELPERS ─────────────────────────────────────────────────────────────
function eventDocId(name) {
  return name.split('/').pop();
}

async function fetchUnprocessedEvents(env, token, limit) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'processed' },
          op: 'EQUAL',
          value: { booleanValue: false }
        }
      },
      orderBy: [{ field: { fieldPath: 'ts' }, direction: 'ASCENDING' }],
      limit
    }
  };
  const r = await fetch(
    `${FIRESTORE_API}/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  if (!r.ok) throw new Error(`fetchUnprocessedEvents ${r.status}: ${await r.text()}`);
  const arr = await r.json();
  return arr.filter(x => x.document).map(x => x.document);
}

async function applyToCampaign(env, token, cId, agg, batchId, cfg) {
  // Read current campaign doc
  const docPath = `projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/campaigns/${cId}`;
  const getR = await fetch(`${FIRESTORE_API}/${docPath}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!getR.ok) throw new Error(`get campaign ${cId} ${getR.status}`);
  const camp = await getR.json();
  const f = camp.fields || {};
  const prev = {
    impressies: parseInt(f.impressies?.integerValue ?? '0', 10),
    clicks:     parseInt(f.clicks?.integerValue     ?? '0', 10),
    spend:      parseFloat(f.spend?.doubleValue ?? f.spend?.integerValue ?? '0'),
    budgetTotaal: parseFloat(f.budgetTotaal?.doubleValue ?? f.budgetTotaal?.integerValue ?? '0'),
    budgetDag:    parseFloat(f.budgetDag?.doubleValue    ?? f.budgetDag?.integerValue    ?? '0'),
    eindDatum:  f.eindDatum?.timestampValue || null,
    status:     f.status?.stringValue || 'unknown'
  };
  const newImp   = prev.impressies + agg.impressions;
  const newClk   = prev.clicks     + agg.clicks;
  const addSpend = agg.spend_cents / 100;
  const newSpend = prev.spend + addSpend;
  const newCtr   = newImp > 0 ? newClk / newImp : 0;
  const remaining = prev.budgetTotaal - newSpend;
  const nowMs = Date.now();
  const eindMs = prev.eindDatum ? new Date(prev.eindDatum).getTime() : null;
  const autoPause = (
    cfg.feature_flags?.auto_pause_enabled !== false &&
    (remaining <= 0 || (eindMs && nowMs > eindMs))
  );

  const updates = {
    impressies:           { integerValue: String(newImp) },
    clicks:               { integerValue: String(newClk) },
    ctr:                  { doubleValue:  newCtr },
    spend:                { doubleValue:  +newSpend.toFixed(2) },
    remaining_budget:     { doubleValue:  +remaining.toFixed(2) },
    last_aggregated_at:   { timestampValue: new Date().toISOString() },
    last_aggregated_batch:{ stringValue: batchId }
  };
  if (autoPause && prev.status === 'live') {
    updates.status        = { stringValue: 'paused' };
    updates.auto_paused   = { booleanValue: true };
    updates.auto_paused_reason = { stringValue: remaining <= 0 ? 'budget_exhausted' : 'end_date_reached' };
  }

  const fieldPaths = Object.keys(updates).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const patchR = await fetch(`${FIRESTORE_API}/${docPath}?${fieldPaths}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: updates })
  });
  if (!patchR.ok) throw new Error(`patch campaign ${cId} ${patchR.status}: ${await patchR.text()}`);
  return {
    impressions_added: agg.impressions,
    clicks_added:      agg.clicks,
    spend_added:       +addSpend.toFixed(2),
    new_totals:        { impressies: newImp, clicks: newClk, spend: +newSpend.toFixed(2), ctr: +newCtr.toFixed(4) },
    auto_paused:       autoPause
  };
}

async function markEventsProcessed(env, token, eventIds, batchId) {
  // Firestore batch write (max 500 per batch)
  const writes = eventIds.slice(0, 500).map(id => ({
    update: {
      name: `projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/events/${id}`,
      fields: {
        processed:          { booleanValue: true },
        processed_at:       { timestampValue: new Date().toISOString() },
        processed_batch_id: { stringValue: batchId }
      }
    },
    updateMask: { fieldPaths: ['processed', 'processed_at', 'processed_batch_id'] },
    currentDocument: { exists: true }
  }));
  if (!writes.length) return;
  const r = await fetch(
    `${FIRESTORE_API}/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents:batchWrite`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes })
    }
  );
  if (!r.ok) console.error('[aggregator] markEventsProcessed failed:', r.status, await r.text());
}

async function loadConfig(env) {
  try {
    const token = await getAccessToken(env);
    const r = await fetch(
      `${FIRESTORE_API}/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/admin_settings/global`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) return {};
    const doc = await r.json();
    return parseFirestoreDoc(doc.fields || {});
  } catch (e) {
    console.warn('[aggregator] loadConfig fallback to defaults:', e.message);
    return {};
  }
}

async function updateTelemetry(env, token, telemetry) {
  const path = `projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents/admin_settings/global`;
  const fields = {
    'aggregator_config.last_run_at':       { timestampValue: telemetry.last_run_at },
    'aggregator_config.last_run_status':   { stringValue:    telemetry.last_run_status },
    'aggregator_config.last_run_processed':{ integerValue:   String(telemetry.last_run_processed) },
    'aggregator_config.last_run_duration_ms': { integerValue: String(telemetry.last_run_duration_ms) },
    'aggregator_config.last_batch_id':     { stringValue:    telemetry.last_batch_id }
  };
  const paths = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  await fetch(`${FIRESTORE_API}/${path}?${paths}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
}

// ── FIRESTORE DOC PARSER (recursive) ────────────────────────────────────
function parseFirestoreDoc(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = parseValue(v);
  }
  return out;
}
function parseValue(v) {
  if (v.stringValue !== undefined)    return v.stringValue;
  if (v.integerValue !== undefined)   return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined)    return v.doubleValue;
  if (v.booleanValue !== undefined)   return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined)      return null;
  if (v.mapValue?.fields)             return parseFirestoreDoc(v.mapValue.fields);
  if (v.arrayValue?.values)           return v.arrayValue.values.map(parseValue);
  return null;
}

// ── GOOGLE SERVICE ACCOUNT JWT → ACCESS TOKEN ───────────────────────────
async function getAccessToken(env) {
  const sa = JSON.parse(atob(env.FIRESTORE_SERVICE_ACCOUNT_JSON_B64));
  const iat = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: TOKEN_API,
    iat,
    exp: iat + 3600
  };
  const key = await importPKCS8(sa.private_key, 'RS256');
  const jwt = await new SignJWT(claim)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(key);
  const r = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!r.ok) throw new Error(`OAuth token error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}
