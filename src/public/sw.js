const CACHE_NAME = 'rebeca-corridas-v2';
const urlsToCache = ['/motorista', '/manifest.json'];

// Instalação
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

// Ativação
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

// Fetch com cache
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});

// PUSH NOTIFICATIONS - receber do servidor
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const titulo = data.titulo || '🚗 NOVA CORRIDA!';
    const corpo = data.corpo || 'Você tem uma nova corrida disponível!';
    const icone = data.icone || '/icons/icon-192.png';
    
    event.waitUntil(
        self.registration.showNotification(titulo, {
            body: corpo,
            icon: icone,
            badge: '/icons/icon-72.png',
            vibrate: [300, 100, 300, 100, 300, 100, 500],
            tag: 'corrida-' + (data.corridaId || Date.now()),
            requireInteraction: true,
            silent: false,
            renotify: true,
            actions: [
                { action: 'aceitar', title: '✅ Ver Corrida' },
                { action: 'ignorar', title: '❌ Ignorar' }
            ],
            data: data
        })
    );
});

// Clique na notificação
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'aceitar' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
                // Se já tem uma aba aberta, focar nela
                for (const client of clientList) {
                    if (client.url.includes('motorista') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Senão, abrir nova aba
                return clients.openWindow('/motorista-app.html');
            })
        );
    }
});

// Background sync - manter conexão
self.addEventListener('sync', event => {
    if (event.tag === 'check-corridas') {
        event.waitUntil(checkNovasCorridas());
    }
});

async function checkNovasCorridas() {
    console.log('[SW] Verificando novas corridas...');
}
