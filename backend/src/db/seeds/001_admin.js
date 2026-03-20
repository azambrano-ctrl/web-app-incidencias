const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');

async function runSeeds() {
  const db = getDb();
  const { rows } = await db.query('SELECT COUNT(*) as c FROM users');
  if (parseInt(rows[0].c) > 0) return;

  const hash  = bcrypt.hashSync('admin123', 10);
  const hash2 = bcrypt.hashSync('supervisor123', 10);
  const hash3 = bcrypt.hashSync('tecnico123', 10);

  await db.query(
    `INSERT INTO users (name, email, password, role, phone) VALUES
     ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ($11,$12,$13,$14,$15)`,
    [
      'Administrador','admin@incidencias.com',hash,'admin','00000000',
      'Supervisor','supervisor@incidencias.com',hash2,'supervisor','11111111',
      'Técnico Demo','tecnico@incidencias.com',hash3,'technician','22222222',
    ]
  );

  console.log('[SEED] Usuarios iniciales creados.');
}

module.exports = { runSeeds };
