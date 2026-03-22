const webpush = require('web-push');
const { getDb } = require('../config/database');
const { getSetting, setSetting } = require('../modules/settings/settings.service');

let vapidInitialized = false;

async function ensureVapidKeys() {
  if (vapidInitialized) {
    // Env var takes priority: return it directly without DB lookup
    return process.env.VAPID_PUBLIC_KEY || await getSetting('push_vapid_public');
  }

  // Priority: environment variables > DB
  let pub  = process.env.VAPID_PUBLIC_KEY  || await getSetting('push_vapid_public');
  let priv = process.env.VAPID_PRIVATE_KEY || await getSetting('push_vapid_private');

  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    // Only persist to DB if not supplied via env — env vars are more secure
    if (!process.env.VAPID_PUBLIC_KEY)  await setSetting('push_vapid_public',  keys.publicKey);
    if (!process.env.VAPID_PRIVATE_KEY) await setSetting('push_vapid_private', keys.privateKey);
    pub  = keys.publicKey;
    priv = keys.privateKey;
    console.log('[Push] VAPID keys generadas. Para mayor seguridad configura VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY como variables de entorno.');
  }

  webpush.setVapidDetails('mailto:admin@incidencias.com', pub, priv);
  vapidInitialized = true;
  return pub;
}

async function subscribe(userId, subscription) {
  const db = getDb();
  const endpoint = subscription.endpoint;
  await db.query(`
    INSERT INTO push_subscriptions (user_id, endpoint, subscription) VALUES ($1,$2,$3)
    ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription, user_id=EXCLUDED.user_id
  `, [userId, endpoint, JSON.stringify(subscription)]);
}

async function unsubscribe(userId, endpoint) {
  const db = getDb();
  await db.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [userId, endpoint]);
}

async function sendPush(userId, payload) {
  const enabled = await getSetting('push_enabled');
  if (enabled !== '1') return;

  await ensureVapidKeys();
  const db = getDb();
  const { rows } = await db.query('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id=$1', [userId]);

  for (const row of rows) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [row.endpoint]);
      }
    }
  }
}

module.exports = { ensureVapidKeys, subscribe, unsubscribe, sendPush };
