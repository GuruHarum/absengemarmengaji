const VERSION = 'gemar-static-20260928-roster20-pagination';
const STATIC = ['/offline.html', '/css/theme.css', '/css/layout-responsive.css', '/css/admin-refinement.css', '/css/gm-upgrade-20260928.css', '/css/ui-polish-20260928.css', '/assets/school-logo.png', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/maskable-512.png', '/assets/apple-touch-icon.png', '/manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(STATIC))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gemar-static-') && k !== VERSION).map(k => caches.delete(k))))));
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE')
    self.skipWaiting(); });
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin)
        return;
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => caches.match('/offline.html')));
        return;
    }
    if (!url.search && STATIC.includes(url.pathname))
        event.respondWith(fetch(request, { cache: 'no-cache' }).catch(() => caches.match(url.pathname)));
});
