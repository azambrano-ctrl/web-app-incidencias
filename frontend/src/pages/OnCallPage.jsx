import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getUsers } from '../api/users.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { toast } from 'react-hot-toast';
import { getOncallSchedules, getCurrentOncall, createOncall, deleteOncall } from '../api/oncall.api';

function daysDiff(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

export default function OnCallPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ user_id: '', start_date: '', end_date: '', notes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: schedules = [] } = useQuery({ queryKey: ['oncall'], queryFn: getOncallSchedules });
  const { data: current } = useQuery({ queryKey: ['oncall-current'], queryFn: getCurrentOncall, refetchInterval: 60000 });
  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => getUsers('technician'),
    enabled: ['admin', 'supervisor'].includes(user?.role),
  });

  const createMut = useMutation({
    mutationFn: createOncall,
    onSuccess: () => {
      toast.success('Turno de guardia asignado');
      setShowForm(false);
      setForm({ user_id: '', start_date: '', end_date: '', notes: '' });
      qc.invalidateQueries(['oncall']);
      qc.invalidateQueries(['oncall-current']);
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al crear turno'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteOncall,
    onSuccess: () => {
      toast.success('Turno eliminado');
      qc.invalidateQueries(['oncall']);
      qc.invalidateQueries(['oncall-current']);
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al eliminar'),
  });

  const isAdmin = ['admin', 'supervisor'].includes(user?.role);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = schedules.filter(s => s.end_date >= today);
  const past     = schedules.filter(s => s.end_date < today);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Guardias (On-Call)" />
        <div className="page-body">

          {/* Técnico de guardia HOY */}
          <div className="card" style={{ borderLeft: `4px solid ${current ? '#3b82f6' : 'var(--border)'}`, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 36 }}>{current ? '🛡️' : '😴'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                  {current ? `Técnico de guardia hoy: ${current.user_name}` : 'Sin técnico de guardia hoy'}
                </div>
                {current ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {current.user_email}
                    {current.user_phone ? ` · 📞 ${current.user_phone}` : ''}
                    {' · Turno: '}
                    {new Date(current.start_date + 'T12:00:00').toLocaleDateString('es-EC')}
                    {' — '}
                    {new Date(current.end_date + 'T12:00:00').toLocaleDateString('es-EC')}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Los tickets fuera de horario (antes 8am, después 6pm, fines de semana) no tendrán técnico auto-asignado
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="page-toolbar" style={{ marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Horario de guardias</span>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Asignar guardia</button>
            )}
          </div>

          {/* Próximos y activos */}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                Próximos y activos ({upcoming.length})
              </h3>
              <div className="table-wrap">
                <table className="incidents-table">
                  <thead>
                    <tr>
                      <th>Técnico</th>
                      <th>Estado</th>
                      <th>Desde</th>
                      <th>Hasta</th>
                      <th>Días</th>
                      <th>Notas</th>
                      {isAdmin && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map(s => (
                      <ScheduleRow key={s.id} s={s} today={today} user={user} deleteMut={deleteMut} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historial */}
          {past.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                Historial ({past.length})
              </h3>
              <div className="table-wrap">
                <table className="incidents-table">
                  <thead>
                    <tr>
                      <th>Técnico</th>
                      <th>Estado</th>
                      <th>Desde</th>
                      <th>Hasta</th>
                      <th>Días</th>
                      <th>Notas</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {past.map(s => (
                      <ScheduleRow key={s.id} s={s} today={today} user={user} deleteMut={deleteMut} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {schedules.length === 0 && (
            <div className="table-wrap">
              <table className="incidents-table">
                <tbody>
                  <tr><td className="table-empty" colSpan={7}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
                    <p style={{ fontWeight: 600 }}>No hay turnos de guardia registrados</p>
                    {isAdmin && <p style={{ fontSize: 12, marginTop: 4 }}>Asigna técnicos para atender tickets fuera de horario laboral</p>}
                  </td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <BottomNav />

      {/* Modal nueva guardia */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Asignar turno de guardia</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(form); }}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                <div className="form-row">
                  <label>Técnico *
                    <select value={form.user_id} onChange={e => set('user_id', e.target.value)} required>
                      <option value="">Seleccionar técnico...</option>
                      {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                </div>

                <div className="form-row two-cols">
                  <label>Desde *
                    <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required min={today} />
                  </label>
                  <label>Hasta *
                    <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} required min={form.start_date || today} />
                  </label>
                </div>

                {form.start_date && form.end_date && form.end_date >= form.start_date && (
                  <div className="form-row">
                    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#4338ca', display: 'flex', gap: 8 }}>
                      <span>📅</span>
                      <span>Turno de <strong>{daysDiff(form.start_date, form.end_date)} día(s)</strong> — incluye fines de semana y festivos</span>
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <label>Notas (opcional)
                    <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ej: Guardia de semana santa..." />
                  </label>
                </div>

                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span>⚡</span>
                  <span>Los tickets creados fuera de horario (antes 8am, después 6pm, o fines de semana) se asignarán automáticamente a este técnico.</span>
                </div>

              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Guardando...' : 'Asignar guardia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ s, today, user, deleteMut }) {
  const isActive  = s.start_date <= today && s.end_date >= today;
  const isFuture  = s.start_date > today;
  const isAdmin   = ['admin', 'supervisor'].includes(user?.role);
  const days = daysDiff(s.start_date, s.end_date);

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{s.user_name}</div>
        {s.user_email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.user_email}</div>}
      </td>
      <td>
        {isActive && <span className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>HOY</span>}
        {isFuture && <span className="badge" style={{ background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }}>PRÓXIMO</span>}
        {!isActive && !isFuture && <span className="badge badge-gray">Pasado</span>}
      </td>
      <td style={{ fontSize: 13 }}>{new Date(s.start_date + 'T12:00:00').toLocaleDateString('es-EC')}</td>
      <td style={{ fontSize: 13 }}>{new Date(s.end_date + 'T12:00:00').toLocaleDateString('es-EC')}</td>
      <td style={{ fontSize: 13 }}>{days} día{days !== 1 ? 's' : ''}</td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: s.notes ? 'normal' : 'italic' }}>
        {s.notes || '—'}
      </td>
      {isAdmin && (
        <td>
          {(isFuture || isActive) && (
            <button className="btn btn-sm btn-danger"
              onClick={() => { if (window.confirm('¿Eliminar este turno de guardia?')) deleteMut.mutate(s.id); }}>
              🗑
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
