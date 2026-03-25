const { getDb } = require('../../config/database');

async function runMigrations010() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS olts (
      id               SERIAL PRIMARY KEY,
      description      TEXT NOT NULL,
      ip               TEXT NOT NULL,
      username         TEXT NOT NULL,
      password         TEXT NOT NULL,
      ssh_port         INTEGER NOT NULL DEFAULT 22,
      brand            TEXT NOT NULL DEFAULT 'zte'
                         CHECK (brand IN ('zte','huawei','fiberhome','vsol','nokia')),
      connection_type  TEXT NOT NULL DEFAULT 'ssh'
                         CHECK (connection_type IN ('ssh','telnet','snmp')),
      snmp_community   TEXT DEFAULT 'public',
      status           TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','inactive')),
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[Migration 010] olts OK');
}

module.exports = { runMigrations010 };
