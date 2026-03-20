import api from './axios';

export const getSettings = () =>
  api.get('/settings').then(r => r.data);

export const saveSettings = (data) =>
  api.put('/settings', data).then(r => r.data);

export const testEmail = (to, config) =>
  api.post('/settings/test-email', { to, config }).then(r => r.data);

export const testWhatsApp = (to, config) =>
  api.post('/settings/test-whatsapp', { to, config }).then(r => r.data);

export const getVapidKey = () =>
  api.get('/settings/push/vapid-key').then(r => r.data);

export const pushSubscribe = (subscription) =>
  api.post('/settings/push/subscribe', { subscription }).then(r => r.data);

export const pushUnsubscribe = (endpoint) =>
  api.post('/settings/push/unsubscribe', { endpoint }).then(r => r.data);
