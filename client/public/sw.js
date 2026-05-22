const CACHE_NAME = 'draw-party-shell-v1';
const APP_SHELL = ['.', './index.html', './manifest.webmanifest', './icon.svg', './art/draw-party-sprites.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && shouldCache(request, url)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        if (request.mode === 'navigate') {
          return caches.match('.');
        }
        return Response.error();
      })
  );
});

function shouldCache(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/art/') ||
    APP_SHELL.includes(url.pathname)
  );
}
