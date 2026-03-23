import api from './axios';

export const getNetworkNodes = () =>
  api.get('/network').then(r => r.data);

export const getNetworkNode = (id) =>
  api.get(`/network/${id}`).then(r => r.data);

export const createNetworkNode = (data) =>
  api.post('/network', data).then(r => r.data);

export const updateNetworkNode = (id, data) =>
  api.put(`/network/${id}`, data).then(r => r.data);

export const deleteNetworkNode = (id) =>
  api.delete(`/network/${id}`).then(r => r.data);
