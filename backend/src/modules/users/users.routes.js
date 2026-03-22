const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./users.service');

router.use(authenticate);

router.get('/', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.listUsers(req.query.role)); } catch (e) { next(e); }
});

router.get('/:id', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.getUser(req.params.id)); } catch (e) { next(e); }
});

const passwordRule = body('password')
  .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
  .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
  .matches(/[0-9]/).withMessage('Debe contener al menos un número');

router.post('/', authorize('admin'),
  body('name').notEmpty(), body('email').isEmail(),
  passwordRule, body('role').isIn(['admin', 'supervisor', 'technician']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.status(201).json(await svc.createUser(req.body)); } catch (e) { next(e); }
  }
);

router.put('/:id', authorize('admin'),
  body('name').notEmpty(), body('email').isEmail(), body('role').isIn(['admin', 'supervisor', 'technician']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.updateUser(req.params.id, req.body)); } catch (e) { next(e); }
  }
);

router.patch('/:id/password', authorize('admin'),
  passwordRule,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.resetPassword(req.params.id, req.body.password)); } catch (e) { next(e); }
  }
);

router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try { res.json(await svc.deactivateUser(req.params.id)); } catch (e) { next(e); }
});

module.exports = router;
