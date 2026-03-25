import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRouters, createRouter, updateRouter, deleteRouter, testConnection, getRouterClients, cutClient, activateClient } from '../api/routers.api';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import { toast } from 'react-hot-toast';

const EMPTY = { description: '', ip: '', username: '', password: '', api_port: 8728, cut_label: 'CORTE', active_label: 'HABILITADOS', status: 'active' };

export default function RoutersPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selectedRouter, setSelectedRouter] = useState(null);
  const [testing, setTesting] = useState(null);

  const { data: routers = [], isLoading } = useQuery({ queryKey: ['routers'], queryFn: getRouters });
  const { data: clientsData = { source: null, rows: [] }, isFetching: loadingClients, isError: clientsError } = useQuery({
    queryKey: ['router-clients', selectedRouter?.id],
    queryFn: () => getRouterClients(selectedRouter.id),
    enabled: !!selectedRouter,
    refetchInterval: 30000,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: (data) => editing ? updateRouter(editing.id, data) : createRouter(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routers'] });
      toast.success(editing ? 'Router actualizado' : 'Router creado');
      setShowForm(false);
      setEditing(null);
      setForm(EMPTY);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Error al guardar'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteRouter,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routers'] }); toast.success('Router eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const cutMut = useMutation({
    mutationFn: ({ id, address }) => cutClient(id, address),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['router-clients', selectedRouter?.id] }); toast.success('Servicio cortado'); },
    onError: () => toast.error('Error al cortar servicio'),
  });

  const activateMut = useMutation({
    mutationFn: ({ id, address }) => activateClient(id, address),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['router-clients', selectedRouter?.id] }); toast.success('Servicio activado'); },
    onError: () => toast.error('Error al activar servicio'),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openEdit = (r) => {
    setEditing(r);
    setForm({ ...r, password: '' });
    setShowForm(true);
  };

  const handleTest = async (r) => {
    setTesting(r.id);
    try {
      const res = await testConnection(r.id);
      toast[res.ok ? 'success' : 'error'](res.message);
    } catch { toast.error('Error de conexión'); }
    finally { setTesting(null); }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMut.mutate({ ...form, api_port: parseInt(form.api_port) });
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Routers" />
        <div className="page-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Gestión de Routers</h2>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true); }}>
              + Agregar router
            </button>
          </div>

          {/* Tabla de routers */}
          <div className="table-wrapper" style={{ marginBottom: 32 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th>IP</th>
                  <th>Puerto API</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={5} className="table-empty">Cargando...</td></tr>}
                {!isLoading && routers.length === 0 && <tr><td colSpan={5} className="table-empty">No hay routers registrados</td></tr>}
                {routers.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.description}</td>
                    <td><code>{r.ip}</code></td>
                    <td>{r.api_port}</td>
                    <td>
                      <span style={{
                        background: r.status === 'active' ? '#dcfce7' : '#fee2e2',
                        color: r.status === 'active' ? '#16a34a' : '#dc2626',
                        padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600
                      }}>
                        {r.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setSelectedRouter(r === selectedRouter ? null : r)}>
                        {selectedRouter?.id === r.id ? 'Cerrar' : 'Ver clientes'}
                      </button>
                      <button className="btn btn-sm btn-secondary" disabled={testing === r.id} onClick={() => handleTest(r)}>
                        {testing === r.id ? 'Probando...' : 'Test'}
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r)}>Editar</button>
                      <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}
                        onClick={() => window.confirm(`¿Eliminar ${r.description}?`) && deleteMut.mutate(r.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Panel de clientes del router seleccionado */}
          {selectedRouter && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Clientes — {selectedRouter.description}</h3>
                <button className="btn btn-sm btn-secondary" onClick={() => qc.invalidateQueries({ queryKey: ['router-clients', selectedRouter.id] })}>
                  Actualizar
                </button>
              </div>
              {loadingClients && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Consultando router...</p>}
              {!loadingClients && clientsError && (
                <p style={{ color: '#dc2626', fontSize: 13 }}>No se pudo conectar al router. Verifica IP, puerto y credenciales.</p>
              )}
              {!loadingClients && !clientsError && clientsData.rows.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin clientes activos o el router no respondió.</p>
              )}
              {clientsData.rows.length > 0 && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Fuente: <strong>{clientsData.source}</strong> — {clientsData.rows.length} entradas</p>
                  <table className="data-table">
                  <thead>
                    <tr>
                      {Object.keys(clientsData.rows[0]).map(k => <th key={k}>{k}</th>)}
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsData.rows.map((c, i) => (
                      <tr key={i}>
                        {Object.values(c).map((v, j) => <td key={j} style={{ fontSize: 12 }}>{v}</td>)}
                        <td style={{ display: 'flex', gap: 4 }}>
                          {c.address && <>
                            <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: 11 }}
                              onClick={() => cutMut.mutate({ id: selectedRouter.id, address: c.address })}>
                              Cortar
                            </button>
                            <button className="btn btn-sm" style={{ background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac', fontSize: 11 }}
                              onClick={() => activateMut.mutate({ id: selectedRouter.id, address: c.address })}>
                              Activar
                            </button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </div>
          )}

          {/* Modal formulario */}
          {showForm && (
            <div className="modal-overlay" onClick={() => setShowForm(false)}>
              <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{editing ? 'Editar router' : 'Nuevo router'}</h3>
                  <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <label>Descripción *
                      <input value={form.description} onChange={e => set('description', e.target.value.toUpperCase())} required placeholder="ROUTER 105.100" />
                    </label>
                    <label>IP *
                      <input value={form.ip} onChange={e => set('ip', e.target.value)} required placeholder="45.71.3.172" />
                    </label>
                    <div className="form-row two-cols" style={{ margin: 0 }}>
                      <label>Usuario *
                        <input value={form.username} onChange={e => set('username', e.target.value)} required />
                      </label>
                      <label>Contraseña {editing ? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(vacío = no cambiar)</span> : '*'}
                        <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required={!editing} />
                      </label>
                    </div>
                    <label>Puerto API *
                      <input type="number" value={form.api_port} onChange={e => set('api_port', e.target.value)} required min={1} max={65535} />
                    </label>
                    <div className="form-row two-cols" style={{ margin: 0 }}>
                      <label>Etiqueta de corte
                        <input value={form.cut_label} onChange={e => set('cut_label', e.target.value.toUpperCase())} />
                      </label>
                      <label>Etiqueta de activación
                        <input value={form.active_label} onChange={e => set('active_label', e.target.value.toUpperCase())} />
                      </label>
                    </div>
                    <label>Status
                      <select value={form.status} onChange={e => set('status', e.target.value)}>
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={saveMut.isPending}>
                      {saveMut.isPending ? 'Guardando...' : 'Guardar'}
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
