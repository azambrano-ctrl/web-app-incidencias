const { getDb } = require('../../config/database');

async function runMigrations009() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS routers (
      id          SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      ip          TEXT NOT NULL,
      username    TEXT NOT NULL,
      password    TEXT NOT NULL,
      api_port    INTEGER NOT NULL DEFAULT 8728,
      cut_label   TEXT NOT NULL DEFAULT 'CORTE',
      active_label TEXT NOT NULL DEFAULT 'HABILITADOS',
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[Migration 009] routers OK');
}

module.exports = { runMigrations009 };
