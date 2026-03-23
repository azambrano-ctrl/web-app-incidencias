/**
 * Utilidades para encolar peticiones cuando el dispositivo está sin conexión.
 * El Service Worker lee esta misma BD (offline-queue-db) para reproducir las
 * peticiones cuando se recupera la señal (Background Sync).
 */

const DB_NAME    = 'offline-queue-db';
const DB_STORE   = 'requests';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) =>
      e.target.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * Guarda una petición fallida en la cola offline.
 * @param {{ url: string, method: string, headers: object, body: string, description: string }} item
 */
export async function enqueueRequest({ url, method, headers, body, description }) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    headers: headers || {},
    body:    body    || null,
    description: description || `${method} ${url}`,
    timestamp: Date.now(),
  };

  // Intentar via SW message (más confiable cuando el SW ya gestiona la BD)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'ENQUEUE_REQUEST', item });
  } else {
    // Fallback: escribir directamente
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx  = db.transaction(DB_STORE, 'readwrite');
      const req = tx.objectStore(DB_STORE).add(item);
      req.onsuccess = () => resolve();
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  // Registrar Background Sync para que el SW lo replique al reconectarse
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(sw => {
      if ('sync' in sw) sw.sync.register('offline-queue').catch(() => {});
    });
  }
}

/** Devuelve el número de peticiones pendientes en la cola. */
export async function getQueueCount() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx  = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(0);
    });
  } catch {
    return 0;
  }
}
