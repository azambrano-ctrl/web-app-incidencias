const cron = require('node-cron');
const { getDb } = require('../config/database');
const { createNotification } = require('../modules/notifications/notifications.service');
const { sendEmail } = require('../services/email.service');
const { sendWhatsApp } = require('../services/whatsapp.service');
const { sendPush } = require('../services/push.service');

let _io = null;
function setIo(io) { _io = io; }

function startReminderJob() {
  const intervalMin = process.env.REMINDER_INTERVAL_MINUTES || 5;
  const warnHours   = process.env.REMINDER_WARN_HOURS || 2;
  console.log(`[Cron] Recordatorios cada ${intervalMin} min, alerta con ${warnHours}h de anticipación`);

  cron.schedule(`*/${intervalMin} * * * *`, async () => {
    try {
      const db = getDb();

      // ── Get escalation threshold from settings ──
      const { rows: settingRows } = await db.query(
        `SELECT value FROM settings WHERE key='escalation_hours'`
      );
      const escalationHours = parseFloat(settingRows[0]?.value || '4');

      // Incidencias con due_at próximo o vencido
      const { rows: pending } = await db.query(`
        SELECT i.*, u.name as technician_name, u.email as tech_email, u.phone as tech_phone
        FROM incidents i
        LEFT JOIN users u ON u.id = i.assigned_to
        WHERE i.status IN ('open','assigned','in_progress')
          AND i.assigned_to IS NOT NULL
          AND i.due_at IS NOT NULL
          AND i.due_at <= NOW() + INTERVAL '${warnHours} hours'
          AND (i.last_reminded_at IS NULL OR i.last_reminded_at < NOW() - INTERVAL '30 minutes')
      `);

      for (const inc of pending) {
        const isOverdue = new Date(inc.due_at) < new Date();
        const msg = isOverdue
          ? `⚠️ VENCIDA: La incidencia ${inc.ticket_number} "${inc.title}" venció el ${new Date(inc.due_at).toLocaleDateString('es-HN')}`
          : `⏰ RECORDATORIO: La incidencia ${inc.ticket_number} "${inc.title}" vence pronto`;

        const notif = await createNotification(inc.assigned_to, 'reminder', msg, inc.id);
        if (_io) {
          _io.to(`user:${inc.assigned_to}`).emit('notification:new', notif);
          _io.to(`user:${inc.assigned_to}`).emit('incident:reminder', { incident: inc, message: msg });
        }

        const emailHtml = `<h2 style="color:#ef4444">⚠️ Recordatorio</h2><p>${msg}</p>`;
        if (inc.tech_email) sendEmail(inc.tech_email, `Recordatorio: ${inc.ticket_number}`, emailHtml).catch(err => console.error('[Cron] Email error:', err.message));
        if (inc.tech_phone) sendWhatsApp(inc.tech_phone, msg).catch(err => console.error('[Cron] WhatsApp error:', err.message));
        sendPush(inc.assigned_to, { title: 'Recordatorio de incidencia', body: msg, url: `/incidencias/${inc.id}` }).catch(err => console.error('[Cron] Push error:', err.message));

        await db.query(`UPDATE incidents SET last_reminded_at=NOW() WHERE id=$1`, [inc.id]);
        console.log(`[Cron] Recordatorio: ${inc.ticket_number} -> ${inc.technician_name}`);
      }

      // Incidencias sin asignar más de 24h
      const { rows: stale } = await db.query(`
        SELECT i.* FROM incidents i
        WHERE i.status='open' AND i.assigned_to IS NULL
          AND i.created_at < NOW() - INTERVAL '24 hours'
          AND (i.last_reminded_at IS NULL OR i.last_reminded_at < NOW() - INTERVAL '1 hour')
      `);

      for (const inc of stale) {
        const msg = `⚠️ Sin asignar: La incidencia ${inc.ticket_number} lleva más de 24h sin técnico asignado`;
        const { rows: admins } = await db.query(`SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1`);
        for (const a of admins) {
          const notif = await createNotification(a.id, 'reminder', msg, inc.id);
          if (_io) _io.to(`user:${a.id}`).emit('notification:new', notif);
        }
        await db.query(`UPDATE incidents SET last_reminded_at=NOW() WHERE id=$1`, [inc.id]);
      }

      // ── Escalamiento automático ──
      // Find incidents in 'open' or 'assigned' (not yet in_progress) for more than escalationHours
      // that have not been escalated yet
      const { rows: toEscalate } = await db.query(`
        SELECT i.* FROM incidents i
        WHERE i.status IN ('open','assigned')
          AND i.escalated = FALSE
          AND i.created_at < NOW() - ($1 || ' hours')::INTERVAL
          AND i.status NOT IN ('resolved','closed','cancelled')
      `, [String(escalationHours)]);

      if (toEscalate.length > 0) {
        const { rows: supervisors } = await db.query(
          `SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1`
        );

        for (const inc of toEscalate) {
          // Mark as escalated
          await db.query(
            `UPDATE incidents SET escalated=TRUE, escalated_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [inc.id]
          );

          const escMsg = `🔺 ESCALADA: La incidencia ${inc.ticket_number} "${inc.title}" lleva más de ${escalationHours}h sin ser atendida`;

          for (const sup of supervisors) {
            const notif = await createNotification(sup.id, 'escalation', escMsg, inc.id);
            if (_io) {
              _io.to(`user:${sup.id}`).emit('notification:new', notif);
              _io.to(`user:${sup.id}`).emit('incident:escalated', { incident: inc, message: escMsg });
            }
            // Notify via push
            sendPush(sup.id, { title: 'Incidencia escalada', body: escMsg, url: `/incidencias/${inc.id}` }).catch(err => console.error('[Cron] Push escalation error:', err.message));
          }

          console.log(`[Cron] Escalada: ${inc.ticket_number}`);
        }
      }

    } catch (err) {
      console.error('[Cron] Error:', err.message);
    }
  });
}

module.exports = { startReminderJob, setIo };
