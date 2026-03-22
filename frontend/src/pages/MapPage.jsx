import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMapIncidents } from '../api/incidents.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { PRIORITY_COLORS, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS } from '../utils/constants';

const LEGEND = [
  { label: 'Crítica', color: PRIORITY_COLORS.critical },
  { label: 'Alta',    color: PRIORITY_COLORS.high },
  { label: 'Media',  color: PRIORITY_COLORS.medium },
  { label: 'Baja',   color: PRIORITY_COLORS.low },
];

const DEFAULT_CENTER = [-2.19616, -79.88621]; // Ecuador

function getSLALabel(dueAt, status) {
  if (!dueAt || ['resolved', 'cancelled', 'closed'].includes(status)) return null;
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const diffH  = diffMs / (1000 * 3600);
  if (diffMs < 0) {
    const over = Math.abs(diffH);
    return { label: over < 24 ? `Vencida ${Math.round(over)}h` : `Vencida ${Math.round(over / 24)}d`, color: '#ef4444', text: '#fff' };
  }
  if (diffH < 4) return { label: `${Math.round(diffH < 1 ? diffMs / 60000 : diffH)}${diffH < 1 ? 'min' : 'h'} restantes`, color: '#f97316', text: '#fff' };
  return { label: `${Math.round(diffH)}h restantes`, color: '#dcfce7', text: '#166534' };
}

export default function MapPage() {
  const navigate  = useNavigate();
  const mapRef    = useRef(null);   // DOM node
  const leafletRef = useRef(null);  // Leaflet map instance

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents-map'],
    queryFn: getMapIncidents,
    refetchInterval: 30000,
  });

  /* ── Inicializar mapa una vez que el DOM está listo ── */
  useEffect(() => {
    if (!mapRef.current) return;
    if (leafletRef.current) return; // ya inicializado

    // Importar leaflet dinámicamente (evita problemas con SSR / React 19)
    import('leaflet').then(({ default: L }) => {
      import('leaflet/dist/leaflet.css');

      const center = incidents.length > 0
        ? [parseFloat(incidents[0].latitude), parseFloat(incidents[0].longitude)]
        : DEFAULT_CENTER;

      const map = L.map(mapRef.current).setView(center, 13);
      leafletRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      incidents.forEach(inc => {
        const lat = parseFloat(inc.latitude);
        const lng = parseFloat(inc.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const color = PRIORITY_COLORS[inc.priority] || '#3b82f6';
        const sla   = getSLALabel(inc.due_at, inc.status);

        const slaHtml = sla
          ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${sla.color};color:${sla.text};display:inline-block;margin-bottom:6px;">⏱ ${sla.label}</span>`
          : '';

        const statusColor = STATUS_COLORS[inc.status] || '#9ca3af';
        const statusHtml  = `<span style="font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid ${statusColor};color:${statusColor};background:${statusColor}22;">${STATUS_LABELS[inc.status] || inc.status}</span>`;
        const priorColor  = PRIORITY_COLORS[inc.priority] || '#9ca3af';
        const priorHtml   = `<span style="font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid ${priorColor};color:${priorColor};background:${priorColor}22;">${PRIORITY_LABELS[inc.priority] || inc.priority}</span>`;

        const popupHtml = `
          <div style="font-family:-apple-system,sans-serif;min-width:210px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${inc.ticket_number}</div>
            <div style="font-size:13px;margin-bottom:6px;">${inc.title}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px;line-height:1.6;">
              <div>👤 ${inc.client_name || '—'}</div>
              <div>📍 ${inc.client_address || '—'}</div>
              ${inc.assigned_name ? `<div>🔧 ${inc.assigned_name}</div>` : ''}
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">
              ${statusHtml} ${priorHtml}
            </div>
            ${slaHtml}
            <button
              data-id="${inc.id}"
              style="font-size:12px;padding:5px 10px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;width:100%;margin-top:4px;"
            >Ver detalle →</button>
          </div>`;

        const marker = L.circleMarker([lat, lng], {
          radius: 10,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 0.85,
        }).addTo(map);

        marker.bindPopup(popupHtml, { minWidth: 220 });

        marker.on('popupopen', () => {
          const btn = document.querySelector(`[data-id="${inc.id}"]`);
          if (btn) btn.addEventListener('click', () => navigate(`/incidencias/${inc.id}`));
        });
      });
    });

    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  }, [incidents, navigate]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mapa de Incidencias" />
        <div className="page-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>

          {/* Barra de info */}
          <div style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
              🗺️ {incidents.length} incidencia{incidents.length !== 1 ? 's' : ''} activa{incidents.length !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {LEGEND.map(({ label, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Contenedor del mapa */}
          {isLoading ? (
            <div className="loading-center">Cargando mapa...</div>
          ) : incidents.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
              <p style={{ fontWeight: 600 }}>No hay incidencias activas con ubicación</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Las ubicaciones se asignan automáticamente al crear una incidencia</p>
            </div>
          ) : (
            <div ref={mapRef} style={{ flex: 1, zIndex: 0 }} />
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
