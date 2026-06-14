// ═══════════════════════════════════════════════════════════════════
// Paskamer Praat - AI Fit Assistant Chat v1
// Claude Sonnet 4.5 chat met community-context (RAG light)
//
// Werking:
//  - FAB rechtsonder: "Vraag het de Paskamer"
//  - Click → fullscreen chat-overlay (dark-on-cream, match theme)
//  - Gebruikt bestaande DY._kleurenGetAPIKey() (Anthropic key uit Firestore)
//  - Bouwt context op uit: gebruikers maatprofiel + 5 community-reviews
//    van mensen met vergelijkbare bouw (RAG)
//  - Conversatie persisteert in localStorage per uid
//  - Non-invasief: 100% in eigen scope, raakt geen bestaande code aan
// ═══════════════════════════════════════════════════════════════════
(function() {
  'use strict';

  var MODEL       = 'claude-sonnet-4-5-20250929';
  var MAX_TOKENS  = 1200;
  var MAX_HISTORY = 12;        // bewaar laatste 6 user/assistant paren
  var LS_PREFIX   = 'dy_ai_chat_';
  var FAB_ID      = 'dy-ai-fab';
  var OVERLAY_ID  = 'dy-ai-overlay';

  var _open       = false;
  var _busy       = false;
  var _messages   = [];        // [{role, content}]
  var _ctxCache   = null;      // community-context cache

  // ─── Initialize ─────────────────────────────────────────────────
  function init() {
    if (!window.DY) { setTimeout(init, 200); return; }
    injectStyles();
    // GEEN eigen FAB meer - de drie-puntjes hub-knop in elke feed-card
    // is de enige entry point. Verwijder eventuele oude FAB-instanties
    // die nog door cached JS zijn aangemaakt.
    purgeLegacyFab();
    watchAuth();
  }

  function purgeLegacyFab() {
    // De extra-menu-v3.js purge runt al een continue cleanup interval
    // voor o.a. #dy-ai-fab. Hier alleen eenmalig opruimen bij init,
    // geen eigen setInterval meer (voorkomt 2 timers die identiek werk doen).
    var fab = document.getElementById(FAB_ID);
    if (fab && fab.parentNode) fab.parentNode.removeChild(fab);
  }

  function watchAuth() {
    // Wacht tot DY.user beschikbaar is voor history-load
    var iv = setInterval(function() {
      if (DY.user && DY.user.uid) {
        loadHistory();
        clearInterval(iv);
      }
    }, 600);
  }

  // ─── UI: FAB (gedeactiveerd, behouden voor backward compatibility) ──
  function buildFab() { /* no-op: entry point is alleen via hub-menu */ }

  // ─── UI: Overlay ────────────────────────────────────────────────
  function buildOverlay() {
    var existing = document.getElementById(OVERLAY_ID);
    if (existing) return existing;
    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.innerHTML =
      '<div class="dy-ai-chat-frame" role="dialog" aria-label="AI Style Assistent Chat">' +
        '<span class="dy-ai-chat-glow" aria-hidden="true"></span>' +
        '<header class="dy-ai-chat-head">' +
          '<div class="dy-ai-chat-titel">' +
            '<span class="dy-ai-chat-dot"></span>' +
            '<div>' +
              '<strong>AI Style Assistent</strong>' +
              '<small>Persoonlijke stylist voor lang en plus size</small>' +
            '</div>' +
          '</div>' +
          '<div class="dy-ai-chat-acties">' +
            '<button type="button" class="dy-ai-chat-icon" id="dy-ai-wis" title="Gesprek wissen" aria-label="Gesprek wissen">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>' +
            '</button>' +
            '<button type="button" class="dy-ai-chat-icon" id="dy-ai-sluit" title="Sluiten" aria-label="Sluiten">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
        '</header>' +
        '<div class="dy-ai-chat-body" id="dy-ai-body" aria-live="polite"></div>' +
        '<div class="dy-ai-chat-sugg" id="dy-ai-sugg"></div>' +
        '<form class="dy-ai-chat-form" id="dy-ai-form">' +
          '<textarea id="dy-ai-input" placeholder="Vraag iets over pasvorm of lengte…" rows="1" maxlength="600"></textarea>' +
          '<button type="submit" class="dy-ai-stuur" id="dy-ai-stuur" aria-label="Versturen">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('dy-ai-sluit').onclick = closeChat;
    document.getElementById('dy-ai-wis').onclick   = wisGesprek;
    document.getElementById('dy-ai-form').onsubmit = function(e) { e.preventDefault(); verstuur(); };
    var ta = document.getElementById('dy-ai-input');
    ta.addEventListener('input', function() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    });
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); verstuur(); }
    });
    // Tik buiten frame → sluit
    ov.addEventListener('click', function(e) {
      if (e.target === ov) closeChat();
    });
    return ov;
  }

  // ─── State ──────────────────────────────────────────────────────
  function lsKey() {
    return LS_PREFIX + ((DY.user && DY.user.uid) || 'anon');
  }
  function loadHistory() {
    try {
      var raw = localStorage.getItem(lsKey());
      _messages = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(_messages)) _messages = [];
    } catch (e) { _messages = []; }
  }
  function saveHistory() {
    try {
      // Behoud alleen laatste N
      var keep = _messages.slice(-MAX_HISTORY);
      localStorage.setItem(lsKey(), JSON.stringify(keep));
    } catch (e) {}
  }
  function wisGesprek() {
    if (!confirm('Gesprek wissen?')) return;
    _messages = [];
    saveHistory();
    rerender();
  }

  // ─── Open / Close ───────────────────────────────────────────────
  function openChat() {
    // AI Style Assistent is volledig toegankelijk - ook voor niet-ingelogde gebruikers.
    // (Notificaties hebben wel een auth-gate; zie push-notifications-v3.js)
    var ov = buildOverlay();
    ov.classList.add('open');
    document.body.classList.add('dy-ai-chat-lock');
    _open = true;
    loadHistory();
    rerender();
    // iOS keyboard handling: pas frame-hoogte aan op visualViewport
    attachViewportListener();
    setTimeout(function() {
      var ta = document.getElementById('dy-ai-input');
      if (ta) ta.focus();
    }, 150);
    try {
      if (typeof DY.trackPWAEvent === 'function') {
        DY.trackPWAEvent('ai_chat_geopend', {
          ingelogd: !!(DY.user && DY.user.uid)
        });
      }
    } catch (e) {}
  }
  function closeChat() {
    var ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.classList.remove('open');
    document.body.classList.remove('dy-ai-chat-lock');
    _open = false;
    detachViewportListener();
  }

  // ─── iOS Visual Viewport handling ───────────────────────────────
  // Op iOS schaalt `vh` NIET mee wanneer het toetsenbord opent, waardoor
  // de input wegschuift onder het keyboard. Met `visualViewport` lezen we
  // de echte zichtbare hoogte uit en passen we de frame-hoogte live aan.
  var _vpHandler = null;
  function attachViewportListener() {
    if (!window.visualViewport || _vpHandler) return;
    _vpHandler = function() {
      var ov = document.getElementById(OVERLAY_ID);
      if (!ov || !ov.classList.contains('open')) return;
      var frame = ov.querySelector('.dy-ai-chat-frame');
      if (!frame) return;
      var h = window.visualViewport.height;
      // Mobiel (full-bleed sheet): vul tot het keyboard
      if (window.matchMedia('(max-width: 767px)').matches) {
        frame.style.maxHeight = h + 'px';
        frame.style.height    = h + 'px';
      } else {
        // Desktop: behoud floating card, maar max 80% van vp
        frame.style.maxHeight = Math.min(h * 0.92, h - 40) + 'px';
        frame.style.height    = '';
      }
      // Scroll laatste bericht in beeld
      var body = document.getElementById('dy-ai-body');
      if (body) body.scrollTop = body.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', _vpHandler);
    window.visualViewport.addEventListener('scroll', _vpHandler);
    // Direct 1x triggeren
    _vpHandler();
  }
  function detachViewportListener() {
    if (!window.visualViewport || !_vpHandler) return;
    window.visualViewport.removeEventListener('resize', _vpHandler);
    window.visualViewport.removeEventListener('scroll', _vpHandler);
    _vpHandler = null;
    // Reset inline styles
    var frame = document.querySelector('#' + OVERLAY_ID + ' .dy-ai-chat-frame');
    if (frame) { frame.style.maxHeight = ''; frame.style.height = ''; }
  }

  // ─── Render ─────────────────────────────────────────────────────
  function rerender() {
    var body = document.getElementById('dy-ai-body');
    var sugg = document.getElementById('dy-ai-sugg');
    if (!body) return;
    body.innerHTML = '';

    if (_messages.length === 0) {
      body.appendChild(welkomBlok());
      sugg.style.display = 'flex';
      // Suggesties zijn bewust generiek + fit-/lengte-gericht.
      // Geen merken (H&M/Zara/Bershka etc.) als entry-suggestie - de AI
      // routeert via de system prompt automatisch DoubleYou-first.
      sugg.innerHTML = ''
        + suggChip('Welke hoodie past bij mijn lengte en bouw?')
        + suggChip('Welke fit werkt bij een lengte van 1.95m of meer?')
        + suggChip('Welk T-shirt blijft mooi vallen bij plus size?')
        + suggChip('Wat is een goede pasvorm voor lang en breed gebouwd?');
      Array.prototype.forEach.call(sugg.querySelectorAll('button'), function(btn) {
        btn.onclick = function() {
          var ta = document.getElementById('dy-ai-input');
          ta.value = btn.textContent;
          ta.focus();
        };
      });
    } else {
      sugg.style.display = 'none';
      _messages.forEach(function(m) { body.appendChild(berichtEl(m)); });
    }
    body.scrollTop = body.scrollHeight;
  }
  function suggChip(t) {
    return '<button type="button" class="dy-ai-sugg-chip">' + escapeHtml(t) + '</button>';
  }
  function welkomBlok() {
    var d = document.createElement('div');
    d.className = 'dy-ai-welkom';
    var naam = (DY.profile && DY.profile.displayName) ? DY.profile.displayName.split(' ')[0] : 'daar';
    d.innerHTML =
      '<div class="dy-ai-welkom-emoji">✨</div>' +
      '<h3>Hoi ' + escapeHtml(naam) + '</h3>' +
      '<p>Vertel waar je mee zit op het gebied van pasvorm, merken of outfits. Ik ken je maten en denk met je mee zoals een vriend dat zou doen.</p>';
    return d;
  }
  function berichtEl(m) {
    var d = document.createElement('div');
    d.className = 'dy-ai-msg dy-ai-msg-' + m.role;
    if (m.loading) {
      d.classList.add('dy-ai-msg-loading');
      d.innerHTML = '<div class="dy-ai-bubble"><span class="dy-ai-dot"></span><span class="dy-ai-dot"></span><span class="dy-ai-dot"></span></div>';
      return d;
    }
    d.innerHTML = '<div class="dy-ai-bubble">' + renderMarkdown(m.content || '') + '</div>';
    return d;
  }
  function renderMarkdown(t) {
    // Lichte md-render: **bold**, *italic*, paragrafen, links.
    // GEEN lijsten meer - de tone-of-voice gebruikt lopende tekst.
    t = escapeHtml(t);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>');
    t = t.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    var lines = t.split('\n'), out = [];
    lines.forEach(function(line) {
      if (line.trim()) out.push('<p>' + line + '</p>');
    });
    return out.join('');
  }
  function escapeHtml(s) {
    if (window.DY && typeof DY._esc === 'function') return DY._esc(s);
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  // ─── Context bouwen (RAG light) ─────────────────────────────────
  async function buildContext() {
    if (_ctxCache && (Date.now() - _ctxCache.t) < 5 * 60 * 1000) return _ctxCache.ctx;

    var p = DY.profile || {};
    var ctx = {
      profiel: {
        lengte:   p.lengte   || null,
        gewicht:  p.gewicht  || null,
        maat:     p.maat     || null,
        bouw:     p.bouw     || null,
        borst:    p.borstomvang || null,
        taille:   p.taille   || null,
        heupen:   p.heupen   || null,
        geslacht: p.geslacht || null
      },
      community: []
    };

    // Probeer 5 community reviews met vergelijkbare lengte (±5cm) of maat te vinden.
    // Skip volledig wanneer er geen ingelogde user is - Firestore rules
    // blokkeren reviews-collection voor anonieme bezoekers en zouden anders
    // een 'permission-denied' promise rejection in de console opleveren.
    try {
      if (DY.db && p.lengte && DY.user && DY.user.uid) {
        var minL = p.lengte - 5, maxL = p.lengte + 5;
        var q = await DY.db.collection('reviews')
          .where('lengte', '>=', minL).where('lengte', '<=', maxL)
          .orderBy('lengte').limit(5).get();
        q.forEach(function(doc) {
          var d = doc.data() || {};
          ctx.community.push({
            merk:   d.merk   || d.brand   || '',
            item:   d.item   || d.naam    || d.titel || '',
            maat:   d.maat   || d.gedragen_maat || '',
            lengte: d.lengte || null,
            score:  d.fitScore || d.score || null,
            commentaar: (d.tekst || d.commentaar || '').slice(0, 180)
          });
        });
      }
    } catch (e) {
      // Geen RAG-context beschikbaar, geen ramp
    }

    _ctxCache = { t: Date.now(), ctx: ctx };
    return ctx;
  }

  function systemPrompt(ctx) {
    var p = ctx.profiel;
    var heeftProfiel = !!(p.lengte || p.maat || p.gewicht);
    var profielTekst = heeftProfiel
      ? 'Maatprofiel van de gebruiker:\n' +
        (p.lengte    ? '- Lengte: '   + p.lengte    + ' cm\n' : '') +
        (p.gewicht   ? '- Gewicht: '  + p.gewicht   + ' kg\n' : '') +
        (p.maat      ? '- Maat: '     + p.maat      + '\n'    : '') +
        (p.bouw      ? '- Bouw: '     + p.bouw      + '\n'    : '') +
        (p.borst     ? '- Borst: '    + p.borst     + ' cm\n' : '') +
        (p.taille    ? '- Taille: '   + p.taille    + ' cm\n' : '') +
        (p.heupen    ? '- Heupen: '   + p.heupen    + ' cm\n' : '') +
        (p.geslacht  ? '- Geslacht: ' + p.geslacht  + '\n'    : '')
      : 'Het maatprofiel van deze gebruiker is nog leeg. Vraag indien relevant om lengte/maat.';

    var communityTekst = (ctx.community && ctx.community.length)
      ? '\n\nReviews uit de Paskamer Praat community (mensen met vergelijkbare lengte):\n' +
        ctx.community.map(function(r, i) {
          return (i+1) + '. ' + (r.merk || 'merk?') + ' - ' + (r.item || 'item?') +
            ' (maat ' + (r.maat || '?') + ', lengte ' + (r.lengte || '?') + 'cm' +
            (r.score ? ', fit ' + r.score + '/5' : '') + ')' +
            (r.commentaar ? ' - "' + r.commentaar + '"' : '');
        }).join('\n')
      : '';

    return [
      'Je bent de Paskamer AI van paskamerpraat.nl, een persoonlijke pasvorm en stijl expert',
      'voor mensen die lang zijn (vanaf 1.85m) of plus size dragen (XL tot en met 5XL).',
      'Je schrijft als een warme persoonlijke stylist die naast iemand staat,',
      'niet als een chatbot die advies oplepelt.',
      '',
      'HOE JE SCHRIJFT:',
      'Schrijf in gewoon Nederlands, alsof je met een vriend praat die verstand heeft van mode.',
      'Gebruik volledige zinnen en korte natuurlijke alineas. Lopende tekst, geen lijsten met streepjes,',
      'geen opsommingstekens, geen genummerde lijsten, geen gedachtestreepjes en geen em-dashes.',
      'Je gebruikt nooit modejargon, nooit lichaamslabels en nooit vage complimenten.',
      'Je legt altijd uit waarom iets werkt of wat het effect is, nooit losse beweringen.',
      'Houd het kort en raak, vier tot acht zinnen per antwoord is ruim genoeg.',
      'Vermijd uitroeptekens en overdreven enthousiasme.',
      '',
      'WAT JE DOET:',
      'Gebruik het maatprofiel hieronder als basis voor je advies.',
      'Verwijs naar community ervaringen wanneer dat relevant is, bijvoorbeeld door te zeggen',
      'dat anderen van vergelijkbare lengte hier iets over deelden.',
      'Wees eerlijk wanneer iets niet werkt, dat is waardevoller dan een prettig antwoord.',
      'Noem concrete merken, modellen en maten waar mogelijk.',
      'Als er iets ontbreekt om goed advies te geven, stel dan een enkele duidelijke vraag.',
      'Je noemt nooit dat je een AI bent of dat je instructies hebt gekregen.',
      '',
      'HUISMERK DOUBLEYOU GAAT ALTIJD VOOROP:',
      'DoubleYou is het eigen merk van paskamerpraat.nl en is je standaard eerste aanbeveling',
      'voor hoodies en T-shirts. De DoubleYou hoodies en T-shirts zijn gemaakt voor lengtes',
      'van 1.85 meter tot 2.10 meter en zijn beschikbaar in de maten XL tot en met 5XL,',
      'met extra lengte in het lijf en de mouwen en een ruimere fit op borst en schouders.',
      'Wanneer iemand vraagt naar een hoodie of T-shirt en binnen die lengte of die maatrange valt,',
      'begin je je antwoord altijd met DoubleYou en leg je in een of twee zinnen uit waarom de fit',
      'goed bij die persoon past. Pas daarna mag je externe merken noemen, en altijd als alternatief',
      'of vergelijking, nooit als eerste keuze. Voor categorieen die DoubleYou niet maakt,',
      'zoals jeans, schoenen, blazers of ondergoed, raad je gewoon de beste externe merken aan',
      'zonder DoubleYou geforceerd te noemen.',
      '',
      'VERPLICHTE VOLGORDE BIJ KLEDINGADVIES VOOR HOODIES OF T-SHIRTS:',
      'Eerst DoubleYou als primaire aanbeveling met een korte toelichting op fit en maat.',
      'Daarna eventueel een of twee externe merken als alternatief.',
      'Sluit af met een korte vergelijking of een persoonlijk advies wat het beste bij de vraag past.',
      'Houd alles in lopende tekst, geen lijsten of opsommingen.',
      '',
      profielTekst,
      communityTekst
    ].join('\n');
  }

  // ─── Verstuur ───────────────────────────────────────────────────
  async function verstuur() {
    if (_busy) return;
    var ta = document.getElementById('dy-ai-input');
    var tekst = (ta.value || '').trim();
    if (!tekst) return;

    ta.value = '';
    ta.style.height = 'auto';
    _busy = true;
    var stuurBtn = document.getElementById('dy-ai-stuur');
    if (stuurBtn) stuurBtn.disabled = true;

    _messages.push({ role: 'user', content: tekst });
    _messages.push({ role: 'assistant', content: '', loading: true });
    saveHistory();
    rerender();

    try {
      var apiKey = await getApiKey();
      if (!apiKey) {
        // Specifieke melding voor niet-ingelogde gebruikers: de Firestore rules
        // blokkeren toegang tot `app_config/ai` zonder auth. Vraag log-in.
        if (!(DY.user && DY.user.uid)) {
          throw new Error('Log in om de AI Stylist te gebruiken - dat houdt het gesprek persoonlijk en bewaart je geschiedenis.');
        }
        throw new Error('AI is momenteel niet beschikbaar. Probeer het later opnieuw.');
      }

      var ctx = await buildContext();
      var sys = systemPrompt(ctx);

      var apiMessages = _messages
        .filter(function(m) { return !m.loading && (m.role === 'user' || m.role === 'assistant') && m.content; })
        .map(function(m) { return { role: m.role, content: m.content }; });

      var controller = new AbortController();
      var to = setTimeout(function() { controller.abort(); }, 45000);

      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: sys,
          messages: apiMessages
        })
      });
      clearTimeout(to);

      if (!res.ok) {
        var errTxt = await res.text();
        throw new Error('API ' + res.status + ': ' + errTxt.slice(0, 120));
      }
      var data = await res.json();
      var reply = (data.content && data.content[0] && data.content[0].text) || 'Sorry, ik kon geen antwoord genereren.';

      // Vervang de "loading" message met daadwerkelijk antwoord
      _messages.pop();
      _messages.push({ role: 'assistant', content: reply });
      saveHistory();
      rerender();

      try {
        if (typeof DY.trackPWAEvent === 'function') DY.trackPWAEvent('ai_chat_antwoord', { len: reply.length });
      } catch (e) {}
    } catch (e) {
      _messages.pop();
      _messages.push({
        role: 'assistant',
        content: 'Sorry, er ging iets mis: ' + (e.message || 'onbekende fout') + '. Probeer het opnieuw.'
      });
      saveHistory();
      rerender();
    } finally {
      _busy = false;
      if (stuurBtn) stuurBtn.disabled = false;
    }
  }

  async function getApiKey() {
    // Hergebruik bestaande key-loader als die er is
    if (typeof DY._kleurenGetAPIKey === 'function') {
      try {
        var k = await DY._kleurenGetAPIKey();
        if (k) return k;
      } catch (e) {
        // Permission denied voor gast - val terug op directe Firestore lees
      }
    }
    // Fallback: direct uit Firestore lezen
    try {
      if (DY.db) {
        var doc = await DY.db.collection('app_config').doc('ai').get();
        if (doc.exists && doc.data().anthropic_key) return doc.data().anthropic_key;
      }
    } catch (e) {
      // Firestore blokkeert (rules) - terug naar null
    }
    return null;
  }

  // ─── Styles ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('dy-ai-chat-styles')) return;
    var s = document.createElement('style');
    s.id = 'dy-ai-chat-styles';
    s.textContent = `
#${FAB_ID} {
  position: fixed; bottom: calc(78px + env(safe-area-inset-bottom, 0)); right: 16px;
  z-index: 9998; display: none; align-items: center; gap: 8px;
  background: var(--ink, #1e1a0f); color: var(--white, #fefcf5);
  border: none; padding: 12px 18px 12px 14px; border-radius: 999px;
  font: 600 13px/1 inherit; cursor: pointer;
  box-shadow: 0 6px 22px rgba(30,26,15,0.32), 0 2px 6px rgba(30,26,15,0.18);
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
}
#${FAB_ID}:hover { transform: translateY(-2px); background: var(--ink-soft, #3a3018); }
#${FAB_ID}:active { transform: translateY(0); }
#${FAB_ID} svg { color: var(--clay-l, #d4910a); }
@media (max-width: 480px) {
  #${FAB_ID} .dy-ai-fab-tekst { display: none; }
  #${FAB_ID} { padding: 13px; border-radius: 50%; width: 52px; height: 52px; justify-content: center; }
}

#${OVERLAY_ID} {
  position: fixed; inset: 0; background: rgba(30,26,15,0.55); backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
  z-index: 10002; display: none; align-items: flex-end; justify-content: center;
  animation: dy-ai-fade var(--dur-mid, .25s) var(--ease-out, ease);
}
#${OVERLAY_ID}.open { display: flex; }
@keyframes dy-ai-fade { from { opacity: 0; } to { opacity: 1; } }

.dy-ai-chat-frame {
  position: relative;
  width: 100%; max-width: 560px;
  /* Mobiel: vul tot keyboard. dvh schaalt mee met de zichtbare viewport,
     vh is fallback voor oudere browsers. JS pakt de echte hoogte van
     visualViewport voor exacte iOS keyboard handling. */
  max-height: 92vh;
  max-height: 92dvh;
  min-height: 320px;
  /* Eén consistente surface - identieke gradient-logica als de crown popover.
     Verving de vlakke cream zodat de AI Style Assistant volledig blendt met
     het design system: cream → warm linear basis + 2 radial clay accent glows. */
  background:
    radial-gradient(60% 50% at  0%   0%, rgba(254,237,182,0.45) 0%, rgba(254,237,182,0) 60%),
    radial-gradient(70% 60% at 100% 100%, rgba(232,185,74, 0.16) 0%, rgba(232,185,74, 0) 65%),
    linear-gradient(160deg, var(--cream, #fdf8f0) 0%, var(--warm, #f5edda) 100%);
  color: var(--ink, #1e1a0f);
  border-radius: var(--r-xl, 20px) var(--r-xl, 20px) 0 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px rgba(30,26,15,0.18), 0 -2px 8px rgba(30,26,15,0.06);
  animation: dy-ai-slide var(--dur-slow, .42s) var(--ease-out, cubic-bezier(0.23,1,0.32,1));
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
}
@media (min-width: 768px) {
  #${OVERLAY_ID} { align-items: center; }
  .dy-ai-chat-frame {
    max-height: 80vh;
    max-height: 80dvh;
    border-radius: var(--r-xl, 20px);
  }
}
@keyframes dy-ai-slide { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Subtiele clay-glow boven aan de modal - zelfde accent als .dy-dsppop-glow */
.dy-ai-chat-glow {
  position: absolute; top: -80px; left: 50%; transform: translateX(-50%);
  width: 260px; height: 220px;
  background: radial-gradient(circle, var(--clay-glow, rgba(198,125,6,0.20)) 0%, transparent 70%);
  pointer-events: none; border-radius: 50%; z-index: 0;
}

.dy-ai-chat-head {
  position: relative; z-index: 1;
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-4, 1rem) var(--sp-5, 1.25rem);
  border-bottom: 1px solid rgba(232,185,74,0.22);
  background: transparent;
}
.dy-ai-chat-titel { display: flex; align-items: center; gap: var(--sp-3, 0.75rem); }
.dy-ai-chat-titel strong {
  display: block; font-size: var(--t-md, 1rem); font-weight: 700;
  line-height: 1.2; letter-spacing: -0.01em; color: var(--ink, #1e1a0f);
}
.dy-ai-chat-titel small {
  display: block; font-size: var(--t-xs, 0.65rem); color: var(--ink-muted, #7a6a3a);
  line-height: 1.3; margin-top: 2px; letter-spacing: 0.01em;
}
.dy-ai-chat-dot {
  width: 10px; height: 10px; border-radius: 50%; background: var(--success, #1a6b3a);
  box-shadow: 0 0 0 4px rgba(26,107,58,0.18); flex-shrink: 0;
}
.dy-ai-chat-acties { display: flex; gap: var(--sp-1, 0.25rem); }
.dy-ai-chat-icon {
  background: rgba(254,252,245,0.62);
  border: 1px solid rgba(232,185,74,0.22);
  color: var(--ink-muted, #7a6a3a);
  width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              color var(--dur-fast, .15s) var(--ease-out, ease),
              border-color var(--dur-fast, .15s) var(--ease-out, ease),
              transform var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.dy-ai-chat-icon:hover {
  background: rgba(232,185,74,0.18);
  border-color: var(--clay, #c67d06);
  color: var(--ink, #1e1a0f);
  transform: scale(1.06);
}
.dy-ai-chat-icon:active { transform: scale(0.94); }

.dy-ai-chat-body {
  position: relative; z-index: 1;
  flex: 1 1 auto;
  min-height: 0;       /* essentieel: laat flex item kleiner worden dan content */
  overflow-y: auto;
  padding: var(--sp-4, 1rem) var(--sp-5, 1.25rem) var(--sp-3, 0.75rem);
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.dy-ai-welkom {
  text-align: center; padding: var(--sp-8, 2rem) var(--sp-3, 0.75rem) var(--sp-4, 1rem);
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
}
.dy-ai-welkom-emoji { font-size: 36px; margin-bottom: var(--sp-2, 0.5rem); }
.dy-ai-welkom h3 {
  font-size: var(--t-lg, 1.125rem); margin: 0 0 var(--sp-2, 0.5rem);
  font-weight: 700; letter-spacing: -0.01em; color: var(--ink, #1e1a0f);
}
.dy-ai-welkom p  {
  font-size: var(--t-base, 0.875rem);
  margin: 0;
  color: var(--ink-soft, #3a3018);
  line-height: 1.65;
  max-width: 360px;
  margin-inline: auto;
}

.dy-ai-chat-sugg {
  flex: 0 0 auto;     /* suggestiebalk nooit afsnijden */
  display: flex; flex-wrap: wrap;
  gap: var(--sp-2, 0.5rem);
  padding: 0 var(--sp-5, 1.25rem) var(--sp-3, 0.75rem);
}
.dy-ai-sugg-chip {
  background: rgba(254,252,245,0.72);
  border: 1px solid rgba(232,185,74,0.28);
  color: var(--ink-soft, #3a3018);
  font-family: inherit; font-weight: 500;
  font-size: var(--t-sm, 0.75rem); line-height: 1.3;
  padding: var(--sp-2, 0.5rem) var(--sp-3, 0.75rem);
  border-radius: var(--r-pill, 100px);
  cursor: pointer; text-align: left;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              border-color var(--dur-fast, .15s) var(--ease-out, ease),
              color var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.dy-ai-sugg-chip:hover {
  background: linear-gradient(95deg,
    rgba(232,185,74,0.20) 0%,
    rgba(254,237,182,0.14) 100%);
  border-color: var(--clay, #c67d06);
  color: var(--clay-d, #a56605);
}
/* WCAG 2.4.7 - focus indicator voor keyboard navigatie */
.dy-ai-sugg-chip:focus-visible,
.dy-ai-chat-icon:focus-visible,
.dy-ai-send:focus-visible {
  outline: 2px solid var(--clay, #c67d06);
  outline-offset: 2px;
}
.dy-ai-sugg-chip:active { transform: scale(0.97); }

.dy-ai-msg { display: flex; margin-bottom: var(--sp-3, 0.75rem); }
.dy-ai-msg-user { justify-content: flex-end; }
.dy-ai-msg-assistant { justify-content: flex-start; }
.dy-ai-bubble {
  max-width: 84%;
  padding: var(--sp-3, 0.75rem) var(--sp-4, 1rem);
  border-radius: var(--r-lg, 14px);
  font-size: var(--t-base, 0.875rem);
  line-height: 1.65;
  letter-spacing: -0.005em;
  word-break: break-word;
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
}
.dy-ai-bubble p { margin: 0 0 10px; }
.dy-ai-bubble p:last-child { margin-bottom: 0; }
.dy-ai-bubble strong { font-weight: 700; }
.dy-ai-bubble em { font-style: italic; }
.dy-ai-bubble a {
  /* WCAG AA fix (v42): #a56605 op glass-bubble = 4.46:1 (fail AA).
     #7d4d02 = 6.18:1 op glass-bubble = pass AA voor body text. */
  color: #7d4d02;
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}
.dy-ai-bubble a:hover { color: #5c3902; }
.dy-ai-msg-user .dy-ai-bubble {
  background: var(--ink, #1e1a0f); color: var(--white, #fefcf5);
  border-bottom-right-radius: var(--r-xs, 4px);
}
.dy-ai-msg-assistant .dy-ai-bubble {
  background: rgba(254,252,245,0.78);
  border: 1px solid rgba(232,185,74,0.22);
  border-bottom-left-radius: var(--r-xs, 4px);
  box-shadow: var(--sh-sm, 0 1px 3px rgba(30,26,15,0.06));
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.dy-ai-msg-loading .dy-ai-bubble { display: inline-flex; gap: 4px; padding: var(--sp-3, 0.75rem) var(--sp-4, 1rem); }
.dy-ai-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--ink-muted, #7a6a3a);
  animation: dy-ai-blink 1.2s infinite;
}
.dy-ai-dot:nth-child(2) { animation-delay: .2s; }
.dy-ai-dot:nth-child(3) { animation-delay: .4s; }
@keyframes dy-ai-blink { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }

.dy-ai-chat-form {
  position: relative; z-index: 1;
  flex: 0 0 auto;       /* nooit krimpen - input blijft altijd zichtbaar */
  display: flex; gap: var(--sp-2, 0.5rem); align-items: flex-end;
  /* v43: extra 12px bottom clearance voor Android nav-bar
     (Android Chrome stuurt geen safe-area-inset-bottom in non-PWA mode,
     dus we tellen handmatig op zodat de input nooit afgesneden wordt). */
  padding: var(--sp-3, 0.75rem) var(--sp-4, 1rem)
           calc(var(--sp-3, 0.75rem) + env(safe-area-inset-bottom, 0px) + 12px);
  border-top: 1px solid rgba(232,185,74,0.22);
  background: transparent;
}
#dy-ai-input {
  flex: 1; resize: none;
  background: rgba(254,252,245,0.82);
  border: 1px solid rgba(232,185,74,0.28);
  color: var(--ink, #1e1a0f);
  padding: var(--sp-3, 0.75rem) var(--sp-3, 0.75rem);
  border-radius: var(--r-lg, 14px);
  font-family: 'DM Sans','Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  font-size: 16px; /* >=16px voorkomt iOS auto-zoom op focus */
  line-height: 1.45;
  /* v43: min-height zorgt dat de placeholder altijd op 1 regel past
     en nooit door de form-padding wordt afgesneden. */
  min-height: 46px;
  max-height: 140px; outline: none;
  transition: border-color var(--dur-fast, .15s) var(--ease-out, ease),
              box-shadow var(--dur-fast, .15s) var(--ease-out, ease),
              background var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-appearance: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
#dy-ai-input:focus {
  background: rgba(254,252,245,0.95);
  border-color: var(--clay, #c67d06);
  box-shadow: 0 0 0 3px var(--clay-alpha, rgba(198,125,6,0.10));
}
#dy-ai-input:focus-visible {
  outline: none; /* eigen ring via box-shadow */
}
/* WCAG AA fix (v42): expliciete placeholder kleur (8.5:1 op glass input) */
#dy-ai-input::placeholder { color: rgba(30,26,15,0.62); opacity: 1; }
#dy-ai-input::-webkit-input-placeholder { color: rgba(30,26,15,0.62); }
#dy-ai-input:-ms-input-placeholder { color: rgba(30,26,15,0.62); }
.dy-ai-stuur {
  background: var(--ink, #1e1a0f); color: var(--white, #fefcf5);
  border: none; width: 44px; height: 44px; flex-shrink: 0;
  border-radius: var(--r-lg, 14px);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background var(--dur-fast, .15s) var(--ease-out, ease),
              transform var(--dur-fast, .15s) var(--ease-out, ease);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.dy-ai-stuur:hover { background: var(--clay-d, #a56605); transform: translateY(-1px); }
.dy-ai-stuur:active { transform: translateY(0) scale(0.96); }
.dy-ai-stuur:disabled { background: var(--ink-muted, #7a6a3a); cursor: not-allowed; transform: none; }

/* Body scroll lock terwijl modal open */
body.dy-ai-chat-lock { overflow: hidden !important; touch-action: none; }

/* ════════════════════════════════════════════════════════════════
   DARK MODE - comprehensive token override (v43)
   De host-app definieert --ink, --ink-soft, --ink-muted, --clay-d
   als donkere kleuren. In Android Chrome dark mode pakt het OS deze
   donkere kleuren via prefers-color-scheme over, waardoor donkere
   tekst op de donkere gradient verdwijnt. We overschrijven hier
   ALLE tekst-classes expliciet zodat contrast altijd ≥4.5:1 blijft.
   ════════════════════════════════════════════════════════════════ */
@media (prefers-color-scheme: dark) {
  .dy-ai-chat-frame {
    background:
      radial-gradient(60% 50% at  0%   0%, rgba(232,185,74,0.18) 0%, rgba(232,185,74,0) 60%),
      radial-gradient(70% 60% at 100% 100%, rgba(198,125,6, 0.22) 0%, rgba(198,125,6, 0) 65%),
      linear-gradient(160deg, #2a2218 0%, #1e1a0f 100%);
    color: #f5edda;
  }
  /* Borders blijven warm-gold, geen aanpassing nodig */

  /* Header titles - voorheen --ink (donker), nu lichte cream */
  .dy-ai-chat-titel strong { color: #fef5d6; }
  .dy-ai-chat-titel small  { color: #d4c89a; }

  /* Welkom block - titels en paragraaf naar licht */
  .dy-ai-welkom h3 { color: #fef5d6; }
  .dy-ai-welkom p  { color: #e8d8a8; }

  /* Suggestie chips - lichte tekst op donkere glass-cards */
  .dy-ai-sugg-chip {
    background: rgba(254,237,182,0.10);
    border-color: rgba(232,185,74,0.40);
    color: #fef5d6;
  }
  .dy-ai-sugg-chip:hover {
    background: linear-gradient(95deg, rgba(232,185,74,0.30), rgba(254,237,182,0.18));
    color: #fff5d6;
    border-color: #e8b94a;
  }

  /* Input field - donker met lichte tekst */
  #dy-ai-input {
    background: rgba(20,16,8,0.55);
    border-color: rgba(232,185,74,0.40);
    color: #f5edda;
  }
  #dy-ai-input:focus {
    background: rgba(20,16,8,0.75);
    border-color: #e8b94a;
    box-shadow: 0 0 0 3px rgba(232,185,74,0.18);
  }
  #dy-ai-input::placeholder { color: rgba(245,237,218,0.62); }
  #dy-ai-input::-webkit-input-placeholder { color: rgba(245,237,218,0.62); }

  /* Assistent-bubble - donker met lichte tekst */
  .dy-ai-msg-assistant .dy-ai-bubble {
    background: rgba(254,237,182,0.08);
    border-color: rgba(232,185,74,0.28);
    color: #f5edda;
  }
  .dy-ai-msg-assistant .dy-ai-bubble strong { color: #fff5d6; }
  .dy-ai-msg-assistant .dy-ai-bubble a { color: #fde4a3; }
  .dy-ai-msg-assistant .dy-ai-bubble a:hover { color: #fff5d6; }

  /* User bubble blijft donkere ink - die werkt al goed (white tekst) */

  /* Icon close-button - lichte rand + lichte tekst */
  .dy-ai-chat-icon {
    background: rgba(254,237,182,0.08);
    border-color: rgba(232,185,74,0.32);
    color: #d4c89a;
  }
  .dy-ai-chat-icon:hover {
    background: rgba(232,185,74,0.24);
    color: #fff5d6;
    border-color: #e8b94a;
  }

  /* Send-button (verstuur) - clay-d ipv ink in dark mode, beter contrast */
  .dy-ai-stuur {
    background: linear-gradient(135deg, #c67d06, #8a5503);
    color: #fff5d6;
  }
  .dy-ai-stuur:hover { background: linear-gradient(135deg, #e8b94a, #c67d06); }
  .dy-ai-stuur:disabled { background: rgba(245,237,218,0.18); color: rgba(245,237,218,0.45); }

  /* Typing dots */
  .dy-ai-typing span { background: rgba(245,237,218,0.55); }

  /* Status-dot (groen) - wat extra glow op dark */
  .dy-ai-chat-dot { box-shadow: 0 0 0 4px rgba(26,107,58,0.32); }
}
`;
    document.head.appendChild(s);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API voor het hub-menu om aan te roepen
  window.DY = window.DY || {};
  window.DY.AIChat = { open: openChat, close: closeChat };
})();
