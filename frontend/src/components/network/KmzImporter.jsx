import { useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createNetworkNode } from '../../api/network.api';
import { toast } from 'react-hot-toast';

/* ── Clasificar placemark por nombre y estilo ── */
function classify(name) {
  const n = name.toUpperCase();
  if (/MANGA/.test(n)) return 'manga';
  if (/^A\d+N\d+C\d+/.test(n)) return 'caja';   // A#N#C# → caja
  if (/[A-Z]\d*N\d+C\d+/.test(n)) return 'caja'; // cualquier patrón con C al final
  if (/^A\d+N\d+$/.test(n)) return 'nodo';        // A#N# → nodo
  if (/^P\d+N\d+$/.test(n)) return 'nodo';
  if (/NODO|NOC/.test(n)) return 'nodo';
  return 'caja'; // default
}

/* ── Parsear KML text → array de puntos ── */
function parseKml(kmlText) {
  const pmRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  const points = [];
  let m;
  while ((m = pmRegex.exec(kmlText)) !== null) {
    const block = m[1];
    if (!block.includes('<Point>')) continue;
    const nameM  = block.match(/<name>([\s\S]*?)<\/name>/);
    const coordM = block.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
    const descM  = block.match(/<description>([\s\S]*?)<\/description>/);
    if (!coordM) continue;
    const [lng, lat] = coordM[1].trim().split(',');
    const name = (nameM?.[1] || 'Sin nombre').trim();
    points.push({
      name,
      lat:  parseFloat(lat),
      lng:  parseFloat(lng),
      desc: (descM?.[1] || '').replace(/<[^>]*>/g, '').trim(),
      type: classify(name),
    });
  }
  return points;
}

const TYPE_LABELS = { caja: 'Cajas', nodo: 'Nodos', manga: 'Mangas' };
const TYPE_COLORS = { caja: '#16a34a', nodo: '#7c3aed', manga: '#ea580c' };

export default function KmzImporter({ onClose }) {
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const [parsed,   setParsed]   = useState(null);  // { points, counts }
  const [progress, setProgress] = useState(null);  // { done, total }
  const [error,    setError]    = useState('');

  /* ── Leer y parsear el KMZ ── */
  async function handleFile(e) {
    setError('');
    setParsed(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buf  = await file.arrayBuffer();
      const uint = new Uint8Array(buf);
      const zip  = unzipSync(uint);

      const kmlKey = Object.keys(zip).find(k => k.endsWith('.kml'));
      if (!kmlKey) { setError('No se encontró un archivo .kml dentro del KMZ'); return; }

      const kmlText = new TextDecoder('utf-8').decode(zip[kmlKey]);
      const points  = parseKml(kmlText);

      if (points.length === 0) { setError('No se encontraron puntos en el KMZ'); return; }

      const counts = points.reduce((a, p) => { a[p.type] = (a[p.type] || 0) + 1; return a; }, {});
      setParsed({ points, counts });
    } catch (err) {
      setError('Error al leer el archivo: ' + err.message);
    }
  }

  /* ── Importar puntos al API ── */
  async function handleImport() {
    if (!parsed) return;
    const { points } = parsed;
    setProgress({ done: 0, total: points.length });

    let ok = 0, failed = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      try {
        await createNetworkNode({
          type:        p.type,
          name:        p.name,
          description: p.desc || null,
          latitude:    p.lat,
          longitude:   p.lng,
          cable_type:  null,
          total_hilos: 0,
          hilos_used:  0,
          notes:       'Importado desde KMZ',
          splices:     [],
        });
        ok++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: points.length });
    }

    qc.invalidateQueries(['network-nodes']);

    if (failed === 0) {
      toast.success(`✅ ${ok} puntos importados desde KMZ`);
    } else {
      toast(`⚠️ ${ok} importados, ${failed} fallaron`, { icon: '⚠️' });
    }
    onClose();
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="modal-overlay" style={{ zIndex: 4000 }}>
      <div className="modal modal-sm">
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#d1d5db' }} />
        </div>

        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>📂 Importar KMZ</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Importar puntos de red desde Google Maps / Google Earth
            </p>
          </div>
          {!progress && <button className="modal-close" onClick={onClose}>✕</button>}
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Selector de archivo */}
          {!progress && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".kmz,.kml"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  width: '100%', minHeight: 56, borderRadius: 10,
                  border: '2px dashed #3b82f6', background: '#eff6ff',
                  cursor: 'pointer', fontSize: 15, fontWeight: 700,
                  color: '#1d4ed8', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 10,
                }}
              >
                📂 Seleccionar archivo .kmz
              </button>
              {error && (
                <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>⚠️ {error}</p>
              )}
            </div>
          )}

          {/* Vista previa de lo que se va a importar */}
          {parsed && !progress && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>
                Se importarán <strong>{parsed.points.length}</strong> puntos:
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(parsed.counts).map(([type, count]) => (
                  <div key={type} style={{
                    background: TYPE_COLORS[type] + '18',
                    border: `1px solid ${TYPE_COLORS[type]}44`,
                    borderRadius: 8, padding: '8px 14px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: TYPE_COLORS[type] }}>{count}</div>
                    <div style={{ fontSize: 11, color: TYPE_COLORS[type], fontWeight: 700 }}>{TYPE_LABELS[type]}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>
                Los duplicados se agregarán de todas formas. Puedes eliminarlos después desde el mapa.
              </p>
            </div>
          )}

          {/* Barra de progreso */}
          {progress && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                <span>Importando puntos...</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, background: '#16a34a', width: `${pct}%`, transition: 'width .2s' }} />
              </div>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'center' }}>
                {pct < 100 ? 'No cierres esta ventana...' : '✅ ¡Completado!'}
              </p>
            </div>
          )}

        </div>

        {/* Botones */}
        {!progress && (
          <div className="form-actions" style={{ gap: 10 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ minHeight: 48 }}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!parsed}
              className="btn btn-primary"
              style={{ minHeight: 48, flex: 2, opacity: parsed ? 1 : 0.4 }}
            >
              ⬆️ Importar {parsed ? parsed.points.length : ''} puntos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
