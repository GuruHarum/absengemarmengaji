const VERSION = 'loader42';
const STATIC_CACHE = `gemar-static-${VERSION}`;
const RUNTIME_CACHE = `gemar-runtime-${VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/css/theme.css',
  '/css/layout-responsive.css',
  '/css/admin-refinement.css',
  '/css/gm-upgrade-20260928.css',
  '/css/ui-polish-20260928.css',
  '/css/ux-stage5.css',
  '/css/pwa.css',
  '/css/visual-stage8.css',
  '/css/rev37-visual-fixes.css',
  '/js/islamic-quotes.js',
  '/assets/school-logo.png',
  '/assets/icon-192.png',
  '/assets/notification-icon-192.png',
  '/assets/icon-512.png',
  '/assets/maskable-512.png',
  '/assets/apple-touch-icon.png',
  '/assets/notification-badge-96.png'
];

function normalizedRequest(url) {
  return new Request(url.origin + url.pathname, { method: 'GET', credentials: 'same-origin' });
}

async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(PRECACHE.map(async path => {
    const response = await fetch(path, { cache: 'reload' });
    if (response.ok) await cache.put(path, response.clone());
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precache());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('gemar-') && ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.source?.postMessage?.({ type: 'PWA_VERSION', version: VERSION });
  }
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; }
  catch (_) { payload = { body: event.data?.text?.() || '' }; }
  const title = String(payload.title || 'Gemar Mengaji').trim() || 'Gemar Mengaji';
  const body = String(payload.body || 'Ada informasi baru di Gemar Mengaji. Buka aplikasi untuk melihat detail.').trim();
  const data = { ...(payload.data || {}) };
  data.url ||= '/admin.html?pwa=notification';
  const options = {
    body,
    icon: payload.icon || '/assets/notification-icon-192.png',
    badge: payload.badge || '/assets/notification-badge-96.png',
    tag: payload.tag || 'gemar-mengaji',
    renotify: Boolean(payload.renotify),
    data
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || '/admin.html?pwa=notification', self.location.origin).href;
  event.waitUntil((async () => {
    // openWindow pada URL yang masih berada di scope PWA memberi Chromium kesempatan
    // merutekan klik ke WebAPK/standalone Gemar Mengaji, bukan memaksa tab Chrome lama.
    if (clients.openWindow) {
      const opened = await clients.openWindow(targetUrl);
      if (opened) {
        if ('focus' in opened) await opened.focus();
        if (data.notificationId) {
          opened.postMessage({ type: 'OPEN_NOTIFICATION', notificationId: String(data.notificationId) });
        }
        return;
      }
    }
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const fallback = clientsList.find(client => {
      try { return new URL(client.url).origin === self.location.origin; } catch (_) { return false; }
    });
    if (fallback) {
      if ('navigate' in fallback) await fallback.navigate(targetUrl);
      await fallback.focus();
      if (data.notificationId) {
        fallback.postMessage({ type: 'OPEN_NOTIFICATION', notificationId: String(data.notificationId) });
      }
    }
  })());
});

async function networkNavigation(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request, { cache: 'no-store' });
  } catch (_) {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(request, url) {
  const cache = await caches.open(RUNTIME_CACHE);
  const key = normalizedRequest(url);
  const cached = await cache.match(key);
  const network = fetch(request, { cache: 'no-cache' }).then(async response => {
    if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    void network;
    return cached;
  }
  const response = await network;
  return response || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkNavigation(event));
    return;
  }

  const destination = request.destination;
  const cacheable = ['script', 'style', 'image', 'font', 'manifest'].includes(destination)
    || /\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname);
  if (cacheable) event.respondWith(staleWhileRevalidate(request, url));
});
