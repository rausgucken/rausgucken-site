/**
 * rausgucken.de — Service Worker v1
 * - Shell (HTML, CSS, JS, fonts): cache-first
 * - /data/*.json: network-first, cache fallback
 * - /og/** images: cache-first
 * - Push notifications: show reminder for saved events
 */

const CACHE_VERSION = 'rg-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

const SHELL_URLS = ['/', '/offline.html', '/site.webmanifest', '/logo.svg', '/logo.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('rg-') && ![SHELL_CACHE, DATA_CACHE, IMAGE_CACHE].includes(k))
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin &&
      !url.hostname.includes('fonts.gstatic.com') &&
      !url.hostname.includes('fonts.googleapis.com')) return;

  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (url.pathname.startsWith('/og/')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }
  if (url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const toCache = resp.clone();
            caches.open(SHELL_CACHE).then(c => c.put(request, toCache));
          }
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/offline.html');
        })
    );
    return;
  }
  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let p;
  try { p = event.data.json(); } catch { p = { title: 'rausgucken.de', body: event.data.text() }; }
  const { title = 'rausgucken.de', body = '', url = '/', icon } = p;
  event.waitUntil(
    self.registration.showNotification(title, {
      body, icon: icon || '/android-chrome-192x192.png',
      badge: '/favicon-96x96.png',
      data: { url }, tag: 'rg-event-reminder',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) { if (w.url === target && 'focus' in w) return w.focus(); }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp.ok) (await caches.open(cacheName)).put(req, resp.clone());
    return resp;
  } catch { return new Response('Offline', { status: 503 }); }
}

async function networkFirst(req, cacheName) {
  try {
    const resp = await fetch(req);
    if (resp.ok) (await caches.open(cacheName)).put(req, resp.clone());
    return resp;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  const freshPromise = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  // Always return cached immediately if available; fresh updates cache in background.
  // If no cache, await fresh — but guard against null (network failure + no cache).
  if (cached) { freshPromise; return cached; }
  const fresh = await freshPromise;
  return fresh || new Response('', { status: 503 });
}
