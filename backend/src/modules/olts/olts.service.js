const { getDb } = require('../../config/database');

async function listOlts() {
  const db = getDb();
  const { rows } = await db.query(
    `SELECT id, description, ip, username, ssh_port, brand, connection_type, snmp_community, status, pon_frame, pon_slot, pon_ports, created_at
     FROM olts ORDER BY description ASC`
  );
  return rows;
}

async function getOlt(id) {
  const db = getDb();
  const { rows } = await db.query(`SELECT * FROM olts WHERE id=$1`, [id]);
  if (!rows[0]) throw Object.assign(new Error('OLT no encontrada'), { status: 404 });
  return rows[0];
}

async function createOlt(data) {
  const db = getDb();
  const { description, ip, username, password, ssh_port, brand, connection_type, snmp_community, status, pon_frame, pon_slot, pon_ports } = data;
  const { rows } = await db.query(
    `INSERT INTO olts (description, ip, username, password, ssh_port, brand, connection_type, snmp_community, status, pon_frame, pon_slot, pon_ports)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [description, ip, username, password, ssh_port || 22, brand || 'zte', connection_type || 'ssh', snmp_community || 'public', status || 'active',
     pon_frame || 1, pon_slot || 1, pon_ports || 8]
  );
  return rows[0];
}

async function updateOlt(id, data) {
  const db = getDb();
  const { description, ip, username, password, ssh_port, brand, connection_type, snmp_community, status, pon_frame, pon_slot, pon_ports } = data;
  const { rows } = await db.query(
    `UPDATE olts SET
       description=$1, ip=$2, username=$3,
       password=COALESCE(NULLIF($4,''), password),
       ssh_port=$5, brand=$6, connection_type=$7, snmp_community=$8, status=$9,
       pon_frame=COALESCE($10,pon_frame), pon_slot=COALESCE($11,pon_slot), pon_ports=COALESCE($12,pon_ports),
       updated_at=NOW()
     WHERE id=$13 RETURNING *`,
    [description, ip, username, password, ssh_port, brand, connection_type, snmp_community, status,
     pon_frame || null, pon_slot || null, pon_ports || null, id]
  );
  if (!rows[0]) throw Object.assign(new Error('OLT no encontrada'), { status: 404 });
  return rows[0];
}

async function deleteOlt(id) {
  const db = getDb();
  const { rowCount } = await db.query(`DELETE FROM olts WHERE id=$1`, [id]);
  if (!rowCount) throw Object.assign(new Error('OLT no encontrada'), { status: 404 });
}

module.exports = { listOlts, getOlt, createOlt, updateOlt, deleteOlt };
