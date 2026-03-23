import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getMapIncidents, regeocodeIncidents } from '../api/incidents.api';
import { getNetworkNodes, createNetworkNode, updateNetworkNode, deleteNetworkNode, deleteAllNetworkNodes } from '../api/network.api';
import KmzImporter from '../components/network/KmzImporter';
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
  caja:  { color: '#16a34a', bg: '#dcfce7', label: 'Caja' },
  nodo:  { color: '#7c3aed', bg: '#ede9fe', label: 'Nodo' },
  manga: { color: '#ea580c', bg: '#ffedd5', label: 'Manga' },
};

// SVG icons (24×24, stroke-based)
const NODE_ICONS = {
  caja: (color = 'currentColor', size = 24) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/>
      <path d="M12 22V12"/>
      <polyline points="3.29 7 12 12 20.71 7"/>
      <path d="m7.5 4.27 9 5.15"/>
    </svg>`,
  nodo: (color = 'currentColor', size = 24) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="16" y="16" width="6" height="6" rx="1"/>
      <rect x="2" y="16" width="6" height="6" rx="1"/>
      <rect x="9" y="2" width="6" height="6" rx="1"/>
      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/>
      <path d="M12 12V8"/>
    </svg>`,
  manga: (color = 'currentColor', size = 24) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
      fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
      <path d="M3 12a9 3 0 0 0 18 0"/>
    </svg>`,
};

// Componente React SVG para usar en JSX
function NodeIcon({ type, size = 24, color }) {
  const cfg = NODE_CONFIG[type] || NODE_CONFIG.caja;
  const c = color || cfg.color;
  return <span dangerouslySetInnerHTML={{ __html: NODE_ICONS[type]?.(c, size) || '' }} style={{ display: 'flex', alignItems: 'center' }} />;
}

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

// Hilos automáticos según tipo de cable
const CABLE_HILOS = {
  'Fibra monomodo 4H':  4,
  'Fibra monomodo 8H':  8,
  'Fibra monomodo 12H': 12,
  'Fibra monomodo 24H': 24,
  'Fibra monomodo 48H': 48,
  'Fibra monomodo 96H': 96,
  'ADSS 24H': 24,
  'ADSS 48H': 48,
  'UTP Cat6': 8,
};

// Colores TIA-598 (orden 1–12)
const TIA598 = [
  { n: 1,  nombre: 'Azul',     hex: '#1d4ed8' },
  { n: 2,  nombre: 'Naranja',  hex: '#ea580c' },
  { n: 3,  nombre: 'Verde',    hex: '#16a34a' },
  { n: 4,  nombre: 'Marrón',   hex: '#92400e' },
  { n: 5,  nombre: 'Pizarra',  hex: '#475569' },
  { n: 6,  nombre: 'Blanco',   hex: '#e2e8f0', text: '#374151' },
  { n: 7,  nombre: 'Rojo',     hex: '#dc2626' },
  { n: 8,  nombre: 'Negro',    hex: '#1e293b' },
  { n: 9,  nombre: 'Amarillo', hex: '#ca8a04' },
  { n: 10, nombre: 'Violeta',  hex: '#7c3aed' },
  { n: 11, nombre: 'Rosa',     hex: '#db2777' },
  { n: 12, nombre: 'Aqua',     hex: '#0891b2' },
];

function isFiber(cableType) {
  return cableType && (cableType.startsWith('Fibra') || cableType.startsWith('ADSS'));
}

// Genera grupos de tubos/hilos para un cable dado
function buildFiberMap(total) {
  if (!total || total === 0) return [];
  const tubes = [];
  let hilo = 1;
  let tubeIdx = 0;
  while (hilo <= total) {
    const tubeColor = TIA598[tubeIdx % 12];
    const fibers = [];
    for (let i = 0; i < 12 && hilo <= total; i++, hilo++) {
      fibers.push({ n: hilo, ...TIA598[i] });
    }
    tubes.push({ tube: tubeIdx + 1, tubeColor, fibers });
    tubeIdx++;
  }
  return tubes;
}

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
  splices: [], // [{ id, fromN, toN }]
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
      splices:     initial.splices     || [],
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
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal" style={{ maxWidth: 500 }}>

        {/* Drag handle (solo visible en mobile bottom-sheet) */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#d1d5db' }} />
        </div>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{initial?.id ? '✏️ Editar' : '📍 Registrar'} punto de red</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Caja, nodo o manga — documentar materiales</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tipo */}
          <div>
            <label style={{ marginBottom: 8 }}>Tipo de punto *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(NODE_CONFIG).map(([key, c]) => {
                const active = form.type === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: key }))}
                    style={{
                      flex: 1, minHeight: 64, borderRadius: 10, cursor: 'pointer',
                      border: `2px solid ${active ? c.color : 'var(--border)'}`,
                      background: active ? c.bg : 'var(--bg)',
                      color: active ? c.color : 'var(--text-muted)',
                      transition: 'all .15s', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px',
                    }}
                  >
                    <NodeIcon type={key} size={22} color={active ? c.color : '#94a3b8'} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nombre */}
          <label>
            Nombre / Identificador *
            <input
              value={form.name} onChange={set('name')} required maxLength={100}
              placeholder="Ej: Caja-Sur-07, Nodo-Principal-B"
              style={{ fontSize: 16 }}
            />
          </label>

          {/* GPS — acción principal en móvil */}
          <div>
            <label style={{ marginBottom: 8 }}>Ubicación GPS *</label>
            <button
              type="button"
              onClick={useGPS}
              disabled={gpsLoading}
              style={{
                width: '100%', minHeight: 56, borderRadius: 10,
                border: `2px ${form.latitude ? 'solid' : 'dashed'} ${form.latitude ? '#16a34a' : '#3b82f6'}`,
                background: form.latitude ? '#f0fdf4' : '#eff6ff',
                cursor: 'pointer', fontSize: 15, fontWeight: 700,
                color: form.latitude ? '#166534' : '#1d4ed8',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              {gpsLoading ? (
                <><span>⏳</span> Obteniendo señal GPS...</>
              ) : form.latitude ? (
                <><span>✅</span> {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)}</>
              ) : (
                <><span>📡</span> Marcar mi ubicación actual</>
              )}
            </button>
            {form.latitude && (
              <button type="button" onClick={useGPS} disabled={gpsLoading}
                style={{ marginTop: 6, width: '100%', padding: '8px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-muted)' }}>
                🔄 Actualizar GPS
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={form.latitude}  onChange={set('latitude')}  placeholder="Latitud"  style={{ flex: 1, fontSize: 13 }} />
              <input value={form.longitude} onChange={set('longitude')} placeholder="Longitud" style={{ flex: 1, fontSize: 13 }} />
            </div>
          </div>

          {/* Tipo de cable */}
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
            Tipo de cable
            <select
              value={form.cable_type}
              onChange={e => {
                const ct = e.target.value;
                const auto = CABLE_HILOS[ct];
                setForm(f => ({ ...f, cable_type: ct, total_hilos: auto !== undefined ? String(auto) : f.total_hilos }));
              }}
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

          {/* Código de colores TIA-598 — solo para fibra */}
          {isFiber(form.cable_type) && form.total_hilos > 0 && (() => {
            const tubes = buildFiberMap(Number(form.total_hilos));
            return (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  🎨 Código de colores TIA-598 — {form.total_hilos} hilos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tubes.map(tube => (
                    <div key={tube.tube}>
                      {tubes.length > 1 && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: tube.tubeColor.hex, border: '1px solid #d1d5db', display: 'inline-block' }} />
                          Tubo {tube.tube} — {tube.tubeColor.nombre}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tube.fibers.map(f => (
                          <div
                            key={f.n}
                            title={`Hilo ${f.n}: ${f.nombre}`}
                            style={{
                              width: 44, height: 44, borderRadius: 8,
                              background: f.hex,
                              border: '2px solid rgba(255,255,255,.4)',
                              boxShadow: '0 1px 4px rgba(0,0,0,.25)',
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              cursor: 'default', flexShrink: 0,
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 800, color: f.text || '#fff', lineHeight: 1 }}>{f.n}</span>
                            <span style={{ fontSize: 8, color: f.text || 'rgba(255,255,255,.85)', lineHeight: 1, marginTop: 2, textAlign: 'center' }}>{f.nombre.slice(0,4)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Registro de fusiones (solo manga) ── */}
          {form.type === 'manga' && (() => {
            const total = parseInt(form.total_hilos) || 0;
            // Genera opciones de fibra: { n, nombre, hex, text, tube }
            const fiberOptions = total > 0
              ? Array.from({ length: total }, (_, i) => {
                  const n = i + 1;
                  const color = TIA598[(n - 1) % 12];
                  const tubeIdx = Math.floor((n - 1) / 12);
                  const tubeColor = TIA598[tubeIdx % 12];
                  return { n, ...color, tube: tubeIdx + 1, tubeColor };
                })
              : [];

            function addSplice() {
              setForm(f => ({ ...f, splices: [...f.splices, { id: Date.now(), fromN: '', toN: '' }] }));
            }
            function removeSplice(id) {
              setForm(f => ({ ...f, splices: f.splices.filter(s => s.id !== id) }));
            }
            function setSplice(id, key, val) {
              setForm(f => ({ ...f, splices: f.splices.map(s => s.id === id ? { ...s, [key]: val } : s) }));
            }

            const FiberChip = ({ n }) => {
              if (!n) return null;
              const f = fiberOptions.find(o => o.n === parseInt(n));
              if (!f) return null;
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: f.hex, color: f.text || '#fff',
                  borderRadius: 6, padding: '2px 7px', fontSize: 11, fontWeight: 700,
                  border: '2px solid rgba(255,255,255,.4)',
                }}>
                  {f.n} {f.nombre}
                </span>
              );
            };

            return (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                    🔗 Registro de fusiones {form.splices.length > 0 ? `(${form.splices.length})` : ''}
                  </span>
                  <button
                    type="button" onClick={addSplice}
                    style={{ fontSize: 12, fontWeight: 700, background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                  >
                    + Agregar fusión
                  </button>
                </div>

                {total === 0 && (
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Ingresa el total de hilos arriba para poder registrar fusiones.</p>
                )}

                {form.splices.length === 0 && total > 0 && (
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Toca "+ Agregar fusión" para registrar cada empalme.</p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.splices.map((splice, idx) => {
                    const fromFiber = fiberOptions.find(o => o.n === parseInt(splice.fromN));
                    const toFiber   = fiberOptions.find(o => o.n === parseInt(splice.toN));
                    return (
                      <div key={splice.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Fusión {idx + 1}</span>
                          <button type="button" onClick={() => removeSplice(splice.id)}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Hilo origen */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>HILO A</div>
                            <select
                              value={splice.fromN}
                              onChange={e => setSplice(splice.id, 'fromN', e.target.value)}
                              style={{ width: '100%', padding: '7px 6px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: fromFiber ? fromFiber.hex : '#fff', color: fromFiber ? (fromFiber.text || '#fff') : '#374151', fontWeight: 700 }}
                            >
                              <option value="">— Seleccionar —</option>
                              {fiberOptions.map(f => (
                                <option key={f.n} value={f.n} style={{ background: f.hex, color: f.text || '#fff' }}>
                                  Hilo {f.n} — {f.nombre}{total > 12 ? ` (T${f.tube})` : ''}
                                </option>
                              ))}
                            </select>
                            {fromFiber && <FiberChip n={splice.fromN} />}
                          </div>

                          {/* Flecha */}
                          <div style={{ fontSize: 18, color: '#94a3b8', flexShrink: 0, marginTop: 14 }}>⇄</div>

                          {/* Hilo destino */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>HILO B</div>
                            <select
                              value={splice.toN}
                              onChange={e => setSplice(splice.id, 'toN', e.target.value)}
                              style={{ width: '100%', padding: '7px 6px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: toFiber ? toFiber.hex : '#fff', color: toFiber ? (toFiber.text || '#fff') : '#374151', fontWeight: 700 }}
                            >
                              <option value="">— Seleccionar —</option>
                              {fiberOptions.map(f => (
                                <option key={f.n} value={f.n} style={{ background: f.hex, color: f.text || '#fff' }}>
                                  Hilo {f.n} — {f.nombre}{total > 12 ? ` (T${f.tube})` : ''}
                                </option>
                              ))}
                            </select>
                            {toFiber && <FiberChip n={splice.toN} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Descripción */}
          <label>
            Descripción / trabajo realizado
            <textarea
              value={form.description} onChange={set('description')} rows={2} maxLength={1000}
              placeholder="Ej: Empalme de fibra, splitter 1:8 instalado..."
              style={{ fontSize: 15, resize: 'vertical' }}
            />
          </label>

          {/* Notas */}
          <label>
            Notas adicionales
            <textarea
              value={form.notes} onChange={set('notes')} rows={2} maxLength={2000}
              placeholder="Observaciones, materiales adicionales..."
              style={{ fontSize: 15, resize: 'vertical' }}
            />
          </label>

          </div>{/* end modal-body */}

          {/* Botones */}
          <div className="form-actions" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ minHeight: 48 }}>
              Cancelar
            </button>
            <button
              type="submit" disabled={isPending}
              className="btn btn-primary"
              style={{ minHeight: 48, flex: 2, background: isPending ? '#94a3b8' : cfg.color, fontSize: 15, fontWeight: 700 }}
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

  const [showNoCoords,    setShowNoCoords]    = useState(false);
  const [showIncidents,   setShowIncidents]   = useState(true);
  const [showNodes,       setShowNodes]       = useState(true);
  const [hiddenLayers,    setHiddenLayers]    = useState(new Set()); // layer names that are OFF
  const [nodeModal,       setNodeModal]       = useState({ open: false, initial: null });
  const [showKmzImport,   setShowKmzImport]   = useState(false);

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

  const deleteAllMut = useMutation({
    mutationFn: deleteAllNetworkNodes,
    onSuccess: (res) => { qc.invalidateQueries(['network-nodes']); toast.success(`🗑 ${res.deleted} nodos eliminados`); },
    onError:   () => toast.error('Error al borrar la red'),
  });

  const withCoords    = allIncidents.filter(i => i.latitude != null && i.longitude != null);
  const withoutCoords = allIncidents.filter(i => i.latitude == null || i.longitude == null);

  // Capas únicas de nodos de red (de importaciones KMZ)
  const networkLayers = [...new Set(networkNodes.map(n => n.layer).filter(Boolean))].sort();
  // Nodos visibles según capas activas (capas ocultas se excluyen; nodos sin capa siempre visibles)
  const visibleNodes  = networkNodes.filter(n => !n.layer || !hiddenLayers.has(n.layer));

  function toggleLayer(name) {
    setHiddenLayers(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

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
      if (showIncidents) withCoords.forEach(inc => {
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
        visibleNodes.forEach(node => {
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
                <div style="width:30px;height:30px;border-radius:50%;background:${cfg.color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${NODE_ICONS[node.type]?.('#fff', 16) || ''}</div>
                <div>
                  <div style="font-weight:700;font-size:13px;color:${cfg.color};">${node.name}</div>
                  <div style="font-size:11px;color:#64748b;">${cfg.label}</div>
                </div>
              </div>
              ${node.cable_type ? `<div style="font-size:12px;margin-bottom:3px;">🔌 ${node.cable_type}</div>` : ''}
              ${hilosHtml}
              ${node.description ? `<div style="font-size:12px;color:#374151;margin-top:6px;border-top:1px solid #f1f5f9;padding-top:6px;">${node.description}</div>` : ''}
              ${node.notes ? `<div style="font-size:11px;color:#64748b;margin-top:4px;font-style:italic;">${node.notes}</div>` : ''}
              ${(() => {
                const sp = Array.isArray(node.splices) ? node.splices.filter(s => s.fromN && s.toN) : [];
                if (!sp.length) return '';
                const chips = sp.map(s => {
                  const a = TIA598[(parseInt(s.fromN)-1)%12];
                  const b = TIA598[(parseInt(s.toN)-1)%12];
                  return `<span style="display:inline-flex;align-items:center;gap:3px;margin:2px;">
                    <span style="background:${a.hex};color:${a.text||'#fff'};border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;">${s.fromN} ${a.nombre}</span>
                    <span style="color:#94a3b8;font-size:10px;">⇄</span>
                    <span style="background:${b.hex};color:${b.text||'#fff'};border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700;">${s.toN} ${b.nombre}</span>
                  </span>`;
                }).join('');
                return `<div style="margin-top:8px;border-top:1px solid #f1f5f9;padding-top:6px;">
                  <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;">🔗 Fusiones (${sp.length})</div>
                  <div style="display:flex;flex-wrap:wrap;">${chips}</div>
                </div>`;
              })()}
              ${node.layer ? `<div style="font-size:10px;color:#7c3aed;margin-top:4px;font-weight:600;">📂 ${node.layer}</div>` : ''}
              <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Por: ${node.created_by_name || '—'}</div>
              <div style="display:flex;gap:6px;margin-top:8px;">${editBtn}${delBtn}</div>
            </div>`;

          const icon = L.divIcon({
            html: `<div style="width:32px;height:32px;border-radius:50%;background:${cfg.color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4);">${NODE_ICONS[node.type]?.('#fff', 18) || ''}</div>`,
            iconSize:   [32, 32],
            iconAnchor: [16, 16],
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
  }, [allIncidents, visibleNodes, showIncidents, showNodes, navigate, isAdmin]);

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
            {/* Botón incidencias */}
            <button
              onClick={() => setShowIncidents(v => !v)}
              style={{ fontSize: 12, background: showIncidents ? '#eff6ff' : '#f8fafc', color: showIncidents ? '#2563eb' : '#64748b', border: `1px solid ${showIncidents ? '#93c5fd' : '#d1d5db'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
            >
              🎫 Incidencias {withCoords.length > 0 ? `(${withCoords.length})` : ''} {showIncidents ? '●' : '○'}
            </button>

            {/* Botón nodos */}
            <button
              onClick={() => setShowNodes(v => !v)}
              style={{ fontSize: 12, background: showNodes ? '#ede9fe' : '#f8fafc', color: showNodes ? '#7c3aed' : '#64748b', border: `1px solid ${showNodes ? '#c4b5fd' : '#d1d5db'}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
            >
              📡 Red {networkNodes.length > 0 ? `(${networkNodes.length})` : ''} {showNodes ? '●' : '○'}
            </button>

            {/* Chips de capas KMZ — visibles cuando Red está activo y hay capas */}
            {showNodes && networkLayers.map(layer => {
              const isActive = !hiddenLayers.has(layer);
              const count    = networkNodes.filter(n => n.layer === layer).length;
              const label    = layer.length > 18 ? layer.slice(0, 16) + '…' : layer;
              return (
                <button
                  key={layer}
                  onClick={() => toggleLayer(layer)}
                  title={layer}
                  style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                    background: isActive ? '#f0fdf4' : '#f8fafc',
                    color:      isActive ? '#16a34a' : '#94a3b8',
                    border:     `1px solid ${isActive ? '#86efac' : '#d1d5db'}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  📂 {label} ({count}) {isActive ? '●' : '○'}
                </button>
              );
            })}

            {/* Registrar nuevo nodo */}
            <button
              onClick={() => setNodeModal({ open: true, initial: null })}
              style={{ fontSize: 12, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}
            >
              + Registrar punto
            </button>

            {/* Importar KMZ — solo admin/supervisor */}
            {isAdmin && (
              <button
                onClick={() => setShowKmzImport(true)}
                style={{ fontSize: 12, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 700 }}
              >
                📂 Importar KMZ
              </button>
            )}

            {/* Borrar toda la red — solo admin */}
            {user?.role === 'admin' && networkNodes.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`¿Borrar los ${networkNodes.length} puntos de red? Esta acción no se puede deshacer.`)) {
                    deleteAllMut.mutate();
                  }
                }}
                disabled={deleteAllMut.isPending}
                style={{ fontSize: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
              >
                {deleteAllMut.isPending ? '⏳' : '🗑'} Borrar red ({networkNodes.length})
              </button>
            )}

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
                  <NodeIcon type={key} size={14} color={c.color} />
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

      {/* KMZ Importer */}
      {showKmzImport && <KmzImporter onClose={() => setShowKmzImport(false)} />}

      {/* FAB móvil — botón flotante para registrar punto rápido */}
      <button
        onClick={() => setNodeModal({ open: true, initial: null })}
        aria-label="Registrar punto de red"
        style={{
          position: 'fixed', bottom: 76, right: 16, zIndex: 2000,
          width: 56, height: 56, borderRadius: '50%',
          background: '#16a34a', color: '#fff', border: 'none',
          fontSize: 26, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(22,163,74,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        +
      </button>

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
