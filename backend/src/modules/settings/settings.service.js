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
  const result = {};
  for (const k of keys) result[k] = await getSetting(k);
  return result;
}

async function setSettings(obj) {
  for (const [k, v] of Object.entries(obj)) await setSetting(k, v);
}

module.exports = { getSetting, setSetting, getSettings, setSettings };
