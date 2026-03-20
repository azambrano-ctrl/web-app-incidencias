import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getSummary, getIncidents } from '../api/incidents.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_COLORS, TYPE_LABELS } from '../utils/constants';

export default function DashboardPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const { data, refetch } = useQuery({
    queryKey: ['summary'],
    queryFn: getSummary,
    refetchInterval: 30000,
    enabled: user?.role !== 'technician',
  });

  const { data: myData, refetch: refetchMy } = useQuery({
    queryKey: ['my-incidents-dash'],
    queryFn: () => getIncidents({ limit: 50 }),
    enabled: user?.role === 'technician',
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { refetch(); refetchMy?.(); };
    socket.on('incident:created', refresh);
    socket.on('incident:status_changed', refresh);
    socket.on('incident:assigned', refresh);
    return () => {
      socket.off('incident:created', refresh);
      socket.off('incident:status_changed', refresh);
      socket.off('incident:assigned', refresh);
    };
  }, [socket]);

  if (user?.role === 'technician') {
    const all = myData?.data || [];
    const active = all.filter(i => !['resolved', 'cancelled'].includes(i.status));
    const resolved = all.filter(i => i.status === 'resolved');
    const isOverdue = (inc) => {
      const last = new Date(inc.updated_at || inc.created_at);
      return (Date.now() - last.getTime()) > 24 * 60 * 60 * 1000;
    };

    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Topbar title="Mis Incidencias" />
          <div className="page-body">

            {/* Resumen rápido */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
              <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
                <span className="stat-icon">🔧</span>
                <div>
                  <div className="stat-number">{active.length}</div>
                  <div className="stat-label">Activas</div>
                </div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
                <span className="stat-icon">⚠️</span>
                <div>
                  <div className="stat-number">{active.filter(isOverdue).length}</div>
                  <div className="stat-label">Vencidas</div>
                </div>
              </div>
              <div className="stat-card" style={{ borderLeft: '4px solid #22c55e' }}>
                <span className="stat-icon">✅</span>
                <div>
                  <div className="stat-number">{resolved.length}</div>
                  <div className="stat-label">Resueltas</div>
                </div>
              </div>
            </div>

            {active.length === 0 ? (
              <div className="welcome-card">
                <h2>¡Todo al día, {user.name.split(' ')[0]}!</h2>
                <p>No tienes incidencias activas en este momento.</p>
              </div>
            ) : (
              <>
                <h3 style={{ marginBottom: 12, fontSize: 15, color: 'var(--text-muted)' }}>
                  Incidencias activas ({active.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {active.map(inc => (
                    <div
                      key={inc.id}
                      className={`incident-card${isOverdue(inc) ? ' card-overdue' : ''}`}
                      style={{ borderLeftColor: isOverdue(inc) ? '#ef4444' : STATUS_COLORS[inc.status], cursor: 'pointer' }}
                      onClick={() => navigate(`/incidencias/${inc.id}`)}
                    >
                      {isOverdue(inc) && (
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
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 2px' }}>
                        👤 {inc.client_name}
                      </div>
                      {inc.client_address && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                          📍 {inc.client_address}
                        </div>
                      )}
                      {inc.client_phone && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          📞 {inc.client_phone}
                        </div>
                      )}
                      <div className="incident-card-bottom" style={{ marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(inc.created_at).toLocaleDateString('es-HN')}
                        </span>
                        {inc.due_at && (
                          <span style={{ fontSize: 12, color: new Date(inc.due_at) < new Date() ? '#ef4444' : 'var(--text-muted)', fontWeight: 600 }}>
                            ⏰ {new Date(inc.due_at).toLocaleDateString('es-HN')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const byStatus = data?.byStatus || [];
  const byPriority = data?.byPriority || [];
  const techLoad = data?.techLoad || [];
  const avgResolution = data?.avgResolution || [];

  const totalOpen = byStatus.filter(s => !['resolved', 'closed', 'cancelled'].includes(s.status))
    .reduce((acc, s) => acc + s.count, 0);
  const critical = byPriority.find(p => p.priority === 'critical')?.count || 0;
  const resolved = byStatus.find(s => s.status === 'resolved')?.count || 0;
  const unassigned = byStatus.find(s => s.status === 'open')?.count || 0;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Dashboard" />
        <div className="page-body">
          <div className="stats-grid">
            <div className="stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <span className="stat-icon">🎫</span>
              <div>
                <div className="stat-number">{totalOpen}</div>
                <div className="stat-label">Incidencias activas</div>
              </div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <span className="stat-icon">🚨</span>
              <div>
                <div className="stat-number">{critical}</div>
                <div className="stat-label">Críticas</div>
              </div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #f97316' }}>
              <span className="stat-icon">⚠️</span>
              <div>
                <div className="stat-number">{unassigned}</div>
                <div className="stat-label">Sin asignar</div>
              </div>
            </div>
            <div className="stat-card" style={{ borderLeft: '4px solid #22c55e' }}>
              <span className="stat-icon">✅</span>
              <div>
                <div className="stat-number">{resolved}</div>
                <div className="stat-label">Resueltas</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card">
              <h3>Estado de incidencias</h3>
              <div className="status-breakdown">
                {byStatus.map(s => (
                  <div key={s.status} className="breakdown-item">
                    <span className="breakdown-label" style={{ color: STATUS_COLORS[s.status] }}>
                      {STATUS_LABELS[s.status]}
                    </span>
                    <div className="breakdown-bar-wrap">
                      <div
                        className="breakdown-bar"
                        style={{
                          width: `${Math.min(100, (s.count / Math.max(1, byStatus.reduce((a, x) => a + x.count, 0))) * 100)}%`,
                          backgroundColor: STATUS_COLORS[s.status],
                        }}
                      />
                    </div>
                    <span className="breakdown-count">{s.count}</span>
                  </div>
                ))}
                {byStatus.length === 0 && <p className="empty-msg">Sin incidencias registradas</p>}
              </div>
            </div>

            <div className="card">
              <h3>Carga por técnico</h3>
              <div className="tech-load-list">
                {techLoad.map(t => (
                  <div key={t.id} className="tech-load-item">
                    <span className="tech-name">{t.name}</span>
                    <span className="tech-count" style={{ color: t.open_count > 5 ? '#ef4444' : '#22c55e' }}>
                      {t.open_count} activas
                    </span>
                  </div>
                ))}
                {techLoad.length === 0 && <p className="empty-msg">Sin técnicos registrados</p>}
              </div>
            </div>

            <div className="card">
              <h3>Tiempo promedio de resolución</h3>
              <div className="resolution-list">
                {avgResolution.map(r => (
                  <div key={r.type} className="resolution-item">
                    <span>{r.type === 'internet' ? '🌐 Internet' : r.type === 'tv' ? '📺 TV Cable' : '🌐📺 Ambos'}</span>
                    <span className="resolution-time">{r.avg_hours ? `${r.avg_hours}h` : 'N/A'}</span>
                  </div>
                ))}
                {avgResolution.length === 0 && <p className="empty-msg">Sin datos de resolución</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
