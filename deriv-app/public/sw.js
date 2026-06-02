const CACHE_NAME = 'axiom-digit-v1';
const urlsToCache = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  // Network first for API calls, cache first for static assets
  if (event.request.url.includes('/api/') || event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request)
    )
  );
});
