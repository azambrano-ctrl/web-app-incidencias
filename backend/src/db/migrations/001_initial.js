const { getDb } = require('../../config/database');

async function runMigrations() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL CHECK(role IN ('admin','supervisor','technician')),
      phone      TEXT,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id              SERIAL PRIMARY KEY,
      ticket_number   TEXT    NOT NULL UNIQUE,
      title           TEXT    NOT NULL,
      description     TEXT    NOT NULL,
      type            TEXT    NOT NULL CHECK(type IN ('internet','tv','both')),
      priority        TEXT    NOT NULL DEFAULT 'medium'
                        CHECK(priority IN ('low','medium','high','critical')),
      status          TEXT    NOT NULL DEFAULT 'open'
                        CHECK(status IN ('open','assigned','in_progress','resolved','closed','cancelled')),
      client_name     TEXT    NOT NULL,
      client_address  TEXT    NOT NULL,
      client_phone    TEXT,
      assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by      INTEGER NOT NULL REFERENCES users(id),
      resolved_at     TIMESTAMPTZ,
      solution        TEXT,
      due_at          TIMESTAMPTZ,
      last_reminded_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status          ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_assigned        ON incidents(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_incidents_priority        ON incidents(priority);
    CREATE INDEX IF NOT EXISTS idx_incidents_created         ON incidents(created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_status_priority ON incidents(status, priority);
    CREATE INDEX IF NOT EXISTS idx_incidents_assigned_status ON incidents(assigned_to, status);

    CREATE TABLE IF NOT EXISTS status_history (
      id           SERIAL PRIMARY KEY,
      incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      changed_by   INTEGER NOT NULL REFERENCES users(id),
      old_status   TEXT,
      new_status   TEXT    NOT NULL,
      comment      TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_history_incident ON status_history(incident_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      incident_id  INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      message      TEXT NOT NULL,
      read         INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);

    CREATE TABLE IF NOT EXISTS comments (
      id           SERIAL PRIMARY KEY,
      incident_id  INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      body         TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_comments_incident ON comments(incident_id);

    CREATE TABLE IF NOT EXISTS clients (
      id              SERIAL PRIMARY KEY,
      external_id     TEXT,
      identificacion  TEXT,
      nombre1         TEXT,
      nombre2         TEXT,
      apellido1       TEXT,
      apellido2       TEXT,
      razon_social    TEXT,
      direccion       TEXT,
      celular1        TEXT,
      celular2        TEXT,
      email           TEXT,
      sector          TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_clients_identificacion ON clients(identificacion);
    CREATE INDEX IF NOT EXISTS idx_clients_razon_social   ON clients(razon_social);
    CREATE INDEX IF NOT EXISTS idx_clients_celular1       ON clients(celular1);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      subscription TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Columnas agregadas posteriormente
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS client_phone2 TEXT`);
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS client_identificacion TEXT`);
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS client_signature TEXT`);

  // Corregir incidencias con técnico asignado pero estado "open"
  await db.query(`
    UPDATE incidents SET status='assigned'
    WHERE status='open' AND assigned_to IS NOT NULL
  `);

  console.log('[DB] Migraciones ejecutadas correctamente.');
}

module.exports = { runMigrations };
