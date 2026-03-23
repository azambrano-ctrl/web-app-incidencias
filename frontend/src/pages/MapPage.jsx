import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMapIncidents, regeocodeIncidents } from '../api/incidents.api';
import { getNetworkNodes, createNetworkNode, updateNetworkNode, deleteNetworkNode } from '../api/network.api';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { PRIORITY_COLORS, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS } from '../utils/constants';
import { toast } from 'react-hot-toast';

/* ── Constantes ── */
const DEFAULT_CENTER = [-2.19616, -79.88621]; // Guayaquil

const LEGEND = [
  { label: 'Crítica', color: PRIORITY_COLORS.critical },
  { label: 'Alta',    color: PRIORITY_COLORS.high },
  { label: 'Media',   color: PRIORITY_COLORS.medium },
  { label: 'Baja',    color: PRIORITY_COLORS.low },
];

const NODE_CONFIG = {
  caja:  { color: '#16a34a', bg: '#dcfce7', emoji: '📦', label: 'Caja' },
  nodo:  { color: '#7c3aed', bg: '#ede9fe', emoji: '🔵', label: 'Nodo' },
  manga: { color: '#ea580c', bg: '#ffedd5', emoji: '🟠', label: 'Manga' },
};

const CABLE_TYPES = [
  'Fibra monomodo 4H',
  'Fibra monomodo 8H',
  'Fibra monomodo 12H',
  'Fibra monomodo 24H',
  'Fibra monomodo 48H',
  'Fibra monomodo 96H',
  'ADSS 24H',
  'ADSS 48H',
  'Cable coaxial RG6',
  'Cable coaxial RG11',
  'UTP Cat6',
  'Otro',
];

const EMPTY_FORM = {
  type: 'caja',
  name: '',
  description: '',
  cable_type: '',
  total_hilos: '',
  hilos_used: '',
  notes: '',
  latitude: '',
  longitude: '',
};

function getSLALabel(dueAt, status) {
  if (!dueAt || ['resolved','cancelled','closed'].includes(status)) return null;
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const diffH  = diffMs / (1000 * 3600);
  if (diffMs < 0) {
    const over = Math.abs(diffH);
    return { label: over < 24 ? `Vencida ${Math.round(over)}h` : `Vencida ${Math.round(over/24)}d`, color: '#ef4444', text: '#fff' };
  }
  if (diffH < 4) return { label: `${Math.round(diffH < 1 ? diffMs/60000 : diffH)}${diffH < 1 ? 'min' : 'h'} rest.`, color: '#f97316', text: '#fff' };
  return { label: `${Math.round(diffH)}h rest.`, color: '#dcfce7', text: '#166534' };
}

/* ══════════════════════════════════════════════════
   MODAL: Registrar / Editar nodo de red
══════════════════════════════════════════════════ */
function NodeModal({ open, onClose, initial, onSaved, isAdmin }) {
  const [form, setForm]       = useState(EMPTY_FORM);
  const [gpsLoading, setGps]  = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setForm(initial ? {
      type:        initial.type        || 'caja',
      name:        initial.name        || '',
      description: initial.description || '',
      cable_type:  initial.cable_type  || '',
      total_hilos: initial.total_hilos ?? '',
      hilos_used:  initial.hilos_used  ?? '',
      notes:       initial.notes       || '',
      latitude:    initial.latitude    || '',
      longitude:   initial.longitude   || '',
    } : EMPTY_FORM);
  }, [open, initial]);

  const createMut = useMutation({
    mutationFn: createNetworkNode,
    onSuccess: () => {
      qc.invalidateQueries(['network-nodes']);
      toast.success('Nodo registrado en el mapa ✅');
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateNetworkNode(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['network-nodes']);
      toast.success('Nodo actualizado ✅');
      onSaved?.();
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al actualizar'),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function useGPS() {
    if (!navigator.geolocation) { toast.error('GPS no disponible en este dispositivo'); return; }
    setGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(7), longitude: pos.coords.longitude.toFixed(7) }));
        setGps(false);
        toast.success(`📍 GPS: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
      },
      (err) => {
        setGps(false);
        const msgs = { 1: 'Permiso de GPS denegado', 2: 'GPS no disponible', 3: 'Tiempo de espera agotado' };
        toast.error(msgs[err.code] || 'Error al obtener GPS');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.latitude || !form.longitude) { toast.error('Marca la ubicación con GPS o ingresa coordenadas'); return; }
    const payload = {
      ...form,
      latitude:    parseFloat(form.latitude),
      longitude:   parseFloat(form.longitude),
      total_hilos: parseInt(form.total_hilos) || 0,
      hilos_used:  parseInt(form.hilos_used)  || 0,
    };
    if (initial?.id) {
      updateMut.mutate({ id: initial.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (!open) return null;

  const cfg = NODE_CONFIG[form.type] || NODE_CONFIG.caja;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(0,0,0,.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,.3)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {initial?.id ? '✏️ Editar' : '📍 Registrar'} punto de red
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>Caja, nodo o manga — documentar materiales utilizados</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Tipo */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Tipo de punto *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(NODE_CONFIG).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: key }))}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    border: `2px solid ${form.type === key ? c.color : '#e2e8f0'}`,
                    background: form.type === key ? c.bg : '#f8fafc',
                    color: form.type === key ? c.color : '#64748b',
                    transition: 'all .15s',
                  }}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nombre */}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Nombre / Identificador *
            <input
              value={form.name} onChange={set('name')} required maxLength={100}
              placeholder="Ej: Caja-Sur-07, Nodo-Principal-B"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
            />
          </label>

          {/* Ubicación GPS */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Ubicación *</label>
            <button
              type="button"
              onClick={useGPS}
              disabled={gpsLoading}
              style={{
                width: '100%', padding: '10px', borderRadius: 8, border: '2px dashed #3b82f6',
                background: form.latitude ? '#eff6ff' : '#f8fafc', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: '#2563eb', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {gpsLoading ? (
                <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Obteniendo GPS...</>
              ) : form.latitude ? (
                <>📍 {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)} — Actualizar GPS</>
              ) : (
                <>📡 Usar mi ubicación GPS actual</>
              )}
            </button>
            {/* Coordenadas manuales */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                value={form.latitude} onChange={set('latitude')}
                placeholder="Latitud (-2.19616)"
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}
              />
              <input
                value={form.longitude} onChange={set('longitude')}
                placeholder="Longitud (-79.88621)"
                style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}
              />
            </div>
          </div>

          {/* Tipo de cable */}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Tipo de cable
            <select
              value={form.cable_type} onChange={set('cable_type')}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', boxSizing: 'border-box' }}
            >
              <option value="">— Seleccionar —</option>
              {CABLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          {/* Hilos */}
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>
              Total de hilos
              <input
                type="number" min="0" max="9999"
                value={form.total_hilos} onChange={set('total_hilos')}
                placeholder="0"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>
              Hilos utilizados
              <input
                type="number" min="0" max="9999"
                value={form.hilos_used} onChange={set('hilos_used')}
                placeholder="0"
                style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
              />
            </label>
          </div>

          {/* Barra visual hilos */}
          {(form.total_hilos > 0) && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                <span>Ocupación de hilos</span>
                <span>{form.hilos_used || 0} / {form.total_hilos} ({Math.round(((form.hilos_used || 0) / form.total_hilos) * 100)}%)</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99, transition: 'width .3s',
                  background: ((form.hilos_used || 0) / form.total_hilos) > 0.8 ? '#ef4444' : ((form.hilos_used || 0) / form.total_hilos) > 0.5 ? '#f59e0b' : '#22c55e',
                  width: `${Math.min(100, Math.round(((form.hilos_used || 0) / form.total_hilos) * 100))}%`,
                }} />
              </div>
            </div>
          )}

          {/* Descripción */}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Descripción / trabajo realizado
            <textarea
              value={form.description} onChange={set('description')} rows={2} maxLength={1000}
              placeholder="Ej: Empalme de fibra, splitter 1:8 instalado..."
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>

          {/* Notas adicionales */}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Notas adicionales
            <textarea
              value={form.notes} onChange={set('notes')} rows={2} maxLength={2000}
              placeholder="Observaciones, materiales adicionales..."
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </label>

          {/* Botones */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button
              type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f8fafc', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isPending}
              style={{
                flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                background: isPending ? '#94a3b8' : cfg.color,
                color: '#fff', cursor: isPending ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700,
              }}
            >
              {isPending ? '⏳ Guardando...' : (initial?.id ? '✅ Guardar cambios' : `📍 Registrar ${cfg.label}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════ */
export default function MapPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const qc         = useQueryClient();
  const mapRef     = useRef(null);
  const leafletRef = useRef(null);

  const [showNoCoords,  setShowNoCoords]  = useState(false);
  const [showNodes,     setShowNodes]     = useState(true);
  const [nodeModal,     setNodeModal]     = useState({ open: false, initial: null });

  const isAdmin = ['admin','supervisor'].includes(user?.role);

  const { data: allIncidents = [], isLoading } = useQuery({
    queryKey: ['incidents-map'],
    queryFn:  getMapIncidents,
    refetchInterval: 30000,
  });

  const { data: networkNodes = [] } = useQuery({
    queryKey: ['network-nodes'],
    queryFn:  getNetworkNodes,
    refetchInterval: 60000,
  });

  const regeocMut = useMutation({
    mutationFn: regeocodeIncidents,
    onSuccess: (res) => {
      toast.success(`Geocodificación: ${res.updated} de ${res.total} actualizadas`);
      qc.invalidateQueries(['incidents-map']);
    },
    onError: () => toast.error('Error al re-geocodificar'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteNetworkNode,
    onSuccess: () => { qc.invalidateQueries(['network-nodes']); toast.success('Nodo eliminado'); },
    onError:   () => toast.error('Error al eliminar nodo'),
  });

  const withCoords    = allIncidents.filter(i => i.latitude != null && i.longitude != null);
  const withoutCoords = allIncidents.filter(i => i.latitude == null || i.longitude == null);

  /* ── Inicializar / actualizar mapa ── */
  useEffect(() => {
    if (!mapRef.current) return;

    import('leaflet').then(({ default: L }) => {
      import('leaflet/dist/leaflet.css');

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

      // Limpiar capas previas
      map.eachLayer(layer => {
        if (layer._isIncidentMarker || layer._isNetworkNode) map.removeLayer(layer);
      });

      // ── Marcadores de incidencias ──
      withCoords.forEach(inc => {
        const lat = parseFloat(inc.latitude);
        const lng = parseFloat(inc.longitude);
        if (isNaN(lat) || isNaN(lng)) return;

        const color       = PRIORITY_COLORS[inc.priority] || '#3b82f6';
        const sla         = getSLALabel(inc.due_at, inc.status);
        const statusColor = STATUS_COLORS[inc.status]    || '#9ca3af';
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

      // ── Marcadores de nodos de red ──
      if (showNodes) {
        networkNodes.forEach(node => {
          const lat = parseFloat(node.latitude);
          const lng = parseFloat(node.longitude);
          if (isNaN(lat) || isNaN(lng)) return;

          const cfg = NODE_CONFIG[node.type] || NODE_CONFIG.caja;
          const pct = node.total_hilos > 0 ? Math.round((node.hilos_used / node.total_hilos) * 100) : null;
          const barColor = pct === null ? '#94a3b8' : pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';

          const hilosHtml = node.total_hilos > 0 ? `
            <div style="margin-top:6px;">
              <div style="font-size:11px;color:#64748b;margin-bottom:3px;">Hilos: ${node.hilos_used}/${node.total_hilos} (${pct}%)</div>
              <div style="height:5px;border-radius:99px;background:#e2e8f0;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:99px;"></div>
              </div>
            </div>` : '';

          const editBtn  = `<button data-node-edit="${node.id}"  style="flex:1;font-size:11px;padding:4px 6px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:5px;cursor:pointer;">✏️ Editar</button>`;
          const delBtn   = isAdmin
            ? `<button data-node-del="${node.id}" style="flex:1;font-size:11px;padding:4px 6px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:5px;cursor:pointer;">🗑 Eliminar</button>`
            : '';

          const popupHtml = `
            <div style="font-family:-apple-system,sans-serif;min-width:200px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span style="font-size:18px;">${cfg.emoji}</span>
                <div>
                  <div style="font-weight:700;font-size:13px;color:${cfg.color};">${node.name}</div>
                  <div style="font-size:11px;color:#64748b;">${cfg.label}</div>
                </div>
              </div>
              ${node.cable_type ? `<div style="font-size:12px;margin-bottom:3px;">🔌 ${node.cable_type}</div>` : ''}
              ${hilosHtml}
              ${node.description ? `<div style="font-size:12px;color:#374151;margin-top:6px;border-top:1px solid #f1f5f9;padding-top:6px;">${node.description}</div>` : ''}
              ${node.notes ? `<div style="font-size:11px;color:#64748b;margin-top:4px;font-style:italic;">${node.notes}</div>` : ''}
              <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Por: ${node.created_by_name || '—'}</div>
              <div style="display:flex;gap:6px;margin-top:8px;">${editBtn}${delBtn}</div>
            </div>`;

          const icon = L.divIcon({
            html: `<div style="width:28px;height:28px;border-radius:50%;background:${cfg.color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.35);">${cfg.emoji}</div>`,
            iconSize:   [28, 28],
            iconAnchor: [14, 14],
            className:  '',
          });

          const marker = L.marker([lat, lng], { icon }).addTo(map);
          marker._isNetworkNode = true;
          marker.bindPopup(popupHtml, { minWidth: 220 });
          marker.on('popupopen', () => {
            const editEl = document.querySelector(`[data-node-edit="${node.id}"]`);
            const delEl  = document.querySelector(`[data-node-del="${node.id}"]`);
            if (editEl) editEl.addEventListener('click', () => {
              map.closePopup();
              setNodeModal({ open: true, initial: node });
            });
            if (delEl) delEl.addEventListener('click', () => {
              if (confirm(`¿Eliminar nodo "${node.name}"?`)) {
                deleteMut.mutate(node.id);
                map.closePopup();
              }
            });
          });
        });
      }

      // Ajustar vista
      if (withCoords.length > 0 && !leafletRef.current._viewSet) {
        const group = L.featureGroup(
          withCoords.map(i => L.circleMarker([parseFloat(i.latitude), parseFloat(i.longitude)]))
        );
        map.fitBounds(group.getBounds().pad(0.2));
        leafletRef.current._viewSet = true;
      }
    });
  }, [allIncidents, networkNodes, showNodes, navigate, isAdmin]);

  useEffect(() => {
    return () => {
      if (leafletRef.current) { leafletRef.current.remove(); leafletRef.current = null; }
    };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Mapa de Incidencias" />
        <div className="page-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>

          {/* Barra de controles */}
          <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              🗺️ {withCoords.length} incidencias
            </span>

            {/* Botón nodos */}
            <button
              onClick={() => setShowNodes(v => !v)}
              style={{ fontSize: 12, background: showNodes ? '#ede9fe' : '#f8fafc', color: showNodes ? '#7c3aed' : '#64748b', border: `1px solid ${showNodes ? '#c4b5fd' : '#d1d5db'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
            >
              📡 Red {networkNodes.length > 0 ? `(${networkNodes.length})` : ''} {showNodes ? '●' : '○'}
            </button>

            {/* Registrar nuevo nodo */}
            <button
              onClick={() => setNodeModal({ open: true, initial: null })}
              style={{ fontSize: 12, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}
            >
              + Registrar punto
            </button>

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
              >
                {regeocMut.isPending ? '⏳ Geocodificando...' : '🔄 Actualizar ubicaciones'}
              </button>
            )}

            {/* Leyenda */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
              {LEGEND.map(({ label, color }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}
                </span>
              ))}
              {showNodes && Object.entries(NODE_CONFIG).map(([key, c]) => (
                <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <span style={{ fontSize: 11 }}>{c.emoji}</span>
                  <span style={{ color: c.color, fontWeight: 600 }}>{c.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Panel sin coords */}
          {showNoCoords && withoutCoords.length > 0 && (
            <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '10px 16px', flexShrink: 0, maxHeight: 180, overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                ⚠️ Incidencias sin coordenadas
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

          {/* Mapa */}
          {isLoading ? (
            <div className="loading-center">Cargando mapa...</div>
          ) : (
            <div ref={mapRef} style={{ flex: 1, zIndex: 0 }} />
          )}
        </div>
      </main>

      <BottomNav />

      {/* Modal registrar/editar nodo */}
      <NodeModal
        open={nodeModal.open}
        initial={nodeModal.initial}
        onClose={() => setNodeModal({ open: false, initial: null })}
        isAdmin={isAdmin}
      />
    </div>
  );
}
