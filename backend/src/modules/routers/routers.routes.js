const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./routers.service');
const routerSvc = require('../../services/router-connect.service');

router.use(authenticate);

const stripTags = (val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val;

const routerValidation = [
  body('description').notEmpty().withMessage('Descripción requerida').customSanitizer(stripTags),
  body('ip').notEmpty().withMessage('IP requerida').customSanitizer(stripTags),
  body('username').notEmpty().withMessage('Usuario requerido').customSanitizer(stripTags),
  body('api_port').isInt({ min: 1, max: 65535 }).withMessage('Puerto inválido'),
];

// GET /api/v1/routers
router.get('/', async (req, res, next) => {
  try { res.json(await svc.listRouters()); }
  catch (e) { next(e); }
});

// GET /api/v1/routers/:id
router.get('/:id', async (req, res, next) => {
  try { res.json(await svc.getRouter(req.params.id)); }
  catch (e) { next(e); }
});

// POST /api/v1/routers
router.post('/', authorize('admin'), routerValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.status(201).json(await svc.createRouter(req.body)); }
  catch (e) { next(e); }
});

// PUT /api/v1/routers/:id
router.put('/:id', authorize('admin'), routerValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.json(await svc.updateRouter(req.params.id, req.body)); }
  catch (e) { next(e); }
});

// DELETE /api/v1/routers/:id
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try { await svc.deleteRouter(req.params.id); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// POST /api/v1/routers/:id/test — Probar conexión
router.post('/:id/test', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const r = await svc.getRouter(req.params.id);
    const result = await routerSvc.testConnection(r);
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/v1/routers/:id/metrics — Tasas en tiempo real
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const r = await svc.getRouter(req.params.id);
    const result = await routerSvc.getMetrics(r);
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/v1/routers/:id/clients — Listar clientes/ONTs del router
router.get('/:id/clients', async (req, res, next) => {
  try {
    const r = await svc.getRouter(req.params.id);
    const result = await routerSvc.getClients(r);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/v1/routers/:id/cut — Cortar servicio a un cliente
router.post('/:id/cut', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const r = await svc.getRouter(req.params.id);
    const result = await routerSvc.cutClient(r, req.body.address);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/v1/routers/:id/activate — Activar servicio a un cliente
router.post('/:id/activate', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const r = await svc.getRouter(req.params.id);
    const result = await routerSvc.activateClient(r, req.body.address);
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
