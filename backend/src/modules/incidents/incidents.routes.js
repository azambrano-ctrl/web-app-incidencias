const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./incidents.service');

router.use(authenticate);

const incidentValidation = [
  body('title').notEmpty().withMessage('Título requerido'),
  body('description').notEmpty().withMessage('Descripción requerida'),
  body('type').isIn(['internet', 'tv', 'both']).withMessage('Tipo inválido'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('client_name').notEmpty().withMessage('Nombre del cliente requerido'),
  body('client_address').notEmpty().withMessage('Dirección del cliente requerida'),
];

router.get('/', async (req, res, next) => {
  try { res.json(await svc.listIncidents(req.query, req.user.id, req.user.role)); }
  catch (e) { next(e); }
});

router.get('/reports/summary', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.getSummary()); } catch (e) { next(e); }
});

router.get('/map', async (req, res, next) => {
  try { res.json(await svc.getMapIncidents(req.user.id, req.user.role)); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json(await svc.getIncident(req.params.id)); } catch (e) { next(e); }
});

router.post('/', authorize('admin', 'supervisor'), incidentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.status(201).json(await svc.createIncident(req.body, req.user.id)); } catch (e) { next(e); }
});

router.put('/:id', authorize('admin', 'supervisor'), incidentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.json(await svc.updateIncident(req.params.id, req.body)); } catch (e) { next(e); }
});

router.patch('/:id/assign', authorize('admin', 'supervisor'),
  body('technicianId').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.assignIncident(req.params.id, req.body.technicianId, req.user.id)); } catch (e) { next(e); }
  }
);

router.patch('/:id/status',
  body('status').isIn(['open', 'assigned', 'in_progress', 'resolved', 'cancelled']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      res.json(await svc.changeStatus(req.params.id, req.body.status, req.body.comment, req.user.id, req.user.role, req.body.solution, req.body.signature));
    } catch (e) { next(e); }
  }
);

router.post('/:id/comments',
  body('body').notEmpty().withMessage('Comentario vacío'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.status(201).json(await svc.addComment(req.params.id, req.user.id, req.body.body)); } catch (e) { next(e); }
  }
);

module.exports = router;
