import api from './axios';

export const getOncallSchedules = () => api.get('/oncall').then(r => r.data);
export const getCurrentOncall   = () => api.get('/oncall/current').then(r => r.data);
export const createOncall       = (data) => api.post('/oncall', data).then(r => r.data);
export const deleteOncall       = (id)   => api.delete(`/oncall/${id}`).then(r => r.data);
