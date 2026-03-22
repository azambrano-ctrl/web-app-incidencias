const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/authorize');
const svc = require('./incidents.service');

router.use(authenticate);

// Elimina etiquetas HTML para prevenir XSS almacenado
const stripTags = (val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val;

const incidentValidation = [
  body('title').notEmpty().withMessage('Título requerido').customSanitizer(stripTags),
  body('description').notEmpty().withMessage('Descripción requerida').customSanitizer(stripTags),
  body('type').isIn(['internet', 'tv', 'both']).withMessage('Tipo inválido'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('client_name').notEmpty().withMessage('Nombre del cliente requerido').customSanitizer(stripTags),
  body('client_address').notEmpty().withMessage('Dirección del cliente requerida').customSanitizer(stripTags),
];

router.get('/', async (req, res, next) => {
  try { res.json(await svc.listIncidents(req.query, req.user.id, req.user.role)); }
  catch (e) { next(e); }
});

router.get('/reports/summary', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.getSummary()); } catch (e) { next(e); }
});

router.get('/map', async (req, res, next) => {
  try { res.json(await svc.getMapIncidents(req.user.id, req.user.role)); } catch (e) { next(e); }
});

// Directorio de clientes: buscar por nombre y obtener foto de la casa
router.get('/clients/search', async (req, res, next) => {
  try { res.json(await svc.searchClients(req.query.q || '', req.user.id, req.user.role)); } catch (e) { next(e); }
});

// Re-geocodificar incidencias sin coordenadas (admin/supervisor)
router.post('/map/regeocode', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.regeocode()); } catch (e) { next(e); }
});

// Re-geocodificar una incidencia específica
router.post('/:id/geocode', async (req, res, next) => {
  try { res.json(await svc.geocodeOne(req.params.id)); } catch (e) { next(e); }
});

// Fijar coordenadas manualmente (admin/supervisor)
router.patch('/:id/location',
  authorize('admin', 'supervisor'),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.setLocation(req.params.id, req.body.lat, req.body.lng)); } catch (e) { next(e); }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const inc = await svc.getIncident(req.params.id);
    // Técnico solo puede ver incidencias asignadas a él
    if (req.user.role === 'technician' && inc.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta incidencia' });
    }
    res.json(inc);
  } catch (e) { next(e); }
});

router.post('/', authorize('admin', 'supervisor'), incidentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.status(201).json(await svc.createIncident(req.body, req.user.id)); } catch (e) { next(e); }
});

router.put('/:id', authorize('admin', 'supervisor'), incidentValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try { res.json(await svc.updateIncident(req.params.id, req.body)); } catch (e) { next(e); }
});

router.patch('/:id/assign', authorize('admin', 'supervisor'),
  body('technicianId').notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.assignIncident(req.params.id, req.body.technicianId, req.user.id)); } catch (e) { next(e); }
  }
);

router.patch('/:id/status',
  authorize('admin', 'supervisor', 'technician'),
  body('status').isIn(['open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled']),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { signature } = req.body;
      if (signature && Buffer.byteLength(signature, 'utf8') > MAX_SIG_BYTES * 1.4)
        return res.status(413).json({ error: 'La firma supera el tamaño permitido (500 KB)' });
      res.json(await svc.changeStatus(req.params.id, req.body.status, req.body.comment, req.user.id, req.user.role, req.body.solution, signature));
    } catch (e) { next(e); }
  }
);

router.post('/:id/comments',
  body('body').notEmpty().withMessage('Comentario vacío').customSanitizer(stripTags),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.status(201).json(await svc.addComment(req.params.id, req.user.id, req.body.body)); } catch (e) { next(e); }
  }
);

// ── Parent-child linking ──────────────────────────────────────────────────────

router.post('/:id/link',
  authorize('admin', 'supervisor'),
  body('parent_id').notEmpty().withMessage('parent_id requerido'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try { res.json(await svc.linkIncident(req.params.id, req.body.parent_id)); } catch (e) { next(e); }
  }
);

router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try { res.json(await svc.deleteIncident(req.params.id, req.user.id)); } catch (e) { next(e); }
});

router.delete('/:id/link', authorize('admin', 'supervisor'), async (req, res, next) => {
  try { res.json(await svc.unlinkIncident(req.params.id)); } catch (e) { next(e); }
});

// ── Photos ────────────────────────────────────────────────────────────────────

// Helper: verifica que técnico tenga acceso al incidente antes de ver sus fotos
async function checkPhotoAccess(req, res) {
  if (req.user.role !== 'technician') return true;
  const inc = await svc.getIncident(req.params.id);
  if (inc.assigned_to !== req.user.id) {
    res.status(403).json({ error: 'No tienes acceso a las fotos de esta incidencia' });
    return false;
  }
  return true;
}

router.get('/:id/photos', async (req, res, next) => {
  try {
    if (!await checkPhotoAccess(req, res)) return;
    res.json(await svc.getPhotos(req.params.id));
  } catch (e) { next(e); }
});

const MAX_PHOTO_BYTES  = 5 * 1024 * 1024; // 5 MB en base64 ≈ 6.7 MB string
const MAX_SIG_BYTES    = 500 * 1024;       // 500 KB para firmas

router.post('/:id/photos', async (req, res, next) => {
  try {
    const { data, filename, mime_type } = req.body;
    if (!data) return res.status(400).json({ error: 'Se requiere el campo data (base64)' });
    if (Buffer.byteLength(data, 'utf8') > MAX_PHOTO_BYTES * 1.4)
      return res.status(413).json({ error: 'La imagen supera el límite de 5 MB' });
    const photo = await svc.uploadPhoto(
      req.params.id,
      req.user.id,
      data,
      filename || `photo_${Date.now()}.jpg`,
      mime_type || 'image/jpeg'
    );
    res.status(201).json(photo);
  } catch (e) { next(e); }
});

router.get('/:id/photos/:photoId', async (req, res, next) => {
  try {
    if (!await checkPhotoAccess(req, res)) return;
    res.json(await svc.getPhoto(req.params.id, req.params.photoId));
  } catch (e) { next(e); }
});

router.delete('/:id/photos/:photoId', async (req, res, next) => {
  try { res.json(await svc.deletePhoto(req.params.id, req.params.photoId, req.user.id, req.user.role)); } catch (e) { next(e); }
});

module.exports = router;
