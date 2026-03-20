const { Pool } = require('pg');

let pool;

function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
  console.log('[DB] Pool PostgreSQL (Supabase) inicializado.');
  return pool;
}

function getDb() {
  if (!pool) throw new Error('DB no inicializada. Llama initDb() primero.');
  return pool;
}

// Helper: reemplaza ? con $1, $2... y retorna { text, values }
function q(sql, params = []) {
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  return { text, values: params };
}

module.exports = { initDb, getDb, q };
