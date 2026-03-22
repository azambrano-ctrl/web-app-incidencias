import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getUsers } from '../api/users.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { toast } from 'react-hot-toast';
import { getOncallSchedules, getCurrentOncall, createOncall, deleteOncall } from '../api/oncall.api';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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
    onSuccess: () => { toast.success('Turno de guardia asignado'); setShowForm(false); setForm({ user_id: '', start_date: '', end_date: '', notes: '' }); qc.invalidateQueries(['oncall']); qc.invalidateQueries(['oncall-current']); },
    onError: e => toast.error(e.response?.data?.error || 'Error al crear turno'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteOncall,
    onSuccess: () => { toast.success('Turno eliminado'); qc.invalidateQueries(['oncall']); qc.invalidateQueries(['oncall-current']); },
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

          {/* Tarjeta técnico de guardia HOY */}
          <div style={{ background: current ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : '#f8fafc',
            border: `1px solid ${current ? '#93c5fd' : 'var(--border)'}`,
            borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 36 }}>{current ? '🛡️' : '😴'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                {current ? `Técnico de guardia hoy: ${current.user_name}` : 'Sin técnico de guardia hoy'}
              </div>
              {current ? (
                <div style={{ fontSize: 12, color: '#1e40af' }}>
                  {current.user_email} {current.user_phone ? `· 📞 ${current.user_phone}` : ''}
                  {' · '}Turno: {new Date(current.start_date + 'T12:00:00').toLocaleDateString('es-EC')} — {new Date(current.end_date + 'T12:00:00').toLocaleDateString('es-EC')}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Los tickets fuera de horario (antes 8am, después 6pm, fines de semana) no tendrán técnico auto-asignado
                </div>
              )}
            </div>
          </div>

          <div className="page-toolbar" style={{ marginBottom: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Horario de guardias</span>
            {isAdmin && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Asignar guardia</button>
            )}
          </div>

          {/* Próximos turnos */}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Próximos y activos ({upcoming.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map(s => <ScheduleCard key={s.id} s={s} today={today} user={user} deleteMut={deleteMut} />)}
              </div>
            </div>
          )}

          {/* Historial */}
          {past.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Historial ({past.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {past.map(s => <ScheduleCard key={s.id} s={s} today={today} user={user} deleteMut={deleteMut} />)}
              </div>
            </div>
          )}

          {schedules.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
              <p style={{ fontWeight: 600 }}>No hay turnos de guardia registrados</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Asigna técnicos para atender tickets fuera de horario laboral</p>
            </div>
          )}
        </div>
      </main>
      <BottomNav />

      {/* Modal nueva guardia */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>Asignar turno de guardia</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(form); }}
              style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label>Técnico *
                <select value={form.user_id} onChange={e => set('user_id', e.target.value)} required>
                  <option value="">Seleccionar técnico...</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1 }}>Desde *
                  <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required min={today} />
                </label>
                <label style={{ flex: 1 }}>Hasta *
                  <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} required min={form.start_date || today} />
                </label>
              </div>
              {form.start_date && form.end_date && form.end_date >= form.start_date && (
                <div style={{ fontSize: 12, color: '#6366f1', background: '#eef2ff', padding: '8px 12px', borderRadius: 8 }}>
                  📅 Turno de {daysDiff(form.start_date, form.end_date)} día(s) — incluye fines de semana y festivos
                </div>
              )}
              <label>Notas (opcional)
                <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Ej: Guardia de semana santa..." />
              </label>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                ⚡ Los tickets creados fuera de horario (antes 8am, después 6pm, o fines de semana) se asignarán automáticamente a este técnico
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

function ScheduleCard({ s, today, user, deleteMut }) {
  const isActive  = s.start_date <= today && s.end_date >= today;
  const isFuture  = s.start_date > today;
  const isAdmin   = ['admin', 'supervisor'].includes(user?.role);
  const days = daysDiff(s.start_date, s.end_date);

  return (
    <div style={{ background: '#fff', border: `1px solid ${isActive ? '#93c5fd' : 'var(--border)'}`,
      borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
      borderLeft: `4px solid ${isActive ? '#3b82f6' : isFuture ? '#a78bfa' : '#d1d5db'}` }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: isActive ? '#3b82f6' : isFuture ? '#a78bfa' : '#d1d5db',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
        {s.user_name?.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 700 }}>{s.user_name}</span>
          {isActive && <span style={{ fontSize: 10, fontWeight: 700, background: '#3b82f6', color: '#fff', padding: '1px 8px', borderRadius: 20 }}>HOY</span>}
          {isFuture && <span style={{ fontSize: 10, fontWeight: 700, background: '#a78bfa', color: '#fff', padding: '1px 8px', borderRadius: 20 }}>PRÓXIMO</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {new Date(s.start_date + 'T12:00:00').toLocaleDateString('es-EC')} — {new Date(s.end_date + 'T12:00:00').toLocaleDateString('es-EC')}
          <span style={{ marginLeft: 8 }}>({days} día{days !== 1 ? 's' : ''})</span>
          {s.user_email && <span style={{ marginLeft: 8 }}>· {s.user_email}</span>}
        </div>
        {s.notes && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 3 }}>📝 {s.notes}</div>}
      </div>
      {isAdmin && (isFuture || isActive) && (
        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
          onClick={() => { if (window.confirm('¿Eliminar este turno de guardia?')) deleteMut.mutate(s.id); }}>
          🗑
        </button>
      )}
    </div>
  );
}
