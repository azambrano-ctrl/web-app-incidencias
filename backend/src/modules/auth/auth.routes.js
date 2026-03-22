const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { login } = require('./auth.service');
const { getDb } = require('../../config/database');

const COOKIE_OPTIONS = {
  httpOnly: true,                                // JS no puede leer el token
  secure: process.env.NODE_ENV === 'production', // HTTPS en producción
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // cross-origin en prod
  maxAge: 8 * 60 * 60 * 1000,                   // 8h igual que JWT_EXPIRES_IN
  path: '/',
};

router.post('/login',
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { token, user } = await login(req.body.email, req.body.password);
      res.cookie('auth_token', token, COOKIE_OPTIONS);
      res.json({ user });        // solo info del usuario, el token va en cookie httpOnly
    } catch (err) { next(err); }
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token', { ...COOKIE_OPTIONS, maxAge: 0 });
  res.json({ message: 'Sesión cerrada' });
});

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
