const { getDb } = require('../config/database');

async function audit(userId, action, entity, entityId, detail, ip) {
  try {
    const db = getDb();
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId || null, action, entity || null, String(entityId || ''), detail ? JSON.stringify(detail) : null, ip || null]
    );
  } catch (e) {
    console.error('[Audit]', e.message); // no detener el request si falla el log
  }
}

module.exports = { audit };
