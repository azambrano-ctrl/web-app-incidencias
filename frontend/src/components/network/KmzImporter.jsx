import { useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import { useQueryClient } from '@tanstack/react-query';
import { createNetworkNode } from '../../api/network.api';
import { toast } from 'react-hot-toast';

/* ── Clasificar placemark por nombre ── */
function classify(name) {
  const n = name.toUpperCase();
  if (/MANGA/.test(n)) return 'manga';
  if (/^A\d+N\d+C\d+/.test(n)) return 'caja';
  if (/[A-Z]\d*N\d+C\d+/.test(n)) return 'caja';
  if (/^A\d+N\d+$/.test(n)) return 'nodo';
  if (/^P\d+N\d+$/.test(n)) return 'nodo';
  if (/NODO|NOC/.test(n)) return 'nodo';
  return 'caja';
}

/* ── Extraer puntos de un bloque de texto KML ── */
function extractPoints(kmlBlock, layerName) {
  const pmRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  const points = [];
  let m;
  while ((m = pmRegex.exec(kmlBlock)) !== null) {
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
      lat:   parseFloat(lat),
      lng:   parseFloat(lng),
      desc:  (descM?.[1] || '').replace(/<[^>]*>/g, '').trim(),
      type:  classify(name),
      layer: layerName || null,
    });
  }
  return points;
}

/* ── Parsear KML → { folders: [{ name, points }], total } ── */
function parseKml(kmlText) {
  const folders = [];

  // Extraer <Folder> de primer nivel (pueden estar anidados, tomamos todos)
  const folderRegex = /<Folder>([\s\S]*?)<\/Folder>/g;
  let fm;
  const usedRanges = [];

  while ((fm = folderRegex.exec(kmlText)) !== null) {
    const block = fm[1];
    const nameM = block.match(/<name>([\s\S]*?)<\/name>/);
    const folderName = (nameM?.[1] || 'Sin nombre').trim();
    const points = extractPoints(block, folderName);
    if (points.length > 0) {
      folders.push({ name: folderName, points });
      usedRanges.push([fm.index, fm.index + fm[0].length]);
    }
  }

  // Puntos fuera de cualquier Folder
  if (folders.length === 0) {
    // No hay folders — parsear todo como una sola capa
    const allPoints = extractPoints(kmlText, null);
    if (allPoints.length > 0) {
      folders.push({ name: 'Todos los puntos', points: allPoints });
    }
  }

  const total = folders.reduce((s, f) => s + f.points.length, 0);
  return { folders, total };
}

const TYPE_LABELS = { caja: 'Cajas', nodo: 'Nodos', manga: 'Mangas' };
const TYPE_COLORS = { caja: '#16a34a', nodo: '#7c3aed', manga: '#ea580c' };

function countTypes(points) {
  return points.reduce((a, p) => { a[p.type] = (a[p.type] || 0) + 1; return a; }, {});
}

export default function KmzImporter({ onClose }) {
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const [parsed,   setParsed]   = useState(null);   // { folders, total }
  const [selected, setSelected] = useState(new Set()); // folder names checked
  const [progress, setProgress] = useState(null);   // { done, total }
  const [error,    setError]    = useState('');

  /* ── Leer y parsear el KMZ ── */
  async function handleFile(e) {
    setError('');
    setParsed(null);
    setSelected(new Set());
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buf  = await file.arrayBuffer();
      const uint = new Uint8Array(buf);

      let kmlText;
      if (file.name.toLowerCase().endsWith('.kml')) {
        kmlText = new TextDecoder('utf-8').decode(uint);
      } else {
        const zip    = unzipSync(uint);
        const kmlKey = Object.keys(zip).find(k => k.endsWith('.kml'));
        if (!kmlKey) { setError('No se encontró un archivo .kml dentro del KMZ'); return; }
        kmlText = new TextDecoder('utf-8').decode(zip[kmlKey]);
      }

      const result = parseKml(kmlText);
      if (result.total === 0) { setError('No se encontraron puntos en el archivo'); return; }

      setParsed(result);
      // Seleccionar todas las carpetas por defecto
      setSelected(new Set(result.folders.map(f => f.name)));
    } catch (err) {
      setError('Error al leer el archivo: ' + err.message);
    }
  }

  function toggleFolder(name) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function toggleAll(check) {
    if (!parsed) return;
    setSelected(check ? new Set(parsed.folders.map(f => f.name)) : new Set());
  }

  // Puntos de las carpetas seleccionadas
  const selectedPoints = parsed
    ? parsed.folders.filter(f => selected.has(f.name)).flatMap(f => f.points)
    : [];

  const selectedCounts = countTypes(selectedPoints);

  /* ── Importar puntos al API ── */
  async function handleImport() {
    if (!selectedPoints.length) return;
    setProgress({ done: 0, total: selectedPoints.length });

    let ok = 0, failed = 0;
    for (let i = 0; i < selectedPoints.length; i++) {
      const p = selectedPoints[i];
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
          layer:       p.layer,
        });
        ok++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: selectedPoints.length });
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
  const allChecked  = parsed && selected.size === parsed.folders.length;
  const noneChecked = selected.size === 0;

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
                📂 Seleccionar archivo .kmz / .kml
              </button>
              {error && (
                <p style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>⚠️ {error}</p>
              )}
            </div>
          )}

          {/* Selección de capas/folders */}
          {parsed && !progress && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
                  Capas encontradas ({parsed.folders.length})
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    disabled={allChecked}
                    style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                      background: allChecked ? '#e2e8f0' : '#fff', cursor: allChecked ? 'default' : 'pointer',
                      color: '#475569', fontWeight: 600,
                    }}
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    disabled={noneChecked}
                    style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                      background: noneChecked ? '#e2e8f0' : '#fff', cursor: noneChecked ? 'default' : 'pointer',
                      color: '#475569', fontWeight: 600,
                    }}
                  >
                    Ninguna
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {parsed.folders.map(folder => {
                  const isChecked = selected.has(folder.name);
                  const counts    = countTypes(folder.points);
                  return (
                    <label
                      key={folder.name}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '8px 10px', borderRadius: 8,
                        background: isChecked ? '#eff6ff' : '#fff',
                        border: `1px solid ${isChecked ? '#93c5fd' : '#e2e8f0'}`,
                        transition: 'all .15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleFolder(folder.name)}
                        style={{ marginTop: 2, accentColor: '#3b82f6', width: 16, height: 16, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', wordBreak: 'break-word' }}>
                          {folder.name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                          {Object.entries(counts).map(([type, count]) => (
                            <span
                              key={type}
                              style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                                background: TYPE_COLORS[type] + '20',
                                color: TYPE_COLORS[type],
                                border: `1px solid ${TYPE_COLORS[type]}40`,
                              }}
                            >
                              {count} {TYPE_LABELS[type]}
                            </span>
                          ))}
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            ({folder.points.length} pts)
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Resumen de selección */}
              {selectedPoints.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 6px', color: '#475569' }}>
                    Se importarán <strong style={{ color: '#1e293b' }}>{selectedPoints.length}</strong> puntos:
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(selectedCounts).map(([type, count]) => (
                      <div key={type} style={{
                        background: TYPE_COLORS[type] + '18',
                        border: `1px solid ${TYPE_COLORS[type]}44`,
                        borderRadius: 8, padding: '6px 12px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: TYPE_COLORS[type] }}>{count}</div>
                        <div style={{ fontSize: 10, color: TYPE_COLORS[type], fontWeight: 700 }}>{TYPE_LABELS[type]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPoints.length === 0 && (
                <p style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, margin: '10px 0 0' }}>
                  ⚠️ Selecciona al menos una capa para importar.
                </p>
              )}

              <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>
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
              disabled={!parsed || selectedPoints.length === 0}
              className="btn btn-primary"
              style={{ minHeight: 48, flex: 2, opacity: (parsed && selectedPoints.length > 0) ? 1 : 0.4 }}
            >
              ⬆️ Importar {selectedPoints.length > 0 ? selectedPoints.length : ''} puntos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
