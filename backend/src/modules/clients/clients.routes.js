const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./clients.service');

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

module.exports = router;
