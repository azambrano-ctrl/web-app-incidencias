const { getDb } = require('../../config/database');

async function listRouters() {
  const db = getDb();
  const { rows } = await db.query(
    `SELECT id, description, ip, username, api_port, cut_label, active_label, status, created_at
     FROM routers ORDER BY description ASC`
  );
  return rows;
}

async function getRouter(id) {
  const db = getDb();
  const { rows } = await db.query(`SELECT * FROM routers WHERE id=$1`, [id]);
  if (!rows[0]) throw Object.assign(new Error('Router no encontrado'), { status: 404 });
  return rows[0];
}

async function createRouter(data) {
  const db = getDb();
  const { description, ip, username, password, api_port, cut_label, active_label, status } = data;
  const { rows } = await db.query(
    `INSERT INTO routers (description, ip, username, password, api_port, cut_label, active_label, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [description, ip, username, password, api_port || 8728, cut_label || 'CORTE', active_label || 'HABILITADOS', status || 'active']
  );
  return rows[0];
}

async function updateRouter(id, data) {
  const db = getDb();
  const { description, ip, username, password, api_port, cut_label, active_label, status } = data;
  const { rows } = await db.query(
    `UPDATE routers SET
       description=$1, ip=$2, username=$3,
       password=COALESCE(NULLIF($4,''), password),
       api_port=$5, cut_label=$6, active_label=$7, status=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [description, ip, username, password, api_port, cut_label, active_label, status, id]
  );
  if (!rows[0]) throw Object.assign(new Error('Router no encontrado'), { status: 404 });
  return rows[0];
}

async function deleteRouter(id) {
  const db = getDb();
  const { rowCount } = await db.query(`DELETE FROM routers WHERE id=$1`, [id]);
  if (!rowCount) throw Object.assign(new Error('Router no encontrado'), { status: 404 });
}

module.exports = { listRouters, getRouter, createRouter, updateRouter, deleteRouter };
