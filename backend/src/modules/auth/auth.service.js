const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../../config/database');

async function login(email, password) {
  const db = getDb();
  const { rows } = await db.query('SELECT * FROM users WHERE email=$1 AND active=1', [email]);
  const user = rows[0];
  if (!user) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  const { password: _, ...userSafe } = user;
  return { token, user: userSafe };
}

module.exports = { login };
