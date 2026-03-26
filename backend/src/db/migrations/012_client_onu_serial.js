const { getDb } = require('../../config/database');

async function runMigrations012() {
  const db = getDb();
  await db.query(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS onu_serial TEXT;
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_clients_onu_serial ON clients(onu_serial);
  `);
  console.log('[Migration 012] clients.onu_serial OK');
}

module.exports = { runMigrations012 };
