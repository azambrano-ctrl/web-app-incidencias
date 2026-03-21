require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/users.routes');
const incidentRoutes = require('./modules/incidents/incidents.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const clientRoutes = require('./modules/clients/clients.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const checklistRoutes = require('./modules/checklists/checklists.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1); // Railway / Vercel / Render usan proxy
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '15mb' }));

// Rate limiting para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login, intente en 15 minutos' },
});

app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/incidents', incidentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/clients', clientRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/checklists', checklistRoutes);

app.get('/api/v1/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use(errorHandler);

module.exports = app;
