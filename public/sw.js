// Only cache the public app shell. NEVER cache API responses or patient documents.
const CACHE = 'diabeatit-shell-v3';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest']))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.open(CACHE).then(async cache => { const cached = await cache.match(event.request); if (cached) return cached; const response = await fetch(event.request); if (response.ok) await cache.put(event.request,response.clone()); return response; }));
  }
});
self.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.type !== 'diabeatit-reminder' || typeof data.title !== 'string' || typeof data.body !== 'string') return;
  const title = data.title.slice(0, 80);
  const body = data.body.slice(0, 240);
  const tag = typeof data.tag === 'string' && data.tag.startsWith('diabeatit-dose-') ? data.tag.slice(0, 80) : 'diabeatit-dose';
  if (!title || !body) return;
  event.waitUntil(self.registration.showNotification(title, { body, tag }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = open.find(entry => new URL(entry.url).origin === self.location.origin);
    if (client) { await client.focus(); client.postMessage({ type: 'diabeatit-remind' }); return; }
    await self.clients.openWindow('/');
  })());
});