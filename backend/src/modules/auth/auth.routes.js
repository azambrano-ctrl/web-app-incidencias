const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { login } = require('./auth.service');
const { getDb } = require('../../config/database');

router.post('/login',
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await login(req.body.email, req.body.password)); } catch (err) { next(err); }
  }
);

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(
      'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=$1', [req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
