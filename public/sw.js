/**
 * SynCRM Service Worker
 * Strategy:
 *  - Static assets (/_next/static)  : cache-first (immutable, hashed filenames)
 *  - Images (/icons, /_next/image)  : cache-first
 *  - HTML navigation                : network-first, fall back to app shell or /offline
 *  - API / same-origin /api/        : network-only (never cache live data)
 *  - Everything else                : network-first with cache fallback
 *
 * Cross-origin requests (Convex cloud, fonts CDN, etc.) are skipped entirely
 * by the origin guard at the top of the fetch handler.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `syncrm-static-${CACHE_VERSION}`;
const IMAGE_CACHE   = `syncrm-images-${CACHE_VERSION}`;
const PAGES_CACHE   = `syncrm-pages-${CACHE_VERSION}`;

// Pages to cache on install so the offline shell is available immediately.
// Only cache public, auth-independent pages. We deliberately do NOT precache
// '/app' (or any /app/* route): those are auth-gated and resolve to a redirect
// when unauthenticated, which would poison the cache with a login page served
// under an app-route key — a known cause of PWA redirect loops.
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/offline',
];

// ─── Install ────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ───────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  const knownCaches = [STATIC_CACHE, IMAGE_CACHE, PAGES_CACHE];
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('syncrm-') && !knownCaches.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ──────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests from our own origin.
  // This single guard covers all cross-origin resources including Convex cloud,
  // Google Fonts, and any CDN assets.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Skip Next.js hot-reload (dev, but harmless in prod)
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // Never cache same-origin API routes - Convex mutations/queries arrive here
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first (content-hashed filenames, safe to cache forever)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Images: cache-first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/_next/image') ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // HTML navigation: network-first, fall back to cached app shell or /offline
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // Everything else (JS chunks not under /_next/static, etc.): network-first
  event.respondWith(networkFirst(request, PAGES_CACHE));
});

// ─── Strategies ─────────────────────────────────────────────────────────────

/**
 * Cache-first: look up the named cache first; fetch and store on miss.
 * Uses the specific named cache for both lookup and storage to avoid
 * cross-cache pollution.
 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // Return a generic offline error for assets (the browser will show a broken asset)
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first: try the network, fall back to the named cache.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    // Never cache redirected responses: storing a redirect under the original
    // request key serves the wrong page on later cache hits.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached ?? new Response('Network error', { status: 503 });
  }
}

/**
 * Network-first for HTML pages with a multi-tier offline fallback:
 *  1. Exact URL from cache
 *  2. Cached / (landing page)
 *  3. Cached /offline (explicit offline page)
 *  4. Inline HTML last resort
 *
 * We never fall back to a cached '/app' shell: it is auth-gated and may hold a
 * redirect/login response, which would mask the real route and loop the PWA.
 */
async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    // Skip caching redirects (e.g. an auth bounce to /login) to avoid storing
    // the wrong page under an app-route key.
    if (response.ok && !response.redirected) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const pagesCache = await caches.open(PAGES_CACHE);
    const cached =
      (await pagesCache.match(request)) ||
      (await pagesCache.match('/')) ||
      (await pagesCache.match('/offline'));
    return (
      cached ??
      new Response(
        '<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head>' +
        '<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">' +
        '<div style="text-align:center"><h1>You are offline</h1>' +
        '<p>Please check your connection and <a href="/">try again</a>.</p></div></body></html>',
        { headers: { 'Content-Type': 'text/html' }, status: 503 }
      )
    );
  }
}
