const webpush = require('web-push');
const { getDb } = require('../config/database');
const { getSetting, setSetting } = require('../modules/settings/settings.service');

let vapidInitialized = false;

async function ensureVapidKeys() {
  if (vapidInitialized) return await getSetting('push_vapid_public');

  let pub  = await getSetting('push_vapid_public');
  let priv = await getSetting('push_vapid_private');

  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    await setSetting('push_vapid_public',  keys.publicKey);
    await setSetting('push_vapid_private', keys.privateKey);
    pub  = keys.publicKey;
    priv = keys.privateKey;
    console.log('[Push] VAPID keys generadas y guardadas.');
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
