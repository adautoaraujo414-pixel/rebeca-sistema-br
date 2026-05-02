const CACHE_NAME = "rebeca-v" + Date.now();
const urlsToCache = ["/motorista", "/manifest.json"];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const url = event.request.url;
    if (url.includes("/api/") || url.includes("/admin-master") || url.includes("/delivery-admin") || url.includes("/delivery-auth") || url.includes("/rebeca-delivery") || url.includes("/delivery-caixa") || url.includes("/delivery-garcom") || url.includes("/delivery-cozinha")) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});
