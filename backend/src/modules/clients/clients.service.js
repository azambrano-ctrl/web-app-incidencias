const { getDb } = require('../../config/database');

async function importClients(rows) {
  const db = getDb();

  // Deduplicar por ID antes de insertar (evita duplicados si el XLS tiene repetidos)
  const seen = new Map();
  for (const r of rows) seen.set(String(r.ID || ''), r);
  const uniqueRows = [...seen.values()];

  // TRUNCATE fuera de transacción: bloquea la tabla y evita la race condition
  // si el usuario hace clic varias veces mientras el import está corriendo
  await db.query('TRUNCATE TABLE clients RESTART IDENTITY');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const BATCH = 200;
    const COLS = 12;
    for (let i = 0; i < uniqueRows.length; i += BATCH) {
      const batch = uniqueRows.slice(i, i + BATCH);
      const valueClauses = [];
      const params = [];
      let idx = 1;
      for (const r of batch) {
        const placeholders = [];
        for (let c = 0; c < COLS; c++) placeholders.push(`$${idx++}`);
        valueClauses.push(`(${placeholders.join(',')})`);
        params.push(
          String(r.ID || ''), String(r.IDENTIFICACION || ''),
          String(r.NOMBRE1 || ''), String(r.NOMBRE2 || ''),
          String(r.APELLIDO1 || ''), String(r.APELLIDO2 || ''),
          String(r.RAZON_SOCIAL || ''), String(r.DIRECCION || ''),
          String(r.CELULAR1 || ''), String(r.CELULAR2 || ''),
          String(r.EMAIL || ''), String(r.SECTOR || '')
        );
      }
      await client.query(
        `INSERT INTO clients (external_id,identificacion,nombre1,nombre2,apellido1,apellido2,razon_social,direccion,celular1,celular2,email,sector) VALUES ${valueClauses.join(',')}`,
        params
      );
    }
    await client.query('COMMIT');
    return { imported: uniqueRows.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function searchClients(q, limit = 10) {
  const db = getDb();
  const term = `%${q}%`;
  const { rows } = await db.query(`
    SELECT id, external_id, identificacion, razon_social, nombre1, nombre2, apellido1, apellido2,
           direccion, celular1, celular2, email, sector
    FROM clients
    WHERE razon_social ILIKE $1 OR identificacion ILIKE $2
       OR celular1 ILIKE $3 OR celular2 ILIKE $4
       OR nombre1 ILIKE $5 OR apellido1 ILIKE $6
    ORDER BY razon_social
    LIMIT $7
  `, [term, term, term, term, term, term, limit]);
  return rows;
}

async function getStats() {
  const db = getDb();
  const { rows: [total] } = await db.query('SELECT COUNT(*) as total FROM clients');
  const { rows: sectors } = await db.query(`
    SELECT sector, COUNT(*) as count FROM clients
    WHERE sector != '' GROUP BY sector ORDER BY count DESC LIMIT 10
  `);
  return { total: parseInt(total.total), sectors };
}

module.exports = { importClients, searchClients, getStats };
