import api from './axios';

export const getRouters = () => api.get('/routers').then(r => r.data);
export const getRouter = (id) => api.get(`/routers/${id}`).then(r => r.data);
export const createRouter = (data) => api.post('/routers', data).then(r => r.data);
export const updateRouter = (id, data) => api.put(`/routers/${id}`, data).then(r => r.data);
export const deleteRouter = (id) => api.delete(`/routers/${id}`).then(r => r.data);
export const testConnection = (id) => api.post(`/routers/${id}/test`).then(r => r.data);
export const getRouterClients = (id) => api.get(`/routers/${id}/clients`).then(r => r.data);
export const getRouterMetrics = (id) => api.get(`/routers/${id}/metrics`).then(r => r.data);
export const cutClient = (id, address) => api.post(`/routers/${id}/cut`, { address }).then(r => r.data);
export const activateClient = (id, address) => api.post(`/routers/${id}/activate`, { address }).then(r => r.data);
