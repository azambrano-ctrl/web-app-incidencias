import api from './axios';

export const importClients = (rows) =>
  api.post('/clients/import', { rows }).then(r => r.data);

export const searchClients = (q) =>
  api.get('/clients/search', { params: { q } }).then(r => r.data);

export const getClientStats = () =>
  api.get('/clients/stats').then(r => r.data);

export const updateClient = (id, data) =>
  api.patch(`/clients/${id}`, data).then(r => r.data);
