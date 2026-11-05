// Only cache the public app shell. NEVER cache API responses or patient documents.
const CACHE = 'diabeatit-shell-v2';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.open(CACHE).then(async cache => { const cached = await cache.match(event.request); if (cached) return cached; const response = await fetch(event.request); if (response.ok) await cache.put(event.request,response.clone()); return response; }));
  }
});