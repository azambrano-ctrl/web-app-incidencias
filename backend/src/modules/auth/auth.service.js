const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../../config/database');

// Bloqueo por cuenta: hasta 10 intentos fallidos en 15 minutos → cuenta bloqueada 15 min
// Estructura: { attempts: number, lockedUntil: Date|null }
const loginAttempts = new Map();
const MAX_ATTEMPTS  = 10;
const WINDOW_MS     = 15 * 60 * 1000; // 15 min
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 min

function checkLockout(email) {
  const entry = loginAttempts.get(email);
  if (!entry) return;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    const secs = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw Object.assign(new Error(`Cuenta bloqueada por múltiples intentos fallidos. Intente en ${secs}s`), { status: 429 });
  }
  // Limpiar si venció la ventana
  if (entry.windowStart && Date.now() - entry.windowStart > WINDOW_MS) {
    loginAttempts.delete(email);
  }
}

function recordFailure(email) {
  const now = Date.now();
  let entry = loginAttempts.get(email) || { attempts: 0, windowStart: now, lockedUntil: null };
  if (Date.now() - entry.windowStart > WINDOW_MS) {
    entry = { attempts: 0, windowStart: now, lockedUntil: null };
  }
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
  }
  loginAttempts.set(email, entry);
}

async function login(email, password) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  checkLockout(normalizedEmail);

  const db = getDb();
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1 AND active=1', [normalizedEmail]);
  const user = rows[0];
  // Siempre comparar para evitar timing attack, aunque no exista el usuario
  const hash = user?.password || '$2a$10$invalidhashpadding00000000000000000000000000000000000';
  const valid = user && bcrypt.compareSync(password, hash);

  if (!valid) {
    recordFailure(normalizedEmail);
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }

  // Login exitoso: limpiar contador
  loginAttempts.delete(normalizedEmail);

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  const { password: _, ...userSafe } = user;
  return { token, user: userSafe };
}

module.exports = { login };
