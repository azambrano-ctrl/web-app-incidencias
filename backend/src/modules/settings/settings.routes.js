const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { getSettings, setSettings } = require('./settings.service');
const { sendEmail } = require('../../services/email.service');
const { sendWhatsApp } = require('../../services/whatsapp.service');
const { ensureVapidKeys, subscribe, unsubscribe } = require('../../services/push.service');

const SETTING_KEYS = [
  'email_enabled', 'email_host', 'email_port', 'email_secure',
  'email_user', 'email_pass', 'email_from_name', 'email_from_email',
  'whatsapp_enabled', 'whatsapp_api_url', 'whatsapp_token', 'whatsapp_body_template',
  'push_enabled', 'push_vapid_public',
];

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try { res.json(await getSettings(SETTING_KEYS)); } catch (e) { next(e); }
});

router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const allowed = new Set([...SETTING_KEYS, 'push_vapid_private']);
    const toSave = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.has(k)) toSave[k] = v;
    }
    await setSettings(toSave);
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
