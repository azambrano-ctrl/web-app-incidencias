const { getDb } = require('../../config/database');

async function runMigrations008() {
  const db = getDb();
  await db.query(`
    ALTER TABLE incidents
      ADD COLUMN IF NOT EXISTS external_id INTEGER DEFAULT NULL
  `);
  console.log('[Migration 008] incidents.external_id OK');
}

module.exports = { runMigrations008 };
