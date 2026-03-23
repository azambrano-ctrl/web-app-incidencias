const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

function initSocket(httpServer) {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
  ].filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Socket: origin no permitido'));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Middleware de autenticación Socket.io
  // Lee el token desde la cookie httpOnly (mismo mecanismo que el REST API)
  io.use((socket, next) => {
    let token = socket.handshake.auth?.token; // compatibilidad hacia atrás

    if (!token) {
      const cookies = socket.handshake.headers.cookie || '';
      const match = cookies.match(/(?:^|;\s*)auth_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) return next(new Error('Token requerido'));

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, name } = socket.user;
    socket.join(`user:${id}`);
    socket.join(`role:${role}`);
    console.log(`[Socket] Conectado: ${name} (${role}) - ${socket.id}`);

    socket.on('join:incident', (incidentId) => {
      socket.join(`incident:${incidentId}`);
    });

    socket.on('leave:incident', (incidentId) => {
      socket.leave(`incident:${incidentId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Desconectado: ${name} - ${socket.id}`);
    });
  });

  return io;
}

function getIo() {
  if (!io) throw new Error('Socket.io no inicializado');
  return io;
}

module.exports = { initSocket, getIo };
