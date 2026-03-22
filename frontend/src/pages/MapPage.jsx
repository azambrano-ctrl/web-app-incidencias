import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMapIncidents, regeocodeIncidents } from '../api/incidents.api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { PRIORITY_COLORS, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS } from '../utils/constants';
import { toast } from 'react-hot-toast';

const LEGEND = [
  { label: 'Crítica', color: PRIORITY_COLORS.critical },
  { label: 'Alta',    color: PRIORITY_COLORS.high },
  { label: 'Media',  color: PRIORITY_COLORS.medium },
  { label: 'Baja',   color: PRIORITY_COLORS.low },
];

const DEFAULT_CENTER = [-2.19616, -79.88621]; // Guayaquil, Ecuador

function getSLALabel(dueAt, status) {
  if (!dueAt || ['resolved', 'cancelled', 'closed'].includes(status)) return null;
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const diffH  = diffMs / (1000 * 3600);
  if (diffMs < 0) {
    const over = Math.abs(diffH);
    return { label: over < 24 ? `Vencida ${Math.round(over)}h` : `Vencida ${Math.round(over / 24)}d`, color: '#ef4444', text: '#fff' };
  }
  if (diffH < 4) return { label: `${Math.round(diffH < 1 ? diffMs / 60000 : diffH)}${diffH < 1 ? 'min' : 'h'} rest.`, color: '#f97316', text: '#fff' };
  return { label: `${Math.round(diffH)}h rest.`, color: '#dcfce7', text: '#166534' };
}

export default function MapPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const qc         = useQueryClient();
  const mapRef     = useRef(null);
  const leafletRef = useRef(null);
  const [showNoCoords, setShowNoCoords] = useState(false);

  const { data: allIncidents = [], isLoading } = useQuery({
    queryKey: ['incidents-map'],
    queryFn: getMapIncidents,
    refetchInterval: 30000,
  });

  const regeocMut = useMutation({
    mutationFn: regeocodeIncidents,
    onSuccess: (res) => {
      toast.success(`Geocodificación: ${res.updated} de ${res.total} actualizadas`);
      qc.invalidateQueries(['incidents-map']);
    },
    onError: () => toast.error('Error al re-geocodificar'),
  });

  // Separar: con coords (mapa) vs sin coords (panel)
  const withCoords    = allIncidents.filter(i => i.latitude != null && i.longitude != null);
  const withoutCoords = allIncidents.filter(i => i.latitude == null || i.longitude == null);
  const isAdmin = ['admin', 'supervisor'].includes(user?.role);

  /* ── Inicializar / actualizar mapa ── */
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then(({ default: L }) => {
      import('leaflet/dist/leaflet.css');

      // Inicializar mapa si no existe
      if (!leafletRef.current) {
        const center = withCoords.length > 0
          ? [parseFloat(withCoords[0].latitude), parseFloat(withCoords[0].longitude)]
          : DEFAULT_CENTER;
        const map = L.map(mapRef.current).setView(center, 13);
        leafletRef.current = map;
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(map);
      }

      const map = leafletRef.current;

      // Limpiar marcadores anteriores (capa de markers)
      map.eachLayer(layer => {
        if (layer._isIncidentMarker) map.removeLayer(layer);
      });

      // Agregar marcadores
      withCoords.forEach(inc => {
        const lat   = parseFloat(inc.latitude);
        const lng   = parseFloat(inc.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const color       = PRIORITY_COLORS[inc.priority] || '#3b82f6';
        const sla         = getSLALabel(inc.due_at, inc.status);
        const statusColor = STATUS_COLORS[inc.status] || '#9ca3af';
        const priorColor  = PRIORITY_COLORS[inc.priority] || '#9ca3af';

        const slaHtml = sla
          ? `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${sla.color};color:${sla.text};display:inline-block;margin-bottom:6px;">⏱ ${sla.label}</span>`
          : '';

        const popupHtml = `
          <div style="font-family:-apple-system,sans-serif;min-width:210px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:3px;">${inc.ticket_number}</div>
            <div style="font-size:13px;margin-bottom:6px;">${inc.title}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:8px;line-height:1.7;">
              <div>👤 ${inc.client_name || '—'}</div>
              ${inc.client_phone ? `<div>📞 ${inc.client_phone}</div>` : ''}
              <div>📍 ${inc.client_address || '—'}</div>
              ${inc.assigned_name ? `<div>🔧 ${inc.assigned_name}</div>` : ''}
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
              <span style="font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid ${statusColor};color:${statusColor};background:${statusColor}22;">${STATUS_LABELS[inc.status] || inc.status}</span>
              <span style="font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid ${priorColor};color:${priorColor};background:${priorColor}22;">${PRIORITY_LABELS[inc.priority] || inc.priority}</span>
            </div>
            ${slaHtml}
            <button data-id="${inc.id}" style="font-size:12px;padding:5px 10px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;width:100%;margin-top:4px;">
              Ver detalle →
            </button>
          </div>`;

        const marker = L.circleMarker([lat, lng], {
          radius: 11, color: '#fff', weight: 2,
          fillColor: color, fillOpacity: 0.9,
        }).addTo(map);
        marker._isIncidentMarker = true;
        marker.bindPopup(popupHtml, { minWidth: 220 });
        marker.on('popupopen', () => {
          const btn = document.querySelector(`[data-id="${inc.id}"]`);
          if (btn) btn.addEventListener('click', () => navigate(`/incidencias/${inc.id}`));
        });
      });

      // Ajustar vista si hay marcadores
      if (withCoords.length > 0 && !leafletRef.current._viewSet) {
        const group = L.featureGroup(
          withCoords.map(i => L.circleMarker([parseFloat(i.latitude), parseFloat(i.longitude)]))
        );
        map.fitBounds(group.getBounds().pad(0.2));
        leafletRef.current._viewSet = true;
      }
    });
  }, [allIncidents, navigate]);

  useEffect(() => {
    return () => {
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mapa de Incidencias" />
        <div className="page-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>

          {/* Barra de info */}
          <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              🗺️ {withCoords.length} en mapa
            </span>
            {withoutCoords.length > 0 && (
              <button
                onClick={() => setShowNoCoords(v => !v)}
                style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
              >
                ⚠️ {withoutCoords.length} sin ubicación
              </button>
            )}
            {isAdmin && withoutCoords.length > 0 && (
              <button
                className="btn btn-sm btn-secondary"
                disabled={regeocMut.isPending}
                onClick={() => regeocMut.mutate()}
                title="Intentar obtener coordenadas de incidencias sin ubicación"
              >
                {regeocMut.isPending ? '⏳ Geocodificando...' : '🔄 Actualizar ubicaciones'}
              </button>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {LEGEND.map(({ label, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Panel: incidencias sin ubicación */}
          {showNoCoords && withoutCoords.length > 0 && (
            <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 16px', flexShrink: 0, maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                ⚠️ Incidencias sin coordenadas — dirección no geocodificada
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {withoutCoords.map(inc => (
                  <div
                    key={inc.id}
                    onClick={() => navigate(`/incidencias/${inc.id}`)}
                    style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: '#fff', border: '1px solid #fde68a' }}
                  >
                    <code style={{ fontWeight: 700, color: '#2563eb', fontSize: 11 }}>{inc.ticket_number}</code>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</span>
                    <span style={{ color: '#64748b' }}>📍 {inc.client_address || 'Sin dirección'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mapa o estado vacío */}
          {isLoading ? (
            <div className="loading-center">Cargando mapa...</div>
          ) : allIncidents.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
              <p style={{ fontWeight: 600 }}>No hay incidencias activas</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Las incidencias resueltas y canceladas no aparecen en el mapa</p>
            </div>
          ) : withCoords.length === 0 ? (
            /* Hay incidencias pero NINGUNA tiene coords — mostrar mapa vacío con aviso */
            <div style={{ flex: 1, position: 'relative' }}>
              <div ref={mapRef} style={{ width: '100%', height: '100%', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 32px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,.1)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
                <p style={{ fontWeight: 700, marginBottom: 6 }}>{allIncidents.length} incidencia{allIncidents.length !== 1 ? 's' : ''} activa{allIncidents.length !== 1 ? 's' : ''} sin coordenadas</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Las direcciones no pudieron ser geocodificadas</p>
                {isAdmin && (
                  <button className="btn btn-primary" disabled={regeocMut.isPending} onClick={() => regeocMut.mutate()}>
                    {regeocMut.isPending ? '⏳ Geocodificando...' : '🔄 Actualizar ubicaciones'}
                  </button>
                )}
              </div>
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
