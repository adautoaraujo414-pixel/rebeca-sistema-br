const CACHE = 'rebeca-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Nunca interceptar nada — deixar tudo passar direto para a rede
  // Isso resolve o Maximum call stack e network error no caixa
  return;
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '🍊 Rebeca';
  const opts = {
    body: data.body || 'Nova notificação',
    icon: '/icon-rebeca-192.png',
    badge: '/icon-rebeca-192.png',
    tag: data.tag || 'rebeca-notif',
    renotify: true,
    data: { url: data.url || '/' },
    actions: data.actions || []
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
    for (const c of cs) {
      if (c.url === url && 'focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
