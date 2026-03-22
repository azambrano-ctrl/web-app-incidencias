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
  });

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar title="Directorio de Clientes" />
        <div className="page-content">
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div className="search-bar" style={{ marginBottom: 20 }}>
              <input
                type="text"
                className="form-input"
                placeholder="🔍 Buscar cliente por nombre..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                style={{ fontSize: 16, padding: '10px 14px' }}
              />
            </div>

            {isLoading && <p className="text-muted" style={{ textAlign: 'center' }}>Buscando...</p>}

            {!isLoading && clients.length === 0 && debouncedSearch && (
              <p className="text-muted" style={{ textAlign: 'center' }}>
                No se encontró ningún cliente con ese nombre.
              </p>
            )}

            {!isLoading && clients.length === 0 && !debouncedSearch && (
              <p className="text-muted" style={{ textAlign: 'center' }}>
                Escribe el nombre del cliente para buscarlo.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {clients.map(client => (
                <ClientCard
                  key={client.incident_id}
                  client={client}
                  onViewIncident={() => navigate(`/incidents/${client.incident_id}`)}
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
    if (!client.photo_id) return;
    getPhoto(client.incident_id, client.photo_id)
      .then(p => setPhotoSrc(p.data))
      .catch(() => {});
  }, [client.photo_id, client.incident_id]);

  const mapsUrl = client.latitude && client.longitude
    ? `https://www.google.com/maps?q=${client.latitude},${client.longitude}`
    : null;

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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
          {client.client_name}
        </div>
        <div style={{ color: '#555', fontSize: 14, marginBottom: 2 }}>
          📍 {client.client_address}
        </div>
        {client.client_phone && (
          <div style={{ fontSize: 14, marginBottom: 2 }}>
            📞 <a href={`tel:${client.client_phone}`} style={{ color: 'inherit' }}>{client.client_phone}</a>
          </div>
        )}
        {client.client_phone2 && (
          <div style={{ fontSize: 14, marginBottom: 6 }}>
            📞 <a href={`tel:${client.client_phone2}`} style={{ color: 'inherit' }}>{client.client_phone2}</a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn-sm" onClick={onViewIncident} style={{ fontSize: 13 }}>
            Ver incidencia
          </button>
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
