const cron = require('node-cron');
const { getDb } = require('../config/database');
const { createNotification } = require('../modules/notifications/notifications.service');
const { sendEmail } = require('../services/email.service');
const { sendWhatsApp } = require('../services/whatsapp.service');
const { sendPush } = require('../services/push.service');

let _io = null;
function setIo(io) { _io = io; }
const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function startReminderJob() {
  const intervalMin = process.env.REMINDER_INTERVAL_MINUTES || 5;
  const warnHours   = process.env.REMINDER_WARN_HOURS || 1; // avisar 1h antes del vencimiento
  console.log(`[Cron] Recordatorios cada ${intervalMin} min | aviso SLA con ${warnHours}h de anticipación`);

  /* ─────────────────────────────────────────────────────────────────
   *  1. Recordatorio SLA — cada N minutos
   *     Avisa cuando due_at está próximo o ya venció, dentro de horario
   * ───────────────────────────────────────────────────────────────── */
  cron.schedule(`*/${intervalMin} * * * *`, async () => {
    try {
      const db = getDb();

      // Incidencias cuyo due_at está dentro del umbral de aviso o ya venció
      const { rows: pending } = await db.query(`
        SELECT i.*, u.name as technician_name, u.email as tech_email, u.phone as tech_phone
        FROM incidents i
        LEFT JOIN users u ON u.id = i.assigned_to
        WHERE i.status IN ('open','assigned','in_progress')
          AND i.assigned_to IS NOT NULL
          AND i.due_at IS NOT NULL
          AND i.due_at <= NOW() + ($1 || ' hours')::INTERVAL
          AND (i.last_reminded_at IS NULL OR i.last_reminded_at < NOW() - INTERVAL '30 minutes')
      `, [String(warnHours)]);

      for (const inc of pending) {
        const isOverdue = new Date(inc.due_at) < new Date();
        const dueStr = new Date(inc.due_at).toLocaleString('es-EC', {
          timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit',
          hour: '2-digit', minute: '2-digit',
        });
        const msg = isOverdue
          ? `⚠️ SLA VENCIDO: ${inc.ticket_number} "${inc.title}" — venció el ${dueStr}`
          : `⏰ SLA PRÓXIMO: ${inc.ticket_number} "${inc.title}" — vence ${dueStr}`;

        const notif = await createNotification(inc.assigned_to, 'reminder', msg, inc.id);
        if (_io) {
          _io.to(`user:${inc.assigned_to}`).emit('notification:new', notif);
          _io.to(`user:${inc.assigned_to}`).emit('incident:reminder', { incident: inc, message: msg });
        }

        const emailHtml = `<h2 style="color:#ef4444">⚠️ Recordatorio SLA</h2><p>${msg}</p>`;
        if (inc.tech_email) sendEmail(inc.tech_email, `Recordatorio: ${inc.ticket_number}`, emailHtml)
          .catch(e => console.error('[Cron] Email error:', e.message));
        if (inc.tech_phone) sendWhatsApp(inc.tech_phone, msg)
          .catch(e => console.error('[Cron] WhatsApp error:', e.message));
        sendPush(inc.assigned_to, { title: 'Recordatorio SLA', body: msg, url: `/incidencias/${inc.id}` })
          .catch(e => console.error('[Cron] Push error:', e.message));

        await db.query(`UPDATE incidents SET last_reminded_at=NOW() WHERE id=$1`, [inc.id]);
        console.log(`[Cron] SLA recordatorio: ${inc.ticket_number} → ${inc.technician_name}`);
      }

      /* ── Escalamiento automático ── */
      const { rows: settingRows } = await db.query(
        `SELECT value FROM settings WHERE key='escalation_hours'`
      );
      const escalationHours = parseFloat(settingRows[0]?.value || '4');

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
          await db.query(
            `UPDATE incidents SET escalated=TRUE, escalated_at=NOW(), updated_at=NOW() WHERE id=$1`,
            [inc.id]
          );
          const escMsg = `🔺 ESCALADA: ${inc.ticket_number} "${inc.title}" lleva más de ${escalationHours}h sin ser atendida`;
          for (const sup of supervisors) {
            const notif = await createNotification(sup.id, 'escalation', escMsg, inc.id);
            if (_io) {
              _io.to(`user:${sup.id}`).emit('notification:new', notif);
              _io.to(`user:${sup.id}`).emit('incident:escalated', { incident: inc, message: escMsg });
            }
            sendPush(sup.id, { title: 'Incidencia escalada', body: escMsg, url: `/incidencias/${inc.id}` })
              .catch(e => console.error('[Cron] Push escalation error:', e.message));
          }
          console.log(`[Cron] Escalada: ${inc.ticket_number}`);
        }
      }

      /* ── Notificaciones de mantenimientos próximos (1h antes) ── */
      const { rows: upcoming } = await db.query(`
        SELECT m.*, u.name as created_by_name
        FROM maintenances m
        JOIN users u ON u.id = m.created_by
        WHERE m.status = 'scheduled'
          AND m.notify_clients = TRUE
          AND m.notified_at IS NULL
          AND m.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
      `);
      for (const maint of upcoming) {
        const start = new Date(maint.scheduled_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });
        const dur   = maint.estimated_duration_min >= 60
          ? `${Math.round(maint.estimated_duration_min / 60)}h`
          : `${maint.estimated_duration_min}min`;
        const msg = `🔧 MANTENIMIENTO: "${maint.title}" iniciará ${start} (${dur})${maint.zone ? ` — ${maint.zone}` : ''}`;
        const { rows: staff } = await db.query(
          `SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1`
        );
        for (const s of staff) {
          const notif = await createNotification(s.id, 'maintenance', msg, null);
          if (_io) _io.to(`user:${s.id}`).emit('notification:new', notif);
          sendPush(s.id, { title: 'Mantenimiento próximo', body: msg }).catch(() => {});
        }
        await db.query(`UPDATE maintenances SET notified_at=NOW() WHERE id=$1`, [maint.id]);
        console.log(`[Cron] Mantenimiento notificado: ${maint.title}`);
      }

    } catch (err) {
      console.error('[Cron] Error en recordatorio periódico:', err.message);
    }
  });

  /* ─────────────────────────────────────────────────────────────────
   *  2. Resumen matutino — 8:30 lun–sáb (hora Ecuador = UTC-5 = 13:30 UTC)
   *     Notifica todas las incidencias abiertas que NO se resolvieron
   * ───────────────────────────────────────────────────────────────── */
  cron.schedule('30 13 * * 1-6', async () => {   // 13:30 UTC = 08:30 ECU
    try {
      const db = getDb();
      console.log('[Cron] Resumen matutino 8:30 — verificando incidencias pendientes...');

      // Incidencias abiertas/asignadas/en progreso de días anteriores
      const { rows: open } = await db.query(`
        SELECT i.*,
          u.name as technician_name, u.email as tech_email, u.phone as tech_phone,
          u2.name as created_name
        FROM incidents i
        LEFT JOIN users u  ON u.id  = i.assigned_to
        LEFT JOIN users u2 ON u2.id = i.created_by
        WHERE i.status IN ('open','assigned','in_progress')
          AND i.status NOT IN ('resolved','cancelled','closed')
          AND DATE(i.created_at AT TIME ZONE 'America/Guayaquil') < CURRENT_DATE AT TIME ZONE 'America/Guayaquil'
        ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
      `);

      if (open.length === 0) {
        console.log('[Cron] Resumen matutino: sin incidencias pendientes ✅');
        return;
      }

      console.log(`[Cron] Resumen matutino: ${open.length} incidencias pendientes`);

      // Notificar a cada técnico sus incidencias pendientes
      const byTech = {};
      for (const inc of open) {
        const key = inc.assigned_to || 'unassigned';
        if (!byTech[key]) byTech[key] = { tech: inc, items: [] };
        byTech[key].items.push(inc);
      }

      for (const { tech, items } of Object.values(byTech)) {
        if (!tech.assigned_to) continue; // sin asignar → notificar a admins abajo

        const listStr = items.map(i => `• ${i.ticket_number}: ${i.title}`).join('\n');
        const msg = `🌅 Buenos días ${tech.technician_name}. Tienes ${items.length} incidencia${items.length > 1 ? 's' : ''} pendiente${items.length > 1 ? 's' : ''}:\n${listStr}`;

        for (const inc of items) {
          const notif = await createNotification(tech.assigned_to, 'reminder', `📋 Pendiente: ${inc.ticket_number} "${inc.title}"`, inc.id);
          if (_io) _io.to(`user:${tech.assigned_to}`).emit('notification:new', notif);
        }

        const emailHtml = `
          <h2 style="color:#2563eb">🌅 Resumen matutino — ${items.length} incidencia${items.length > 1 ? 's' : ''} pendiente${items.length > 1 ? 's' : ''}</h2>
          <p>Buenos días, <strong>${tech.technician_name}</strong>.</p>
          <p>Las siguientes incidencias están pendientes de resolución:</p>
          <ul>${items.map(i => `<li><b>${esc(i.ticket_number)}</b>: ${esc(i.title)} — <span style="color:#f59e0b">${esc(i.priority)}</span></li>`).join('')}</ul>
          <p style="color:#64748b;font-size:13px;">Horario de atención: 8:30 – 18:00</p>`;

        if (tech.tech_email) sendEmail(tech.tech_email, `📋 ${items.length} incidencia${items.length > 1 ? 's' : ''} pendiente${items.length > 1 ? 's' : ''} — IncidenciasISP`, emailHtml)
          .catch(e => console.error('[Cron] Email matutino error:', e.message));
        if (tech.tech_phone) sendWhatsApp(tech.tech_phone, msg)
          .catch(e => console.error('[Cron] WhatsApp matutino error:', e.message));
        sendPush(tech.assigned_to, {
          title: `📋 ${items.length} incidencia${items.length > 1 ? 's' : ''} pendiente${items.length > 1 ? 's' : ''}`,
          body: `Tienes incidencias abiertas de días anteriores`,
          url: '/incidencias',
        }).catch(() => {});
      }

      // Notificar a admins/supervisores sobre las no asignadas
      const unassigned = open.filter(i => !i.assigned_to);
      if (unassigned.length > 0) {
        const { rows: admins } = await db.query(
          `SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1`
        );
        const uMsg = `⚠️ ${unassigned.length} incidencia${unassigned.length > 1 ? 's' : ''} sin asignar:\n` +
          unassigned.map(i => `• ${i.ticket_number}: ${i.title}`).join('\n');
        for (const a of admins) {
          for (const inc of unassigned) {
            const notif = await createNotification(a.id, 'reminder', `⚠️ Sin asignar: ${inc.ticket_number} "${inc.title}"`, inc.id);
            if (_io) _io.to(`user:${a.id}`).emit('notification:new', notif);
          }
          sendPush(a.id, { title: '⚠️ Incidencias sin asignar', body: uMsg, url: '/incidencias' }).catch(() => {});
        }
        console.log(`[Cron] Resumen matutino: ${unassigned.length} sin asignar notificadas a admins`);
      }

    } catch (err) {
      console.error('[Cron] Error en resumen matutino:', err.message);
    }
  });
}

module.exports = { startReminderJob, setIo };
