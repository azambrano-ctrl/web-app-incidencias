import axios from 'axios';

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
  (err) => {
    if (err.response?.status === 401) {
      sessionStorage.removeItem('user_info');
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = returnTo && returnTo !== '/login'
        ? `/login?next=${encodeURIComponent(returnTo)}`
        : '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
