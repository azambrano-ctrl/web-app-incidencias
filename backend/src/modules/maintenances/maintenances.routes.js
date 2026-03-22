const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { getDb } = require('../../config/database');
const { createNotification } = require('../notifications/notifications.service');
const { sendWhatsApp } = require('../../services/whatsapp.service');
const { sendEmail } = require('../../services/email.service');

router.use(authenticate);

const validation = [
  body('title').notEmpty().withMessage('Título requerido'),
  body('scheduled_at').isISO8601().withMessage('Fecha inválida'),
  body('estimated_duration_min').optional().isInt({ min: 1 }),
];

// GET /api/v1/maintenances
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { status, upcoming } = req.query;
    let where = [];
    const params = [];
    let idx = 1;

    if (status) { where.push(`m.status=$${idx++}`); params.push(status); }
    if (upcoming === '1') { where.push(`m.scheduled_at >= NOW()`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(`
      SELECT m.*, u.name as created_by_name
      FROM maintenances m
      JOIN users u ON u.id = m.created_by
      ${whereClause}
      ORDER BY m.scheduled_at DESC
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/v1/maintenances/:id
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT m.*, u.name as created_by_name
      FROM maintenances m JOIN users u ON u.id = m.created_by
      WHERE m.id=$1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/v1/maintenances
router.post('/', authorize('admin', 'supervisor'), validation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const db = getDb();
    const { title, description, zone, scheduled_at, estimated_duration_min = 60, notify_clients = true } = req.body;
    const { rows } = await db.query(`
      INSERT INTO maintenances (title, description, zone, scheduled_at, estimated_duration_min, notify_clients, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [title, description || null, zone || null, scheduled_at, estimated_duration_min, notify_clients, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/v1/maintenances/:id
router.put('/:id', authorize('admin', 'supervisor'), validation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const db = getDb();
    const { title, description, zone, scheduled_at, estimated_duration_min, notify_clients, status } = req.body;
    const { rows } = await db.query(`
      UPDATE maintenances SET title=$1, description=$2, zone=$3, scheduled_at=$4,
        estimated_duration_min=$5, notify_clients=$6, status=COALESCE($7, status), updated_at=NOW()
      WHERE id=$8 RETURNING *
    `, [title, description || null, zone || null, scheduled_at, estimated_duration_min || 60, notify_clients ?? true, status || null, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// PATCH /api/v1/maintenances/:id/status
router.patch('/:id/status', authorize('admin', 'supervisor'),
  body('status').isIn(['scheduled', 'in_progress', 'completed', 'cancelled']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const db = getDb();
      const { rows } = await db.query(
        `UPDATE maintenances SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [req.body.status, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  }
);

// DELETE /api/v1/maintenances/:id
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.query('DELETE FROM maintenances WHERE id=$1', [req.params.id]);
    res.json({ message: 'Mantenimiento eliminado' });
  } catch (e) { next(e); }
});

module.exports = router;
