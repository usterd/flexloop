/* =========================================================================
   sw.js — offline shell.

   TO SHIP AN UPDATE: bump CACHE_VERSION. Nothing else. The old cache is
   deleted on activate and every file is fetched fresh.

   There is no network content in this app, so the strategy is simply
   cache-first with no network fallback worth speaking of.
   ========================================================================= */

const CACHE_VERSION = 'flexloop-v7';

/* Explicit list. Anything missing here is missing offline. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/stats.js',
  './js/charts.js',
  './js/importers.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // addAll is all-or-nothing; add individually so one bad path cannot
    // silently break the whole install.
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] could not precache', url, err);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // nothing external exists

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Navigations: serve the shell. Hash routes never hit the network anyway,
    // but a cold deep-link or a reload must resolve to index.html.
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html'))
          || (await cache.match('./'))
          || fetch(req).catch(() => new Response('Offline', { status: 503 }));
    }

    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;

    try {
      const res = await fetch(req);
      // Cache anything same-origin we did not know about at install time.
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
