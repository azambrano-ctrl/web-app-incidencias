const { getDb } = require('../../config/database');

async function runMigrations003() {
  const db = getDb();

  // Feature: Mantenimientos programados
  await db.query(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id                     SERIAL PRIMARY KEY,
      title                  TEXT NOT NULL,
      description            TEXT,
      zone                   TEXT,
      scheduled_at           TIMESTAMPTZ NOT NULL,
      estimated_duration_min INTEGER NOT NULL DEFAULT 60,
      status                 TEXT NOT NULL DEFAULT 'scheduled'
                               CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
      notify_clients         BOOLEAN NOT NULL DEFAULT TRUE,
      notified_at            TIMESTAMPTZ,
      created_by             INTEGER NOT NULL REFERENCES users(id),
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_maintenances_scheduled ON maintenances(scheduled_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_maintenances_status    ON maintenances(status)`);

  // Feature: Rotaciones de guardia (on-call)
  await db.query(`
    CREATE TABLE IF NOT EXISTS oncall_schedules (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date   DATE NOT NULL,
      notes      TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_oncall_dates ON oncall_schedules(start_date, end_date)`);

  console.log('[DB] Migraciones 003 ejecutadas correctamente.');
}

module.exports = { runMigrations003 };
