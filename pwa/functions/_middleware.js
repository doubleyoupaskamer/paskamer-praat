/* ═════════════════════════════════════════════════════════════════════
 * Paskamer Praat - Cloudflare Pages Middleware for Bot Prerendering
 * ═════════════════════════════════════════════════════════════════════
 *
 * Detecteert search-engine crawlers via User-Agent en injecteert
 * per-route SEO metadata + zichtbare H1/intro content in index.html.
 *
 * Voor echte users: HttpResponse pass-through, geen wijzigingen, geen
 * extra latency. De originele SPA blijft werken.
 *
 * Voor bots (Googlebot, Bingbot, DuckDuckBot, Yandex, Baiduspider,
 *   FacebookExternalHit, TwitterBot, LinkedInBot, Slackbot,
 *   WhatsApp, Applebot, PetalBot): edge-side HTML transform met:
 *   - Unieke <title> per route
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - Open Graph + Twitter Card tags
 *   - BreadcrumbList JSON-LD
 *   - Zichtbare H1 + intro-alinea (SEO body block)
 *
 * Runt op edge, ~5-15ms extra latency alleen voor bots.
 * ═════════════════════════════════════════════════════════════════════ */

import { findRoute, SITE } from './seo-routes.js';

const BOT_RX = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|bytespider|google-inspectiontool|chrome-lighthouse|pingdom|gtmetrix|headlesschrome/i;

/**
 * Escape HTML voor attribuutwaarden.
 */
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function isBot(ua) {
  if (!ua) return false;
  return BOT_RX.test(ua);
}

function isDocumentRequest(request, url) {
  var method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return false;
  // Skip static assets en API
  var p = url.pathname;
  if (p.startsWith('/api/'))       return false;
  if (p.startsWith('/functions/')) return false;
  if (p.startsWith('/icons/'))     return false;
  if (p.startsWith('/js/'))        return false;
  if (p.startsWith('/css/'))       return false;
  if (p.startsWith('/extensions/'))return false;
  if (p === '/sw.js')              return false;
  if (p === '/manifest.json')      return false;
  if (p === '/robots.txt')         return false;
  if (p === '/sitemap.xml')        return false;
  if (p === '/favicon.ico')        return false;
  // File extensions
  var ext = p.match(/\.([a-z0-9]+)$/i);
  if (ext && ext[1] !== 'html') return false;
  return true;
}

function buildBreadcrumbJsonLd(crumbs, origin) {
  var items = [{ name: 'Home', url: origin + '/' }].concat(
    (crumbs || []).map(function (c) { return { name: c.name, url: origin + c.url }; })
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(function (it, i) {
      return {
        '@type': 'ListItem',
        position: i + 1,
        name: it.name,
        item: it.url
      };
    })
  };
}

function renderMetaBlock(meta, canonicalUrl) {
  var image = meta.image || SITE.image;
  var ogType = meta.ogType || 'website';
  return [
    '<title>', esc(meta.title), '</title>',
    '<meta name="description" content="', esc(meta.description), '">',
    '<link rel="canonical" href="', esc(canonicalUrl), '">',
    '<meta property="og:title" content="', esc(meta.title), '">',
    '<meta property="og:description" content="', esc(meta.description), '">',
    '<meta property="og:type" content="', esc(ogType), '">',
    '<meta property="og:url" content="', esc(canonicalUrl), '">',
    '<meta property="og:image" content="', esc(image), '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:site_name" content="', esc(SITE.name), '">',
    '<meta property="og:locale" content="', esc(SITE.locale), '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="', esc(meta.title), '">',
    '<meta name="twitter:description" content="', esc(meta.description), '">',
    '<meta name="twitter:image" content="', esc(image), '">'
  ].join('\n  ');
}

function renderSeoBody(meta) {
  // Bot-only zichtbaar SEO-block. Voor echte users onzichtbaar (aria-hidden)
  // en wordt door de PWA JS overschreven zodra de app rendert.
  var h1    = esc(meta.h1 || meta.title);
  var intro = esc(meta.intro || meta.description);
  return [
    '<div id="pp-seo-body" data-seo-prerender="1"',
    ' style="max-width:900px;margin:24px auto;padding:16px;font-family:system-ui,sans-serif;color:#3a2f24;line-height:1.6">',
    '<h1 style="font-family:\'Cormorant Garamond\',Georgia,serif;color:#c67d06;font-size:2rem;margin:0 0 12px">', h1, '</h1>',
    '<p style="font-size:1.05rem">', intro, '</p>',
    '</div>'
  ].join('');
}

/**
 * De HTMLRewriter transformeert de originele index.html:
 *  - vervang <title>
 *  - vervang <meta name="description">
 *  - vervang <link rel="canonical">
 *  - vervang og:*, twitter:*
 *  - append BreadcrumbList JSON-LD in <head>
 *  - inject SEO body block direct na <body>
 */
class MetaRewriter {
  constructor(html) {
    this.html = html;
    this.done = false;
  }
  element(element) {
    if (this.done) { element.remove(); return; }
    element.replace(this.html, { html: true });
    this.done = true;
  }
}

class RemoveElement {
  element(element) { element.remove(); }
}

async function prerenderForBot(request, env, url) {
  // Fetch origineel index.html (asset)
  var indexUrl = new URL('/index.html', url.origin);
  var originalResp = await env.ASSETS.fetch(new Request(indexUrl.toString(), {
    method: 'GET',
    headers: { 'accept': 'text/html' }
  }));
  if (!originalResp.ok) return originalResp;

  var routeMatch = findRoute(url.pathname, url.search);
  var meta = routeMatch.meta;
  var canonical = SITE.origin + routeMatch.path;

  var metaBlock = renderMetaBlock(meta, canonical);
  var breadcrumb = buildBreadcrumbJsonLd(meta.crumbs, SITE.origin);
  var breadcrumbTag = '<script type="application/ld+json" data-seo-prerender="1">'
    + JSON.stringify(breadcrumb) + '</script>';
  var seoBody = renderSeoBody(meta);

  // Gebruik Cloudflare's HTMLRewriter API
  var rewriter = new HTMLRewriter()
    // Verwijder de bestaande <title>, <meta name=description>, <link rel=canonical>
    // en og:* / twitter:* om ze te vervangen door route-specifieke versies.
    .on('title', new RemoveElement())
    .on('meta[name="description"]', new RemoveElement())
    .on('link[rel="canonical"]', new RemoveElement())
    .on('meta[property^="og:"]', new RemoveElement())
    .on('meta[name^="twitter:"]', new RemoveElement())
    // Voeg de nieuwe meta-block toe direct na <meta charset>
    .on('head', {
      element: function (el) {
        el.prepend(metaBlock, { html: true });
        el.append(breadcrumbTag, { html: true });
      }
    })
    // Injecteer SEO body block direct na <body>
    .on('body', {
      element: function (el) {
        el.prepend(seoBody, { html: true });
      }
    });

  var transformed = rewriter.transform(originalResp);

  // Kopieer response met aangepaste headers
  var headers = new Headers(transformed.headers);
  headers.set('X-Prerender', 'bot-optimized');
  headers.set('X-Prerender-Route', routeMatch.path);
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600'); // 5m browser, 1h edge
  headers.set('Vary', 'User-Agent');

  return new Response(transformed.body, {
    status: originalResp.status,
    headers: headers
  });
}

export const onRequest = async (context) => {
  var request = context.request;
  var env     = context.env;
  var url     = new URL(request.url);

  // Skip als geen document request
  if (!isDocumentRequest(request, url)) {
    return context.next();
  }

  var ua = request.headers.get('user-agent') || '';

  // Alleen prerenderen voor echte bots
  if (!isBot(ua)) {
    return context.next();
  }

  // Alleen prerenderen voor publieke routes (private routes krijgen
  // X-Robots-Tag: noindex via _headers, en dit ziet Google direct)
  var p = url.pathname.toLowerCase();
  var PRIVATE = ['/admin', '/account', '/leden', '/login', '/register', '/checkout'];
  for (var i = 0; i < PRIVATE.length; i++) {
    if (p === PRIVATE[i] || p.startsWith(PRIVATE[i] + '/')) {
      // Laat de normale response gaan met noindex headers uit _headers
      return context.next();
    }
  }

  try {
    return await prerenderForBot(request, env, url);
  } catch (err) {
    // Bij fout: fail-open naar originele SPA response, log via header
    var resp = await context.next();
    var h = new Headers(resp.headers);
    h.set('X-Prerender-Error', String(err && err.message || err).slice(0, 200));
    return new Response(resp.body, { status: resp.status, headers: h });
  }
};
