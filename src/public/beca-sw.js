// ══ BECA ESTUDA — SERVICE WORKER ══
// Estrategia: Network First — sempre busca do servidor
// Se offline, usa cache como fallback
// Atualiza automaticamente em background sem precisar baixar de novo

var CACHE = 'beca-v14';
var ASSETS = [
  '/beca-estuda',
  '/beca-estuda.html',
  '/beca-icon-192.png',
  '/beca-icon-512.png',
  '/beca-manifest.json'
];

// INSTALAR — pre-cachear assets essenciais
self.addEventListener('install', function(e) {
  self.skipWaiting(); // Ativa imediatamente sem esperar aba fechar
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(ASSETS.map(function(url) {
        return c.add(url).catch(function(err) {
          console.log('[SW] cache miss:', url);
        });
      }));
    })
  );
});

// ATIVAR — limpar caches antigos e assumir controle imediato
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) {
          console.log('[SW] deletando cache antigo:', k);
          return caches.delete(k);
        }
      }));
    }).then(function() {
      return self.clients.claim(); // Assume controle de todas as abas abertas
    }).then(function() {
      // Notificar todas as abas que ha uma nova versao
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE });
        });
      });
    })
  );
});

// FETCH — Network First para paginas, Cache First para assets estaticos
self.addEventListener('fetch', function(e) {
  // Ignorar requests nao GET
  if (e.request.method !== 'GET') return;

  // Nunca cachear API Anthropic
  if (e.request.url.includes('anthropic.com')) return;

  // Nunca cachear fontes externas (deixar browser cuidar)
  if (e.request.url.includes('googleapis.com') ||
      e.request.url.includes('gstatic.com')) return;

  var isPage = e.request.mode === 'navigate' ||
               e.request.url.includes('/beca-estuda');

  if (isPage) {
    // PAGINA: Network First — sempre tenta pegar versao nova do servidor
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(function(res) {
        if (res.ok) {
          // Salva a versao nova no cache para uso offline
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function() {
        // Offline: usa cache
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/beca-estuda');
        });
      })
    );
  } else {
    // ASSETS (icones, manifest): Cache First com revalidacao em background
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        var networkFetch = fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        }).catch(function() { return cached; });

        // Retorna cache imediatamente mas atualiza em background
        return cached || networkFetch;
      })
    );
  }
});

// MENSAGEM — receber comandos do app
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'CLEAR_CACHE') {
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    });
  }
});
