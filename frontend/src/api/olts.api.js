import api from './axios';

export const getOlts = () => api.get('/olts').then(r => r.data);
export const getOlt = (id) => api.get(`/olts/${id}`).then(r => r.data);
export const createOlt = (data) => api.post('/olts', data).then(r => r.data);
export const updateOlt = (id, data) => api.put(`/olts/${id}`, data).then(r => r.data);
export const deleteOlt = (id) => api.delete(`/olts/${id}`).then(r => r.data);
export const testOlt = (id) => api.post(`/olts/${id}/test`).then(r => r.data);
export const getONUs = (id) => api.get(`/olts/${id}/onus`).then(r => r.data);
export const getONUSignal = (id, onuId) => api.get(`/olts/${id}/onus/${encodeURIComponent(onuId)}/signal`).then(r => r.data);
export const rebootONU = (id, onuId) => api.post(`/olts/${id}/onus/${encodeURIComponent(onuId)}/reboot`).then(r => r.data);
export const provisionONU = (id, data) => api.post(`/olts/${id}/provision`, data).then(r => r.data);
export const linkOnuSerial = (clientId, serial) => api.patch(`/clients/${clientId}/onu-serial`, { onu_serial: serial }).then(r => r.data);
