const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./clients.service');
const strip = (val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val;

router.use(authenticate);

router.post('/import', authorize('admin'), async (req, res, next) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'Se requiere un array "rows" con los datos' });
    res.json(await svc.importClients(rows));
  } catch (e) { next(e); }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);
    res.json(await svc.searchClients(q, 10));
  } catch (e) { next(e); }
});

router.get('/stats', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.getStats()); } catch (e) { next(e); }
});

// PATCH /api/v1/clients/:id — actualizar datos de contacto (todos los roles)
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    res.json(await svc.updateClient(id, req.body));
  } catch (e) { next(e); }
});

// Vincular serial ONU a cliente: PATCH /api/v1/clients/:id/onu-serial
router.patch('/:id/onu-serial', authorize('admin', 'supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    const serial = strip(req.body.onu_serial || '');
    res.json(await svc.linkOnuSerial(id, serial || null));
  } catch (e) { next(e); }
});

module.exports = router;
