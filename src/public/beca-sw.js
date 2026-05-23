var CACHE = 'beca-v5';
var ASSETS = [
  '/beca-estuda',
  '/beca-estuda.html',
  '/beca-icon-192.png',
  '/beca-icon-512.png',
  '/beca-manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(ASSETS.map(function(url) {
        return c.add(url).catch(function(err) {
          console.log('SW cache miss:', url, err);
        });
      }));
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) {
        return k !== CACHE;
      }).map(function(k) {
        return caches.delete(k);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Ignorar requests nao GET e API Anthropic (sempre online)
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('anthropic.com')) return;
  if(e.request.url.includes('fonts.googleapis.com') ||
     e.request.url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  // Cache first para assets locais, network first para paginas
  var isPage = e.request.mode === 'navigate' ||
               e.request.url.endsWith('/beca-estuda') ||
               e.request.url.endsWith('/beca-estuda.html');

  if(isPage) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match('/beca-estuda.html') ||
               caches.match('/beca-estuda');
      })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          if(res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
          }
          return res;
        });
      })
    );
  }
});
