import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { searchClients, getPhoto } from '../api/incidents.api';
import { updateClient } from '../api/clients.api';

export default function ClientDirectoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingClient, setEditingClient] = useState(null);
  const timerRef = useRef(null);
  const qc = useQueryClient();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients-search', debouncedSearch],
    queryFn: () => searchClients(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateClient(id, data),
    onSuccess: () => {
      toast.success('Cliente actualizado');
      qc.invalidateQueries(['clients-search']);
      setEditingClient(null);
    },
    onError: () => toast.error('Error al actualizar cliente'),
  });

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Directorio de Clientes" />
        <div className="page-content">
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
              <input
                type="text"
                className="form-input"
                placeholder="🔍 Buscar por nombre, apellido, cédula o teléfono..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                style={{ fontSize: 16, padding: '10px 14px', width: '100%' }}
              />
            </div>

            {search.length < 2 && (
              <p className="text-muted" style={{ textAlign: 'center' }}>
                Escribe al menos 2 caracteres para buscar.
              </p>
            )}

            {isLoading && <p className="text-muted" style={{ textAlign: 'center' }}>Buscando...</p>}

            {!isLoading && search.length >= 2 && clients.length === 0 && (
              <p className="text-muted" style={{ textAlign: 'center' }}>
                No se encontró ningún cliente con ese criterio.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {clients.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onViewIncident={client.incident_id ? () => navigate(`/incidencias/${client.incident_id}`) : null}
                  onEdit={() => setEditingClient(client)}
                />
              ))}
            </div>
          </div>
        </div>
        <BottomNav />
      </main>

      {editingClient && (
        <EditClientModal
          client={editingClient}
          saving={updateMut.isPending}
          onSave={(data) => updateMut.mutate({ id: editingClient.id, data })}
          onClose={() => setEditingClient(null)}
        />
      )}
    </div>
  );
}

function ClientCard({ client, onViewIncident, onEdit }) {
  const [photoSrc, setPhotoSrc] = useState(null);

  useEffect(() => {
    if (!client.photo_id || !client.photo_incident_id) return;
    getPhoto(client.photo_incident_id, client.photo_id)
      .then(p => setPhotoSrc(p.data))
      .catch(() => {});
  }, [client.photo_id, client.photo_incident_id]);

  const mapsUrl = client.latitude && client.longitude
    ? `https://www.google.com/maps?q=${client.latitude},${client.longitude}`
    : null;

  const displayName = client.nombre_display || client.razon_social || '—';

  return (
    <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 16 }}>
      {/* Foto de la casa */}
      <div style={{
        width: 110, height: 90, flexShrink: 0,
        background: '#f0f0f0', borderRadius: 8, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid #ddd',
      }}>
        {photoSrc
          ? <img src={photoSrc} alt="Casa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 32, opacity: 0.35 }}>🏠</span>
        }
      </div>

      {/* Datos del cliente */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
          {displayName}
        </div>
        {client.identificacion && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>CI: {client.identificacion}</div>
        )}
        {client.direccion && (
          <div style={{ color: '#555', fontSize: 14, marginBottom: 2 }}>📍 {client.direccion}</div>
        )}
        {client.sector && (
          <div style={{ color: '#777', fontSize: 13, marginBottom: 2 }}>🏘️ {client.sector}</div>
        )}
        {client.celular1 && (
          <div style={{ fontSize: 14, marginBottom: 2 }}>
            📞 <a href={`tel:${client.celular1}`} style={{ color: 'inherit' }}>{client.celular1}</a>
          </div>
        )}
        {client.celular2 && (
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            📞 <a href={`tel:${client.celular2}`} style={{ color: 'inherit' }}>{client.celular2}</a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={onEdit}
            style={{ fontSize: 13 }}
          >
            ✏️ Editar contacto
          </button>
          {onViewIncident && (
            <button className="btn btn-sm" onClick={onViewIncident} style={{ fontSize: 13 }}>
              Ver incidencia
            </button>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
              style={{ fontSize: 13, background: '#34a853', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', textDecoration: 'none' }}
            >
              📍 Ver en mapa
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function EditClientModal({ client, saving, onSave, onClose }) {
  const displayName = client.nombre_display || client.razon_social || '—';
  const [form, setForm] = useState({
    celular1:  client.celular1  || '',
    celular2:  client.celular2  || '',
    email:     client.email     || '',
    direccion: client.direccion || '',
    sector:    client.sector    || '',
  });

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }}>
      <div className="modal modal-sm">
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#d1d5db' }} />
        </div>

        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>✏️ Editar contacto</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {displayName} {client.identificacion ? `· CI ${client.identificacion}` : ''}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div className="form-group">
              <label className="form-label">📞 Teléfono / Celular principal</label>
              <input
                name="celular1"
                value={form.celular1}
                onChange={handleChange}
                className="form-input"
                type="tel"
                placeholder="0999 000 000"
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">📞 Teléfono / Celular secundario</label>
              <input
                name="celular2"
                value={form.celular2}
                onChange={handleChange}
                className="form-input"
                type="tel"
                placeholder="(Opcional)"
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">✉️ Email</label>
              <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="form-input"
                type="email"
                placeholder="correo@ejemplo.com"
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">📍 Dirección</label>
              <input
                name="direccion"
                value={form.direccion}
                onChange={handleChange}
                className="form-input"
                placeholder="Dirección del cliente"
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">🏘️ Sector</label>
              <input
                name="sector"
                value={form.sector}
                onChange={handleChange}
                className="form-input"
                placeholder="Sector o barrio"
                style={{ fontSize: 16 }}
              />
            </div>

          </div>

          <div className="form-actions" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ minHeight: 48 }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ minHeight: 48, flex: 2 }}
            >
              {saving ? '⏳ Guardando...' : '💾 Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
