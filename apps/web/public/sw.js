// Cache only the app shell and hashed public assets. Never cache API responses or employee data.
const CACHE = 'bilim-shell-v3-written';
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch('/', { cache: 'reload' });
      const html = await response.clone().text();
      await cache.put('/', response);
      const assets = Array.from(
        html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
        (match) => match[1],
      );
      await cache.addAll(assets);
    })(),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith('/api')
  )
    return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            void caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (u.pathname.startsWith('/assets/'))
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              void caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return r;
          }),
      ),
    );
});
