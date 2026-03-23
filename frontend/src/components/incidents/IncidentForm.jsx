import { useState, useEffect, useRef } from 'react';
import { searchClients, updateClient } from '../../api/clients.api';
import { getUsers } from '../../api/users.api';
import { toast } from 'react-hot-toast';

const EMPTY = {
  title: '', description: '', type: 'internet', priority: 'medium',
  client_name: '', client_address: '', client_phone: '', client_phone2: '', client_identificacion: '', assigned_to: '',
};

export default function IncidentForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial || EMPTY);
  const [clientQuery, setClientQuery] = useState(initial?.client_name || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null); // { id, celular1, celular2 } del cliente seleccionado
  const [updateContact, setUpdateContact] = useState(false);  // checkbox "actualizar en directorio"
  const searchTimer = useRef(null);
  const suggestRef = useRef(null);

  useEffect(() => {
    getUsers('technician').then(data => setTechnicians(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Búsqueda con debounce
  useEffect(() => {
    if (clientQuery.length < 2) { setSuggestions([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchClients(clientQuery);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [clientQuery]);

  // Cerrar sugerencias al click fuera
  useEffect(() => {
    const handler = (e) => { if (suggestRef.current && !suggestRef.current.contains(e.target)) setShowSuggestions(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectClient = (c) => {
    const fullName = c.razon_social ||
      [c.nombre1, c.nombre2, c.apellido1, c.apellido2].filter(Boolean).join(' ');
    setClientQuery(fullName);
    setSelectedClient({ id: c.id, celular1: c.celular1 || '', celular2: c.celular2 || '' });
    setUpdateContact(false);
    setForm(f => ({
      ...f,
      client_name: fullName,
      client_address: c.direccion || f.client_address,
      client_phone: c.celular1 || f.client_phone,
      client_phone2: c.celular2 || f.client_phone2,
      client_identificacion: c.identificacion || f.client_identificacion,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleClientInput = (val) => {
    setClientQuery(val);
    set('client_name', val);
    if (val.length < 2) setShowSuggestions(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Si el usuario quiere actualizar el contacto en el directorio
    if (updateContact && selectedClient) {
      try {
        await updateClient(selectedClient.id, {
          celular1: form.client_phone,
          celular2: form.client_phone2,
        });
        toast.success('📋 Teléfono actualizado en el directorio');
      } catch {
        toast.error('No se pudo actualizar el directorio (la incidencia se creará igual)');
      }
    }
    onSubmit(form);
  };

  // Detectar si el teléfono fue modificado respecto al cliente original
  const phoneChanged = selectedClient && (
    form.client_phone !== selectedClient.celular1 ||
    form.client_phone2 !== selectedClient.celular2
  );

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Editar Incidencia' : 'Nueva Incidencia'}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="incident-form">
          <div className="form-row">
            <label>Título *
              <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="Ej: Sin señal de internet" />
            </label>
          </div>
          <div className="form-row">
            <label>Descripción *
              <textarea value={form.description} onChange={e => set('description', e.target.value)} required rows={3} placeholder="Describe el problema..." />
            </label>
          </div>
          <div className="form-row two-cols">
            <label>Tipo de servicio *
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="internet">Internet</option>
                <option value="tv">TV Cable</option>
                <option value="both">Internet + TV</option>
              </select>
            </label>
            <label>Prioridad *
              <select value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </label>
          </div>

          {/* Búsqueda de cliente con autocompletado */}
          <div className="form-row" ref={suggestRef} style={{ position: 'relative' }}>
            <label>Nombre del cliente *
              <div className="client-search-wrap">
                <input
                  value={clientQuery}
                  onChange={e => handleClientInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  required
                  placeholder="Buscar por nombre, cédula o teléfono..."
                  autoComplete="off"
                />
                {clientQuery.length >= 2 && (
                  <span className="client-search-icon">🔍</span>
                )}
              </div>
            </label>
            {showSuggestions && (
              <ul className="client-suggestions">
                {suggestions.map(c => {
                  const name = c.razon_social ||
                    [c.nombre1, c.nombre2, c.apellido1, c.apellido2].filter(Boolean).join(' ');
                  return (
                    <li key={c.id} onMouseDown={() => selectClient(c)} className="client-suggestion-item">
                      <div className="suggestion-name">{name}</div>
                      <div className="suggestion-meta">
                        <span>{c.identificacion}</span>
                        {c.celular1 && <span>📞 {c.celular1}</span>}
                        {c.sector && <span>📍 {c.sector}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="form-row">
            <label>Dirección *
              <input value={form.client_address} onChange={e => set('client_address', e.target.value)} required placeholder="Se llena automáticamente al seleccionar cliente" />
            </label>
          </div>
          <div className="form-row two-cols">
            <label>Teléfono 1
              <input value={form.client_phone} onChange={e => set('client_phone', e.target.value)} placeholder="Opcional" />
            </label>
            <label>Teléfono 2
              <input value={form.client_phone2} onChange={e => set('client_phone2', e.target.value)} placeholder="Opcional" />
            </label>
          </div>

          {/* Checkbox: actualizar teléfono en el directorio si fue modificado */}
          {phoneChanged && (
            <div className="form-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={updateContact}
                  onChange={e => setUpdateContact(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#2563eb', flexShrink: 0 }}
                />
                <span>
                  📋 Actualizar este teléfono en el directorio del cliente
                  <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                    (antes: {selectedClient.celular1 || '—'})
                  </span>
                </span>
              </label>
            </div>
          )}
          <div className="form-row">
            <label>Técnico asignado
              <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
                <option value="">Sin asignar</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={onCancel} className="btn btn-secondary">Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : (initial ? 'Guardar cambios' : 'Crear incidencia')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
