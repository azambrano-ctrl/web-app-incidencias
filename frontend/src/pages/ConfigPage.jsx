import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { importClients, getClientStats } from '../api/clients.api';
import { getUsers, createUser, updateUser, deactivateUser, resetPassword } from '../api/users.api';
import { getSettings, saveSettings, testEmail, testWhatsApp, getVapidKey, pushSubscribe, pushUnsubscribe } from '../api/settings.api';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api/checklist.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

const EMPTY_TECH = { name: '', email: '', password: '', phone: '', role: 'technician' };
const DEFAULT_WA_TEMPLATE = '{"token":"{token}","to":"{to}","body":"{message}"}';
const EMPTY_TEMPLATE = { name: '', items: [''] };

export default function ConfigPage() {
  const fileRef = useRef();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Clientes
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  // Técnicos
  const [showTechForm, setShowTechForm] = useState(false);
  const [editingTech, setEditingTech] = useState(null);
  const [techForm, setTechForm] = useState(EMPTY_TECH);
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState('');

  // Notificaciones
  const [notifTab, setNotifTab] = useState('email');
  const [emailCfg, setEmailCfg] = useState({
    email_enabled: '0', email_host: '', email_port: '587', email_secure: '0',
    email_user: '', email_pass: '', email_from_name: 'IncidenciasISP', email_from_email: '',
  });
  const [waCfg, setWaCfg] = useState({
    whatsapp_enabled: '0', whatsapp_api_url: '', whatsapp_token: '', whatsapp_body_template: DEFAULT_WA_TEMPLATE,
  });
  const [pushCfg, setPushCfg] = useState({ push_enabled: '0' });
  const [extCfg, setExtCfg] = useState({ ext_api_enabled: '0', ext_api_url: '', ext_api_user: '', ext_api_pass: '' });
  const [savingExt, setSavingExt] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testWaTo, setTestWaTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [pushState, setPushState] = useState('idle'); // idle | requesting | subscribed | unsupported

  // Escalation
  const [escalationHours, setEscalationHours] = useState('4');
  const [savingEscalation, setSavingEscalation] = useState(false);
  const [defaultCity, setDefaultCity] = useState('La Troncal, Ecuador');
  const [savingCity, setSavingCity] = useState(false);
  const [mapBbox, setMapBbox] = useState('');
  const [savingBbox, setSavingBbox] = useState(false);
  const [googleMapsKey, setGoogleMapsKey] = useState('');
  const [savingGoogleKey, setSavingGoogleKey] = useState(false);

  // Checklist templates
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE);

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['client-stats'],
    queryFn: getClientStats,
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['technicians'],
    queryFn: () => getUsers('technician'),
  });

  // Checklist templates
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['checklist-templates'],
    queryFn: getTemplates,
    enabled: ['admin', 'supervisor'].includes(user?.role),
  });

  // Cargar ajustes de notificaciones
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: user?.role === 'admin',
  });

  useEffect(() => {
    if (!settingsData) return;
    const s = settingsData;
    setEmailCfg(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('email_'))) }));
    setWaCfg(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('whatsapp_'))) }));
    setPushCfg(prev => ({ ...prev, push_enabled: s.push_enabled || '0' }));
    setExtCfg(prev => ({ ...prev, ...Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('ext_api_'))) }));
    if (s.escalation_hours) setEscalationHours(s.escalation_hours);
    if (s.default_city) setDefaultCity(s.default_city);
    if (s.map_bbox) setMapBbox(s.map_bbox);
    if (s.google_maps_key) setGoogleMapsKey(s.google_maps_key);
  }, [settingsData]);

  // Verificar si push ya está suscrito
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported');
      return;
    }
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
      if (sub) setPushState('subscribed');
    }).catch(() => {});
  }, []);

  const setTF = (k, v) => setTechForm(f => ({ ...f, [k]: v }));
  const setEC = (k, v) => setEmailCfg(f => ({ ...f, [k]: v }));
  const setWA = (k, v) => setWaCfg(f => ({ ...f, [k]: v }));
  const setExt = (k, v) => setExtCfg(f => ({ ...f, [k]: v }));

  const openCreate = () => { setTechForm(EMPTY_TECH); setEditingTech(null); setShowTechForm(true); };
  const openEdit = (t) => { setTechForm({ ...t, password: '' }); setEditingTech(t); setShowTechForm(true); };

  const saveTechMut = useMutation({
    mutationFn: (data) => editingTech ? updateUser(editingTech.id, data) : createUser(data),
    onSuccess: () => {
      toast.success(editingTech ? 'Técnico actualizado' : 'Técnico creado');
      setShowTechForm(false);
      qc.invalidateQueries(['technicians']);
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al guardar'),
  });

  const deactivateMut = useMutation({
    mutationFn: (id) => deactivateUser(id),
    onSuccess: () => { toast.success('Técnico desactivado'); qc.invalidateQueries(['technicians']); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const resetMut = useMutation({
    mutationFn: () => resetPassword(resetId, newPass),
    onSuccess: () => { toast.success('Contraseña restablecida'); setResetId(null); setNewPass(''); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  // Template mutations
  const saveTemplateMut = useMutation({
    mutationFn: (data) => editingTemplate
      ? updateTemplate(editingTemplate.id, data)
      : createTemplate(data),
    onSuccess: () => {
      toast.success(editingTemplate ? 'Template actualizado' : 'Template creado');
      setShowTemplateForm(false);
      setEditingTemplate(null);
      setTemplateForm(EMPTY_TEMPLATE);
      refetchTemplates();
    },
    onError: e => toast.error(e.response?.data?.error || 'Error al guardar template'),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: (id) => deleteTemplate(id),
    onSuccess: () => { toast.success('Template eliminado'); refetchTemplates(); },
    onError: e => toast.error(e.response?.data?.error || 'Error'),
  });

  const openCreateTemplate = () => {
    setTemplateForm(EMPTY_TEMPLATE);
    setEditingTemplate(null);
    setShowTemplateForm(true);
  };

  const openEditTemplate = (t) => {
    setTemplateForm({ name: t.name, items: t.items });
    setEditingTemplate(t);
    setShowTemplateForm(true);
  };

  const addTemplateItem = () => setTemplateForm(f => ({ ...f, items: [...f.items, ''] }));
  const updateTemplateItem = (idx, val) => setTemplateForm(f => {
    const items = [...f.items];
    items[idx] = val;
    return { ...f, items };
  });
  const removeTemplateItem = (idx) => setTemplateForm(f => ({
    ...f,
    items: f.items.filter((_, i) => i !== idx)
  }));

  // ── Guardar API externa ──
  const handleSaveExt = async () => {
    setSavingExt(true);
    try {
      await saveSettings(extCfg);
      toast.success('API externa guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingExt(false); }
  };

  // ── Guardar ajustes de notificaciones ──
  const handleSaveNotif = async () => {
    setSavingNotif(true);
    try {
      await saveSettings({ ...emailCfg, ...waCfg, ...pushCfg });
      toast.success('Ajustes guardados');
      qc.invalidateQueries(['settings']);
    } catch { toast.error('Error al guardar ajustes'); }
    finally { setSavingNotif(false); }
  };

  // ── Guardar umbral de escalamiento ──
  const handleSaveEscalation = async () => {
    setSavingEscalation(true);
    try {
      await saveSettings({ escalation_hours: escalationHours });
      toast.success('Umbral de escalamiento guardado');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingEscalation(false); }
  };

  const handleSaveCity = async () => {
    setSavingCity(true);
    try {
      await saveSettings({ default_city: defaultCity });
      toast.success('Ciudad por defecto guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingCity(false); }
  };

  const handleSaveBbox = async () => {
    setSavingBbox(true);
    try {
      await saveSettings({ map_bbox: mapBbox });
      toast.success('Área del mapa guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingBbox(false); }
  };

  const handleSaveGoogleKey = async () => {
    setSavingGoogleKey(true);
    try {
      await saveSettings({ google_maps_key: googleMapsKey });
      toast.success('API key de Google Maps guardada');
    } catch { toast.error('Error al guardar'); }
    finally { setSavingGoogleKey(false); }
  };

  // ── Probar email ──
  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      await testEmail(testEmailTo || user?.email, emailCfg.email_enabled === '1' ? null : emailCfg);
      toast.success('Email de prueba enviado');
    } catch (e) { toast.error(e.response?.data?.error || e.message || 'Error'); }
    finally { setTestingEmail(false); }
  };

  // ── Probar WhatsApp ──
  const handleTestWa = async () => {
    if (!testWaTo) { toast.error('Ingresa un número de destino'); return; }
    setTestingWa(true);
    try {
      await testWhatsApp(testWaTo, waCfg.whatsapp_enabled === '1' ? null : waCfg);
      toast.success('Mensaje WhatsApp enviado');
    } catch (e) { toast.error(e.response?.data?.error || e.message || 'Error'); }
    finally { setTestingWa(false); }
  };

  // ── Suscribir / desuscribir Push ──
  const handlePushToggle = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Tu navegador no soporta notificaciones push'); return;
    }
    setPushState('requesting');
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await existing.unsubscribe();
        await pushUnsubscribe(existing.endpoint);
        setPushState('idle');
        toast.success('Notificaciones push desactivadas en este dispositivo');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { toast.error('Permiso denegado'); setPushState('idle'); return; }

      const { publicKey } = await getVapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await pushSubscribe(sub.toJSON());
      setPushState('subscribed');
      toast.success('Notificaciones push activadas en este dispositivo');
    } catch (e) { toast.error(e.message || 'Error al configurar push'); setPushState('idle'); }
  };

  // ── Clientes ──
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        let headerRow = -1;
        for (let i = 0; i < raw.length; i++) {
          if (raw[i].includes('ID') || raw[i].includes('IDENTIFICACION')) { headerRow = i; break; }
        }
        if (headerRow === -1) { toast.error('No se encontraron encabezados válidos'); return; }
        const headers = raw[headerRow].map(h => String(h).trim().toUpperCase());
        const dataRows = raw.slice(headerRow + 1).filter(r => r.some(c => c !== ''));
        const rows = dataRows.map(r => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ''; });
          return obj;
        });
        setPreview({ rows, filename: file.name, total: rows.length });
        toast.success(`Archivo leído: ${rows.length.toLocaleString()} clientes`);
      } catch (err) { toast.error('Error al leer el archivo: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const res = await importClients(preview.rows);
      toast.success(`✅ ${res.imported.toLocaleString()} clientes importados`);
      setPreview(null);
      refetchStats();
      qc.invalidateQueries(['client-stats']);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al importar');
    } finally { setImporting(false); }
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Configuración" />
        <div className="page-body">

          {/* ── TÉCNICOS ── */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Técnicos</h3>
              <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Nuevo técnico</button>
            </div>
            {technicians.length === 0 ? (
              <p className="empty-msg">No hay técnicos registrados</p>
            ) : (
              <div className="table-wrap">
                <table className="incidents-table">
                  <thead>
                    <tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {technicians.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 600 }}>
                          <span className="tech-avatar-sm">{t.name[0]}</span>
                          {t.name}
                        </td>
                        <td>{t.email}</td>
                        <td>{t.phone || '—'}</td>
                        <td>
                          <span className={`badge ${t.active ? 'badge-green' : 'badge-gray'}`}>
                            {t.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(t)}>Editar</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setResetId(t.id); setNewPass(''); }}>Contraseña</button>
                            {t.active === 1 && (
                              <button className="btn btn-sm btn-danger"
                                onClick={() => { if (confirm(`¿Desactivar a ${t.name}?`)) deactivateMut.mutate(t.id); }}>
                                Desactivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── ESCALAMIENTO AUTOMÁTICO ── */}
          {user?.role === 'admin' && (
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>🔺 Escalamiento automático</h3>
              <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>
                Si una incidencia permanece en estado "abierta" o "asignada" sin pasar a "en progreso" durante este tiempo, se escalará automáticamente a supervisores y administradores.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Umbral de escalamiento:</span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={escalationHours}
                    onChange={e => setEscalationHours(e.target.value)}
                    style={{ width: 80 }}
                  />
                  <span style={{ color: '#64748b' }}>horas</span>
                </label>
                <button className="btn btn-primary btn-sm" onClick={handleSaveEscalation} disabled={savingEscalation}>
                  {savingEscalation ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              <p style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                Valor predeterminado: 4 horas. Rango válido: 1–168 horas.
              </p>
            </div>
          )}

          {/* ── CIUDAD / MAPA ── */}
          {user?.role === 'admin' && (
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>🗺️ Geocodificación del mapa</h3>
              <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>
                Configura cómo se buscan las direcciones en el mapa. Con la <strong>API key de Google Maps</strong> la
                precisión mejora enormemente. Sin ella se usa OpenStreetMap como respaldo.
              </p>

              {/* Google Maps API Key */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: '0 0 4px' }}>
                  ⭐ Google Maps Geocoding API (recomendado)
                </p>
                <p style={{ fontSize: 12, color: '#15803d', margin: '0 0 10px' }}>
                  Mucho más preciso para direcciones locales de Ecuador. Gratis hasta ~40.000 búsquedas/mes.{' '}
                  <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noreferrer" style={{ color: '#15803d', fontWeight: 600 }}>
                    Obtener API key ↗
                  </a>
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 13 }}>API Key:</span>
                    <input
                      type="password"
                      value={googleMapsKey}
                      onChange={e => setGoogleMapsKey(e.target.value)}
                      placeholder="AIzaSy..."
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </label>
                  <button className="btn btn-primary btn-sm" onClick={handleSaveGoogleKey} disabled={savingGoogleKey}>
                    {savingGoogleKey ? 'Guardando...' : 'Guardar key'}
                  </button>
                </div>
                {googleMapsKey && (
                  <p style={{ fontSize: 11, color: '#166534', margin: '6px 0 0' }}>✅ API key configurada — se usará Google Maps para geocodificar</p>
                )}
              </div>

              {/* Ciudad */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Ciudad por defecto:</span>
                  <input
                    value={defaultCity}
                    onChange={e => setDefaultCity(e.target.value)}
                    placeholder="Ej: La Troncal"
                    style={{ flex: 1 }}
                  />
                </label>
                <button className="btn btn-primary btn-sm" onClick={handleSaveCity} disabled={savingCity}>
                  {savingCity ? 'Guardando...' : 'Guardar ciudad'}
                </button>
              </div>

              {/* Bounding box */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 240 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Área del mapa (bbox):</span>
                  <input
                    value={mapBbox}
                    onChange={e => setMapBbox(e.target.value)}
                    placeholder="minLon,maxLat,maxLon,minLat  ej: -79.45,-2.35,-79.25,-2.55"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                  />
                </label>
                <button className="btn btn-primary btn-sm" onClick={handleSaveBbox} disabled={savingBbox}>
                  {savingBbox ? 'Guardando...' : 'Guardar área'}
                </button>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Para La Troncal usa: <code>-79.45,-2.35,-79.25,-2.55</code> · Obtén las coordenadas de tu zona en{' '}
                <a href="https://boundingbox.klokantech.com" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                  boundingbox.klokantech.com
                </a>.<br />
                Después de guardar, ve al Mapa → "🔄 Actualizar ubicaciones" para re-geocodificar las incidencias existentes.
              </p>
            </div>
          )}

          {/* ── CHECKLIST TEMPLATES ── */}
          {['admin', 'supervisor'].includes(user?.role) && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0 }}>✅ Templates de checklist</h3>
                  <p style={{ color: '#64748b', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
                    Define listas de verificación reutilizables para resolver incidencias.
                  </p>
                </div>
                {user?.role === 'admin' && (
                  <button className="btn btn-primary btn-sm" onClick={openCreateTemplate}>+ Nuevo template</button>
                )}
              </div>
              {templates.length === 0 ? (
                <p className="empty-msg">No hay templates de checklist</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{
                      border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px',
                      background: t.active ? '#fafafa' : '#f8f8f8',
                      opacity: t.active ? 1 : 0.6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            {t.name}
                            {!t.active && <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(inactivo)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>
                            {t.items?.length || 0} ítem{t.items?.length !== 1 ? 's' : ''}:
                            {' '}{(t.items || []).slice(0, 3).join(', ')}{t.items?.length > 3 ? '...' : ''}
                          </div>
                        </div>
                        {user?.role === 'admin' && (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => openEditTemplate(t)}>Editar</button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => { if (confirm(`¿Eliminar template "${t.name}"?`)) deleteTemplateMut.mutate(t.id); }}
                            >
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NOTIFICACIONES ── */}
          {user?.role === 'admin' && (
            <div className="card">
              <h3 style={{ marginBottom: 16 }}>Notificaciones externas</h3>
              <p className="config-desc" style={{ marginBottom: 16 }}>
                Cuando un técnico no está conectado al sistema, estas notificaciones lo alertan fuera de la app.
              </p>

              {/* Tabs */}
              <div className="notif-tabs">
                <button className={`notif-tab ${notifTab === 'email' ? 'active' : ''}`} onClick={() => setNotifTab('email')}>
                  📧 Email SMTP
                </button>
                <button className={`notif-tab ${notifTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setNotifTab('whatsapp')}>
                  💬 WhatsApp API
                </button>
                <button className={`notif-tab ${notifTab === 'push' ? 'active' : ''}`} onClick={() => setNotifTab('push')}>
                  🔔 Push (Web)
                </button>
              </div>

              {/* ── Tab Email ── */}
              {notifTab === 'email' && (
                <div className="notif-panel">
                  <div className="notif-toggle-row">
                    <label className="toggle-label">
                      <input type="checkbox" checked={emailCfg.email_enabled === '1'}
                        onChange={e => setEC('email_enabled', e.target.checked ? '1' : '0')} />
                      <span className="toggle-slider" />
                      Activar notificaciones por email
                    </label>
                  </div>
                  <div className="notif-grid">
                    <label>Servidor SMTP (host)
                      <input value={emailCfg.email_host} onChange={e => setEC('email_host', e.target.value)}
                        placeholder="smtp.gmail.com" />
                    </label>
                    <label>Puerto
                      <input value={emailCfg.email_port} onChange={e => setEC('email_port', e.target.value)}
                        placeholder="587" type="number" />
                    </label>
                    <label>Usuario / Correo
                      <input value={emailCfg.email_user} onChange={e => setEC('email_user', e.target.value)}
                        placeholder="tu@gmail.com" />
                    </label>
                    <label>Contraseña / App Password
                      <input type="password" value={emailCfg.email_pass} onChange={e => setEC('email_pass', e.target.value)}
                        placeholder="••••••••" />
                    </label>
                    <label>Nombre remitente
                      <input value={emailCfg.email_from_name} onChange={e => setEC('email_from_name', e.target.value)}
                        placeholder="IncidenciasISP" />
                    </label>
                    <label>Correo remitente
                      <input value={emailCfg.email_from_email} onChange={e => setEC('email_from_email', e.target.value)}
                        placeholder="noreply@empresa.com" />
                    </label>
                  </div>
                  <div className="notif-encrypt-row">
                    <label className="check-label">
                      <input type="checkbox" checked={emailCfg.email_secure === '1'}
                        onChange={e => setEC('email_secure', e.target.checked ? '1' : '0')} />
                      Usar SSL/TLS (puerto 465)
                    </label>
                  </div>
                  <div className="notif-help">
                    <strong>Gmail:</strong> Usa App Password en <em>Seguridad → Contraseñas de aplicación</em>.<br />
                    Host: <code>smtp.gmail.com</code> · Puerto: <code>587</code> · SSL: desactivado
                  </div>
                  <div className="notif-actions">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                      <input value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)}
                        placeholder={`Probar en: ${user?.email || 'correo@ejemplo.com'}`}
                        style={{ flex: 1 }} />
                      <button className="btn btn-secondary" onClick={handleTestEmail} disabled={testingEmail}>
                        {testingEmail ? 'Enviando...' : 'Enviar prueba'}
                      </button>
                    </div>
                    <button className="btn btn-primary" onClick={handleSaveNotif} disabled={savingNotif}>
                      {savingNotif ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tab WhatsApp ── */}
              {notifTab === 'whatsapp' && (
                <div className="notif-panel">
                  <div className="notif-toggle-row">
                    <label className="toggle-label">
                      <input type="checkbox" checked={waCfg.whatsapp_enabled === '1'}
                        onChange={e => setWA('whatsapp_enabled', e.target.checked ? '1' : '0')} />
                      <span className="toggle-slider" />
                      Activar notificaciones por WhatsApp
                    </label>
                  </div>
                  <div className="notif-grid">
                    <label style={{ gridColumn: '1/-1' }}>URL del API de WhatsApp
                      <input value={waCfg.whatsapp_api_url} onChange={e => setWA('whatsapp_api_url', e.target.value)}
                        placeholder="https://api.ultramsg.com/instance_id/messages/chat" />
                    </label>
                    <label style={{ gridColumn: '1/-1' }}>Token / API Key
                      <input value={waCfg.whatsapp_token} onChange={e => setWA('whatsapp_token', e.target.value)}
                        placeholder="tu_token_aqui" />
                    </label>
                    <label style={{ gridColumn: '1/-1' }}>Template del cuerpo JSON
                      <textarea value={waCfg.whatsapp_body_template}
                        onChange={e => setWA('whatsapp_body_template', e.target.value)}
                        rows={3} style={{ fontFamily: 'monospace', fontSize: 12 }}
                        placeholder={'{"token":"{token}","to":"{to}","body":"{message}"}'} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Variables: <code>{'{token}'}</code> <code>{'{to}'}</code> <code>{'{message}'}</code>
                      </span>
                    </label>
                  </div>
                  <div className="notif-help">
                    Compatible con <strong>UltraMsg</strong>, <strong>WhatsMate</strong>, <strong>WAHA</strong> y cualquier API HTTP.<br />
                    El número del técnico debe estar en formato internacional: <code>+50499999999</code>
                  </div>
                  <div className="notif-actions">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                      <input value={testWaTo} onChange={e => setTestWaTo(e.target.value)}
                        placeholder="+50499999999" style={{ flex: 1 }} />
                      <button className="btn btn-secondary" onClick={handleTestWa} disabled={testingWa}>
                        {testingWa ? 'Enviando...' : 'Enviar prueba'}
                      </button>
                    </div>
                    <button className="btn btn-primary" onClick={handleSaveNotif} disabled={savingNotif}>
                      {savingNotif ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Tab Push ── */}
              {notifTab === 'push' && (
                <div className="notif-panel">
                  <div className="notif-toggle-row">
                    <label className="toggle-label">
                      <input type="checkbox" checked={pushCfg.push_enabled === '1'}
                        onChange={e => setPushCfg(p => ({ ...p, push_enabled: e.target.checked ? '1' : '0' }))} />
                      <span className="toggle-slider" />
                      Activar notificaciones push del sistema
                    </label>
                  </div>

                  <div className="push-info-box">
                    <div className="push-info-icon">🔔</div>
                    <div>
                      <strong>Notificaciones push del navegador</strong>
                      <p>Cuando el técnico tiene el sistema abierto en su teléfono o PC, recibirá notificaciones aunque la pantalla esté bloqueada.</p>
                      <p style={{ marginTop: 8 }}>Cada técnico debe activar las notificaciones en su dispositivo desde su perfil o desde aquí si es admin.</p>
                    </div>
                  </div>

                  {pushState === 'unsupported' ? (
                    <div className="notif-help" style={{ color: '#ef4444' }}>
                      Tu navegador no soporta notificaciones push. Usa Chrome, Firefox o Edge modernos.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                      <button
                        className={`btn ${pushState === 'subscribed' ? 'btn-danger' : 'btn-primary'}`}
                        onClick={handlePushToggle}
                        disabled={pushState === 'requesting'}
                      >
                        {pushState === 'requesting' ? 'Configurando...'
                          : pushState === 'subscribed' ? '🔕 Desactivar push en este dispositivo'
                          : '🔔 Activar push en este dispositivo'}
                      </button>
                      {pushState === 'subscribed' && (
                        <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>
                          ✓ Activo en este dispositivo
                        </span>
                      )}
                    </div>
                  )}

                  <div className="notif-help" style={{ marginTop: 16 }}>
                    Las VAPID keys se generan automáticamente al activar push.<br />
                    Para que los técnicos reciban push, deben abrir el sistema en su teléfono y aceptar el permiso de notificaciones.
                  </div>

                  <div className="notif-actions" style={{ marginTop: 16 }}>
                    <button className="btn btn-primary" onClick={handleSaveNotif} disabled={savingNotif}>
                      {savingNotif ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── API EXTERNA ── */}
          {user?.role === 'admin' && (
            <div className="card">
              <h3>🔗 API Externa (Sistema externo)</h3>
              <p style={{ color: '#64748b', marginBottom: 16 }}>
                Cuando se crea una incidencia en este sistema, se enviará automáticamente al sistema externo configurado.
              </p>
              <div style={{ marginBottom: 16 }}>
                <label className="toggle-label">
                  <input type="checkbox" checked={extCfg.ext_api_enabled === '1'}
                    onChange={e => setExt('ext_api_enabled', e.target.checked ? '1' : '0')} />
                  <span className="toggle-slider" />
                  Activar integración con API externa
                </label>
              </div>
              <div className="notif-grid">
                <label>URL base del sistema externo
                  <input value={extCfg.ext_api_url} onChange={e => setExt('ext_api_url', e.target.value)}
                    placeholder="http://3.220.31.246:5000" />
                </label>
                <label>Usuario (email)
                  <input value={extCfg.ext_api_user} onChange={e => setExt('ext_api_user', e.target.value)}
                    placeholder="troncalnet@lsfcloud.com" />
                </label>
                <label>Contraseña
                  <input type="password" value={extCfg.ext_api_pass} onChange={e => setExt('ext_api_pass', e.target.value)}
                    placeholder="••••••••" />
                </label>
              </div>
              <div className="notif-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={handleSaveExt} disabled={savingExt}>
                  {savingExt ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* ── BASE DE CLIENTES ── */}
          <div className="card">
            <h3>Base de clientes</h3>
            <div className="config-stats">
              <div className="config-stat">
                <span className="config-stat-number">{stats?.total?.toLocaleString() || 0}</span>
                <span className="config-stat-label">Clientes registrados</span>
              </div>
              {stats?.sectors?.slice(0, 5).map(s => (
                <div key={s.sector} className="config-stat">
                  <span className="config-stat-number">{s.count.toLocaleString()}</span>
                  <span className="config-stat-label">{s.sector || 'Sin sector'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── IMPORTAR CLIENTES ── */}
          <div className="card">
            <h3>Importar base de clientes</h3>
            <p className="config-desc">
              Carga un archivo <strong>.xls</strong> o <strong>.xlsx</strong> con los clientes activos.
              Encabezados detectados: <code>ID, IDENTIFICACION, NOMBRE1, NOMBRE2, APELLIDO1, APELLIDO2, RAZON_SOCIAL, DIRECCION, CELULAR1, CELULAR2, EMAIL, SECTOR</code>.
            </p>
            <p className="config-warn">⚠️ La importación <strong>reemplaza</strong> la base de clientes existente.</p>
            <div className="import-zone" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" onChange={handleFile} style={{ display: 'none' }} />
              <span className="import-icon">📂</span>
              <span className="import-text">Haz clic o arrastra aquí tu archivo Excel</span>
              <span className="import-hint">.xls, .xlsx o .csv</span>
            </div>
            {preview && (
              <div className="import-preview">
                <div className="import-preview-header">
                  <div>
                    <strong>📄 {preview.filename}</strong>
                    <span className="import-preview-count">{preview.total.toLocaleString()} clientes detectados</span>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => setPreview(null)}>✕ Cancelar</button>
                </div>
                <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto', marginTop: 12 }}>
                  <table className="incidents-table">
                    <thead>
                      <tr><th>ID</th><th>Identificación</th><th>Razón Social / Nombre</th><th>Dirección</th><th>Celular</th><th>Sector</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 8).map((r, i) => (
                        <tr key={i}>
                          <td>{r.ID}</td>
                          <td>{r.IDENTIFICACION}</td>
                          <td>{r.RAZON_SOCIAL || [r.NOMBRE1, r.NOMBRE2, r.APELLIDO1, r.APELLIDO2].filter(Boolean).join(' ')}</td>
                          <td>{r.DIRECCION}</td>
                          <td>{r.CELULAR1}</td>
                          <td>{r.SECTOR}</td>
                        </tr>
                      ))}
                      {preview.total > 8 && (
                        <tr><td colSpan={6} className="table-empty">... y {(preview.total - 8).toLocaleString()} registros más</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                    {importing ? 'Importando...' : `Importar ${preview.total.toLocaleString()} clientes`}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* ── MODAL TÉCNICO ── */}
      {showTechForm && (
        <div className="modal-overlay" onClick={() => setShowTechForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTech ? 'Editar técnico' : 'Nuevo técnico'}</h3>
              <button className="modal-close" onClick={() => setShowTechForm(false)}>✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); saveTechMut.mutate(techForm); }} className="incident-form">
              <div className="form-row">
                <label>Nombre completo *
                  <input value={techForm.name} onChange={e => setTF('name', e.target.value)} required placeholder="Ej: Juan Pérez" />
                </label>
              </div>
              <div className="form-row">
                <label>Correo electrónico *
                  <input type="email" value={techForm.email} onChange={e => setTF('email', e.target.value)} required placeholder="tecnico@empresa.com" />
                </label>
              </div>
              {!editingTech && (
                <div className="form-row">
                  <label>Contraseña *
                    <input type="password" value={techForm.password} onChange={e => setTF('password', e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
                  </label>
                </div>
              )}
              <div className="form-row">
                <label>Teléfono (para WhatsApp)
                  <input value={techForm.phone} onChange={e => setTF('phone', e.target.value)} placeholder="+50499999999" />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTechForm(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saveTechMut.isPending}>
                  {saveTechMut.isPending ? 'Guardando...' : (editingTech ? 'Guardar cambios' : 'Crear técnico')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL CONTRASEÑA ── */}
      {resetId && (
        <div className="modal-overlay" onClick={() => setResetId(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Restablecer contraseña</h3>
              <button className="modal-close" onClick={() => setResetId(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Nueva contraseña
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} minLength={6} placeholder="Mínimo 6 caracteres" />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setResetId(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={newPass.length < 6 || resetMut.isPending} onClick={() => resetMut.mutate()}>
                {resetMut.isPending ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHECKLIST TEMPLATE ── */}
      {showTemplateForm && (
        <div className="modal-overlay" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editingTemplate ? 'Editar template' : 'Nuevo template de checklist'}</h3>
              <button className="modal-close" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <label>Nombre del template *
                <input
                  value={templateForm.name}
                  onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Revisión de fibra óptica"
                />
              </label>
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Ítems del checklist</span>
                  <button className="btn btn-sm btn-secondary" onClick={addTemplateItem}>+ Agregar ítem</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {templateForm.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        value={item}
                        onChange={e => updateTemplateItem(idx, e.target.value)}
                        placeholder={`Ítem ${idx + 1}...`}
                        style={{ flex: 1 }}
                      />
                      {templateForm.items.length > 1 && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => removeTemplateItem(idx)}
                          style={{ padding: '4px 8px' }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {editingTemplate && (
                <div style={{ marginTop: 12 }}>
                  <label className="toggle-label" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={templateForm.active !== false}
                      onChange={e => setTemplateForm(f => ({ ...f, active: e.target.checked }))}
                    />
                    <span className="toggle-slider" />
                    Template activo
                  </label>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={
                  !templateForm.name.trim() ||
                  templateForm.items.every(i => !i.trim()) ||
                  saveTemplateMut.isPending
                }
                onClick={() => saveTemplateMut.mutate({
                  name: templateForm.name,
                  items: templateForm.items.filter(i => i.trim()),
                  active: templateForm.active !== false,
                })}
              >
                {saveTemplateMut.isPending ? 'Guardando...' : (editingTemplate ? 'Guardar cambios' : 'Crear template')}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// Utilitario para VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
