// cache-bust: 1779042567
/**
 * sw-rebeca.js — Service Worker Unificado
 * Versão 4.0
 *
 * Estratégias:
 *   - Shell (HTML/JS/CSS): Cache First + atualização em background
 *   - API (/api/*):        Network First + fallback offline
 *   - Imagens:             Cache First + lazy cache
 *   - Push:                Notificações nativas completas
 *   - Background Sync:     Pedidos offline enfileirados
 */

const VERSION    = 'rebeca-v4';
const SHELL_KEY  = `${VERSION}-shell`;
const API_KEY    = `${VERSION}-api`;
const IMG_KEY    = `${VERSION}-img`;

// ── ASSETS DO SHELL (pré-cache no install) ─────────────────────────────────
const SHELL_ASSETS = [
  '/',
  '/delivery-admin',
  '/agenda-adm',
  '/js/rebeca-realtime.js',
  '/js/rebeca-monitor.js',
  '/js/rebeca-notify.js',
  '/js/rebeca-onboarding.js',
  '/icon-rebeca-192.png',
  '/icon-rebeca-512.png',
  '/agenda-icon-192.png',
  '/agenda-icon-512.png',
];

// ── INSTALL ────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_KEY)
      .then(cache => cache.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {}) // Não bloquear install se algum asset falhar
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !k.startsWith(VERSION))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorar não-GET, extensões de dev, websockets
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.hostname !== self.location.hostname) return;

  // ── API: Network First ───────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(_networkFirst(request, API_KEY, 10000));
    return;
  }

  // ── IMAGENS: Cache First ─────────────────────────────────────────────────
  if (/\.(png|jpg|jpeg|svg|webp|ico|gif)$/i.test(url.pathname)) {
    e.respondWith(_cacheFirst(request, IMG_KEY));
    return;
  }

  // ── JS/CSS: Stale While Revalidate ──────────────────────────────────────
  if (/\.(js|css)$/i.test(url.pathname)) {
    e.respondWith(_staleWhileRevalidate(request, SHELL_KEY));
    return;
  }

  // ── HTML/ROTAS: Network First com fallback offline ───────────────────────
  e.respondWith(_networkFirst(request, SHELL_KEY, 8000));
});

// ── ESTRATÉGIAS ────────────────────────────────────────────────────────────
async function _cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return _offlineFallback(request);
  }
}

async function _networkFirst(request, cacheName, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await caches.match(request);
    if (cached) return cached;
    return _offlineFallback(request);
  }
}

async function _staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => {});
  return cached || fetchPromise || _offlineFallback(request);
}

function _offlineFallback(request) {
  const url = new URL(request.url);
  if (request.headers.get('accept')?.includes('text/html')) {
    return new Response(_offlineHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({
      sucesso: false,
      offline: true,
      msg: 'Sem conexão — dados em cache'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return new Response('Offline', { status: 503 });
}

function _offlineHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Rebeca — Sem conexão</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;
         display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
    .card{background:#1e293b;border-radius:20px;padding:40px 32px;max-width:360px;
          width:100%;text-align:center;border:1px solid #334155}
    .icon{font-size:48px;margin-bottom:20px}
    h1{font-size:1.3rem;font-weight:800;margin-bottom:8px;color:#f8fafc}
    p{font-size:.88rem;color:#94a3b8;line-height:1.6;margin-bottom:24px}
    button{padding:12px 28px;background:#f97316;color:#fff;border:none;
           border-radius:10px;font-size:.88rem;font-weight:700;cursor:pointer;
           font-family:inherit}
    button:hover{background:#ea6c0a}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Sem conexão</h1>
    <p>Verifique sua internet e tente novamente.<br>
       Seus dados estão salvos localmente.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;
}

// ── BACKGROUND SYNC — pedidos offline ─────────────────────────────────────
self.addEventListener('sync', e => {
  if (e.tag === 'sync-pedidos') {
    e.waitUntil(_syncPedidos());
  }
  if (e.tag === 'sync-agendamentos') {
    e.waitUntil(_syncAgendamentos());
  }
});

async function _syncPedidos() {
  try {
    // Ler fila do IndexedDB via postMessage para o client
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SYNC_PEDIDOS' }));
  } catch(e) {}
}

async function _syncAgendamentos() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SYNC_AGENDAMENTOS' }));
  } catch(e) {}
}

// ── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { title: 'Rebeca', body: e.data?.text() }; }

  const tipos = {
    pedido:      { icon: '/icon-rebeca-192.png', badge: '/icon-rebeca-192.png', tag: 'pedido' },
    agendamento: { icon: '/agenda-icon-192.png',  badge: '/agenda-icon-192.png',  tag: 'agend'  },
    pagamento:   { icon: '/icon-rebeca-192.png', badge: '/icon-rebeca-192.png', tag: 'pgto'   },
  };

  const cfg = tipos[data.tipo] || tipos.pedido;

  const opts = {
    body:      data.body || data.msg || 'Nova notificação',
    icon:      data.icon  || cfg.icon,
    badge:     cfg.badge,
    tag:       data.tag   || cfg.tag,
    renotify:  true,
    vibrate:   data.tipo === 'pedido' ? [200, 100, 200] : [100],
    data:      { url: data.url || '/', tipo: data.tipo },
    actions:   data.tipo === 'pedido' ? [
      { action: 'ver',     title: '👀 Ver pedido' },
      { action: 'aceitar', title: '✅ Aceitar' },
    ] : data.tipo === 'agendamento' ? [
      { action: 'ver',      title: '📅 Ver agenda' },
      { action: 'confirmar',title: '✅ Confirmar' },
    ] : [],
  };

  e.waitUntil(
    self.registration.showNotification(data.title || '🍊 Rebeca', opts)
  );
});

// ── NOTIFICATION CLICK ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  const action = e.action;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Focar janela existente
        const existing = clients.find(c => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.postMessage({ type: 'NOTIF_CLICK', action, url, data: e.notification.data });
          return;
        }
        // Abrir nova janela
        return self.clients.openWindow(url);
      })
  );
});

// ── MESSAGE (comunicação com páginas) ──────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'TENANT_CONTEXT') {
    // Armazenar contexto tenant para uso futuro em cache isolation
    self._tenantId = e.data.tenantId || 'unknown';
    self._modulo   = e.data.modulo   || 'default';
    console.log(`[SW] Tenant context: ${self._tenantId}:${self._modulo}`);
  }
  if (e.data?.type === 'CACHE_URLS') {
    const urls = e.data.urls || [];
    caches.open(SHELL_KEY).then(cache => cache.addAll(urls));
  }
  if (e.data?.type === 'GET_VERSION') {
    e.source?.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

console.log(`[SW] ${VERSION} — instalado`);
