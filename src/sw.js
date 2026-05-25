// vite-plugin-pwa injecte self.__WB_MANIFEST — on l'utilise pour le versioning
var CACHE_NAME = 'peabloom-v' + ((self.__WB_MANIFEST || []).length);
var BASE = '/Peabloom/';
var PRECACHE_URLS = [BASE, BASE + 'index.html'];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  // Toutes les navigations SPA → on sert index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(BASE + 'index.html').then(function(r) {
        return r || fetch(event.request);
      })
    );
    return;
  }
  // Assets statiques → cache first, réseau en fallback
  event.respondWith(
    caches.match(event.request).then(function(r) {
      return r || fetch(event.request).then(function(response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});

self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || '\uD83C\uDF38 PeaBloom', {
      body: data.body || '',
      icon: BASE + 'icon-192.png',
      badge: BASE + 'icon-192.png',
      image: BASE + 'splash-logo.png',
      data: { tab: data.tab || 'entry' }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var tab = (event.notification.data && event.notification.data.tab) || 'entry';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.includes(BASE) && 'focus' in c) {
          c.postMessage({ type: 'SET_TAB', tab: tab });
          return c.focus();
        }
      }
      return clients.openWindow(BASE + '?tab=' + tab);
    })
  );
});
