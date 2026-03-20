import { useQuery } from '@tanstack/react-query';
import { getSummary } from '../api/incidents.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, TYPE_LABELS } from '../utils/constants';

export default function ReportsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['summary'], queryFn: getSummary, refetchInterval: 60000 });

  if (isLoading) return <div className="app-layout"><Sidebar /><main className="main-content"><Topbar title="Reportes" /><div className="loading-center">Cargando...</div></main></div>;

  const { byStatus = [], byPriority = [], techLoad = [], avgResolution = [] } = data || {};
  const total = byStatus.reduce((a, s) => a + s.count, 0);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Reportes y estadísticas" />
        <div className="page-body">
          <div className="reports-grid">
            <div className="card">
              <h3>Incidencias por estado</h3>
              <table className="report-table">
                <thead><tr><th>Estado</th><th>Cantidad</th><th>%</th></tr></thead>
                <tbody>
                  {byStatus.map(s => (
                    <tr key={s.status}>
                      <td><span className="badge" style={{ backgroundColor: STATUS_COLORS[s.status] + '22', color: STATUS_COLORS[s.status], border: `1px solid ${STATUS_COLORS[s.status]}` }}>{STATUS_LABELS[s.status]}</span></td>
                      <td>{s.count}</td>
                      <td>{total ? ((s.count / total) * 100).toFixed(1) + '%' : '0%'}</td>
                    </tr>
                  ))}
                  <tr className="total-row"><td><strong>Total</strong></td><td><strong>{total}</strong></td><td></td></tr>
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>Incidencias por prioridad</h3>
              <table className="report-table">
                <thead><tr><th>Prioridad</th><th>Cantidad</th></tr></thead>
                <tbody>
                  {byPriority.map(p => (
                    <tr key={p.priority}>
                      <td><span className="badge" style={{ backgroundColor: PRIORITY_COLORS[p.priority] + '22', color: PRIORITY_COLORS[p.priority], border: `1px solid ${PRIORITY_COLORS[p.priority]}` }}>{PRIORITY_LABELS[p.priority]}</span></td>
                      <td>{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>Carga de técnicos (activas)</h3>
              <table className="report-table">
                <thead><tr><th>Técnico</th><th>Incidencias activas</th><th>Carga</th></tr></thead>
                <tbody>
                  {techLoad.map(t => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.open_count}</td>
                      <td>
                        <div className="mini-bar-wrap">
                          <div className="mini-bar" style={{ width: `${Math.min(100, t.open_count * 10)}%`, backgroundColor: t.open_count > 7 ? '#ef4444' : t.open_count > 4 ? '#f59e0b' : '#22c55e' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {techLoad.length === 0 && <tr><td colSpan={3} className="table-empty">Sin técnicos</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>Tiempo promedio de resolución</h3>
              <table className="report-table">
                <thead><tr><th>Tipo de servicio</th><th>Promedio (horas)</th></tr></thead>
                <tbody>
                  {avgResolution.map(r => (
                    <tr key={r.type}>
                      <td>{TYPE_LABELS[r.type]}</td>
                      <td>{r.avg_hours ? `${r.avg_hours}h` : 'N/A'}</td>
                    </tr>
                  ))}
                  {avgResolution.length === 0 && <tr><td colSpan={2} className="table-empty">Sin incidencias resueltas</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
