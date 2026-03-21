const CACHE_APP = 'incidencias-app-v1';
const CACHE_API = 'incidencias-api-v1';

// ===== INSTALL: cachear shell de la app =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then(cache => cache.addAll(['/', '/index.html', '/manifest.json']))
      .then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE: limpiar caches viejos =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_APP && k !== CACHE_API).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ===== FETCH: estrategias de cache =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar peticiones del mismo origen o OpenStreetMap (mapa)
  if (url.origin !== self.location.origin && !url.hostname.includes('openstreetmap.org')) return;

  // API: network-first, caché como respaldo (solo GET)
  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') return;
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_API).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Tiles del mapa (OpenStreetMap): cache-first
  if (url.hostname.includes('openstreetmap.org')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_APP).then(cache => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Assets (JS/CSS/imágenes): cache-first, luego red
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_APP).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Navegación sin red → servir index.html (SPA)
        if (request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'IncidenciasISP', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
