const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { getDb } = require('../../config/database');

router.use(authenticate);

// GET /api/v1/oncall — lista de guardias
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
             cb.name as created_by_name
      FROM oncall_schedules o
      JOIN users u  ON u.id  = o.user_id
      JOIN users cb ON cb.id = o.created_by
      ORDER BY o.start_date DESC
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/v1/oncall/current — técnico de guardia HOY
router.get('/current', async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT o.*, u.name as user_name, u.email as user_email, u.phone as user_phone
      FROM oncall_schedules o
      JOIN users u ON u.id = o.user_id
      WHERE CURRENT_DATE BETWEEN o.start_date AND o.end_date
      ORDER BY o.created_at DESC
      LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (e) { next(e); }
});

// POST /api/v1/oncall — crear turno
router.post('/',
  authorize('admin', 'supervisor'),
  body('user_id').notEmpty().withMessage('Técnico requerido'),
  body('start_date').isISO8601().withMessage('Fecha inicio inválida'),
  body('end_date').isISO8601().withMessage('Fecha fin inválida'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const db = getDb();
      const { user_id, start_date, end_date, notes } = req.body;

      // Verificar que el usuario es técnico
      const { rows: userRows } = await db.query(
        `SELECT id FROM users WHERE id=$1 AND role='technician' AND active=1`, [user_id]
      );
      if (!userRows[0]) return res.status(400).json({ error: 'El usuario debe ser un técnico activo' });

      // Verificar que no hay solapamiento
      const { rows: overlap } = await db.query(`
        SELECT id FROM oncall_schedules
        WHERE user_id=$1 AND NOT (end_date < $2 OR start_date > $3)
      `, [user_id, start_date, end_date]);
      if (overlap.length > 0) return res.status(400).json({ error: 'El técnico ya tiene un turno en ese período' });

      const { rows } = await db.query(`
        INSERT INTO oncall_schedules (user_id, start_date, end_date, notes, created_by)
        VALUES ($1,$2,$3,$4,$5) RETURNING *
      `, [user_id, start_date, end_date, notes || null, req.user.id]);
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  }
);

// DELETE /api/v1/oncall/:id
router.delete('/:id', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.query('DELETE FROM oncall_schedules WHERE id=$1', [req.params.id]);
    res.json({ message: 'Turno eliminado' });
  } catch (e) { next(e); }
});

module.exports = router;
