const { getDb } = require('../../config/database');
const { createNotification } = require('../notifications/notifications.service');
const { sendEmail } = require('../../services/email.service');
const { sendWhatsApp } = require('../../services/whatsapp.service');
const { sendPush } = require('../../services/push.service');
const { createExternalIncident } = require('../../services/external.service');
const { geocodeAddress } = require('../../services/geocoding.service');

const SLA_HOURS = { critical: 2, high: 4, medium: 8, low: 24 };

let _io = null;
function setIo(io) { _io = io; }
function emit(event, room, data) { if (_io) _io.to(room).emit(event, data); }

async function generateTicket() {
  const db = getDb();
  const year = new Date().getFullYear();
  const { rows } = await db.query(`SELECT COUNT(*) as c FROM incidents WHERE ticket_number LIKE $1`, [`INC-${year}-%`]);
  const num = String(parseInt(rows[0].c) + 1).padStart(5, '0');
  return `INC-${year}-${num}`;
}

async function getIncident(id) {
  const db = getDb();
  const { rows } = await db.query(`
    SELECT i.*,
      u1.name as assigned_name, u1.email as assigned_email, u1.phone as assigned_phone,
      u2.name as created_name,
      parent.ticket_number as parent_ticket, parent.title as parent_title,
      (SELECT COUNT(*) FROM incidents ch WHERE ch.parent_id = i.id) as children_count
    FROM incidents i
    LEFT JOIN users u1 ON u1.id = i.assigned_to
    LEFT JOIN users u2 ON u2.id = i.created_by
    LEFT JOIN incidents parent ON parent.id = i.parent_id
    WHERE i.id = $1
  `, [id]);
  const inc = rows[0];
  if (!inc) throw Object.assign(new Error('Incidencia no encontrada'), { status: 404 });

  const { rows: history } = await db.query(`
    SELECT h.*, u.name as user_name FROM status_history h
    JOIN users u ON u.id = h.changed_by
    WHERE h.incident_id=$1 ORDER BY h.created_at ASC
  `, [id]);

  const { rows: comments } = await db.query(`
    SELECT c.*, u.name as user_name, u.role as user_role FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.incident_id=$1 ORDER BY c.created_at ASC
  `, [id]);

  // Load children if this is a parent
  const { rows: children } = await db.query(`
    SELECT id, ticket_number, title, status, priority FROM incidents
    WHERE parent_id=$1 ORDER BY created_at ASC
  `, [id]);

  return { ...inc, history, comments, children };
}

async function listIncidents(filters, userId, userRole) {
  const db = getDb();
  const { status, priority, type, assigned_to, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  let idx = 1;

  if (userRole === 'technician') { where.push(`i.assigned_to=$${idx++}`); params.push(userId); }
  if (status)      { where.push(`i.status=$${idx++}`);      params.push(status); }
  if (priority)    { where.push(`i.priority=$${idx++}`);    params.push(priority); }
  if (type)        { where.push(`i.type=$${idx++}`);        params.push(type); }
  if (assigned_to) { where.push(`i.assigned_to=$${idx++}`); params.push(assigned_to); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const { rows: [{ c: total }] } = await db.query(
    `SELECT COUNT(*) as c FROM incidents i ${whereClause}`, params
  );

  const { rows } = await db.query(`
    SELECT i.*,
      u1.name as assigned_name, u1.email as assigned_email,
      u2.name as created_name,
      (SELECT COUNT(*) FROM incidents ch WHERE ch.parent_id = i.id) as children_count
    FROM incidents i
    LEFT JOIN users u1 ON u1.id = i.assigned_to
    LEFT JOIN users u2 ON u2.id = i.created_by
    ${whereClause}
    ORDER BY
      CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      i.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `, [...params, Number(limit), offset]);

  return { data: rows, total: parseInt(total), page: Number(page), limit: Number(limit) };
}

async function createIncident(data, createdBy) {
  const db = getDb();
  const ticket = await generateTicket();
  const { title, description, type, priority = 'medium', client_name, client_address, client_phone, client_phone2, client_identificacion, assigned_to } = data;

  const slaHours = SLA_HOURS[priority] || 8;
  const dueAt = data.due_at || new Date(Date.now() + slaHours * 3600000).toISOString();

  const initialStatus = assigned_to ? 'assigned' : 'open';

  const { rows } = await db.query(`
    INSERT INTO incidents (ticket_number, title, description, type, priority, status, client_name, client_address, client_phone, client_phone2, client_identificacion, assigned_to, created_by, due_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id
  `, [ticket, title, description, type, priority, initialStatus, client_name, client_address, client_phone || null, client_phone2 || null, client_identificacion || null, assigned_to || null, createdBy, dueAt]);

  const inc = await getIncident(rows[0].id);

  // Geocodificar dirección en segundo plano
  geocodeAddress(client_address).then(coords => {
    if (coords) {
      db.query(`UPDATE incidents SET latitude=$1, longitude=$2 WHERE id=$3`, [coords.lat, coords.lng, inc.id])
        .catch(e => console.error('[Geocode] Error guardando coordenadas:', e.message));
    }
  }).catch(() => {});

  const { rows: admins } = await db.query(`SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1`);
  for (const admin of admins) {
    const notif = await createNotification(admin.id, 'created', `Nueva incidencia ${ticket}: ${title}`, inc.id);
    emit('notification:new', `user:${admin.id}`, notif);
  }
  emit('incident:created', 'role:admin', inc);
  emit('incident:created', 'role:supervisor', inc);

  // Enviar al sistema externo (no bloquea si falla)
  createExternalIncident(inc).catch(e => console.error('[ExtAPI] Error al crear:', e.message));

  return inc;
}

async function assignIncident(id, technicianId, assignedBy) {
  const db = getDb();
  const inc = await getIncident(id);
  const { rows } = await db.query('SELECT id, name FROM users WHERE id=$1 AND role=$2 AND active=1', [technicianId, 'technician']);
  const tech = rows[0];
  if (!tech) throw Object.assign(new Error('Técnico no válido'), { status: 400 });

  const oldStatus = inc.status;
  const newStatus = 'assigned';
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE incidents SET assigned_to=$1, status=$2, updated_at=NOW() WHERE id=$3`, [technicianId, newStatus, id]);
    await client.query(`INSERT INTO status_history (incident_id, changed_by, old_status, new_status, comment) VALUES ($1,$2,$3,$4,$5)`,
      [id, assignedBy, oldStatus, newStatus, `Asignada a ${tech.name}`]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }

  const updated = await getIncident(id);

  const msg = `Se te asignó la incidencia ${updated.ticket_number}: ${updated.title}`;
  const notif = await createNotification(technicianId, 'assigned', msg, id);
  emit('notification:new', `user:${technicianId}`, notif);
  emit('incident:assigned', `user:${technicianId}`, { incident: updated, message: msg });
  emit('incident:assigned', 'role:supervisor', { incident: updated });
  emit('incident:assigned', 'role:admin', { incident: updated });
  emit('incident:status_changed', `incident:${id}`, { incident: updated, oldStatus, newStatus });

  const { rows: techRows } = await db.query('SELECT email, phone FROM users WHERE id=$1', [technicianId]);
  const techUser = techRows[0];
  const emailHtml = `
    <h2 style="color:#2563eb">Nueva incidencia asignada</h2>
    <p><b>Ticket:</b> ${updated.ticket_number}</p>
    <p><b>Título:</b> ${updated.title}</p>
    <p><b>Cliente:</b> ${updated.client_name}</p>
    <p><b>Dirección:</b> ${updated.client_address}</p>
    <p><b>Prioridad:</b> ${updated.priority}</p>
    <p><b>Descripción:</b> ${updated.description}</p>`;
  const waMsg = `📋 *Nueva incidencia asignada*\n🎫 ${updated.ticket_number}\n📌 ${updated.title}\n👤 ${updated.client_name}\n📍 ${updated.client_address}\n⚡ Prioridad: ${updated.priority}`;
  if (techUser?.email) sendEmail(techUser.email, `Nueva incidencia: ${updated.ticket_number}`, emailHtml).catch(e => console.error('[Email]', e.message));
  if (techUser?.phone) sendWhatsApp(techUser.phone, waMsg).catch(e => console.error('[WhatsApp]', e.message));
  sendPush(technicianId, { title: 'Nueva incidencia asignada', body: `${updated.ticket_number}: ${updated.title}`, url: `/incidencias/${id}` }).catch(() => {});

  return updated;
}

async function changeStatus(id, newStatus, comment, changedBy, userRole, solution, signature) {
  const db = getDb();
  const inc = await getIncident(id);

  if (userRole === 'technician' && inc.assigned_to !== changedBy) {
    throw Object.assign(new Error('Solo puede cambiar el estado de sus propias incidencias'), { status: 403 });
  }
  if (newStatus === 'resolved' && !solution?.trim()) {
    throw Object.assign(new Error('Debe ingresar la solución aplicada para resolver la incidencia'), { status: 400 });
  }

  // Block resolving if checklist has unchecked items
  if (newStatus === 'resolved') {
    const { rows: clRows } = await db.query(
      `SELECT items FROM incident_checklists WHERE incident_id=$1`, [id]
    );
    if (clRows[0]) {
      const items = clRows[0].items;
      const unchecked = items.filter(item => !item.checked);
      if (unchecked.length > 0) {
        throw Object.assign(
          new Error('Debes completar el checklist antes de resolver'),
          { status: 400 }
        );
      }
    }
  }

  const oldStatus = inc.status;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (newStatus === 'resolved') {
      await client.query(`UPDATE incidents SET status=$1, updated_at=NOW(), resolved_at=NOW(), solution=$2, client_signature=$3 WHERE id=$4`, [newStatus, solution.trim(), signature || null, id]);
    } else {
      await client.query(`UPDATE incidents SET status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, id]);
    }
    await client.query(`INSERT INTO status_history (incident_id, changed_by, old_status, new_status, comment) VALUES ($1,$2,$3,$4,$5)`,
      [id, changedBy, oldStatus, newStatus, comment || null]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }

  // Auto-close children when parent is resolved
  if (newStatus === 'resolved') {
    const { rows: children } = await db.query(
      `SELECT id FROM incidents WHERE parent_id=$1 AND status NOT IN ('resolved','closed','cancelled')`, [id]
    );
    for (const child of children) {
      await db.query(`UPDATE incidents SET status='resolved', updated_at=NOW(), resolved_at=NOW(), solution=$1 WHERE id=$2`,
        [`Auto-cerrada: incidencia padre ${inc.ticket_number} fue resuelta`, child.id]);
      await db.query(`INSERT INTO status_history (incident_id, changed_by, old_status, new_status, comment) VALUES ($1,$2,$3,$4,$5)`,
        [child.id, changedBy, 'in_progress', 'resolved', `Auto-cerrada al resolver incidencia padre ${inc.ticket_number}`]);
    }
  }

  const updated = await getIncident(id);
  const { rows: [changer] } = await db.query('SELECT name FROM users WHERE id=$1', [changedBy]);
  const msg = `Incidencia ${updated.ticket_number} cambió de "${oldStatus}" a "${newStatus}" por ${changer.name}`;

  if (updated.assigned_to && updated.assigned_to !== changedBy) {
    const n = await createNotification(updated.assigned_to, 'status_change', msg, id);
    emit('notification:new', `user:${updated.assigned_to}`, n);
    sendPush(updated.assigned_to, { title: 'Incidencia actualizada', body: msg, url: `/incidencias/${id}` }).catch(() => {});
  }

  const { rows: admins } = await db.query(`SELECT id FROM users WHERE role IN ('admin','supervisor') AND active=1 AND id!=$1`, [changedBy]);
  for (const a of admins) {
    const n = await createNotification(a.id, 'status_change', msg, id);
    emit('notification:new', `user:${a.id}`, n);
  }

  emit('incident:status_changed', `incident:${id}`, { incident: updated, oldStatus, newStatus, changedBy });
  emit('incident:status_changed', 'role:supervisor', { incident: updated, oldStatus, newStatus });
  emit('incident:status_changed', 'role:admin', { incident: updated, oldStatus, newStatus });

  return updated;
}

async function updateIncident(id, data) {
  const db = getDb();
  await getIncident(id);
  const { title, description, type, priority, client_name, client_address, client_phone, client_phone2, client_identificacion, assigned_to } = data;
  await db.query(`
    UPDATE incidents SET title=$1, description=$2, type=$3, priority=$4,
      client_name=$5, client_address=$6, client_phone=$7, client_phone2=$8, client_identificacion=$9, assigned_to=$10, updated_at=NOW()
    WHERE id=$11
  `, [title, description, type, priority, client_name, client_address, client_phone || null, client_phone2 || null, client_identificacion || null, assigned_to || null, id]);
  return getIncident(id);
}

async function addComment(incidentId, userId, body) {
  const db = getDb();
  await getIncident(incidentId);
  const { rows } = await db.query('INSERT INTO comments (incident_id, user_id, body) VALUES ($1,$2,$3) RETURNING id', [incidentId, userId, body]);
  const { rows: [comment] } = await db.query(`
    SELECT c.*, u.name as user_name, u.role as user_role FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id=$1
  `, [rows[0].id]);
  emit('incident:comment', `incident:${incidentId}`, { comment });
  return comment;
}

async function linkIncident(id, parentId) {
  const db = getDb();
  if (parseInt(id) === parseInt(parentId)) {
    throw Object.assign(new Error('Una incidencia no puede ser su propio padre'), { status: 400 });
  }
  // Verify parent exists
  const { rows: parentRows } = await db.query(`SELECT id FROM incidents WHERE id=$1`, [parentId]);
  if (!parentRows[0]) throw Object.assign(new Error('Incidencia padre no encontrada'), { status: 404 });

  // Prevent circular references: the target parent must not be a child of this incident
  const { rows: childCheck } = await db.query(`SELECT id FROM incidents WHERE id=$1 AND parent_id=$2`, [parentId, id]);
  if (childCheck[0]) throw Object.assign(new Error('Referencia circular: la incidencia padre es ya hijo de esta'), { status: 400 });

  await db.query(`UPDATE incidents SET parent_id=$1, updated_at=NOW() WHERE id=$2`, [parentId, id]);
  return getIncident(id);
}

async function unlinkIncident(id) {
  const db = getDb();
  await db.query(`UPDATE incidents SET parent_id=NULL, updated_at=NOW() WHERE id=$1`, [id]);
  return getIncident(id);
}

async function getPhotos(incidentId) {
  const db = getDb();
  const { rows } = await db.query(`
    SELECT ip.id, ip.filename, ip.mime_type, ip.created_at, u.name as uploaded_by_name, ip.uploaded_by
    FROM incident_photos ip
    JOIN users u ON u.id = ip.uploaded_by
    WHERE ip.incident_id=$1 ORDER BY ip.created_at ASC
  `, [incidentId]);
  return rows;
}

async function getPhoto(incidentId, photoId) {
  const db = getDb();
  const { rows } = await db.query(`SELECT * FROM incident_photos WHERE id=$1 AND incident_id=$2`, [photoId, incidentId]);
  if (!rows[0]) throw Object.assign(new Error('Foto no encontrada'), { status: 404 });
  return rows[0];
}

async function uploadPhoto(incidentId, uploadedBy, data, filename, mimeType) {
  const db = getDb();
  // Check max 5 photos per incident
  const { rows: countRows } = await db.query(`SELECT COUNT(*) as c FROM incident_photos WHERE incident_id=$1`, [incidentId]);
  if (parseInt(countRows[0].c) >= 5) {
    throw Object.assign(new Error('Máximo 5 fotos por incidencia'), { status: 400 });
  }
  const { rows } = await db.query(
    `INSERT INTO incident_photos (incident_id, uploaded_by, data, filename, mime_type) VALUES ($1,$2,$3,$4,$5) RETURNING id, filename, mime_type, created_at`,
    [incidentId, uploadedBy, data, filename, mimeType]
  );
  return rows[0];
}

async function deletePhoto(incidentId, photoId, userId, userRole) {
  const db = getDb();
  const { rows } = await db.query(`SELECT * FROM incident_photos WHERE id=$1 AND incident_id=$2`, [photoId, incidentId]);
  if (!rows[0]) throw Object.assign(new Error('Foto no encontrada'), { status: 404 });

  // Only admin/supervisor or uploader can delete
  if (!['admin', 'supervisor'].includes(userRole) && rows[0].uploaded_by !== userId) {
    throw Object.assign(new Error('No tiene permiso para eliminar esta foto'), { status: 403 });
  }

  await db.query(`DELETE FROM incident_photos WHERE id=$1`, [photoId]);
  return { message: 'Foto eliminada' };
}

async function getSummary() {
  const db = getDb();
  const { rows: byStatus } = await db.query(`SELECT status, COUNT(*) as count FROM incidents GROUP BY status`);
  const { rows: byPriority } = await db.query(`SELECT priority, COUNT(*) as count FROM incidents GROUP BY priority`);
  const { rows: techLoad } = await db.query(`
    SELECT u.id, u.name, COUNT(i.id) as open_count
    FROM users u
    LEFT JOIN incidents i ON i.assigned_to=u.id AND i.status NOT IN ('resolved','closed','cancelled')
    WHERE u.role='technician' AND u.active=1
    GROUP BY u.id, u.name ORDER BY open_count DESC
  `);
  const { rows: avgResolution } = await db.query(`
    SELECT type,
      ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)::numeric, 1) as avg_hours
    FROM incidents WHERE status='resolved' AND resolved_at IS NOT NULL
    GROUP BY type
  `);
  return { byStatus, byPriority, techLoad, avgResolution };
}

async function getMapIncidents(userId, userRole) {
  const db = getDb();
  const params = [];
  let where = `WHERE i.latitude IS NOT NULL AND i.status NOT IN ('cancelled','resolved','closed')`;
  if (userRole === 'technician') {
    where += ` AND i.assigned_to=$1`;
    params.push(userId);
  }
  const { rows } = await db.query(`
    SELECT i.id, i.ticket_number, i.title, i.status, i.priority, i.type,
      i.client_name, i.client_address, i.latitude, i.longitude, i.due_at,
      u.name as assigned_name
    FROM incidents i
    LEFT JOIN users u ON u.id = i.assigned_to
    ${where}
    ORDER BY CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
  `, params);
  return rows;
}

module.exports = {
  setIo, getIncident, listIncidents, createIncident, assignIncident, changeStatus,
  updateIncident, addComment, getSummary, getMapIncidents,
  linkIncident, unlinkIncident,
  getPhotos, getPhoto, uploadPhoto, deletePhoto,
};
