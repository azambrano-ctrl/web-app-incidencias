const { getDb } = require('../../config/database');

async function runMigrations002() {
  const db = getDb();

  // Feature 1: Escalamiento automático
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ`);

  // Feature 2: Incidencias masivas (parent-child)
  await db.query(`ALTER TABLE incidents ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_incidents_parent ON incidents(parent_id)`);

  // Feature 3: Checklist de resolución
  await db.query(`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      items      JSONB NOT NULL DEFAULT '[]',
      active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS incident_checklists (
      id          SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      template_id INTEGER REFERENCES checklist_templates(id) ON DELETE SET NULL,
      items       JSONB NOT NULL DEFAULT '[]',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(incident_id)
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_incident_checklists_incident ON incident_checklists(incident_id)`);

  // Feature 4: Fotos adjuntas
  await db.query(`
    CREATE TABLE IF NOT EXISTS incident_photos (
      id          SERIAL PRIMARY KEY,
      incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      data        TEXT NOT NULL,
      filename    VARCHAR(255) NOT NULL,
      mime_type   VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_incident_photos_incident ON incident_photos(incident_id)`);

  console.log('[DB] Migraciones 002 ejecutadas correctamente.');
}

module.exports = { runMigrations002 };
