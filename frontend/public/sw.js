// АванDата service worker — обработка push-уведомлений и кликов по ним.
// Минимальная версия без офлайн-кеша (PWA уже работает через manifest).

self.addEventListener('install', (event) => {
  // Сразу активируемся, не ждём вкладок старой версии
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push event — приходит JSON-payload от backend (см. pushService.sendNotification)
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'АванDата', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'АванDата';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'avandata',
    data: payload.data || {},
    requireInteraction: true,
    vibrate: [80, 40, 80],
  };

  event.waitUntil((async () => {
    // 1. Показываем системное уведомление (если Windows позволит)
    try { await self.registration.showNotification(title, options); } catch (e) {}
    // 2. ДОПОЛНИТЕЛЬНО — шлём message всем открытым клиентам, чтобы страница
    //    показала in-page баннер. Это backup на случай Focus Assist / Quiet Hours.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      try { c.postMessage({ type: 'push', title, body: options.body, url: payload.url || '/', data: options.data }); } catch (_) {}
    }
  })());
});

// Клик по уведомлению — открыть нужный URL (если уже открыта вкладка — focus, иначе open)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      // Если совпадает origin — фокусим и навигируем
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      } catch (_) {}
    }
    // Иначе открываем новую вкладку
    await self.clients.openWindow(targetUrl);
  })());
});
