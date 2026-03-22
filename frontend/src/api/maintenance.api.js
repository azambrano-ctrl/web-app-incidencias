import api from './axios';

export const getMaintenances  = (params) => api.get('/maintenances', { params }).then(r => r.data);
export const getMaintenance   = (id)     => api.get(`/maintenances/${id}`).then(r => r.data);
export const createMaintenance = (data)  => api.post('/maintenances', data).then(r => r.data);
export const updateMaintenance = (id, data) => api.put(`/maintenances/${id}`, data).then(r => r.data);
export const updateMaintenanceStatus = (id, status) => api.patch(`/maintenances/${id}/status`, { status }).then(r => r.data);
export const deleteMaintenance = (id)   => api.delete(`/maintenances/${id}`).then(r => r.data);
