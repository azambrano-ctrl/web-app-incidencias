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

export const changeStatus = (id, status, comment, solution, signature) =>
  api.patch(`/incidents/${id}/status`, { status, comment, solution, signature }).then(r => r.data);

export const getMapIncidents = () =>
  api.get('/incidents/map').then(r => r.data);

export const addComment = (id, body) =>
  api.post(`/incidents/${id}/comments`, { body }).then(r => r.data);

export const getSummary = () =>
  api.get('/incidents/reports/summary').then(r => r.data);

// Parent-child linking
export const linkIncident = (id, parent_id) =>
  api.post(`/incidents/${id}/link`, { parent_id }).then(r => r.data);

export const unlinkIncident = (id) =>
  api.delete(`/incidents/${id}/link`).then(r => r.data);

// Photos
export const getPhotos = (id) =>
  api.get(`/incidents/${id}/photos`).then(r => r.data);

export const getPhoto = (id, photoId) =>
  api.get(`/incidents/${id}/photos/${photoId}`).then(r => r.data);

export const uploadPhoto = (id, data, filename, mime_type) =>
  api.post(`/incidents/${id}/photos`, { data, filename, mime_type }).then(r => r.data);

export const deletePhoto = (id, photoId) =>
  api.delete(`/incidents/${id}/photos/${photoId}`).then(r => r.data);

export const deleteIncident = (id) =>
  api.delete(`/incidents/${id}`).then(r => r.data);

export const regeocodeIncidents = () =>
  api.post('/incidents/map/regeocode').then(r => r.data);

export const geocodeIncident = (id) =>
  api.post(`/incidents/${id}/geocode`).then(r => r.data);
