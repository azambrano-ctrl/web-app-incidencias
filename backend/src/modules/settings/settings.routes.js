const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { audit } = require('../../middleware/audit');
const { getSettings, getSetting, setSettings } = require('./settings.service');
const { sendEmail } = require('../../services/email.service');
const { sendWhatsApp } = require('../../services/whatsapp.service');
const { ensureVapidKeys, subscribe, unsubscribe } = require('../../services/push.service');
const { resetToken, testConnection } = require('../../services/external.service');

const SETTING_KEYS = [
  'email_enabled', 'email_host', 'email_port', 'email_secure',
  'email_user', 'email_pass', 'email_from_name', 'email_from_email',
  'whatsapp_enabled', 'whatsapp_api_url', 'whatsapp_token', 'whatsapp_body_template',
  'push_enabled', 'push_vapid_public',
  'default_city',   // ciudad por defecto para geocodificación del mapa
  'map_bbox',       // bounding box para restringir geocodificación al área local (minLon,maxLat,maxLon,minLat)
  'google_maps_key', // API key de Google Maps Geocoding (opcional, mejora precisión)
  'ext_api_enabled', 'ext_api_url', 'ext_api_user', 'ext_api_pass', // API externa TRONCALNET
];

// Claves que NUNCA se devuelven al cliente (passwords, tokens, API keys)
const SENSITIVE_KEYS = new Set(['email_pass', 'whatsapp_token', 'google_maps_key', 'push_vapid_private', 'ext_api_pass']);

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const all = await getSettings(SETTING_KEYS);
    const safe = {};
    for (const [k, v] of Object.entries(all)) {
      safe[k] = SENSITIVE_KEYS.has(k) ? (v ? '***configured***' : '') : v;
    }
    res.json(safe);
  } catch (e) { next(e); }
});

router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const allowed = new Set([...SETTING_KEYS, 'push_vapid_private']);
    const toSave = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.has(k)) toSave[k] = v;
    }
    await setSettings(toSave);
    // Si cambiaron credenciales de API externa, invalidar token en caché
    if (['ext_api_url', 'ext_api_user', 'ext_api_pass'].some(k => k in toSave)) resetToken();
    // Auditar qué claves se cambiaron (sin los valores sensibles)
    const changedKeys = Object.keys(toSave).filter(k => !SENSITIVE_KEYS.has(k));
    await audit(req.user.id, 'settings:update', 'settings', null, { keys: changedKeys }, req.ip);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/test-email', authenticate, authorize('admin'), async (req, res) => {
  try {
    const to = req.body.to || req.user.email;
    const cfg = req.body.config || null;
    if (cfg) cfg.email_enabled = '1';
    await sendEmail(to, '✅ Prueba de Email — IncidenciasISP',
      `<h2 style="color:#2563eb">Email configurado correctamente</h2>
       <p>Tu sistema de notificaciones por email está funcionando.</p>`, cfg);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/test-ext', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { config } = req.body;
    const baseUrl = config?.ext_api_url || await getSetting('ext_api_url');
    const username = config?.ext_api_user || await getSetting('ext_api_user');
    // La contraseña puede venir del frontend o de la BD (si el frontend envía '***configured***' usamos la de la BD)
    let password = config?.ext_api_pass;
    if (!password || password === '***configured***') password = await getSetting('ext_api_pass');
    await testConnection({ baseUrl, username, password });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/test-whatsapp', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { to, config } = req.body;
    if (!to) return res.status(400).json({ error: 'Número de destino requerido' });
    const cfg = config || null;
    if (cfg) cfg.whatsapp_enabled = '1';
    await sendWhatsApp(to, '✅ IncidenciasISP: Prueba de WhatsApp funcionando correctamente.', cfg);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/push/vapid-key', authenticate, async (req, res, next) => {
  try { res.json({ publicKey: await ensureVapidKeys() }); } catch (e) { next(e); }
});

router.post('/push/subscribe', authenticate, async (req, res, next) => {
  try { await subscribe(req.user.id, req.body.subscription); res.json({ ok: true }); } catch (e) { next(e); }
});

router.post('/push/unsubscribe', authenticate, async (req, res, next) => {
  try { await unsubscribe(req.user.id, req.body.endpoint); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
