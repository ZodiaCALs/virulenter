/* ============================================================
   Virulenter · sw.js
   Makes the installed app work offline. Deliberately conservative:

     • the shell (html, css, js, icons, manifest) is pre-cached on install
     • navigations are network-first, so a redeployed app is picked up on the
       next online load, with the cached shell as the offline fallback
     • everything same-origin else is stale-while-revalidate
     • nothing is ever written to localStorage — the cache stores code only,
       never the user's taps, which live in the URL

   Bump CACHE when the shell changes; the old cache is dropped on activate.
   ============================================================ */
const CACHE = 'virulenter-v6';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/views.css',
  './css/stats.css',
  './js/core.js',
  './js/codec.js',
  './js/store.js',
  './js/ui.js',
  './js/views.js',
  './js/charts.js',
  './js/stats.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* addAll rejects the whole install if one file 404s, so add individually */
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { /* optional file */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* the app keeps its whole session in the query string and fragment, so two
     navigations to "the same" URL can carry completely different data —
     never serve a navigation from the cache without trying the network */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('<h1>Offline</h1><p>Open Virulenter once while online to install it.</p>',
                 { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      /* refresh in the background, serve the cached copy immediately */
      fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
