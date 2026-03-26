const { getDb } = require('../../config/database');

async function runMigrations011() {
  const db = getDb();
  await db.query(`
    ALTER TABLE olts
      ADD COLUMN IF NOT EXISTS pon_frame INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS pon_slot  INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS pon_ports INTEGER NOT NULL DEFAULT 8;
  `);
  console.log('[Migration 011] olt pon_frame/pon_slot/pon_ports OK');
}

module.exports = { runMigrations011 };
