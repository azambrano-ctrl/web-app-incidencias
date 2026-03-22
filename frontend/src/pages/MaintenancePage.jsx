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

function Badge({ status }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
      background: STATUS_COLOR[status] + '22', color: STATUS_COLOR[status],
      border: `1px solid ${STATUS_COLOR[status]}` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function MaintenanceForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial || EMPTY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => { e.preventDefault(); onSubmit(form); };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>{initial ? 'Editar Mantenimiento' : 'Nuevo Mantenimiento'}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>Título *
            <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Ej: Mantenimiento fibra sector norte" />
          </label>
          <label>Descripción
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Describe el alcance del mantenimiento..." />
          </label>
          <label>Zona / Sector afectado
            <input value={form.zone} onChange={e => set('zone', e.target.value)} placeholder="Ej: Sector Norte, Barrio Las Palmas, Nodo 03..." />
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}>Fecha y hora *
              <input type="datetime-local" value={form.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} required />
            </label>
            <label style={{ flex: 1 }}>Duración estimada (min)
              <input type="number" min={1} value={form.estimated_duration_min}
                onChange={e => set('estimated_duration_min', parseInt(e.target.value))} />
            </label>
          </div>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.notify_clients} onChange={e => set('notify_clients', e.target.checked)} />
            Notificar automáticamente 1 hora antes
          </label>
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

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mantenimientos Programados" />
        <div className="page-body">

          <div className="page-toolbar">
            <div className="filters">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="scheduled">Programados</option>
                <option value="in_progress">En curso</option>
                <option value="completed">Completados</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </div>
            {['admin', 'supervisor'].includes(user?.role) && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nuevo mantenimiento</button>
            )}
          </div>

          {isLoading ? <div className="loading-center">Cargando...</div> : (
            <>
              {/* Próximos */}
              {upcoming.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📅 Próximos ({upcoming.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {upcoming.map(m => <MaintenanceCard key={m.id} m={m} user={user} statusMut={statusMut} deleteMut={deleteMut} setEditing={setEditing} toFormDate={toFormDate} />)}
                  </div>
                </div>
              )}

              {/* Historial */}
              {past.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📋 Historial ({past.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {past.map(m => <MaintenanceCard key={m.id} m={m} user={user} statusMut={statusMut} deleteMut={deleteMut} setEditing={setEditing} toFormDate={toFormDate} />)}
                  </div>
                </div>
              )}

              {maintenances.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
                  <p style={{ fontWeight: 600 }}>No hay mantenimientos registrados</p>
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

function MaintenanceCard({ m, user, statusMut, deleteMut, setEditing, toFormDate }) {
  const start    = new Date(m.scheduled_at);
  const end      = new Date(start.getTime() + m.estimated_duration_min * 60000);
  const isAdmin  = ['admin', 'supervisor'].includes(user?.role);
  const isPast   = start < new Date();

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
      borderLeft: `4px solid ${STATUS_COLOR[m.status]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</span>
            <Badge status={m.status} />
            {m.notify_clients && <span style={{ fontSize: 11, color: '#6366f1' }}>🔔 Notificación activa</span>}
          </div>
          {m.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{m.description}</p>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>📅 {start.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</span>
            <span>⏱ {m.estimated_duration_min >= 60 ? `${Math.round(m.estimated_duration_min / 60)}h` : `${m.estimated_duration_min}min`}</span>
            <span>🔚 Fin aprox: {end.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' })}</span>
            {m.zone && <span>📍 {m.zone}</span>}
            <span>👤 {m.created_by_name}</span>
          </div>
          {m.notified_at && <p style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>✅ Notificado el {new Date(m.notified_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}</p>}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
                <button className="btn btn-sm btn-secondary" onClick={() => setEditing({ ...m, scheduled_at: toFormDate(m.scheduled_at) })}>
                  ✏️
                </button>
                <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                  onClick={() => {
                    if (window.confirm('¿Cancelar este mantenimiento?'))
                      statusMut.mutate({ id: m.id, status: 'cancelled' });
                  }}>
                  ✕
                </button>
              </>
            )}
            {user?.role === 'admin' && ['completed', 'cancelled'].includes(m.status) && (
              <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                onClick={() => { if (window.confirm('¿Eliminar este mantenimiento?')) deleteMut.mutate(m.id); }}>
                🗑
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
