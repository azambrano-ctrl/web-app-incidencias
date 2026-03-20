import api from './axios';

export const getNotifications = (onlyUnread = false) =>
  api.get('/notifications', { params: onlyUnread ? { read: 'false' } : {} }).then(r => r.data);

export const getUnreadCount = () =>
  api.get('/notifications/count').then(r => r.data);

export const markAsRead = (id) =>
  api.patch(`/notifications/${id}/read`).then(r => r.data);

export const markAllAsRead = () =>
  api.patch('/notifications/read-all').then(r => r.data);
