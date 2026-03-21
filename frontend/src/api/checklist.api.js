import api from './axios';

// Templates
export const getTemplates = () =>
  api.get('/checklists/templates').then(r => r.data);

export const createTemplate = (data) =>
  api.post('/checklists/templates', data).then(r => r.data);

export const updateTemplate = (id, data) =>
  api.put(`/checklists/templates/${id}`, data).then(r => r.data);

export const deleteTemplate = (id) =>
  api.delete(`/checklists/templates/${id}`).then(r => r.data);

// Incident checklists
export const getIncidentChecklist = (incidentId) =>
  api.get(`/checklists/incidents/${incidentId}`).then(r => r.data);

export const createIncidentChecklist = (incidentId, data) =>
  api.post(`/checklists/incidents/${incidentId}`, data).then(r => r.data);

export const toggleChecklistItem = (incidentId, index) =>
  api.patch(`/checklists/incidents/${incidentId}/items/${index}`).then(r => r.data);
