// Minimal offline shell. Cache-first for same-origin static assets; the network is
// always used for /api/ and /uploads/. Bump CACHE to invalidate on deploy.
const CACHE = 'selfdash-shell-v1';
const SHELL = ['/', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  e.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => hit || caches.match('/'));
      return hit || net;
    })
  );
});
