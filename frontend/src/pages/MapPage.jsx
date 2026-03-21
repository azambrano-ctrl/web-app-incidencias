import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getMapIncidents } from '../api/incidents.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { StatusBadge, PriorityBadge } from '../components/incidents/StatusBadge';
import { SLABadge } from '../components/incidents/SLABadge';
import { PRIORITY_COLORS } from '../utils/constants';

const LEGEND = [
  { label: 'Crítica', color: PRIORITY_COLORS.critical },
  { label: 'Alta', color: PRIORITY_COLORS.high },
  { label: 'Media', color: PRIORITY_COLORS.medium },
  { label: 'Baja', color: PRIORITY_COLORS.low },
];

// Centro por defecto: Tegucigalpa, Honduras
const DEFAULT_CENTER = [14.0818, -87.2068];

export default function MapPage() {
  const navigate = useNavigate();

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents-map'],
    queryFn: getMapIncidents,
    refetchInterval: 30000,
  });

  const center = incidents.length > 0
    ? [parseFloat(incidents[0].latitude), parseFloat(incidents[0].longitude)]
    : DEFAULT_CENTER;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mapa de Incidencias" />
        <div className="page-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>

          {/* Barra de información */}
          <div style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
              🗺️ {incidents.length} incidencia{incidents.length !== 1 ? 's' : ''} activa{incidents.length !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {LEGEND.map(({ label, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Mapa */}
          {isLoading ? (
            <div className="loading-center">Cargando mapa...</div>
          ) : incidents.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
              <p style={{ fontWeight: 600 }}>No hay incidencias activas con ubicación</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>Las ubicaciones se obtienen automáticamente al crear una incidencia</p>
            </div>
          ) : (
            <div style={{ flex: 1 }}>
              <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {incidents.map(inc => (
                  <CircleMarker
                    key={inc.id}
                    center={[parseFloat(inc.latitude), parseFloat(inc.longitude)]}
                    radius={10}
                    pathOptions={{
                      color: '#fff',
                      weight: 2,
                      fillColor: PRIORITY_COLORS[inc.priority] || '#3b82f6',
                      fillOpacity: 0.85,
                    }}
                  >
                    <Popup minWidth={220}>
                      <div style={{ fontFamily: '-apple-system, sans-serif' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                          {inc.ticket_number}
                        </div>
                        <div style={{ fontSize: 13, marginBottom: 6 }}>{inc.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                          <div>👤 {inc.client_name}</div>
                          <div>📍 {inc.client_address}</div>
                          {inc.assigned_name && <div>🔧 {inc.assigned_name}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                          <StatusBadge status={inc.status} />
                          <PriorityBadge priority={inc.priority} />
                        </div>
                        {inc.due_at && (
                          <div style={{ marginBottom: 8 }}>
                            <SLABadge dueAt={inc.due_at} status={inc.status} />
                          </div>
                        )}
                        <button
                          style={{ fontSize: 12, padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', width: '100%' }}
                          onClick={() => navigate(`/incidencias/${inc.id}`)}
                        >
                          Ver detalle →
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
