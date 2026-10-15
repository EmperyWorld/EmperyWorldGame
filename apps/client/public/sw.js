/* cache-first hashed JS; network-first /media + /maps so regenerations apply. Never /api, /ws, /health, or POST. */
const CACHE = 'empery-static-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api') || p.startsWith('/ws') || p === '/health' || p.startsWith('/health')) {
    return;
  }

  // Vite hashed bundles stay cache-first.
  if (p.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Media/maps change in place without content hashes — prefer network.
  if (p.startsWith('/media/') || p.startsWith('/maps/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res.clone());
          return res;
        } catch (err) {
          const fallback = await cache.match(req);
          if (fallback) return fallback;
          throw err;
        }
      })(),
    );
  }
});
