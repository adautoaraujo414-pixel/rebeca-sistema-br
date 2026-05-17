const CACHE = "agenda-v3-1779045326';
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
    caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
    return resp;
  }).catch(function(){ return caches.match(e.request); }));
});
self.addEventListener("push", function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) {}
  var titulo = data.titulo || "Rebeca Agenda";
  var corpo  = data.corpo  || "Nova notificacao";
  var icon   = data.icon   || "/agenda-icon.svg";
  var url    = data.url    || "/agenda-adm";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: corpo, icon: icon, badge: icon,
    vibrate: [200,100,200],
    data: { url: url, tipo: data.tipo || "geral" },
    tag: data.tipo || "geral",
    renotify: true
  }));
});
self.addEventListener("notificationclick", function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/agenda-adm";
  e.waitUntil(clients.matchAll({ type:"window", includeUncontrolled:true }).then(function(list) {
    for(var i=0;i<list.length;i++){
      if(list[i].url.includes(url) && "focus" in list[i]) return list[i].focus();
    }
    if(clients.openWindow) return clients.openWindow(url);
  }));
});
