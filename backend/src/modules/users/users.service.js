const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');

async function listUsers(role) {
  const db = getDb();
  let sql = 'SELECT id, name, email, role, phone, active, created_at FROM users';
  const params = [];
  if (role) { sql += ' WHERE role=$1'; params.push(role); }
  sql += ' ORDER BY name';
  const { rows } = await db.query(sql, params);
  return rows;
}

async function getUser(id) {
  const db = getDb();
  const { rows } = await db.query(
    'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id=$1', [id]
  );
  if (!rows[0]) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  return rows[0];
}

async function createUser({ name, email, password, role, phone }) {
  const db = getDb();
  const { rows: ex } = await db.query('SELECT id FROM users WHERE email=$1', [email]);
  if (ex[0]) throw Object.assign(new Error('El email ya está registrado'), { status: 409 });

  const hash = bcrypt.hashSync(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, email, hash, role, phone || null]
  );
  return getUser(rows[0].id);
}

async function updateUser(id, { name, email, role, phone, active }) {
  const db = getDb();
  await getUser(id);
  await db.query(
    `UPDATE users SET name=$1, email=$2, role=$3, phone=$4, active=$5, updated_at=NOW() WHERE id=$6`,
    [name, email, role, phone || null, active !== undefined ? active : 1, id]
  );
  return getUser(id);
}

async function resetPassword(id, newPassword) {
  const db = getDb();
  await getUser(id);
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.query(`UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2`, [hash, id]);
  return { message: 'Contraseña actualizada' };
}

async function deactivateUser(id) {
  const db = getDb();
  await getUser(id);
  await db.query(`UPDATE users SET active=0, updated_at=NOW() WHERE id=$1`, [id]);
  return { message: 'Usuario desactivado' };
}

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword, deactivateUser };
