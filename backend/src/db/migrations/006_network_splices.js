const { getDb } = require('../../config/database');

async function runMigrations006() {
  const db = getDb();
  await db.query(`
    ALTER TABLE network_nodes
      ADD COLUMN IF NOT EXISTS splices JSONB NOT NULL DEFAULT '[]'
  `);
  console.log('[Migration 006] network_nodes.splices OK');
}

module.exports = { runMigrations006 };
