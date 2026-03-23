const CACHE_APP = 'incidencias-app-v2';
const CACHE_API = 'incidencias-api-v1';
const QUEUE_DB  = 'offline-queue-db';
const QUEUE_STORE = 'requests';

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

// ===== OFFLINE QUEUE (IndexedDB) =====

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getQueueCount() {
  const db = await openQueueDb();
  return new Promise((resolve) => {
    const tx  = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(0);
  });
}

async function getAllQueued() {
  const db = await openQueueDb();
  return new Promise((resolve) => {
    const tx  = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => resolve([]);
  });
}

async function deleteQueued(id) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(QUEUE_STORE, 'readwrite');
    const req = tx.objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function notifyQueueCount() {
  const count = await getQueueCount();
  const clientsList = await clients.matchAll({ includeUncontrolled: true });
  clientsList.forEach(client => client.postMessage({ type: 'QUEUE_COUNT', count }));
}

// ===== BACKGROUND SYNC =====

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue') {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  const items = await getAllQueued();
  if (items.length === 0) return;

  console.log(`[SW] Reintentando ${items.length} petición(es) en cola...`);

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method:      item.method,
        headers:     item.headers,
        body:        item.body || undefined,
        credentials: 'include',
      });
      // Eliminar de la cola si el servidor procesó (incluso errores 4xx son definitivos)
      if (response.status < 500) {
        await deleteQueued(item.id);
        console.log(`[SW] Sincronizado: ${item.method} ${item.url} → ${response.status}`);
      }
    } catch {
      // Aún sin red — dejar en cola y detener
      console.log('[SW] Aún sin conexión, se reintentará al reconectar');
      break;
    }
  }

  await notifyQueueCount();
}

// ===== MENSAJES DESDE LA APP =====

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'GET_QUEUE_COUNT') {
    getQueueCount().then(count =>
      event.source?.postMessage({ type: 'QUEUE_COUNT', count })
    );
  }

  if (event.data.type === 'ENQUEUE_REQUEST') {
    openQueueDb().then(db => {
      const tx  = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).add(event.data.item);
      tx.oncomplete = () => notifyQueueCount();
    });
  }
});
