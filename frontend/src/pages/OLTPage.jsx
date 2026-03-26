import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOlts, createOlt, updateOlt, deleteOlt, testOlt, getONUs, rebootONU, provisionONU, linkOnuSerial, getONUSignals } from '../api/olts.api';
import { searchClients } from '../api/clients.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import { toast } from 'react-hot-toast';

const BRANDS = { zte: 'ZTE', huawei: 'Huawei', fiberhome: 'FiberHome', vsol: 'VSOL', nokia: 'Nokia' };
const CONN_TYPES = { ssh: 'SSH', telnet: 'Telnet', snmp: 'SNMP' };

const EMPTY = { description: '', ip: '', username: '', password: '', ssh_port: 22, brand: 'zte', connection_type: 'ssh', snmp_community: 'public', status: 'active', pon_frame: 1, pon_slot: 1, pon_ports: 8 };

const PROV_EMPTY = { port: '', sn: '', profile: '1', vlan: '100', description: '' };

function SignalBar({ dbm }) {
  if (dbm === null || dbm === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
  const color = dbm >= -25 ? '#16a34a' : dbm >= -30 ? '#d97706' : '#dc2626';
  return <span style={{ color, fontWeight: 600 }}>{dbm} dBm</span>;
}

export default function OLTPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selectedOlt, setSelectedOlt] = useState(null);
  const [search, setSearch] = useState('');
  const [testing, setTesting] = useState(null);
  const [showProvision, setShowProvision] = useState(false);
  const [provForm, setProvForm] = useState(PROV_EMPTY);
  const [linkOnu, setLinkOnu] = useState(null); // ONU a vincular
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [linking, setLinking] = useState(false);
  const [selectedPort, setSelectedPort] = useState('all');

  const { data: olts = [], isLoading } = useQuery({ queryKey: ['olts'], queryFn: getOlts });

  const { data: onus = [], isFetching: loadingOnus, isError: onusError } = useQuery({
    queryKey: ['olt-onus', selectedOlt?.id, selectedPort],
    queryFn: () => getONUs(selectedOlt.id, selectedPort === 'all' ? null : selectedPort),
    enabled: !!selectedOlt,
    refetchInterval: 30000,
    retry: false,
  });

  // Segunda fase: señales ópticas (carga tras obtener la lista)
  const onlineIds = useMemo(() => onus.filter(o => o.status === 'online').map(o => o.id), [onus]);
  const { data: signals = {} } = useQuery({
    queryKey: ['olt-signals', selectedOlt?.id, selectedPort, onlineIds.join(',')],
    queryFn: () => getONUSignals(selectedOlt.id, onlineIds),
    enabled: !!selectedOlt && onlineIds.length > 0,
    refetchInterval: 60000,
    retry: false,
    staleTime: 55000,
  });

  // Detectar nuevas ONUs en cada refresco
  const knownOnuIds = useRef(null);
  useEffect(() => {
    if (!onus.length) return;
    const currentIds = new Set(onus.map(o => o.id));
    if (knownOnuIds.current === null) {
      // Primera carga — solo guardar, no notificar
      knownOnuIds.current = currentIds;
      return;
    }
    const newOnus = onus.filter(o => !knownOnuIds.current.has(o.id));
    for (const onu of newOnus) {
      toast(`Nueva ONU detectada: ${onu.id} (${onu.mac || 'SN desconocido'})`, {
        icon: '📡',
        duration: 8000,
        style: { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 600 },
      });
    }
    knownOnuIds.current = currentIds;
  }, [onus]);

  // Resetear seguimiento y puerto al cambiar de OLT
  useEffect(() => { knownOnuIds.current = null; setSelectedPort('all'); }, [selectedOlt?.id]);

  const filteredOnus = useMemo(() => {
    const q = search.toLowerCase();
    return !q ? onus : onus.filter(o => (o.id || '').toLowerCase().includes(q) || (o.mac || '').toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q));
  }, [onus, search]);

  const onuStats = useMemo(() => ({
    total: onus.length,
    online: onus.filter(o => o.status === 'online').length,
    offline: onus.filter(o => o.status === 'offline').length,
  }), [onus]);

  const saveMut = useMutation({
    mutationFn: (data) => editing ? updateOlt(editing.id, data) : createOlt(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olts'] }); setShowForm(false); setEditing(null); setForm(EMPTY); toast.success(editing ? 'OLT actualizada' : 'OLT creada'); },
    onError: () => toast.error('Error al guardar'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteOlt,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olts'] }); if (selectedOlt) setSelectedOlt(null); toast.success('OLT eliminada'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const rebootMut = useMutation({
    mutationFn: ({ id, onuId }) => rebootONU(id, onuId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-onus'] }); toast.success('ONU reiniciada'); },
    onError: () => toast.error('Error al reiniciar ONU'),
  });

  const provMut = useMutation({
    mutationFn: (data) => provisionONU(selectedOlt.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['olt-onus'] }); setShowProvision(false); setProvForm(PROV_EMPTY); toast.success('ONU provisionada'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Error al provisionar'),
  });

  const handleTest = async (olt) => {
    setTesting(olt.id);
    try {
      const r = await testOlt(olt.id);
      toast[r.ok ? 'success' : 'error'](r.message);
    } catch { toast.error('Error de conexión'); }
    finally { setTesting(null); }
  };

  const handleClientSearch = async (q) => {
    setClientSearch(q);
    if (q.length < 2) { setClientResults([]); return; }
    try { setClientResults(await searchClients(q)); } catch { setClientResults([]); }
  };

  const handleLink = async (clientId) => {
    if (!linkOnu) return;
    setLinking(true);
    try {
      await linkOnuSerial(clientId, linkOnu.mac);
      qc.invalidateQueries({ queryKey: ['olt-onus'] });
      toast.success('ONU vinculada al cliente');
      setLinkOnu(null); setClientSearch(''); setClientResults([]);
    } catch { toast.error('Error al vincular'); }
    finally { setLinking(false); }
  };

  const handleUnlink = async (onu) => {
    if (!onu.clientId) return;
    setLinking(true);
    try {
      await linkOnuSerial(onu.clientId, null);
      qc.invalidateQueries({ queryKey: ['olt-onus'] });
      toast.success('Vínculo eliminado');
    } catch { toast.error('Error al desvincular'); }
    finally { setLinking(false); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMut.mutate(form);
  };

  const openEdit = (olt) => {
    setEditing(olt);
    setForm({ ...olt, password: '' });
    setShowForm(true);
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Gestión de OLTs" />
        <div className="page-body">

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Gestión de OLTs</h2>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true); }}>+ Agregar OLT</button>
          </div>

          {/* Tabla OLTs */}
          <div className="table-wrapper" style={{ marginBottom: 32 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>IP</th>
                  <th>Marca</th>
                  <th>Conexión</th>
                  <th>Puerto</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</td></tr>}
                {olts.map(olt => (
                  <tr key={olt.id}
                    onClick={() => setSelectedOlt(selectedOlt?.id === olt.id ? null : olt)}
                    style={{ cursor: 'pointer', background: selectedOlt?.id === olt.id ? '#eff6ff' : '' }}>
                    <td style={{ fontWeight: 600 }}>{olt.description}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{olt.ip}</td>
                    <td><span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{BRANDS[olt.brand]}</span></td>
                    <td style={{ fontSize: 13 }}>{CONN_TYPES[olt.connection_type]}</td>
                    <td style={{ fontSize: 13 }}>{olt.ssh_port}</td>
                    <td>
                      <span style={{ background: olt.status === 'active' ? '#dcfce7' : '#fee2e2', color: olt.status === 'active' ? '#16a34a' : '#dc2626', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {olt.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleTest(olt)} disabled={testing === olt.id}>
                          {testing === olt.id ? '...' : 'Test'}
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(olt)}>Editar</button>
                        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={() => window.confirm(`¿Eliminar ${olt.description}?`) && deleteMut.mutate(olt.id)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && olts.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No hay OLTs registradas</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Panel ONUs */}
          {selectedOlt && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>ONUs — {selectedOlt.description}</h3>
                  {!loadingOnus && onus.length > 0 && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: '#374151' }}>Total: <strong>{onuStats.total}</strong></span>
                      <span style={{ fontSize: 12, color: '#16a34a' }}>Online: <strong>{onuStats.online}</strong></span>
                      <span style={{ fontSize: 12, color: '#dc2626' }}>Offline: <strong>{onuStats.offline}</strong></span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowProvision(true)}>+ Provisionar ONU</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => qc.invalidateQueries({ queryKey: ['olt-onus'] })}>Actualizar</button>
                </div>
              </div>

              {/* Selector de puerto PON */}
              {selectedOlt.brand === 'zte' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {[{ label: 'Todos', value: 'all' },
                    ...Array.from({ length: selectedOlt.pon_ports || 8 }, (_, i) => ({
                      label: `${selectedOlt.pon_frame || 1}/${selectedOlt.pon_slot || 1}/${i + 1}`,
                      value: String(i + 1),
                    }))
                  ].map(({ label, value }) => (
                    <button key={value}
                      onClick={() => setSelectedPort(value)}
                      style={{
                        padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: selectedPort === value ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                        background: selectedPort === value ? '#eff6ff' : 'white',
                        color: selectedPort === value ? '#2563eb' : '#374151',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Búsqueda */}
              {onus.length > 0 && (
                <input
                  placeholder="Buscar por ID, MAC o descripción..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }}
                />
              )}

              {loadingOnus && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Consultando OLT...</p>}
              {!loadingOnus && onusError && (
                <p style={{ color: '#dc2626', fontSize: 13 }}>No se pudo conectar a la OLT. Verifica IP, puerto y credenciales.</p>
              )}
              {!loadingOnus && !onusError && onus.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No se encontraron ONUs o la OLT no respondió.</p>
              )}

              {filteredOnus.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ padding: '10px 14px' }}>ID / Puerto</th>
                        <th style={{ padding: '10px 14px' }}>MAC / SN</th>
                        <th style={{ padding: '10px 14px' }}>Estado</th>
                        <th style={{ padding: '10px 14px' }}>Señal Rx</th>
                        <th style={{ padding: '10px 14px' }}>Señal Tx</th>
                        <th style={{ padding: '10px 14px' }}>Descripción</th>
                        <th style={{ padding: '10px 14px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOnus.map((onu, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 12, fontFamily: 'monospace', padding: '10px 14px' }}>{onu.id}</td>
                          <td style={{ fontSize: 12, fontFamily: 'monospace', padding: '10px 14px' }}>{onu.mac || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              background: onu.status === 'online' ? '#dcfce7' : '#fee2e2',
                              color: onu.status === 'online' ? '#16a34a' : '#dc2626',
                              padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600
                            }}>
                              {onu.status === 'online' ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}><SignalBar dbm={signals[onu.id]?.rxPower ?? null} /></td>
                          <td style={{ padding: '10px 14px' }}><SignalBar dbm={signals[onu.id]?.txPower ?? null} /></td>
                          <td style={{ fontSize: 12, padding: '10px 14px' }}>
                            {onu.description
                              ? <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{onu.description}</span>
                              : <span style={{ color: '#94a3b8' }}>Sin vincular</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#d97706', border: '1px solid #fcd34d', fontSize: 11 }}
                                onClick={() => window.confirm(`¿Reiniciar ONU ${onu.id}?`) && rebootMut.mutate({ id: selectedOlt.id, onuId: onu.id })}>
                                Reiniciar
                              </button>
                              {onu.description
                                ? <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: 11 }}
                                    onClick={() => handleUnlink(onu)} disabled={linking}>
                                    Desvincular
                                  </button>
                                : <button className="btn btn-sm" style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', fontSize: 11 }}
                                    onClick={() => { setLinkOnu(onu); setClientSearch(''); setClientResults([]); }}>
                                    Vincular
                                  </button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Modal formulario OLT */}
          {showForm && (
            <div className="modal-overlay" onClick={() => setShowForm(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                  <h3>{editing ? 'Editar OLT' : 'Nueva OLT'}</h3>
                  <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                  <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">Descripción *</label>
                      <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">IP *</label>
                      <input className="form-input" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">Puerto SSH *</label>
                      <input className="form-input" type="number" value={form.ssh_port} onChange={e => setForm(f => ({ ...f, ssh_port: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">Usuario *</label>
                      <input className="form-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">Contraseña {editing ? '(dejar vacío = sin cambio)' : '*'}</label>
                      <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required={!editing} />
                    </div>
                    <div>
                      <label className="form-label">Marca *</label>
                      <select className="form-input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}>
                        {Object.entries(BRANDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Tipo de conexión</label>
                      <select className="form-input" value={form.connection_type} onChange={e => setForm(f => ({ ...f, connection_type: e.target.value }))}>
                        {Object.entries(CONN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {form.connection_type === 'snmp' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Comunidad SNMP</label>
                        <input className="form-input" value={form.snmp_community} onChange={e => setForm(f => ({ ...f, snmp_community: e.target.value }))} />
                      </div>
                    )}
                    {form.brand === 'zte' && (
                      <>
                        <div>
                          <label className="form-label">Frame PON</label>
                          <input className="form-input" type="number" min="1" value={form.pon_frame ?? 1} onChange={e => setForm(f => ({ ...f, pon_frame: parseInt(e.target.value) || 1 }))} />
                        </div>
                        <div>
                          <label className="form-label">Slot PON</label>
                          <input className="form-input" type="number" min="1" value={form.pon_slot ?? 1} onChange={e => setForm(f => ({ ...f, pon_slot: parseInt(e.target.value) || 1 }))} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label className="form-label">Cantidad de puertos GPON a escanear</label>
                          <input className="form-input" type="number" min="1" max="16" value={form.pon_ports ?? 8} onChange={e => setForm(f => ({ ...f, pon_ports: parseInt(e.target.value) || 8 }))} />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="form-label">Estado</label>
                      <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={saveMut.isPending}>
                      {saveMut.isPending ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal vincular ONU a cliente */}
          {linkOnu && (
            <div className="modal-overlay" onClick={() => setLinkOnu(null)}>
              <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Vincular ONU a cliente</h3>
                  <button className="modal-close" onClick={() => setLinkOnu(null)}>✕</button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    ONU: <strong style={{ fontFamily: 'monospace' }}>{linkOnu.id}</strong><br />
                    SN: <strong style={{ fontFamily: 'monospace' }}>{linkOnu.mac}</strong>
                  </p>
                  <input
                    className="form-input"
                    placeholder="Buscar cliente por nombre, cédula o teléfono..."
                    value={clientSearch}
                    onChange={e => handleClientSearch(e.target.value)}
                    autoFocus
                  />
                  {clientResults.length > 0 && (
                    <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                      {clientResults.map(c => (
                        <button key={c.id}
                          onClick={() => handleLink(c.id)}
                          disabled={linking}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                          <strong>{c.razon_social || `${c.nombre1 || ''} ${c.apellido1 || ''}`.trim()}</strong>
                          <span style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>{c.identificacion} · {c.celular1}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {clientSearch.length >= 2 && clientResults.length === 0 && (
                    <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>No se encontraron clientes</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modal provisionar ONU */}
          {showProvision && (
            <div className="modal-overlay" onClick={() => setShowProvision(false)}>
              <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Provisionar ONU — {selectedOlt?.description}</h3>
                  <button className="modal-close" onClick={() => setShowProvision(false)}>✕</button>
                </div>
                <form onSubmit={e => { e.preventDefault(); provMut.mutate(provForm); }}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label className="form-label">Puerto PON (ej: 1/1/1)</label>
                      <input className="form-input" value={provForm.port} onChange={e => setProvForm(f => ({ ...f, port: e.target.value }))} required placeholder="1/1/1" />
                    </div>
                    <div>
                      <label className="form-label">Serial / SN de la ONU</label>
                      <input className="form-input" value={provForm.sn} onChange={e => setProvForm(f => ({ ...f, sn: e.target.value }))} required placeholder="ZTEG1234ABCD" />
                    </div>
                    <div>
                      <label className="form-label">Perfil de línea</label>
                      <input className="form-input" value={provForm.profile} onChange={e => setProvForm(f => ({ ...f, profile: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">VLAN</label>
                      <input className="form-input" value={provForm.vlan} onChange={e => setProvForm(f => ({ ...f, vlan: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">Descripción (nombre del cliente)</label>
                      <input className="form-input" value={provForm.description} onChange={e => setProvForm(f => ({ ...f, description: e.target.value }))} required />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowProvision(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={provMut.isPending}>
                      {provMut.isPending ? 'Provisionando...' : 'Provisionar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
