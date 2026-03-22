const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  // 1. Leer token desde cookie httpOnly (preferido, más seguro)
  // 2. Fallback a Authorization: Bearer (compatibilidad con clientes existentes)
  let token = req.cookies?.auth_token;

  if (!token) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { authenticate };
