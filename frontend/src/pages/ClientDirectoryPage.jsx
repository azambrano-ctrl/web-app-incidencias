import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import BottomNav from '../components/layout/BottomNav';
import { searchClients, getPhoto } from '../api/incidents.api';

export default function ClientDirectoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timerRef = useRef(null);

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
                />
              ))}
            </div>
          </div>
        </div>
        <BottomNav />
      </main>
    </div>
  );
}

function ClientCard({ client, onViewIncident }) {
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
