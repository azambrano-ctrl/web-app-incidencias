const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const svc = require('./notifications.service');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const onlyUnread = req.query.read === 'false';
    res.json(await svc.getNotifications(req.user.id, onlyUnread));
  } catch (e) { next(e); }
});

router.get('/count', async (req, res, next) => {
  try { res.json({ unread: await svc.getUnreadCount(req.user.id) }); } catch (e) { next(e); }
});

router.patch('/read-all', async (req, res, next) => {
  try { res.json(await svc.markAllAsRead(req.user.id)); } catch (e) { next(e); }
});

router.patch('/:id/read', async (req, res, next) => {
  try { res.json(await svc.markAsRead(req.params.id, req.user.id)); } catch (e) { next(e); }
});

module.exports = router;
