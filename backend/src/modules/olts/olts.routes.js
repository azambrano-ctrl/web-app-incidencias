const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./olts.service');
const oltSvc = require('../../services/olt-connect.service');
const { getClientsBySerials } = require('../clients/clients.service');

router.use(authenticate);

const strip = (val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val;

const oltValidation = [
  body('description').notEmpty().withMessage('Descripción requerida').customSanitizer(strip),
  body('ip').notEmpty().withMessage('IP requerida').customSanitizer(strip),
  body('username').notEmpty().withMessage('Usuario requerido').customSanitizer(strip),
  body('brand').isIn(['zte','huawei','fiberhome','vsol','nokia']).withMessage('Marca inválida'),
  body('ssh_port').isInt({ min: 1, max: 65535 }).withMessage('Puerto inválido'),
];

// CRUD
router.get('/', async (req, res, next) => {
  try { res.json(await svc.listOlts()); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await svc.getOlt(req.params.id)); } catch (e) { next(e); }
});

router.post('/', authorize('admin'), oltValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.status(201).json(await svc.createOlt(req.body)); } catch (e) { next(e); }
});

router.put('/:id', authorize('admin'), oltValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.json(await svc.updateOlt(req.params.id, req.body)); } catch (e) { next(e); }
});

router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try { await svc.deleteOlt(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});

// Operaciones OLT
router.post('/:id/test', async (req, res, next) => {
  try {
    const olt = await svc.getOlt(req.params.id);
    res.json(await oltSvc.testConnection(olt));
  } catch (e) { next(e); }
});

router.get('/:id/onus', async (req, res, next) => {
  try {
    const olt = await svc.getOlt(req.params.id);
    const onus = await oltSvc.listONUs(olt);
    // Enriquecer con nombre de cliente por serial (mac = SN en ZTE)
    const serials = onus.map(o => o.mac).filter(Boolean);
    const clientMap = await getClientsBySerials(serials);
    for (const onu of onus) {
      const c = onu.mac ? clientMap[onu.mac] : null;
      onu.description = c?.name || null;
      onu.clientId = c?.id || null;
    }
    res.json(onus);
  } catch (e) { next(e); }
});

router.get('/:id/onus/:onuId/signal', async (req, res, next) => {
  try {
    const olt = await svc.getOlt(req.params.id);
    res.json(await oltSvc.getSignal(olt, decodeURIComponent(req.params.onuId)));
  } catch (e) { next(e); }
});

router.post('/:id/onus/:onuId/reboot', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const olt = await svc.getOlt(req.params.id);
    res.json(await oltSvc.rebootONU(olt, decodeURIComponent(req.params.onuId)));
  } catch (e) { next(e); }
});

router.post('/:id/provision', authorize('admin'), async (req, res, next) => {
  try {
    const olt = await svc.getOlt(req.params.id);
    res.json(await oltSvc.provisionONU(olt, req.body));
  } catch (e) { next(e); }
});

module.exports = router;
