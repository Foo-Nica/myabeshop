/* Myabéshop service worker: keeps the courier app usable without network (§8.1).
 * - App shell (/livreur pages, JS/CSS chunks, icons): served from cache, refreshed in the background.
 * - API calls are never cached here: the app keeps its own copy of the deliveries and
 *   queues actions in local storage, then replays them when the network is back. */
const CACHE = 'myabe-livreur-v1';
const SHELL = ['/livreur', '/livreur/connexion', '/icon.svg', '/livreur.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages of the courier app: network first, cached copy when offline.
  if (req.mode === 'navigate' && url.pathname.startsWith('/livreur')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((r) => r || caches.match('/livreur'))),
    );
    return;
  }

  // Static assets: cache first (file names are content-hashed).
  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
