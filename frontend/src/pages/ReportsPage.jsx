import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSummary } from '../api/incidents.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, TYPE_LABELS } from '../utils/constants';

/* ── Helpers ──────────────────────────────────────────────── */
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });

const now = () => new Date().toLocaleString('es-EC', {
  timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit',
  year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/* ── Mini bar component ───────────────────────────────────── */
function MiniBar({ value, max, color }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mini-bar-wrap">
      <div className="mini-bar" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* ── PDF generator ────────────────────────────────────────── */
function generatePDF({ byStatus, byPriority, techLoad, avgResolution, total, period }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const primaryRGB = [37, 99, 235];   // #2563eb
  const grayRGB   = [100, 116, 139];  // text-muted

  /* ── Header ── */
  doc.setFillColor(...primaryRGB);
  doc.rect(0, 0, W, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('📡 IncidenciasISP', 14, 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Reporte de incidencias y estadísticas', 14, 18);
  doc.text(`Generado: ${now()}`, W - 14, 18, { align: 'right' });
  if (period) {
    doc.text(`Período: ${period}`, W - 14, 24, { align: 'right' });
  }

  let y = 36;

  /* ── KPI strip ── */
  const kpis = [
    { label: 'Total incidencias', value: String(total) },
    { label: 'Tipos de servicio', value: String(avgResolution.length) },
    { label: 'Técnicos activos',  value: String(techLoad.length) },
    { label: 'Resueltas',         value: String(byStatus.find(s => s.status === 'resolved')?.count ?? 0) },
  ];
  const colW = (W - 28) / kpis.length;
  kpis.forEach((k, i) => {
    const x = 14 + i * colW;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x, y, colW - 4, 18, 3, 3, 'F');
    doc.setTextColor(...primaryRGB);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(k.value, x + (colW - 4) / 2, y + 9, { align: 'center' });
    doc.setTextColor(...grayRGB);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(k.label.toUpperCase(), x + (colW - 4) / 2, y + 15, { align: 'center' });
  });

  y += 26;

  /* ── Section helper ── */
  const section = (title) => {
    doc.setFillColor(...primaryRGB);
    doc.rect(14, y, 3, 6, 'F');
    doc.setTextColor(...[30, 41, 59]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, y + 5);
    y += 9;
  };

  /* ── Table defaults ── */
  const tableDefaults = {
    startY: y,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: primaryRGB, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: (data) => { y = data.cursor.y + 8; },
  };

  /* ── 1. Por estado ── */
  section('Incidencias por estado');
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Estado', 'Cantidad', 'Porcentaje']],
    body: [
      ...byStatus.map(s => [
        STATUS_LABELS[s.status] || s.status,
        s.count,
        total ? `${((s.count / total) * 100).toFixed(1)}%` : '0%',
      ]),
      ['TOTAL', total, '100%'],
    ],
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
    didParseCell: (data) => {
      if (data.row.index === byStatus.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [226, 232, 240];
      }
    },
  });

  /* ── 2. Por prioridad ── */
  section('Incidencias por prioridad');
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Prioridad', 'Cantidad']],
    body: byPriority.map(p => [PRIORITY_LABELS[p.priority] || p.priority, p.count]),
    columnStyles: { 1: { halign: 'center' } },
  });

  /* ── 3. Carga de técnicos ── */
  section('Carga de técnicos (incidencias activas)');
  const maxLoad = Math.max(...techLoad.map(t => Number(t.open_count)), 1);
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Técnico', 'Incidencias activas', 'Nivel de carga']],
    body: techLoad.length
      ? techLoad.map(t => [
          t.name,
          t.open_count,
          Number(t.open_count) > 7 ? '🔴 Alto' : Number(t.open_count) > 4 ? '🟡 Medio' : '🟢 Normal',
        ])
      : [['Sin técnicos asignados', '', '']],
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
  });

  /* ── 4. Tiempo promedio ── */
  section('Tiempo promedio de resolución por tipo de servicio');
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [['Tipo de servicio', 'Promedio (horas)']],
    body: avgResolution.length
      ? avgResolution.map(r => [TYPE_LABELS[r.type] || r.type, r.avg_hours ? `${r.avg_hours}h` : 'N/A'])
      : [['Sin incidencias resueltas aún', '—']],
    columnStyles: { 1: { halign: 'center' } },
  });

  /* ── Footer en cada página ── */
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...grayRGB);
    doc.setFont('helvetica', 'normal');
    doc.text('IncidenciasISP — Reporte generado automáticamente', 14, 290);
    doc.text(`Página ${i} de ${pages}`, W - 14, 290, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 287, W - 14, 287);
  }

  const filename = `reporte-incidencias-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

/* ── Page ─────────────────────────────────────────────────── */
export default function ReportsPage() {
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: getSummary,
    refetchInterval: 60000,
  });

  if (isLoading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Reportes y estadísticas" />
        <div className="loading-center">Cargando...</div>
      </main>
    </div>
  );

  const { byStatus = [], byPriority = [], techLoad = [], avgResolution = [] } = data || {};
  const total = byStatus.reduce((a, s) => a + Number(s.count), 0);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      generatePDF({ byStatus, byPriority, techLoad, avgResolution, total });
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Reportes y estadísticas" />
        <div className="page-body">

          {/* Toolbar */}
          <div className="page-toolbar" style={{ marginBottom: 24 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Resumen general</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10 }}>
                Actualizado: {now()}
              </span>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
              style={{ gap: 8, display: 'inline-flex', alignItems: 'center' }}
            >
              {downloading ? (
                <>⏳ Generando PDF...</>
              ) : (
                <>📄 Descargar PDF</>
              )}
            </button>
          </div>

          {/* KPI strip */}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card">
              <span className="stat-icon">🎫</span>
              <div><div className="stat-number">{total}</div><div className="stat-label">Total incidencias</div></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">✅</span>
              <div>
                <div className="stat-number">{byStatus.find(s => s.status === 'resolved')?.count ?? 0}</div>
                <div className="stat-label">Resueltas</div>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">👷</span>
              <div><div className="stat-number">{techLoad.length}</div><div className="stat-label">Técnicos activos</div></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⏱</span>
              <div>
                <div className="stat-number">
                  {avgResolution.length
                    ? `${(avgResolution.reduce((a, r) => a + Number(r.avg_hours || 0), 0) / avgResolution.length).toFixed(1)}h`
                    : '—'}
                </div>
                <div className="stat-label">Resolución promedio</div>
              </div>
            </div>
          </div>

          {/* Grid de tablas */}
          <div className="reports-grid">

            {/* Por estado */}
            <div className="card">
              <h3>Incidencias por estado</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Estado</th><th>Cantidad</th><th>%</th></tr>
                </thead>
                <tbody>
                  {byStatus.map(s => (
                    <tr key={s.status}>
                      <td>
                        <span className="badge" style={{
                          background: STATUS_COLORS[s.status] + '22',
                          color: STATUS_COLORS[s.status],
                          border: `1px solid ${STATUS_COLORS[s.status]}55`,
                        }}>
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </td>
                      <td>{s.count}</td>
                      <td>{total ? `${((s.count / total) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td><strong>Total</strong></td>
                    <td><strong>{total}</strong></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Por prioridad */}
            <div className="card">
              <h3>Incidencias por prioridad</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Prioridad</th><th>Cantidad</th></tr>
                </thead>
                <tbody>
                  {byPriority.map(p => (
                    <tr key={p.priority}>
                      <td>
                        <span className="badge" style={{
                          background: PRIORITY_COLORS[p.priority] + '22',
                          color: PRIORITY_COLORS[p.priority],
                          border: `1px solid ${PRIORITY_COLORS[p.priority]}55`,
                        }}>
                          {PRIORITY_LABELS[p.priority] || p.priority}
                        </span>
                      </td>
                      <td>{p.count}</td>
                    </tr>
                  ))}
                  {byPriority.length === 0 && (
                    <tr><td colSpan={2} className="table-empty">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Carga de técnicos */}
            <div className="card">
              <h3>Carga de técnicos (activas)</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Técnico</th><th>Activas</th><th>Carga</th></tr>
                </thead>
                <tbody>
                  {techLoad.map(t => {
                    const count = Number(t.open_count);
                    const color = count > 7 ? '#ef4444' : count > 4 ? '#f59e0b' : '#22c55e';
                    const maxLoad = Math.max(...techLoad.map(x => Number(x.open_count)), 1);
                    return (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{t.open_count}</td>
                        <td><MiniBar value={count} max={maxLoad} color={color} /></td>
                      </tr>
                    );
                  })}
                  {techLoad.length === 0 && (
                    <tr><td colSpan={3} className="table-empty">Sin técnicos</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tiempo promedio */}
            <div className="card">
              <h3>Tiempo promedio de resolución</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Tipo de servicio</th><th>Promedio</th></tr>
                </thead>
                <tbody>
                  {avgResolution.map(r => (
                    <tr key={r.type}>
                      <td>{TYPE_LABELS[r.type] || r.type}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        {r.avg_hours ? `${r.avg_hours}h` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  {avgResolution.length === 0 && (
                    <tr><td colSpan={2} className="table-empty">Sin incidencias resueltas</td></tr>
                  )}
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
