const { getDb } = require('../../config/database');

async function getSetting(key) {
  const db = getDb();
  const { rows } = await db.query('SELECT value FROM settings WHERE key=$1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  const db = getDb();
  await db.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
    [key, value != null ? String(value) : null]
  );
}

async function getSettings(keys) {
  if (!keys || keys.length === 0) return {};
  const db = getDb();
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    keys
  );
  const result = Object.fromEntries(keys.map(k => [k, null]));
  for (const row of rows) result[row.key] = row.value;
  return result;
}

async function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) await setSetting(k, v);
}

module.exports = { getSetting, setSetting, getSettings, setSettings };
