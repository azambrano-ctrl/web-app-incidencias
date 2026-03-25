import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getIncidents, createIncident, assignIncident, deleteIncident } from '../api/incidents.api';
import { getUsers } from '../api/users.api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import IncidentForm from '../components/incidents/IncidentForm';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import { SLABadge } from '../components/incidents/SLABadge';
import { TYPE_LABELS, STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '../utils/constants';
import { toast } from 'react-hot-toast';

const PRIMARY = [37, 99, 235];
const GRAY    = [100, 116, 139];
const DARK    = [30, 41, 59];

const PRIORITY_COLOR_MAP = {
  critical: [239, 68, 68],
  high:     [249, 115, 22],
  medium:   [234, 179, 8],
  low:      [34, 197, 94],
};
const STATUS_COLOR_MAP = {
  open:        [59, 130, 246],
  assigned:    [99, 102, 241],
  in_progress: [245, 158, 11],
  resolved:    [34, 197, 94],
  cancelled:   [156, 163, 175],
  closed:      [107, 114, 128],
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtSLA(dueAt, status) {
  if (!dueAt) return '—';
  if (['resolved', 'cancelled', 'closed'].includes(status)) return 'Cerrada';
  const diff = new Date(dueAt) - Date.now();
  if (diff < 0) return '⚠ Vencida';
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h restantes`;
  return `${Math.floor(h / 24)}d restantes`;
}

async function exportAllToPDF({ filters, userName }) {
  toast('Preparando PDF...', { icon: '⏳' });
  const result = await getIncidents({ ...filters, page: 1, limit: 9999 });
  const all = result?.data || [];

  if (all.length === 0) { toast.error('No hay incidencias para exportar'); return; }

  // A4 landscape = 297 × 210 mm — usamos todo el ancho
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 297
  const H = doc.internal.pageSize.getHeight();  // 210

  /* ── Header ── */
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('IncidenciasISP — Listado completo de incidencias', 12, 11);

  const activeFilters = [];
  if (filters.status)      activeFilters.push(`Estado: ${STATUS_LABELS[filters.status] || filters.status}`);
  if (filters.priority)    activeFilters.push(`Prioridad: ${PRIORITY_LABELS[filters.priority] || filters.priority}`);
  if (filters.type)        activeFilters.push(`Servicio: ${TYPE_LABELS[filters.type] || filters.type}`);
  if (filters.assigned_to) activeFilters.push('Con filtro de técnico');
  const filterStr = activeFilters.length ? activeFilters.join(' · ') : 'Todos los registros';

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Filtros: ${filterStr}   ·   Total: ${all.length} incidencias   ·   Exportado por: ${userName}`, 12, 19);

  const nowStr = new Date().toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  doc.text(nowStr, W - 12, 19, { align: 'right' });

  /* ── Tabla principal ── */
  // Columnas: Ticket | Título | Tipo | Prioridad | Estado | SLA | Técnico | Cliente | Teléfonos | Dirección | Creada
  // Suma anchos = 272mm (dentro de 297 - 12*2 = 273mm usables)
  autoTable(doc, {
    startY: 30,
    margin: { left: 8, right: 8 },
    tableWidth: W - 16,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      textColor: DARK,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: PRIMARY, textColor: 255,
      fontStyle: 'bold', fontSize: 7.5,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    head: [[
      'Ticket', 'Título', 'Tipo', 'Prioridad', 'Estado', 'SLA',
      'Técnico', 'Cliente', 'Teléfonos', 'Dirección', 'Creada',
    ]],
    body: all.map(inc => {
      // Teléfonos: principal + secundario si existe
      const tel = [inc.client_phone, inc.client_phone2].filter(Boolean).join('\n') || '—';
      return [
        inc.ticket_number + (inc.escalated ? '\n🔺 Escalada' : ''),
        inc.title,
        TYPE_LABELS[inc.type] || inc.type,
        PRIORITY_LABELS[inc.priority] || inc.priority,
        STATUS_LABELS[inc.status]    || inc.status,
        fmtSLA(inc.due_at, inc.status),
        inc.assigned_name  || 'Sin asignar',
        inc.client_name    || '—',
        tel,
        inc.client_address || '—',
        fmtDate(inc.created_at),
      ];
    }),
    columnStyles: {
      0:  { cellWidth: 26, fontStyle: 'bold', fontSize: 7 },  // Ticket
      1:  { cellWidth: 38 },                                   // Título
      2:  { cellWidth: 18, halign: 'center' },                 // Tipo
      3:  { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, // Prioridad
      4:  { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Estado
      5:  { cellWidth: 22, halign: 'center' },                 // SLA
      6:  { cellWidth: 26 },                                   // Técnico
      7:  { cellWidth: 26 },                                   // Cliente
      8:  { cellWidth: 26 },                                   // Teléfonos
      9:  { cellWidth: 48 },                                   // Dirección (más ancho)
      10: { cellWidth: 19, halign: 'center' },                 // Creada
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const inc = all[data.row.index];
      if (!inc) return;

      // Prioridad en color
      if (data.column.index === 3) {
        const rgb = PRIORITY_COLOR_MAP[inc.priority];
        if (rgb) data.cell.styles.textColor = rgb;
      }
      // Estado en color
      if (data.column.index === 4) {
        const rgb = STATUS_COLOR_MAP[inc.status];
        if (rgb) data.cell.styles.textColor = rgb;
      }
      // SLA vencida en rojo
      if (data.column.index === 5 && String(data.cell.text[0]).startsWith('⚠')) {
        data.cell.styles.textColor = [239, 68, 68];
        data.cell.styles.fontStyle = 'bold';
      }
      // Fila de incidencias escaladas con fondo amarillo suave
      if (inc.escalated) {
        data.cell.styles.fillColor = [255, 251, 235];
      }
    },
  });

  /* ── Footer en cada página ── */
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('IncidenciasISP — Documento generado automáticamente. Uso interno.', 8, H - 5);
    doc.text(`Página ${i} de ${pages}`, W - 8, H - 5, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(8, H - 8, W - 8, H - 8);
  }

  const filename = `incidencias-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  toast.success(`PDF generado — ${all.length} incidencias`);
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ status: '', priority: '', type: '', assigned_to: '', page: 1, limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [assignModal, setAssignModal] = useState(null);
  const [selectedTech, setSelectedTech] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const deleteMut = useMutation({
    mutationFn: (id) => deleteIncident(id),
    onSuccess: (_, id) => {
      toast.success('Incidencia eliminada');
      qc.invalidateQueries(['incidents']);
      qc.removeQueries(['incident', String(id)]);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al eliminar'),
  });

  const handleDelete = (e, inc) => {
    e.stopPropagation();
    if (window.confirm(`¿Eliminar ${inc.ticket_number}? Esta acción no se puede deshacer.`)) {
      deleteMut.mutate(inc.id);
    }
  };

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v, page: 1 }));
  const incidents = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / filters.limit);

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
              {['admin', 'supervisor'].includes(user?.role) && (
                <select value={filters.assigned_to} onChange={e => setFilter('assigned_to', e.target.value)}>
                  <option value="">Todos los técnicos</option>
                  <option value="unassigned">Sin asignar</option>
                  {(technicians || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                disabled={pdfLoading}
                onClick={async () => {
                  setPdfLoading(true);
                  try { await exportAllToPDF({ filters, userName: user?.name }); }
                  catch { toast.error('Error al generar PDF'); }
                  finally { setPdfLoading(false); }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {pdfLoading ? '⏳ Generando...' : '📄 Exportar PDF'}
              </button>
              {['admin', 'supervisor'].includes(user?.role) && (
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nueva Incidencia</button>
              )}
            </div>
          </div>

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
                      <tr key={inc.id} onClick={() => navigate(`/incidencias/${inc.id}`)} className="table-row-click">
                        <td>
                          <code className="ticket">{inc.ticket_number}</code>
                          {inc.external_id && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>LSF #{inc.external_id}</span>}
                          {inc.escalated && <span className="escalated-tag" title="Escalada">🔺</span>}
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
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-start' }}>
                          {['admin', 'supervisor'].includes(user?.role) && (
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => { setAssignModal(inc); setSelectedTech(inc.assigned_to || ''); }}
                            >
                              Asignar
                            </button>
                          )}
                          {user?.role === 'admin' && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                              onClick={(e) => handleDelete(e, inc)}
                              disabled={deleteMut.isPending}
                              title="Eliminar incidencia"
                            >
                              🗑
                            </button>
                          )}
                          </div>
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
                    className={`incident-card${inc.escalated ? ' card-escalated' : ''}`}
                    style={{ borderLeftColor: inc.escalated ? '#f59e0b' : STATUS_COLORS[inc.status] }}
                    onClick={() => navigate(`/incidencias/${inc.id}`)}
                  >
                    {inc.escalated && (
                      <div className="overdue-card-banner" style={{ background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
                        🔺 Incidencia escalada — requiere atención
                      </div>
                    )}
                    <div className="incident-card-top">
                      <span className="incident-card-title">{inc.title}</span>
                      <StatusBadge status={inc.status} />
                    </div>
                    <div className="incident-card-meta">
                      <PriorityBadge priority={inc.priority} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TYPE_LABELS[inc.type]}</span>
                      <code className="ticket" style={{ fontSize: 11 }}>{inc.ticket_number}</code>
                      {inc.external_id && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>LSF #{inc.external_id}</span>}
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
