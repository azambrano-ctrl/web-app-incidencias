import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const go = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', go);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', off); };
  }, []);

  // Escuchar mensajes del SW sobre el tamaño de la cola
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (e) => {
      if (e.data?.type === 'QUEUE_COUNT') setQueueCount(e.data.count);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    // Solicitar conteo inicial
    navigator.serviceWorker.ready.then(sw => sw.active?.postMessage({ type: 'GET_QUEUE_COUNT' }));
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Al volver la conexión, disparar Background Sync
  useEffect(() => {
    if (!online || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(sw => {
      if ('sync' in sw) sw.sync.register('offline-queue').catch(() => {});
    });
  }, [online]);

  return { online, queueCount };
}
