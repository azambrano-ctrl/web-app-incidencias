import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getIncidents, createIncident, assignIncident } from '../api/incidents.api';
import { getUsers } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import IncidentForm from '../components/incidents/IncidentForm';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import { SLABadge } from '../components/incidents/SLABadge';
import { TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS } from '../utils/constants';
import { toast } from 'react-hot-toast';

export default function IncidentsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ status: '', priority: '', type: '', page: 1, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [assignModal, setAssignModal] = useState(null);
  const [selectedTech, setSelectedTech] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filters],
    queryFn: () => getIncidents(filters),
  });

  const { data: technicians } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => getUsers('technician'),
    enabled: user?.role !== 'technician',
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = () => qc.invalidateQueries(['incidents']);
    socket.on('incident:created', refresh);
    socket.on('incident:status_changed', refresh);
    socket.on('incident:assigned', refresh);
    socket.on('incident:updated', refresh);
    socket.on('incident:escalated', refresh);
    return () => {
      socket.off('incident:created', refresh);
      socket.off('incident:status_changed', refresh);
      socket.off('incident:assigned', refresh);
      socket.off('incident:updated', refresh);
      socket.off('incident:escalated', refresh);
    };
  }, [socket]);

  const createMut = useMutation({
    mutationFn: createIncident,
    onSuccess: () => { toast.success('Incidencia creada'); setShowForm(false); qc.invalidateQueries(['incidents']); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al crear'),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, techId }) => assignIncident(id, techId),
    onSuccess: () => { toast.success('Técnico asignado'); setAssignModal(null); qc.invalidateQueries(['incidents']); },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al asignar'),
  });

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));
  const incidents = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / filters.limit);

  const isOverdue = (inc) => {
    if (['resolved', 'cancelled'].includes(inc.status)) return false;
    const last = new Date(inc.updated_at || inc.created_at);
    return (Date.now() - last.getTime()) > 24 * 60 * 60 * 1000;
  };
  const overdueCount = incidents.filter(isOverdue).length;
  const escalatedCount = incidents.filter(inc => inc.escalated).length;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Incidencias" />
        <div className="page-body">
          <div className="page-toolbar">
            <div className="filters">
              <select value={filters.status} onChange={e => setFilter('status', e.target.value)}>
                <option value="">Todos los estados</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
                <option value="">Todas las prioridades</option>
                <option value="critical">Crítica</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
              <select value={filters.type} onChange={e => setFilter('type', e.target.value)}>
                <option value="">Todos los servicios</option>
                <option value="internet">Internet</option>
                <option value="tv">TV Cable</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            {['admin', 'supervisor'].includes(user?.role) && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nueva Incidencia</button>
            )}
          </div>

          {overdueCount > 0 && (
            <div className="overdue-banner">
              <span className="overdue-banner-icon">⚠️</span>
              <span>
                <strong>{overdueCount} incidencia{overdueCount > 1 ? 's' : ''}</strong> lleva{overdueCount > 1 ? 'n' : ''} más de 24 horas sin actividad
              </span>
            </div>
          )}

          {escalatedCount > 0 && (
            <div className="overdue-banner" style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', borderColor: '#f59e0b', color: '#92400e' }}>
              <span className="overdue-banner-icon">🔺</span>
              <span>
                <strong>{escalatedCount} incidencia{escalatedCount > 1 ? 's' : ''}</strong> escalada{escalatedCount > 1 ? 's' : ''} — requiere{escalatedCount > 1 ? 'n' : ''} atención del supervisor
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="loading-center">Cargando...</div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="incidents-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Título</th>
                      <th>Servicio</th>
                      <th>Prioridad</th>
                      <th>Estado</th>
                      <th>SLA</th>
                      <th>Técnico</th>
                      <th>Cliente</th>
                      <th>Creada</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.length === 0 && (
                      <tr><td colSpan={10} className="table-empty">No hay incidencias</td></tr>
                    )}
                    {incidents.map(inc => (
                      <tr key={inc.id} onClick={() => navigate(`/incidencias/${inc.id}`)} className={`table-row-click${isOverdue(inc) ? ' row-overdue' : ''}`}>
                        <td>
                          <code className="ticket">{inc.ticket_number}</code>
                          {inc.escalated && <span className="escalated-tag" title="Escalada">🔺</span>}
                          {isOverdue(inc) && <span className="overdue-tag">⚠️ +24h</span>}
                          {parseInt(inc.children_count) > 0 && (
                            <span className="parent-tag" title={`${inc.children_count} sub-incidencias`}>🔗 {inc.children_count}</span>
                          )}
                          {inc.parent_id && <span className="child-tag" title="Sub-incidencia">↳</span>}
                        </td>
                        <td className="incident-title">{inc.title}</td>
                        <td>{TYPE_LABELS[inc.type]}</td>
                        <td><PriorityBadge priority={inc.priority} /></td>
                        <td><StatusBadge status={inc.status} /></td>
                        <td><SLABadge dueAt={inc.due_at} status={inc.status} /></td>
                        <td>{inc.assigned_name || <span className="unassigned">Sin asignar</span>}</td>
                        <td>{inc.client_name}</td>
                        <td>{new Date(inc.created_at).toLocaleDateString('es-HN')}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {['admin', 'supervisor'].includes(user?.role) && inc.status !== 'cancelled' && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => { setAssignModal(inc); setSelectedTech(inc.assigned_to || ''); }}
                            >
                              Asignar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="pagination">
                  <button disabled={filters.page === 1} onClick={() => setFilter('page', filters.page - 1)} className="btn btn-sm">◀ Anterior</button>
                  <span>Página {filters.page} de {totalPages} ({total} total)</span>
                  <button disabled={filters.page >= totalPages} onClick={() => setFilter('page', filters.page + 1)} className="btn btn-sm">Siguiente ▶</button>
                </div>
              )}
            </>
          )}
          {/* Tarjetas móvil */}
              <div className="incident-cards">
                {incidents.length === 0 && (
                  <p className="empty-msg">No hay incidencias</p>
                )}
                {incidents.map(inc => (
                  <div
                    key={inc.id}
                    className={`incident-card${isOverdue(inc) ? ' card-overdue' : ''}${inc.escalated ? ' card-escalated' : ''}`}
                    style={{ borderLeftColor: inc.escalated ? '#f59e0b' : isOverdue(inc) ? '#ef4444' : STATUS_COLORS[inc.status] }}
                    onClick={() => navigate(`/incidencias/${inc.id}`)}
                  >
                    {inc.escalated && (
                      <div className="overdue-card-banner" style={{ background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
                        🔺 Incidencia escalada — requiere atención
                      </div>
                    )}
                    {isOverdue(inc) && !inc.escalated && (
                      <div className="overdue-card-banner">⚠️ Sin actividad por más de 24 horas</div>
                    )}
                    <div className="incident-card-top">
                      <span className="incident-card-title">{inc.title}</span>
                      <StatusBadge status={inc.status} />
                    </div>
                    <div className="incident-card-meta">
                      <PriorityBadge priority={inc.priority} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TYPE_LABELS[inc.type]}</span>
                      <code className="ticket" style={{ fontSize: 11 }}>{inc.ticket_number}</code>
                      {parseInt(inc.children_count) > 0 && (
                        <span style={{ fontSize: 11, color: '#6366f1' }}>🔗 {inc.children_count} sub-inc.</span>
                      )}
                      {inc.parent_id && (
                        <span style={{ fontSize: 11, color: '#8b5cf6' }}>↳ sub-incidencia</span>
                      )}
                    </div>
                    {inc.due_at && <div style={{ marginBottom: 4 }}><SLABadge dueAt={inc.due_at} status={inc.status} /></div>}
                    <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 2px' }}>
                      👤 {inc.client_name}
                    </div>
                    {inc.client_address && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        📍 {inc.client_address}
                      </div>
                    )}
                    <div className="incident-card-bottom">
                      <span className="incident-card-client">
                        🔧 {inc.assigned_name || <span className="unassigned">Sin asignar</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {['admin', 'supervisor'].includes(user?.role) && inc.status !== 'cancelled' && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={e => { e.stopPropagation(); setAssignModal(inc); setSelectedTech(inc.assigned_to || ''); }}
                          >
                            Asignar
                          </button>
                        )}
                        <span className="incident-card-date">
                          {new Date(inc.created_at).toLocaleDateString('es-HN')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

    </div>
      </main>
      <BottomNav />

      {showForm && (
        <IncidentForm
          onSubmit={d => createMut.mutate(d)}
          onCancel={() => setShowForm(false)}
          loading={createMut.isPending}
        />
      )}

      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Asignar técnico — {assignModal.ticket_number}</h3>
              <button className="modal-close" onClick={() => setAssignModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Técnico
                <select value={selectedTech} onChange={e => setSelectedTech(e.target.value)}>
                  <option value="">Seleccionar técnico...</option>
                  {(technicians || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name} — {t.phone || 'Sin teléfono'}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setAssignModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={!selectedTech || assignMut.isPending}
                onClick={() => assignMut.mutate({ id: assignModal.id, techId: selectedTech })}
              >
                {assignMut.isPending ? 'Asignando...' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
