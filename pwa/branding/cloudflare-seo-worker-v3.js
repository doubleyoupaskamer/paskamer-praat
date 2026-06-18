/**
 * Doubleyou (Paskamerpraat) — SEO Worker v3 (afgestemd op v60.1.115)
 *
 * Wijzigingen t.o.v. v2:
 *   • Branding: "Paskamer Praat" → "Doubleyou" (main) + "Paskamerpraat" (sub)
 *   • Nieuwe routes: /uitgelicht, /merken, /ai-stijladvies
 *   • /voorwaarden anchor deep-links voor A-Z reglement, AUP, privacy, AV, campagnes
 *   • Uitgebreide AI-bot detection (Google-Extended, Applebot-Extended, Cohere etc.)
 *   • Rijkere JSON-LD: Organization + WebSite + WebPage + BreadcrumbList + FAQPage
 *   • Verbeterde FAQ-content gebaseerd op huidige app-functies (Wallet, Premium, Outfit Score)
 *   • Updated meta-descriptions, exacter doelgroep-targeting (1.85m+, XL-5XL)
 *
 * BINDING:
 *   Worker Settings → Bindings → Add binding
 *   Type: Service  |  Variable: ASSETS  |  Service: paskamer-praat (Pages project)
 *   OF: Type: Assets binding bij Pages Functions
 */

// ── AI + Search bots (uitgebreid met 2026-bots) ─────────────────────
const BOT_PATTERN = /googlebot|google-inspectiontool|google-extended|bingbot|baiduspider|yandexbot|duckduckbot|slurp|applebot|applebot-extended|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|rogerbot|redditbot|ia_archiver|msnbot|ahrefsbot|semrushbot|dotbot|petalbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|perplexity-user|cohere-ai|youbot|amazonbot|bytespider|mistralai-user|meta-externalagent|meta-externalfetcher/i;

function isBot(request) {
  const ua = request.headers.get('User-Agent') || '';
  return BOT_PATTERN.test(ua);
}

// ── Route mapping (alle publiek indexeerbare paden) ─────────────────
const PAD_CONFIG = {
  '/':                   { pagina: 'home',         title: 'Doubleyou | Tailored for Tall & Plus Size — Fashion Community Nederland' },
  '/feed':               { pagina: 'feed',         title: 'Community Feed — Doubleyou Paskamerpraat' },
  '/uitgelicht':         { pagina: 'uitgelicht',   title: 'Uitgelicht — Aangeboden merken & campagnes | Doubleyou' },
  '/merken':             { pagina: 'merken',       title: 'Merken voor Tall & Plus Size — Doubleyou Merkenoverzicht' },
  '/looks':              { pagina: 'looks',        title: 'Outfit Inspiratie voor Tall & Plus Size — Doubleyou' },
  '/reviews':            { pagina: 'reviews',      title: 'Eerlijke Pasvorm Reviews — Doubleyou Community' },
  '/winkel':             { pagina: 'winkel',       title: 'Winkel — Doubleyou Tailored for Tall & Plus Size' },
  '/challenges':         { pagina: 'challenges',   title: 'Community Challenges — Doubleyou Paskamerpraat' },
  '/post-van-de-week':   { pagina: 'ovdw',         title: 'Post van de Week — Doubleyou Paskamerpraat' },
  '/outfit-vergelijker': { pagina: 'vergelijker',  title: 'AI Outfit Vergelijker — Doubleyou' },
  '/ai-stijladvies':     { pagina: 'aistyle',      title: 'AI Stijladvies & Outfit Score — Doubleyou' },
  '/voorwaarden':        { pagina: 'voorwaarden',  title: 'Voorwaarden & A-Z Gebruikersreglement — Doubleyou' },
  '/voorwaarden/':       { pagina: 'voorwaarden',  title: 'Voorwaarden & A-Z Gebruikersreglement — Doubleyou' },
  '/privacy':            { pagina: 'privacy',      title: 'Privacyverklaring & Cookies — Doubleyou' },
  '/community-regels':   { pagina: 'regels',       title: 'Community Regels & Acceptable Use — Doubleyou' },
  '/beta':               { pagina: 'beta',         title: 'Beta-programma — Doubleyou Paskamerpraat' },
};

const DESCRIPTIONS = {
  home:        'Doubleyou is de gratis community voor tall fashion (1.85m+) en plus size mode (XL–5XL) in Nederland. Lees eerlijke pasvorm reviews, bekijk outfit inspiratie van mensen met jouw lengte, en gebruik AI Outfit Score voor persoonlijk stijladvies. Gratis aanmelden.',
  feed:        'De nieuwste pasvorm ervaringen, fitchecks en outfit-verhalen van tall (1.85m+) en plus size (XL–5XL) fashion-fans in Nederland.',
  uitgelicht:  'Aangeboden producten en campagnes van zorgvuldig geselecteerde merken die kleding maken voor tall en plus size. Eerlijk gemarkeerd als gesponsord.',
  merken:      'Overzicht van merken op Doubleyou die kleding maken voor tall (1.85m+) en plus size (XL–5XL). Bekijk per merk de aanbiedingen, reviews en collecties.',
  looks:       'Outfits van echte community-leden, gefilterd op lengte (1.85m+) en maat (XL t/m 5XL). Inspiratie voor tall fashion en plus size looks.',
  reviews:     'Onafhankelijke pasvorm-reviews van kledingmerken voor mensen die tall zijn (1.85m+) of plus size kleding dragen (XL–5XL).',
  winkel:      'Doubleyou kleding voor tall en plus size: pasvormen tot 1.95m+ en maten XL t/m 5XL. Gemaakt om écht te passen.',
  challenges:  'Wekelijkse stijl-challenges voor de Doubleyou community. Doe mee en verdien DSP punten (DoubleYou Stijlpunten).',
  ovdw:        'De beste community-bijdrage van afgelopen week, gekozen door de Doubleyou community.',
  vergelijker: 'AI-tool die twee outfits met elkaar vergelijkt en persoonlijk stijladvies geeft op basis van jouw lichaamsprofiel, lengte en maat.',
  aistyle:     'Gratis AI Outfit Score & Style Match voor tall en plus size. Upload een foto, krijg direct kleurenanalyse, pasvorm-tips en outfit suggesties.',
  voorwaarden: 'Officiële juridische documenten van Doubleyou: A t/m Z Gebruikersreglement Merkenportaal, Algemene Voorwaarden, Privacyverklaring, AUP en Campagnevoorwaarden. Versie 2.0 — 14 februari 2026.',
  privacy:     'Privacyverklaring en cookiebeleid van Doubleyou. Hoe wij persoonsgegevens verwerken volgens AVG/GDPR.',
  regels:      'Community-regels en Acceptable Use Policy voor Doubleyou. Respecteer alle lichaamstypen, deel eerlijke ervaringen, geen body shaming.',
  beta:        'Doubleyou is momenteel in publieke beta. Doe mee, geef feedback en help de community groeien.',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getBotHTML(pad, config) {
  const canonicalUrl = `https://paskamerpraat.nl${pad}`;
  const desc = DESCRIPTIONS[config.pagina] || DESCRIPTIONS.home;

  const contentMap = {
    home: `<h1>Doubleyou — Tailored for Tall &amp; Plus Size</h1>
      <p class="lead">De gratis Nederlandse community voor mensen die <strong>tall</strong> zijn (1.85m+) of <strong>plus size</strong> kleding dragen (XL–5XL). Vind kleding die écht past, deel eerlijke pasvorm-ervaringen en krijg AI-stijladvies. Een initiatief van Doubleyou — Tall &amp; Plus Size Fashion.</p>

      <h2>Wat doet Doubleyou Paskamerpraat?</h2>
      <ul>
        <li><a href="/feed">Community Feed</a> — Nieuwste posts, fitchecks en outfit-verhalen</li>
        <li><a href="/uitgelicht">Uitgelicht</a> — Aangeboden merken &amp; campagnes voor tall en plus size</li>
        <li><a href="/merken">Merken</a> — Overzicht van alle deelnemende merken</li>
        <li><a href="/looks">Outfit Inspiratie</a> — Looks gefilterd op lengte en maat</li>
        <li><a href="/reviews">Pasvorm Reviews</a> — Eerlijke beoordelingen van kledingmerken</li>
        <li><a href="/ai-stijladvies">AI Stijladvies</a> — Outfit Score, kleurenanalyse en style match</li>
        <li><a href="/outfit-vergelijker">Outfit Vergelijker</a> — Vergelijk twee outfits met AI</li>
        <li><a href="/post-van-de-week">Post van de Week</a> — Beste community-bijdrage</li>
        <li><a href="/challenges">Challenges</a> — Wekelijkse stijl-challenges met DSP punten</li>
        <li><a href="/winkel">Winkel</a> — Doubleyou kleding voor tall &amp; plus size</li>
      </ul>

      <h2>Voor wie is Doubleyou?</h2>
      <p>Voor iedereen die <strong>tall</strong> is (lengte 1.85m of meer) of <strong>plus size</strong> kleding draagt (maat XL t/m 5XL). Onze community helpt je kleding te vinden die zit zoals het hoort — niet "ongeveer goed", maar écht passend bij jouw lichaam.</p>

      <h2>Hoe werkt het?</h2>
      <ol>
        <li>Gratis aanmelden in 30 seconden</li>
        <li>Vul je <em>postuur-profiel</em> (lengte, maat, voorkeur — alleen wat jij wilt delen)</li>
        <li>Bekijk een gepersonaliseerde feed met mensen die op jou lijken qua maat</li>
        <li>Krijg AI-aanbevelingen voor kleding, kleuren en outfits</li>
        <li>Verdien DSP punten door eerlijke reviews te schrijven</li>
      </ol>

      <h2>Veelgestelde vragen</h2>
      <dl>
        <dt>Is Doubleyou gratis?</dt>
        <dd>Ja, alle community-functies zijn 100% gratis. Premium (€4,99/maand) ontgrendelt onbeperkte AI-features.</dd>

        <dt>Welke maten worden besproken?</dt>
        <dd>Tall (vanaf 1.85m) en plus size (XL, XXL, 3XL, 4XL, 5XL). Beide categorieën hebben aparte tags en filters.</dd>

        <dt>Wat zijn DSP punten?</dt>
        <dd>Doubleyou Stijlpunten — verdien je door bij te dragen aan de community: posts, reviews, comments en challenges.</dd>

        <dt>Hoe werkt de AI Outfit Score?</dt>
        <dd>Upload een outfit-foto en de AI analyseert pasvorm, kleurharmonie, proportionering en geeft concrete verbetertips. Werkt met Google Gemini Vision.</dd>

        <dt>Worden mijn lichaamsgegevens gedeeld?</dt>
        <dd>Nooit. Je postuur-profiel is standaard privé. Je bepaalt zelf wat je deelt.</dd>

        <dt>Kan ik mijn account verwijderen?</dt>
        <dd>Ja, op elk moment via <a href="/voorwaarden#privacy">Profiel → Privacy → Account verwijderen</a>. Alle data wordt binnen 30 dagen permanent verwijderd (AVG).</dd>

        <dt>Is Doubleyou voor mannen én vrouwen?</dt>
        <dd>Ja, voor alle geslachten en lichaamstypen. Tall (1.85m+) en plus size (XL–5XL) zijn onze focus, ongeacht gender.</dd>
      </dl>`,

    feed: `<h1>Community Feed — Doubleyou Paskamerpraat</h1>
      <p>${escapeHtml(DESCRIPTIONS.feed)}</p>
      <h2>Wat zie je in de feed?</h2>
      <ul>
        <li>Fitchecks van community-leden</li>
        <li>Pasvorm-ervaringen met specifieke merken</li>
        <li>Outfit-verhalen en stijl-tips</li>
        <li>AI Outfit Scores van leden</li>
      </ul>
      <p><a href="/">← Terug naar Doubleyou</a></p>`,

    uitgelicht: `<h1>Uitgelicht — Aangeboden merken &amp; campagnes</h1>
      <p>${escapeHtml(DESCRIPTIONS.uitgelicht)}</p>
      <p>Alle uitgelichte content is duidelijk gemarkeerd met "<strong>Gesponsord</strong>". Doubleyou werkt alleen met merken die kleding maken voor tall (1.85m+) en plus size (XL–5XL).</p>
      <p><a href="/merken">Alle merken</a> · <a href="/">← Doubleyou</a></p>`,

    merken: `<h1>Merken voor Tall &amp; Plus Size — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.merken)}</p>
      <p>Elk merk op Doubleyou heeft een eigen pagina met collecties, reviews en eerlijke maat-informatie.</p>
      <p><a href="/uitgelicht">Uitgelichte aanbiedingen</a> · <a href="/">← Doubleyou</a></p>`,

    looks: `<h1>Outfit Inspiratie voor Tall &amp; Plus Size — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.looks)}</p>
      <p><a href="/reviews">Pasvorm Reviews</a> · <a href="/">← Doubleyou</a></p>`,

    reviews: `<h1>Eerlijke Pasvorm Reviews — Doubleyou Community</h1>
      <p>${escapeHtml(DESCRIPTIONS.reviews)}</p>
      <p>Reviews zijn geschreven door echte community-leden met hun eigen lengte en maat erbij vermeld. Geen sponsoring, geen filter.</p>
      <p><a href="/">← Doubleyou</a></p>`,

    winkel: `<h1>Winkel — Doubleyou Tailored for Tall &amp; Plus Size</h1>
      <p>${escapeHtml(DESCRIPTIONS.winkel)}</p>
      <p>Bekijk de volledige collectie op <a href="https://doubleyousmallandtall.nl" rel="noopener">doubleyousmallandtall.nl</a></p>
      <p><a href="/">← Community</a></p>`,

    challenges: `<h1>Community Challenges — Doubleyou Paskamerpraat</h1>
      <p>${escapeHtml(DESCRIPTIONS.challenges)}</p>
      <p><a href="/post-van-de-week">Post van de Week</a> · <a href="/">← Doubleyou</a></p>`,

    ovdw: `<h1>Post van de Week — Doubleyou Paskamerpraat</h1>
      <p>${escapeHtml(DESCRIPTIONS.ovdw)}</p>
      <p><a href="/feed">Bekijk de feed</a> · <a href="/">← Doubleyou</a></p>`,

    vergelijker: `<h1>AI Outfit Vergelijker — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.vergelijker)}</p>
      <p>De AI gebruikt Google Gemini Vision om twee outfits naast elkaar te analyseren op pasvorm, kleurharmonie en stijl-coherentie.</p>
      <p><a href="/ai-stijladvies">Alle AI features</a> · <a href="/">← Doubleyou</a></p>`,

    aistyle: `<h1>AI Stijladvies &amp; Outfit Score — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.aistyle)}</p>
      <h2>AI features op Doubleyou</h2>
      <ul>
        <li><strong>Outfit Score</strong> — Beoordeel je outfit op pasvorm, kleur en proportie</li>
        <li><strong>Style Match</strong> — Vind outfits die bij jouw lichaamsprofiel passen</li>
        <li><strong>Kleurenanalyse</strong> — Welke kleuren werken het best bij jouw teint</li>
        <li><strong>Outfit Vergelijker</strong> — Twee outfits naast elkaar analyseren</li>
      </ul>
      <p><a href="/">← Doubleyou</a></p>`,

    voorwaarden: `<h1>Voorwaarden &amp; A-Z Gebruikersreglement — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.voorwaarden)}</p>
      <h2>Documenten</h2>
      <ul>
        <li><a href="/voorwaarden#reglement">A t/m Z Gebruikersreglement Merkenportaal</a> — 26 artikelen</li>
        <li><a href="/voorwaarden#aup">Acceptable Use Policy</a></li>
        <li><a href="/voorwaarden#privacy">Privacyverklaring &amp; Cookies</a></li>
        <li><a href="/voorwaarden#av">Algemene Voorwaarden (B2B)</a></li>
        <li><a href="/voorwaarden#campagnes">Campagnevoorwaarden</a></li>
      </ul>
      <p><strong>Versie 2.0</strong> · 14 februari 2026 · Beheerder: Doubleyou Tailored for Tall &amp; Plus Size</p>
      <p><a href="/">← Doubleyou</a></p>`,

    privacy: `<h1>Privacyverklaring &amp; Cookies — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.privacy)}</p>
      <p>Doubleyou gebruikt alleen functionele cookies en Firebase session tokens. <strong>Géén tracking- of advertentiecookies.</strong></p>
      <p><a href="/voorwaarden">Alle juridische documenten</a> · <a href="/">← Doubleyou</a></p>`,

    regels: `<h1>Community Regels &amp; Acceptable Use — Doubleyou</h1>
      <p>${escapeHtml(DESCRIPTIONS.regels)}</p>
      <ul>
        <li>Respecteer alle lichaamstypen, lengtes en maten</li>
        <li>Deel eerlijke ervaringen — geen sponsored posts zonder vermelding</li>
        <li>Geen body shaming, discriminatie of intimidatie</li>
        <li>Geen nepaccounts of follower-manipulatie</li>
      </ul>
      <p><a href="/voorwaarden#aup">Volledig AUP-document</a> · <a href="/">← Doubleyou</a></p>`,

    beta: `<h1>Beta-programma — Doubleyou Paskamerpraat</h1>
      <p>${escapeHtml(DESCRIPTIONS.beta)}</p>
      <p>Doubleyou is een initiatief van Doubleyou Tailored for Tall &amp; Plus Size.</p>
      <p><a href="/">← Doubleyou</a></p>`,
  };

  const body = contentMap[config.pagina] || contentMap.home;
  const safeTitle = escapeHtml(config.title);
  const safeDesc = escapeHtml(desc);

  // JSON-LD met meerdere schemas voor betere AI-discoverability
  const jsonLd = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://paskamerpraat.nl/#organization",
      "name": "Doubleyou",
      "alternateName": ["Doubleyou Paskamerpraat", "Paskamerpraat"],
      "url": "https://paskamerpraat.nl/",
      "logo": "https://paskamerpraat.nl/icons/icon-512.png",
      "description": "Doubleyou — Tailored for Tall & Plus Size. Community voor tall (1.85m+) en plus size (XL–5XL) fashion in Nederland.",
      "sameAs": ["https://doubleyousmallandtall.nl"],
      "areaServed": { "@type": "Country", "name": "Netherlands" }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": "https://paskamerpraat.nl/#website",
      "url": "https://paskamerpraat.nl/",
      "name": "Doubleyou Paskamerpraat",
      "publisher": { "@id": "https://paskamerpraat.nl/#organization" },
      "inLanguage": "nl-NL"
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "url": canonicalUrl,
      "name": config.title,
      "description": desc,
      "isPartOf": { "@id": "https://paskamerpraat.nl/#website" },
      "inLanguage": "nl-NL"
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Doubleyou", "item": "https://paskamerpraat.nl/" },
        ...(pad !== '/' ? [{ "@type": "ListItem", "position": 2, "name": config.title.split(' — ')[0].split(' | ')[0], "item": canonicalUrl }] : [])
      ]
    },
    ...(config.pagina === 'home' ? [{
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "Is Doubleyou gratis?", "acceptedAnswer": { "@type": "Answer", "text": "Ja, alle community-functies zijn 100% gratis. Premium (€4,99/maand) ontgrendelt onbeperkte AI-features." } },
        { "@type": "Question", "name": "Welke maten worden besproken op Doubleyou?", "acceptedAnswer": { "@type": "Answer", "text": "Tall (vanaf 1.85m lengte) en plus size (XL, XXL, 3XL, 4XL, 5XL). Beide categorieën hebben aparte filters en tags." } },
        { "@type": "Question", "name": "Wat zijn DSP punten?", "acceptedAnswer": { "@type": "Answer", "text": "Doubleyou Stijlpunten — die verdien je door bij te dragen aan de community: posts, reviews, comments en challenges." } },
        { "@type": "Question", "name": "Hoe werkt de AI Outfit Score?", "acceptedAnswer": { "@type": "Answer", "text": "Upload een outfit-foto en de AI analyseert pasvorm, kleurharmonie, proportie en geeft verbetertips. Powered by Google Gemini Vision." } },
        { "@type": "Question", "name": "Is Doubleyou voor mannen én vrouwen?", "acceptedAnswer": { "@type": "Answer", "text": "Ja, voor alle geslachten en lichaamstypen. Tall (1.85m+) en plus size (XL–5XL) zijn de focus, ongeacht gender." } }
      ]
    }] : [])
  ]);

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<link rel="canonical" href="${canonicalUrl}">
<link rel="alternate" hreflang="nl-NL" href="${canonicalUrl}">
<link rel="alternate" hreflang="nl" href="${canonicalUrl}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:type" content="${config.pagina === 'voorwaarden' || config.pagina === 'privacy' || config.pagina === 'regels' ? 'article' : 'website'}">
<meta property="og:site_name" content="Doubleyou">
<meta property="og:locale" content="nl_NL">
<meta property="og:image" content="https://paskamerpraat.nl/hero-model.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Doubleyou — Tall & Plus Size Fashion Community">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@paskamerpraat">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="https://paskamerpraat.nl/hero-model.png">
<script type="application/ld+json">${jsonLd}</script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'DM Sans',sans-serif;max-width:860px;margin:0 auto;padding:32px 20px;color:#1e1a0f;background:#fdf8f0;line-height:1.6}
h1{font-family:'Cormorant Garamond',Georgia,serif;color:#1e1a0f;font-size:2rem;margin:0 0 14px;line-height:1.2}
h2{font-family:'Cormorant Garamond',Georgia,serif;margin-top:32px;color:#1e1a0f;font-size:1.5rem}
.lead{font-size:1.05rem;color:#3a3018;margin-bottom:24px}
a{color:#c67d06;text-decoration:underline}
a:hover{color:#a86b00}
ul,ol{padding-left:22px;margin:8px 0 16px}
li{margin-bottom:8px}
dl{margin:16px 0}
dt{font-weight:700;margin-top:18px;color:#1e1a0f}
dd{margin:6px 0 12px 18px;color:#3a3018}
nav{margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #e8e0d0;font-size:0.9rem}
nav a{margin-right:14px;font-weight:500}
nav a.brand{font-weight:700;font-size:1.05rem;color:#1e1a0f}
footer{margin-top:48px;padding-top:18px;border-top:1px solid #e8e0d0;font-size:0.85rem;color:#888}
strong{color:#1e1a0f}
em{font-style:italic;color:#3a3018}
</style>
</head>
<body>
<nav>
<a href="/" class="brand">Doubleyou · Paskamerpraat</a>
<a href="/feed">Feed</a>
<a href="/uitgelicht">Uitgelicht</a>
<a href="/merken">Merken</a>
<a href="/looks">Looks</a>
<a href="/reviews">Reviews</a>
<a href="/ai-stijladvies">AI Advies</a>
<a href="/winkel">Winkel</a>
</nav>
${body}
<footer>
<a href="/voorwaarden">Voorwaarden</a> · <a href="/voorwaarden#reglement">A-Z Reglement</a> · <a href="/voorwaarden#privacy">Privacy</a> · <a href="/community-regels">Community Regels</a><br>
© 2026 Doubleyou Tailored for Tall &amp; Plus Size · <a href="https://doubleyousmallandtall.nl" rel="noopener">doubleyousmallandtall.nl</a>
</footer>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pad = url.pathname;

    // Statische assets altijd direct naar Pages
    const ASSETS_EXT = /\.(js|css|png|webp|jpg|jpeg|svg|ico|woff|woff2|ttf|json|xml|txt|mp4|webm|mp3|map|pdf|md)$/i;
    if (ASSETS_EXT.test(pad)) {
      return env.ASSETS.fetch(request);
    }

    // Admin / debug / vernieuw / test-hub altijd door (deze hebben X-Robots-Tag: noindex via _headers)
    if (pad.startsWith('/admin') || pad.startsWith('/debug') ||
        pad.startsWith('/vernieuw') || pad.startsWith('/test-hub') ||
        pad.startsWith('/api/') || pad.startsWith('/branding/')) {
      return env.ASSETS.fetch(request);
    }

    // Niet-bot: gewoon naar Pages (de SPA handelt routing zelf af)
    if (!isBot(request)) {
      return env.ASSETS.fetch(request);
    }

    // ── Bot: serveer statische SEO HTML ──
    let config = PAD_CONFIG[pad];
    if (!config) {
      // Probeer hoofdpad (bv. /voorwaarden/anchor → /voorwaarden)
      const hoofdpad = '/' + pad.split('/').filter(Boolean)[0];
      config = PAD_CONFIG[hoofdpad] || PAD_CONFIG['/'];
    }

    // Canonical pad: gebruik het exacte pad als het in PAD_CONFIG staat, anders /
    const botPad = PAD_CONFIG[pad] ? pad : '/';

    return new Response(getBotHTML(botPad, config), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=7200',
        'X-Robots-Tag': 'index, follow, max-snippet:-1, max-image-preview:large',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'User-Agent',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    });
  }
};
