import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '🌸 PeaBloom', {
      body: data.body || '',
      icon: '/Peabloom/icon-192.png',
      badge: '/Peabloom/icon-192.png',
      image: '/Peabloom/splash-logo.png',
      data: { tab: data.tab || 'entry' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tab = event.notification.data?.tab || 'entry';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const client of list) {
        if (client.url.includes('/Peabloom/') && 'focus' in client) {
          client.postMessage({ type: 'SET_TAB', tab });
          return client.focus();
        }
      }
      return clients.openWindow(`/Peabloom/?tab=${tab}`);
    })
  );
});
