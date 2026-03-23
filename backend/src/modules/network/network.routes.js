const router = require('express').Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize }    = require('../../middleware/authorize');
const svc = require('./network.service');

router.use(authenticate);

const stripTags = (v) => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : v;

const nodeValidation = [
  body('type').isIn(['caja','nodo','manga']).withMessage('Tipo inválido'),
  body('name').notEmpty().isLength({ max: 100 }).customSanitizer(stripTags).withMessage('Nombre requerido'),
  body('latitude').isFloat({ min: -90,  max: 90  }).withMessage('Latitud inválida'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
  body('cable_type').optional({ nullable: true }).isLength({ max: 100 }).customSanitizer(stripTags),
  body('total_hilos').optional().isInt({ min: 0, max: 9999 }),
  body('hilos_used').optional().isInt({ min: 0, max: 9999 }),
  body('description').optional({ nullable: true }).isLength({ max: 1000 }).customSanitizer(stripTags),
  body('notes').optional({ nullable: true }).isLength({ max: 2000 }).customSanitizer(stripTags),
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

// GET /api/v1/network — todos los roles pueden ver
router.get('/', async (req, res, next) => {
  try { res.json(await svc.listNodes()); } catch (e) { next(e); }
});

// GET /api/v1/network/:id
router.get('/:id', param('id').isInt(), async (req, res, next) => {
  try { res.json(await svc.getNode(Number(req.params.id))); } catch (e) { next(e); }
});

// POST /api/v1/network — técnicos y superiores pueden crear
router.post('/', nodeValidation, validate, async (req, res, next) => {
  try { res.status(201).json(await svc.createNode(req.body, req.user.id)); } catch (e) { next(e); }
});

// PUT /api/v1/network/:id — el creador o admin/supervisor
router.put('/:id', nodeValidation, validate, async (req, res, next) => {
  try {
    const node = await svc.getNode(Number(req.params.id));
    const isOwner = node.created_by === req.user.id;
    const isAdmin = ['admin','supervisor'].includes(req.user.role);
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Sin permiso para editar este nodo' });
    res.json(await svc.updateNode(Number(req.params.id), req.body, req.user.id));
  } catch (e) { next(e); }
});

// DELETE /api/v1/network/:id — solo admin/supervisor
router.delete('/:id', authorize('admin','supervisor'), async (req, res, next) => {
  try { await svc.deleteNode(Number(req.params.id)); res.json({ ok: true }); } catch (e) { next(e); }
});

module.exports = router;
