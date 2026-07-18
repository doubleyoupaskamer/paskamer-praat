/**
 * Cloudflare Pages Function - API proxy
 *
 * Vangt ALLE /api/* requests op paskamerpraat.nl en stuurt ze door
 * naar de emergentagent backend. Ondersteunt GET, POST, PUT, DELETE,
 * PATCH, OPTIONS, HEAD. Behoudt headers, body, methode en query string.
 *
 * Waarom: Cloudflare Pages `_redirects` proxied ALLEEN GET-requests
 * (POST/PUT/DELETE geven HTTP 405). Pages Functions overkomt dit.
 *
 * Voordelen versus directe cross-origin fetch:
 * - Same-origin: geen adblock false-positives op preview.emergentagent.com
 * - Geen CORS-preflight roundtrips nodig
 * - Werkt achter VPN/firewall die de preview URL blokkeert
 */

const BACKEND_ORIGIN = 'https://paskamer-stability.preview.emergentagent.com';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // Bouw het target-pad. context.params.path is een array bij catchall routes.
  const pathParts = Array.isArray(params.path) ? params.path : [params.path || ''];
  const targetPath = '/api/' + pathParts.filter(Boolean).join('/');
  const targetUrl = BACKEND_ORIGIN + targetPath + url.search;

  // Headers overnemen. Sommige hop-by-hop headers moeten we NIET meesturen
  // (host wordt door de fetch API automatisch gezet, cf-headers zijn intern).
  const forwardedHeaders = new Headers();
  const strippedHeaders = new Set([
    'host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
    'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for'
  ]);
  for (const [key, value] of request.headers.entries()) {
    if (!strippedHeaders.has(key.toLowerCase())) {
      forwardedHeaders.set(key, value);
    }
  }

  // Nieuwe request opbouwen. Body alleen doorsturen voor methodes die
  // een body ondersteunen (GET/HEAD hebben geen body).
  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const forwardedRequest = new Request(targetUrl, {
    method: method,
    headers: forwardedHeaders,
    body: hasBody ? request.body : undefined,
    redirect: 'follow',
    // Duplex "half" is nodig voor streaming bodies (POST met binary data).
    duplex: hasBody ? 'half' : undefined,
  });

  try {
    const backendResponse = await fetch(forwardedRequest);

    // Response met dezelfde status, headers en body doorgeven aan de client.
    const responseHeaders = new Headers(backendResponse.headers);
    // Optioneel: strip cache-control zodat de proxy niet zelf cached
    responseHeaders.delete('cf-cache-status');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'proxy_upstream_unreachable',
        message: 'Backend niet bereikbaar via Pages Functions proxy.',
        detail: String(err && err.message || err),
        target: targetUrl,
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
}
