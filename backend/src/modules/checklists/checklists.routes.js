const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const { getDb } = require('../../config/database');

router.use(authenticate);

// ── Templates ────────────────────────────────────────────────────────────────

// GET /api/v1/checklists/templates
router.get('/templates', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(`SELECT * FROM checklist_templates ORDER BY name ASC`);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/v1/checklists/templates
router.post('/templates',
  authorize('admin'),
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('items').isArray({ min: 1 }).withMessage('Debe tener al menos un ítem'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const db = getDb();
      const { name, items } = req.body;
      const { rows } = await db.query(
        `INSERT INTO checklist_templates (name, items) VALUES ($1, $2) RETURNING *`,
        [name, JSON.stringify(items)]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  }
);

// PUT /api/v1/checklists/templates/:id
router.put('/templates/:id',
  authorize('admin'),
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('items').isArray({ min: 1 }).withMessage('Debe tener al menos un ítem'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const db = getDb();
      const { name, items, active } = req.body;
      const { rows } = await db.query(
        `UPDATE checklist_templates SET name=$1, items=$2, active=COALESCE($3, active) WHERE id=$4 RETURNING *`,
        [name, JSON.stringify(items), active !== undefined ? active : null, req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Template no encontrado' });
      res.json(rows[0]);
    } catch (e) { next(e); }
  }
);

// DELETE /api/v1/checklists/templates/:id
router.delete('/templates/:id', authorize('admin'), async (req, res, next) => {
  try {
    const db = getDb();
    await db.query(`DELETE FROM checklist_templates WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Template eliminado' });
  } catch (e) { next(e); }
});

// ── Incident checklists ───────────────────────────────────────────────────────

// GET /api/v1/checklists/incidents/:id
router.get('/incidents/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT ic.*, t.name as template_name
       FROM incident_checklists ic
       LEFT JOIN checklist_templates t ON t.id = ic.template_id
       WHERE ic.incident_id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.json(null);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// POST /api/v1/checklists/incidents/:id  — create/assign checklist
router.post('/incidents/:id',
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const db = getDb();
      const incidentId = req.params.id;
      let { template_id, items } = req.body;

      // If template_id given, load items from template
      if (template_id && !items) {
        const { rows: tmpl } = await db.query(`SELECT items FROM checklist_templates WHERE id=$1`, [template_id]);
        if (!tmpl[0]) return res.status(404).json({ error: 'Template no encontrado' });
        items = tmpl[0].items.map(label => ({ label, checked: false, checked_at: null, checked_by: null }));
      } else if (Array.isArray(items)) {
        // items can be array of strings (labels) or objects
        items = items.map(i => typeof i === 'string'
          ? { label: i, checked: false, checked_at: null, checked_by: null }
          : { label: i.label, checked: false, checked_at: null, checked_by: null }
        );
      } else {
        return res.status(400).json({ error: 'Debe proveer template_id o items' });
      }

      const { rows } = await db.query(
        `INSERT INTO incident_checklists (incident_id, template_id, items)
         VALUES ($1, $2, $3)
         ON CONFLICT (incident_id) DO UPDATE SET template_id=$2, items=$3, updated_at=NOW()
         RETURNING *`,
        [incidentId, template_id || null, JSON.stringify(items)]
      );
      res.status(201).json(rows[0]);
    } catch (e) { next(e); }
  }
);

// PATCH /api/v1/checklists/incidents/:id/items/:index — toggle item
router.patch('/incidents/:id/items/:index', async (req, res, next) => {
  try {
    const db = getDb();
    const incidentId = req.params.id;
    const index = parseInt(req.params.index);

    // Solo el técnico asignado o admin/supervisor puede marcar items
    if (req.user.role === 'technician') {
      const { rows: inc } = await db.query(
        `SELECT assigned_to FROM incidents WHERE id=$1`, [incidentId]
      );
      if (!inc[0] || inc[0].assigned_to !== req.user.id)
        return res.status(403).json({ error: 'Solo el técnico asignado puede actualizar este checklist' });
    }

    const { rows } = await db.query(`SELECT * FROM incident_checklists WHERE incident_id=$1`, [incidentId]);
    if (!rows[0]) return res.status(404).json({ error: 'Checklist no encontrado' });

    const items = rows[0].items;
    if (index < 0 || index >= items.length) return res.status(400).json({ error: 'Índice inválido' });

    const item = items[index];
    item.checked = !item.checked;
    item.checked_at = item.checked ? new Date().toISOString() : null;
    item.checked_by = item.checked ? req.user.id : null;

    const { rows: updated } = await db.query(
      `UPDATE incident_checklists SET items=$1, updated_at=NOW() WHERE incident_id=$2 RETURNING *`,
      [JSON.stringify(items), incidentId]
    );
    res.json(updated[0]);
  } catch (e) { next(e); }
});

module.exports = router;
