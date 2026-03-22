import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { toast } from 'react-hot-toast';
import {
  getMaintenances, createMaintenance, updateMaintenance,
  updateMaintenanceStatus, deleteMaintenance,
} from '../api/maintenance.api';

const STATUS_LABEL = {
  scheduled: 'Programado', in_progress: 'En curso',
  completed: 'Completado', cancelled: 'Cancelado',
};
const STATUS_COLOR = {
  scheduled: '#3b82f6', in_progress: '#f59e0b',
  completed: '#22c55e', cancelled: '#9ca3af',
};
const EMPTY = { title: '', description: '', zone: '', scheduled_at: '', estimated_duration_min: 60, notify_clients: true };

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || '#9ca3af';
  return (
    <span className="badge" style={{
      background: color + '22', color, border: `1px solid ${color}55`,
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function MaintenanceForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial || EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>{initial ? '✏️ Editar Mantenimiento' : '🔧 Nuevo Mantenimiento'}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>

            <div className="form-row">
              <label>Título *
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  required
                  placeholder="Ej: Mantenimiento fibra sector norte"
                />
              </label>
            </div>

            <div className="form-row">
              <label>Descripción
                <textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={3}
                  placeholder="Describe el alcance del mantenimiento..."
                />
              </label>
            </div>

            <div className="form-row">
              <label>Zona / Sector afectado
                <input
                  value={form.zone}
                  onChange={e => set('zone', e.target.value)}
                  placeholder="Ej: Sector Norte, Barrio Las Palmas, Nodo 03..."
                />
              </label>
            </div>

            <div className="form-row two-cols">
              <label>Fecha y hora *
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => set('scheduled_at', e.target.value)}
                  required
                />
              </label>
              <label>Duración estimada (min)
                <input
                  type="number"
                  min={1}
                  value={form.estimated_duration_min}
                  onChange={e => set('estimated_duration_min', parseInt(e.target.value))}
                />
              </label>
            </div>

            <div className="form-row">
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={form.notify_clients}
                  onChange={e => set('notify_clients', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
                />
                Notificar automáticamente 1 hora antes
              </label>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span>ℹ️</span>
              <span>Los clientes afectados recibirán una notificación automática si la opción está activa.</span>
            </div>

          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : (initial ? 'Guardar cambios' : 'Crear mantenimiento')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const { data: maintenances = [], isLoading } = useQuery({
    queryKey: ['maintenances', filterStatus],
    queryFn: () => getMaintenances(filterStatus ? { status: filterStatus } : {}),
    refetchInterval: 60000,
  });

  const createMut = useMutation({
    mutationFn: (data) => createMaintenance({ ...data, scheduled_at: new Date(data.scheduled_at).toISOString() }),
    onSuccess: () => { toast.success('Mantenimiento creado'); setShowForm(false); qc.invalidateQueries(['maintenances']); },
    onError: e => toast.error(e.response?.data?.error || 'Error al crear'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateMaintenance(id, { ...data, scheduled_at: new Date(data.scheduled_at).toISOString() }),
    onSuccess: () => { toast.success('Actualizado'); setEditing(null); qc.invalidateQueries(['maintenances']); },
    onError: e => toast.error(e.response?.data?.error || 'Error al actualizar'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updateMaintenanceStatus(id, status),
    onSuccess: () => { toast.success('Estado actualizado'); qc.invalidateQueries(['maintenances']); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteMaintenance(id),
    onSuccess: () => { toast.success('Mantenimiento eliminado'); qc.invalidateQueries(['maintenances']); },
    onError: e => toast.error(e.response?.data?.error || 'Error al eliminar'),
  });

  const upcoming = maintenances.filter(m => m.status === 'scheduled' && new Date(m.scheduled_at) > new Date());
  const past     = maintenances.filter(m => m.status !== 'scheduled' || new Date(m.scheduled_at) <= new Date());
  const toFormDate = (iso) => iso ? iso.slice(0, 16) : '';
  const isAdmin = ['admin', 'supervisor'].includes(user?.role);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mantenimientos Programados" />
        <div className="page-body">

          <div className="page-toolbar">
            <div className="filters">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="scheduled">Programados</option>
                <option value="in_progress">En curso</option>
                <option value="completed">Completados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nuevo mantenimiento</button>
            )}
          </div>

          {isLoading ? (
            <div className="loading-center">Cargando...</div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📅 Próximos ({upcoming.length})
                  </h3>
                  <div className="table-wrap">
                    <table className="incidents-table">
                      <thead>
                        <tr>
                          <th>Título</th>
                          <th>Estado</th>
                          <th>Fecha programada</th>
                          <th>Duración</th>
                          <th>Zona</th>
                          <th>Creado por</th>
                          {isAdmin && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map(m => (
                          <MaintenanceRow key={m.id} m={m} user={user} statusMut={statusMut} deleteMut={deleteMut} setEditing={setEditing} toFormDate={toFormDate} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {past.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📋 Historial ({past.length})
                  </h3>
                  <div className="table-wrap">
                    <table className="incidents-table">
                      <thead>
                        <tr>
                          <th>Título</th>
                          <th>Estado</th>
                          <th>Fecha programada</th>
                          <th>Duración</th>
                          <th>Zona</th>
                          <th>Creado por</th>
                          {isAdmin && <th>Acciones</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {past.map(m => (
                          <MaintenanceRow key={m.id} m={m} user={user} statusMut={statusMut} deleteMut={deleteMut} setEditing={setEditing} toFormDate={toFormDate} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {maintenances.length === 0 && (
                <div className="table-wrap">
                  <table className="incidents-table">
                    <tbody>
                      <tr><td className="table-empty" colSpan={7}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
                        <p style={{ fontWeight: 600 }}>No hay mantenimientos registrados</p>
                        {isAdmin && <p style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "+ Nuevo mantenimiento" para crear uno</p>}
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <BottomNav />

      {showForm && (
        <MaintenanceForm
          onSubmit={data => createMut.mutate(data)}
          onCancel={() => setShowForm(false)}
          loading={createMut.isPending}
        />
      )}
      {editing && (
        <MaintenanceForm
          initial={{ ...editing, scheduled_at: toFormDate(editing.scheduled_at) }}
          onSubmit={data => updateMut.mutate({ id: editing.id, data })}
          onCancel={() => setEditing(null)}
          loading={updateMut.isPending}
        />
      )}
    </div>
  );
}

function MaintenanceRow({ m, user, statusMut, deleteMut, setEditing, toFormDate }) {
  const start   = new Date(m.scheduled_at);
  const end     = new Date(start.getTime() + m.estimated_duration_min * 60000);
  const isAdmin = ['admin', 'supervisor'].includes(user?.role);
  const isPast  = start < new Date();
  const dur     = m.estimated_duration_min >= 60
    ? `${Math.round(m.estimated_duration_min / 60)}h`
    : `${m.estimated_duration_min}min`;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{m.title}</div>
        {m.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</div>}
        {m.notify_clients && <span style={{ fontSize: 11, color: '#6366f1' }}>🔔 Notif. activa</span>}
        {m.notified_at && <span style={{ fontSize: 11, color: 'var(--success)', marginLeft: 6 }}>✅ Notificado</span>}
      </td>
      <td><StatusBadge status={m.status} /></td>
      <td style={{ fontSize: 12 }}>
        <div>{start.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        <div style={{ color: 'var(--text-muted)' }}>→ fin ~{end.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' })}</div>
      </td>
      <td style={{ fontSize: 12 }}>⏱ {dur}</td>
      <td style={{ fontSize: 12 }}>{m.zone || <span className="unassigned">—</span>}</td>
      <td style={{ fontSize: 12 }}>{m.created_by_name}</td>
      {isAdmin && (
        <td>
          <div className="actions-cell">
            {m.status === 'scheduled' && !isPast && (
              <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                onClick={() => statusMut.mutate({ id: m.id, status: 'in_progress' })}>
                ▶ Iniciar
              </button>
            )}
            {m.status === 'in_progress' && (
              <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
                onClick={() => statusMut.mutate({ id: m.id, status: 'completed' })}>
                ✅ Completar
              </button>
            )}
            {['scheduled', 'in_progress'].includes(m.status) && (
              <>
                <button className="btn btn-sm btn-secondary"
                  onClick={() => setEditing({ ...m, scheduled_at: toFormDate(m.scheduled_at) })}>
                  ✏️
                </button>
                <button className="btn btn-sm btn-danger"
                  onClick={() => { if (window.confirm('¿Cancelar este mantenimiento?')) statusMut.mutate({ id: m.id, status: 'cancelled' }); }}>
                  ✕
                </button>
              </>
            )}
            {user?.role === 'admin' && ['completed', 'cancelled'].includes(m.status) && (
              <button className="btn btn-sm btn-danger"
                onClick={() => { if (window.confirm('¿Eliminar este mantenimiento?')) deleteMut.mutate(m.id); }}>
                🗑
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
