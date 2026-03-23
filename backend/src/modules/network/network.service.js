const { getDb } = require('../../config/database');

async function listNodes() {
  const db = getDb();
  const { rows } = await db.query(`
    SELECT n.*, u.name AS created_by_name
    FROM   network_nodes n
    LEFT JOIN users u ON u.id = n.created_by
    ORDER  BY n.created_at DESC
  `);
  return rows;
}

async function getNode(id) {
  const db = getDb();
  const { rows } = await db.query(`
    SELECT n.*, u.name AS created_by_name, u2.name AS updated_by_name
    FROM   network_nodes n
    LEFT JOIN users u  ON u.id  = n.created_by
    LEFT JOIN users u2 ON u2.id = n.updated_by
    WHERE n.id = $1
  `, [id]);
  if (!rows[0]) throw Object.assign(new Error('Nodo no encontrado'), { status: 404 });
  return rows[0];
}

async function createNode(data, userId) {
  const db = getDb();
  const { type, name, description, latitude, longitude, cable_type, total_hilos, hilos_used, notes } = data;
  const { rows } = await db.query(`
    INSERT INTO network_nodes
      (type, name, description, latitude, longitude, cable_type, total_hilos, hilos_used, notes, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    RETURNING *
  `, [type, name, description || null, latitude, longitude,
      cable_type || null, total_hilos || 0, hilos_used || 0,
      notes || null, userId]);
  return rows[0];
}

async function updateNode(id, data, userId) {
  const db = getDb();
  const { type, name, description, latitude, longitude, cable_type, total_hilos, hilos_used, notes } = data;
  const { rows } = await db.query(`
    UPDATE network_nodes SET
      type        = COALESCE($1, type),
      name        = COALESCE($2, name),
      description = $3,
      latitude    = COALESCE($4, latitude),
      longitude   = COALESCE($5, longitude),
      cable_type  = $6,
      total_hilos = COALESCE($7, total_hilos),
      hilos_used  = COALESCE($8, hilos_used),
      notes       = $9,
      updated_by  = $10,
      updated_at  = NOW()
    WHERE id = $11
    RETURNING *
  `, [type, name, description ?? null, latitude, longitude,
      cable_type ?? null, total_hilos, hilos_used,
      notes ?? null, userId, id]);
  if (!rows[0]) throw Object.assign(new Error('Nodo no encontrado'), { status: 404 });
  return rows[0];
}

async function deleteNode(id) {
  const db = getDb();
  const { rowCount } = await db.query('DELETE FROM network_nodes WHERE id=$1', [id]);
  if (!rowCount) throw Object.assign(new Error('Nodo no encontrado'), { status: 404 });
}

module.exports = { listNodes, getNode, createNode, updateNode, deleteNode };
