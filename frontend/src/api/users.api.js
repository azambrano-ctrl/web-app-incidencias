import api from './axios';

export const getUsers = (role) =>
  api.get('/users', { params: role ? { role } : {} }).then(r => r.data);

export const createUser = (data) =>
  api.post('/users', data).then(r => r.data);

export const updateUser = (id, data) =>
  api.put(`/users/${id}`, data).then(r => r.data);

export const resetPassword = (id, password) =>
  api.patch(`/users/${id}/password`, { password }).then(r => r.data);

export const deactivateUser = (id) =>
  api.delete(`/users/${id}`).then(r => r.data);
