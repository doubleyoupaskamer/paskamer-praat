/**
 * Doubleyou SEO Worker v3.1 - BULLETPROOF EDITION
 *
 * Alle env.ASSETS.fetch() calls zijn nu ULTRA-DEFENSIEF via safeAssetsFetch().
 * Crash kan NIET meer optreden, zelfs in preview zonder binding.
 */

const BOT_PATTERN = /googlebot|google-inspectiontool|google-extended|bingbot|baiduspider|yandexbot|duckduckbot|slurp|applebot|applebot-extended|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|rogerbot|redditbot|ia_archiver|msnbot|ahrefsbot|semrushbot|dotbot|petalbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|perplexity-user|cohere-ai|youbot|amazonbot|bytespider|mistralai-user|meta-externalagent|meta-externalfetcher/i;

function isBot(request) {
  const ua = request.headers.get('User-Agent') || '';
  return BOT_PATTERN.test(ua);
}

const PAD_CONFIG = {
  '/':                   { pagina: 'home',         title: 'Doubleyou | Tailored for Tall & Plus Size | Fashion Community Nederland' },
  '/feed':               { pagina: 'feed',         title: 'Community Feed | Doubleyou Paskamerpraat' },
  '/uitgelicht':         { pagina: 'uitgelicht',   title: 'Uitgelicht | Aangeboden merken & campagnes | Doubleyou' },
  '/merken':             { pagina: 'merken',       title: 'Merken voor Tall & Plus Size | Doubleyou' },
  '/looks':              { pagina: 'looks',        title: 'Outfit Inspiratie voor Tall & Plus Size | Doubleyou' },
  '/reviews':            { pagina: 'reviews',      title: 'Eerlijke Pasvorm Reviews | Doubleyou' },
  '/winkel':             { pagina: 'winkel',       title: 'Winkel | Doubleyou Tailored for Tall & Plus Size' },
  '/challenges':         { pagina: 'challenges',   title: 'Community Challenges | Doubleyou' },
  '/post-van-de-week':   { pagina: 'ovdw',         title: 'Post van de Week | Doubleyou' },
  '/outfit-vergelijker': { pagina: 'vergelijker',  title: 'AI Outfit Vergelijker | Doubleyou' },
  '/ai-stijladvies':     { pagina: 'aistyle',      title: 'AI Stijladvies & Outfit Score | Doubleyou' },
  '/voorwaarden':        { pagina: 'voorwaarden',  title: 'Voorwaarden & A-Z Gebruikersreglement | Doubleyou' },
  '/voorwaarden/':       { pagina: 'voorwaarden',  title: 'Voorwaarden & A-Z Gebruikersreglement | Doubleyou' },
  '/privacy':            { pagina: 'privacy',      title: 'Privacyverklaring & Cookies | Doubleyou' },
  '/community-regels':   { pagina: 'regels',       title: 'Community Regels | Doubleyou' },
  '/beta':               { pagina: 'beta',         title: 'Beta-programma | Doubleyou Paskamerpraat' },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ═══════════════════════════════════════════════════════════════════
// ★ BULLETPROOF helper - werkt OOK als env.ASSETS undefined is
// ═══════════════════════════════════════════════════════════════════
async function safeAssetsFetch(env, request) {
  try {
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return await env.ASSETS.fetch(request);
    }
  } catch (e) { /* fall through naar preview-fallback */ }

  // ASSETS binding ontbreekt (preview mode op *.workers.dev)
  // → toon vriendelijke uitleg-pagina, GEEN crash
  return new Response(
`<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<title>Doubleyou SEO Worker | Preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:24px;color:#1e1a0f;background:#fdf8f0;line-height:1.6}
h1{font-family:Georgia,serif;color:#c67d06}code{background:#1e1a0f;color:#c67d06;padding:2px 6px;border-radius:4px;font-size:0.9em}
.box{background:#fff;border:1px solid #e8e0d0;border-radius:12px;padding:18px;margin:18px 0}
.ok{color:#3a7d3a;font-weight:700}.warn{color:#c67d06;font-weight:700}a{color:#c67d06}</style></head>
<body>
<h1>⚙️ Doubleyou SEO Worker, v3.1</h1>
<p class="warn">⚠️ Preview mode op <code>*.workers.dev</code>, <code>env.ASSETS</code> niet beschikbaar.</p>
<p>Dit is normaal. De binding werkt alleen op productie (<code>paskamerpraat.nl</code>).</p>
<div class="box">
<p><strong>✅ Test als bot om de SEO-HTML te zien:</strong></p>
<code>curl -A "Googlebot" https://paskamerpraat-seo.doubleuurbanluxury.workers.dev/</code>
</div>
<div class="box">
<p><strong>🚀 Productie test:</strong> <a href="https://paskamerpraat.nl/" rel="noopener">paskamerpraat.nl</a></p>
</div>
<div class="box">
<p><strong>🔗 Settings → Bindings moet zijn:</strong></p>
<ul>
<li>Variable: <code>ASSETS</code></li>
<li>Type: <code>Service binding</code> of <code>Assets binding</code></li>
<li>Service: jouw Pages project</li>
</ul>
</div>
</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Worker-Mode': 'preview-no-binding' } }
  );
}

function getBotHTML(pad, config) {
  const canonicalUrl = `https://paskamerpraat.nl${pad}`;
  const desc = 'Doubleyou, Community voor tall (1.85m+) en plus size (XL–5XL) fashion in Nederland. Eerlijke pasvorm reviews, AI stijladvies en outfit inspiratie.';
  const safeTitle = escapeHtml(config.title);
  const jsonLd = JSON.stringify([
    { "@context":"https://schema.org","@type":"Organization","@id":"https://paskamerpraat.nl/#organization","name":"Doubleyou","alternateName":["Doubleyou Paskamerpraat","Paskamerpraat"],"url":"https://paskamerpraat.nl/","logo":"https://paskamerpraat.nl/icons/icon-512.png","description":desc,"sameAs":["https://doubleyousmallandtall.nl"]},
    { "@context":"https://schema.org","@type":"WebSite","@id":"https://paskamerpraat.nl/#website","url":"https://paskamerpraat.nl/","name":"Doubleyou Paskamerpraat","publisher":{"@id":"https://paskamerpraat.nl/#organization"},"inLanguage":"nl-NL"},
    { "@context":"https://schema.org","@type":"WebPage","url":canonicalUrl,"name":config.title,"description":desc,"isPartOf":{"@id":"https://paskamerpraat.nl/#website"},"inLanguage":"nl-NL"},
    ...(config.pagina === 'home' ? [{
      "@context":"https://schema.org","@type":"FAQPage",
      "mainEntity":[
        {"@type":"Question","name":"Is Doubleyou gratis?","acceptedAnswer":{"@type":"Answer","text":"Ja, alle community-functies zijn 100% gratis. Premium is €4,99/maand voor onbeperkte AI-features."}},
        {"@type":"Question","name":"Welke maten worden besproken?","acceptedAnswer":{"@type":"Answer","text":"Tall (vanaf 1.85m) en plus size (XL t/m 5XL)."}},
        {"@type":"Question","name":"Wat zijn DSP punten?","acceptedAnswer":{"@type":"Answer","text":"Doubleyou Stijlpunten die je verdient door bij te dragen aan de community."}},
        {"@type":"Question","name":"Hoe werkt de AI Outfit Score?","acceptedAnswer":{"@type":"Answer","text":"Upload een outfit-foto, AI analyseert pasvorm, kleurharmonie en geeft persoonlijke tips."}}
      ]
    }] : [])
  ]);

  return `<!DOCTYPE html><html lang="nl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" hreflang="nl-NL" href="${canonicalUrl}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Doubleyou">
<meta property="og:locale" content="nl_NL">
<meta property="og:image" content="https://paskamerpraat.nl/hero-model-v2.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="https://paskamerpraat.nl/hero-model-v2.png">
<script type="application/ld+json">${jsonLd}</script>
<style>body{font-family:-apple-system,sans-serif;max-width:860px;margin:0 auto;padding:32px 20px;color:#1e1a0f;background:#fdf8f0;line-height:1.6}
h1{font-family:Georgia,serif;color:#1e1a0f;font-size:2rem}h2{font-family:Georgia,serif;margin-top:32px;font-size:1.5rem}
a{color:#c67d06}dl{margin:16px 0}dt{font-weight:700;margin-top:14px}dd{margin:6px 0 12px 18px}
nav{margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #e8e0d0}
nav a{margin-right:14px}nav a.brand{font-weight:700;color:#1e1a0f}
footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e0d0;font-size:0.85rem;color:#888}</style>
</head><body>
<nav><a href="/" class="brand">Doubleyou · Paskamerpraat</a>
<a href="/feed">Feed</a><a href="/uitgelicht">Uitgelicht</a><a href="/merken">Merken</a>
<a href="/looks">Looks</a><a href="/reviews">Reviews</a><a href="/ai-stijladvies">AI</a><a href="/winkel">Winkel</a></nav>

<h1>${escapeHtml(config.title.split(' | ')[0])}</h1>
<p>De gratis Nederlandse community voor mensen die <strong>tall</strong> zijn (1.85m+) of <strong>plus size</strong> kleding dragen (XL–5XL). Een initiatief van Doubleyou Tailored for Tall &amp; Plus Size.</p>

${config.pagina === 'home' ? `
<h2>Functies</h2>
<ul>
<li><a href="/feed">Community Feed</a>, Posts en fitchecks</li>
<li><a href="/uitgelicht">Uitgelicht</a>, Aangeboden merken &amp; campagnes</li>
<li><a href="/merken">Merken</a>, Overzicht alle deelnemende merken</li>
<li><a href="/looks">Outfit Inspiratie</a>, Looks per lengte en maat</li>
<li><a href="/reviews">Pasvorm Reviews</a>, Eerlijke beoordelingen</li>
<li><a href="/ai-stijladvies">AI Stijladvies</a>, Outfit Score &amp; Style Match</li>
<li><a href="/outfit-vergelijker">Outfit Vergelijker</a>, AI vergelijkt 2 outfits</li>
<li><a href="/winkel">Winkel</a>, Doubleyou kleding</li>
</ul>
<h2>Veelgestelde vragen</h2>
<dl>
<dt>Is Doubleyou gratis?</dt><dd>Ja, alle community-functies zijn 100% gratis. Premium €4,99/maand voor onbeperkte AI.</dd>
<dt>Welke maten worden besproken?</dt><dd>Tall (1.85m+) en plus size (XL–5XL).</dd>
<dt>Wat zijn DSP punten?</dt><dd>Doubleyou Stijlpunten, verdien je door bijdragen aan de community.</dd>
<dt>Hoe werkt AI Outfit Score?</dt><dd>Upload foto → AI analyseert pasvorm, kleur, proportie → krijg tips.</dd>
</dl>` : `<p><a href="/">← Terug naar Doubleyou</a></p>`}

<footer><a href="/voorwaarden">Voorwaarden</a> · <a href="/voorwaarden#reglement">A-Z Reglement</a> · <a href="/voorwaarden#privacy">Privacy</a><br>
© 2026 Doubleyou Tailored for Tall &amp; Plus Size</footer>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY - alle paden gebruiken safeAssetsFetch (nooit raw env.ASSETS)
// ═══════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const pad = url.pathname;

      // Statische assets → safeAssetsFetch
      const ASSETS_EXT = /\.(js|css|png|webp|jpg|jpeg|svg|ico|woff|woff2|ttf|json|xml|txt|mp4|webm|mp3|map|pdf|md)$/i;
      if (ASSETS_EXT.test(pad)) {
        return await safeAssetsFetch(env, request);
      }

      // Admin/debug/api → safeAssetsFetch
      if (pad.startsWith('/admin') || pad.startsWith('/debug') ||
          pad.startsWith('/vernieuw') || pad.startsWith('/test-hub') ||
          pad.startsWith('/api/') || pad.startsWith('/branding/')) {
        return await safeAssetsFetch(env, request);
      }

      // Bot → render SEO HTML (werkt OOK zonder binding!)
      if (isBot(request)) {
        let config = PAD_CONFIG[pad];
        if (!config) {
          const hoofdpad = '/' + pad.split('/').filter(Boolean)[0];
          config = PAD_CONFIG[hoofdpad] || PAD_CONFIG['/'];
        }
        const botPad = PAD_CONFIG[pad] ? pad : '/';
        return new Response(getBotHTML(botPad, config), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=7200',
            'X-Robots-Tag': 'index, follow, max-snippet:-1, max-image-preview:large',
            'X-Content-Type-Options': 'nosniff',
            'Vary': 'User-Agent'
          }
        });
      }

      // Normale user → safeAssetsFetch (PWA)
      return await safeAssetsFetch(env, request);

    } catch (err) {
      // Ultieme catch-all: ZELFS bij parse-errors crashen we niet
      return new Response(
        '<!DOCTYPE html><html><body><h1>Doubleyou</h1><p>Tijdelijke fout. Probeer opnieuw.</p><p>' + escapeHtml(String(err && err.message || err)) + '</p></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Worker-Error': '1' } }
      );
    }
  }
};
