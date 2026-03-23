import axios from 'axios';
import toast from 'react-hot-toast';
import { enqueueRequest } from '../utils/offlineQueue';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Client': 'incidencias-spa',  // CSRF: identifica requests legítimos del SPA
  },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('user_info');
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = returnTo && returnTo !== '/login'
        ? `/login?next=${encodeURIComponent(returnTo)}`
        : '/login';
      return Promise.reject(err);
    }

    // Encolar mutaciones cuando no hay conexión
    if (!navigator.onLine && !err.response && err.config) {
      const { method, url, baseURL, data, headers } = err.config;
      const isReadOnly = ['get', 'head', 'options'].includes(method?.toLowerCase());
      if (!isReadOnly) {
        await enqueueRequest({
          url:         (baseURL || '') + url,
          method:      method.toUpperCase(),
          headers:     {
            'Content-Type': headers['Content-Type'] || 'application/json',
            'X-Client':     'incidencias-spa',
          },
          body:        typeof data === 'string' ? data : JSON.stringify(data),
          description: `${method.toUpperCase()} ${url}`,
        });
        toast('📶 Sin señal — acción guardada. Se enviará al recuperar conexión.', {
          icon: '📴',
          duration: 5000,
          style: { background: '#1e293b', color: '#f8fafc' },
        });
        // Rechazar con señal especial para que el llamador sepa que fue encolado
        const queued = new Error('QUEUED_OFFLINE');
        queued.queued = true;
        return Promise.reject(queued);
      }
    }

    return Promise.reject(err);
  }
);

export default api;
