const { getDb } = require('../../config/database');

async function runMigrations005() {
  const db = getDb();

  await db.query(`
    CREATE TABLE IF NOT EXISTS network_nodes (
      id           SERIAL PRIMARY KEY,
      type         TEXT NOT NULL CHECK (type IN ('caja','nodo','manga')),
      name         TEXT NOT NULL,
      description  TEXT,
      latitude     DECIMAL(10,8) NOT NULL,
      longitude    DECIMAL(11,8) NOT NULL,
      cable_type   TEXT,
      total_hilos  INTEGER NOT NULL DEFAULT 0,
      hilos_used   INTEGER NOT NULL DEFAULT 0,
      notes        TEXT,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_network_nodes_type    ON network_nodes(type)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_network_nodes_created ON network_nodes(created_at DESC)`);

  console.log('[Migration 005] network_nodes OK');
}

module.exports = { runMigrations005 };
