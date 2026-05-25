const CACHE = "agenda-v1779683027";
self.addEventListener("install", function(e) {
  self.skipWaiting();
});
self.addEventListener("activate", function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function(e) {
  if(e.request.method !== "GET") return;
  if(e.request.url.includes("/api/")) return;
  e.respondWith(fetch(e.request).then(function(resp) {
    var clone = resp.clone();
    caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
    return resp;
  }).catch(function() {
    return caches.match(e.request);
  }));
});
