const CACHE = 'agenda-v2';
const ASSETS = [
  '/espaco-digital',
  '/agenda-manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // nunca cachear API
  e.respondWith(
    fetch(e.request)
      .then(function(resp) {
        var clone = resp.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        return resp;
      })
      .catch(function() {
        return caches.match(e.request);
      })
  );
});

// Push notifications
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  var titulo = data.titulo || 'Rebeca Agenda';
  var corpo = data.corpo || 'Você tem um agendamento!';
  var icon = data.icon || '/agenda-icon-192.png';
  e.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: icon,
      badge: icon,
      vibrate: [200, 100, 200],
      data: data
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url || '/espaco-digital'));
});
