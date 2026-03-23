const { getDb } = require('../../config/database');

async function runMigrations007() {
  const db = getDb();
  await db.query(`
    ALTER TABLE network_nodes
      ADD COLUMN IF NOT EXISTS layer TEXT DEFAULT NULL
  `);
  console.log('[Migration 007] network_nodes.layer OK');
}

module.exports = { runMigrations007 };
