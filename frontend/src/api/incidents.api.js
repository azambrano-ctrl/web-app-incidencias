import api from './axios';

export const getIncidents = (params) =>
  api.get('/incidents', { params }).then(r => r.data);

export const getIncident = (id) =>
  api.get(`/incidents/${id}`).then(r => r.data);

export const createIncident = (data) =>
  api.post('/incidents', data).then(r => r.data);

export const updateIncident = (id, data) =>
  api.put(`/incidents/${id}`, data).then(r => r.data);

export const assignIncident = (id, technicianId) =>
  api.patch(`/incidents/${id}/assign`, { technicianId }).then(r => r.data);

export const changeStatus = (id, status, comment, solution) =>
  api.patch(`/incidents/${id}/status`, { status, comment, solution }).then(r => r.data);

export const addComment = (id, body) =>
  api.post(`/incidents/${id}/comments`, { body }).then(r => r.data);

export const getSummary = () =>
  api.get('/incidents/reports/summary').then(r => r.data);
