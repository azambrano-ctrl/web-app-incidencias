require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/users.routes');
const incidentRoutes = require('./modules/incidents/incidents.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const clientRoutes = require('./modules/clients/clients.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const checklistRoutes = require('./modules/checklists/checklists.routes');
const maintenanceRoutes = require('./modules/maintenances/maintenances.routes');
const oncallRoutes   = require('./modules/oncall/oncall.routes');
const networkRoutes  = require('./modules/network/network.routes');
const routerRoutes   = require('./modules/routers/routers.routes');
const oltRoutes      = require('./modules/olts/olts.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1); // Railway / Vercel / Render usan proxy

// Helmet: cabeceras de seguridad HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      connectSrc: ["'self'"],   // Solo el propio dominio puede hacer fetch
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Permite que el frontend (distinto dominio) reciba respuestas
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
// Morgan: formato legible en dev, compacto en producción
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cookieParser());
app.use(express.json({ limit: '15mb' }));

// CSRF: peticiones que modifican estado deben incluir header X-Client
// Previene ataques donde un sitio externo hace requests usando las cookies del usuario
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use((req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path === '/api/v1/auth/login') return next(); // login no tiene cookie aún
  const clientHeader = req.headers['x-client'];
  if (!clientHeader || clientHeader !== 'incidencias-spa') {
    return res.status(403).json({ error: 'Solicitud no autorizada (CSRF)' });
  }
  next();
});

const makeLimiter = (max, windowMs, msg) =>
  rateLimit({ windowMs, max, message: { error: msg } });

// Login: 20 intentos / 15 min
app.use('/api/v1/auth/login',
  makeLimiter(20, 15 * 60 * 1000, 'Demasiados intentos de login, intente en 15 minutos'));

// Crear/modificar usuarios: 30 operaciones / 15 min (solo admin)
app.use('/api/v1/users',
  makeLimiter(30, 15 * 60 * 1000, 'Demasiadas operaciones de usuario, espere 15 minutos'));

// Cambiar contraseña: 5 intentos / hora
app.use('/api/v1/users/:id/password',
  makeLimiter(5, 60 * 60 * 1000, 'Demasiados intentos de cambio de contraseña'));

// Subida de fotos: 30 fotos / 10 min
app.use('/api/v1/incidents/:id/photos',
  makeLimiter(30, 10 * 60 * 1000, 'Demasiadas fotos subidas, espere 10 minutos'));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/incidents', incidentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/checklists', checklistRoutes);
app.use('/api/v1/maintenances', maintenanceRoutes);
app.use('/api/v1/oncall',   oncallRoutes);
app.use('/api/v1/network',  networkRoutes);
app.use('/api/v1/routers', routerRoutes);
app.use('/api/v1/olts', oltRoutes);

app.get('/api/v1/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

module.exports = app;
