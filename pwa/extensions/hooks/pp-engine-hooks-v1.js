/* ═══════════════════════════════════════════════════════════════════════
 * PaskamerPraat - Outfit AI Engine Hooks (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Prepareert de client-side API voor:
 *   - Outfit Review scoring  (ai_score)
 *   - AI Style Assistant     (ai_assist)
 *   - Similar Item matching  (similar_items)
 *
 * BELANGRIJK:
 *   - Deze module is NOG NIET gekoppeld aan UI.
 *   - Alleen hooks/API exposed via window.PP_Engine.
 *   - Server-side AI calls gaan via backend FastAPI /api/ai/*
 *   - Geen UI rendering - pure data fetch + cache.
 * ═══════════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var BACKEND_URL = (window.REACT_APP_BACKEND_URL || window.PP_BACKEND_URL || '').replace(/\/$/, '');
  if (!BACKEND_URL && window.location && window.location.origin) {
    // Fallback: assume backend on same origin under /api
    BACKEND_URL = window.location.origin;
  }

  // In-memory cache per session
  var _cache = {
    ai_scores:     {},   // outfitId → { score, breakdown, ts }
    similar_items: {},   // outfitId → { items, ts }
    style_advice:  {}    // sessionId → { messages, ts }
  };
  var CACHE_TTL = 5 * 60 * 1000; // 5 min

  function _cacheGet(map, key) {
    var v = map[key];
    if (!v) return null;
    if (Date.now() - v.ts > CACHE_TTL) { delete map[key]; return null; }
    return v;
  }

  // ── 1. OUTFIT REVIEW SCORING ──────────────────────────────────────────
  async function scoreOutfit(outfitId, imageUrl, opts) {
    if (!outfitId || !imageUrl) throw new Error('outfitId + imageUrl required');
    var cached = _cacheGet(_cache.ai_scores, outfitId);
    if (cached && !(opts && opts.force)) return cached;
    var res = await fetch(BACKEND_URL + '/api/ai/score-outfit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outfit_id: outfitId,
        image_url: imageUrl,
        context: (opts && opts.context) || {}
      })
    });
    if (!res.ok) throw new Error('scoreOutfit ' + res.status);
    var data = await res.json();
    var rec = { score: data.score, breakdown: data.breakdown, model: data.model, ts: Date.now() };
    _cache.ai_scores[outfitId] = rec;
    return rec;
  }

  // ── 2. AI STYLE ASSISTANT ─────────────────────────────────────────────
  async function askStyleAssistant(sessionId, message, opts) {
    if (!sessionId || !message) throw new Error('sessionId + message required');
    var res = await fetch(BACKEND_URL + '/api/ai/style-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message: message,
        user_context: (opts && opts.user_context) || {},
        image_url: (opts && opts.image_url) || null
      })
    });
    if (!res.ok) throw new Error('askStyleAssistant ' + res.status);
    return await res.json();
  }

  // ── 3. SIMILAR ITEMS ──────────────────────────────────────────────────
  async function findSimilarItems(outfitId, opts) {
    if (!outfitId) throw new Error('outfitId required');
    var cached = _cacheGet(_cache.similar_items, outfitId);
    if (cached && !(opts && opts.force)) return cached;
    var res = await fetch(BACKEND_URL + '/api/ai/similar-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outfit_id: outfitId,
        limit: (opts && opts.limit) || 12,
        category_filter: (opts && opts.category_filter) || null
      })
    });
    if (!res.ok) throw new Error('findSimilarItems ' + res.status);
    var data = await res.json();
    var rec = { items: data.items || [], ts: Date.now() };
    _cache.similar_items[outfitId] = rec;
    return rec;
  }

  // ── 4. EVENT LOGGING (gebruik bestaande campaign_events whitelist + nieuwe events) ──
  function logEngineEvent(type, payload) {
    if (!window.firebase || !window.firebase.firestore) return;
    var ALLOWED = ['outfit_view', 'outfit_review', 'ai_query', 'similar_view'];
    if (ALLOWED.indexOf(type) === -1) return;
    try {
      var db = window.firebase.firestore();
      db.collection('events').add({
        type: type,
        uid: (window.firebase.auth().currentUser || {}).uid || null,
        ts: window.firebase.firestore.FieldValue.serverTimestamp(),
        processed: false,
        metadata: payload || {}
      }).catch(function(){});
    } catch(e) {}
  }

  // ── Pre-scoring queue (voor batched AI calls) ─────────────────────────
  var _scoringQueue = [];
  var _scoringTimer = null;
  function queueScoring(outfitId, imageUrl) {
    _scoringQueue.push({ outfitId: outfitId, imageUrl: imageUrl });
    if (_scoringTimer) return;
    _scoringTimer = setTimeout(function() {
      var batch = _scoringQueue.splice(0, 10);
      _scoringTimer = null;
      batch.forEach(function(item) {
        scoreOutfit(item.outfitId, item.imageUrl).catch(function(){});
      });
    }, 3000);
  }

  function clearCache() {
    _cache.ai_scores = {};
    _cache.similar_items = {};
    _cache.style_advice = {};
  }

  window.PP_Engine = {
    scoreOutfit:         scoreOutfit,
    askStyleAssistant:   askStyleAssistant,
    findSimilarItems:    findSimilarItems,
    logEngineEvent:      logEngineEvent,
    queueScoring:        queueScoring,
    clearCache:          clearCache,
    VERSION:             '1.0.0'
  };
})();
