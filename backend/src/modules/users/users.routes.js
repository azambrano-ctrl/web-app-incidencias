const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { audit } = require('../../middleware/audit');
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
  body('name').notEmpty().isLength({ max: 100 }), body('email').isEmail().isLength({ max: 254 }),
  passwordRule, body('role').isIn(['admin', 'supervisor', 'technician']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const user = await svc.createUser(req.body);
      await audit(req.user.id, 'user:create', 'users', user.id, { email: user.email, role: user.role }, req.ip);
      res.status(201).json(user);
    } catch (e) { next(e); }
  }
);

router.put('/:id', authorize('admin'),
  body('name').notEmpty().isLength({ max: 100 }), body('email').isEmail().isLength({ max: 254 }), body('role').isIn(['admin', 'supervisor', 'technician']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const user = await svc.updateUser(req.params.id, req.body);
      await audit(req.user.id, 'user:update', 'users', req.params.id, { email: req.body.email, role: req.body.role }, req.ip);
      res.json(user);
    } catch (e) { next(e); }
  }
);

router.patch('/:id/password', authorize('admin'),
  passwordRule,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const result = await svc.resetPassword(req.params.id, req.body.password);
      await audit(req.user.id, 'user:password_reset', 'users', req.params.id, null, req.ip);
      res.json(result);
    } catch (e) { next(e); }
  }
);

router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const result = await svc.deactivateUser(req.params.id);
    await audit(req.user.id, 'user:deactivate', 'users', req.params.id, null, req.ip);
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
