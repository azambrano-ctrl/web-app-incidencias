const { getDb } = require('../../config/database');

async function createNotification(userId, type, message, incidentId = null) {
  const db = getDb();
  const { rows } = await db.query(
    `INSERT INTO notifications (user_id, incident_id, type, message) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, incidentId, type, message]
  );
  return rows[0];
}

async function getNotifications(userId, onlyUnread = false) {
  const db = getDb();
  let sql = `
    SELECT n.*, i.ticket_number, i.title as incident_title
    FROM notifications n
    LEFT JOIN incidents i ON i.id = n.incident_id
    WHERE n.user_id = $1
  `;
  if (onlyUnread) sql += ' AND n.read = 0';
  sql += ' ORDER BY n.created_at DESC LIMIT 50';
  const { rows } = await db.query(sql, [userId]);
  return rows;
}

async function getUnreadCount(userId) {
  const db = getDb();
  const { rows } = await db.query(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id=$1 AND read=0', [userId]
  );
  return parseInt(rows[0].count);
}

async function markAsRead(notificationId, userId) {
  const db = getDb();
  await db.query('UPDATE notifications SET read=1 WHERE id=$1 AND user_id=$2', [notificationId, userId]);
  return { message: 'Marcada como leída' };
}

async function markAllAsRead(userId) {
  const db = getDb();
  await db.query('UPDATE notifications SET read=1 WHERE user_id=$1', [userId]);
  return { message: 'Todas marcadas como leídas' };
}

module.exports = { createNotification, getNotifications, getUnreadCount, markAsRead, markAllAsRead };
