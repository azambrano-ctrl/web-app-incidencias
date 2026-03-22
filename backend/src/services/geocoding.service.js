const https = require('https');
const { getSetting } = require('../modules/settings/settings.service');

async function geocodeAddress(address) {
  if (!address || address.trim().length < 5) return null;

  const addr = address.trim();

  // Leer configuración del admin
  const defaultCity = (await getSetting('default_city')) || 'Ecuador';
  const mapBbox     = (await getSetting('map_bbox')) || '';  // ej: "-79.45,-2.35,-79.25,-2.55"

  // ── Intentos en orden de mayor a menor precisión ──────────────────────────

  // 1. Búsqueda estructurada con bbox (más precisa para barrios locales)
  if (mapBbox) {
    const r = await _nominatimStructured(addr, defaultCity, mapBbox, true);
    if (r) return r;
  }

  // 2. Búsqueda estructurada sin bbox
  const r2 = await _nominatimStructured(addr, defaultCity, mapBbox, false);
  if (r2) return r2;

  // 3. Búsqueda libre con ciudad + bbox
  if (mapBbox) {
    const r = await _nominatimFree(`${addr}, ${defaultCity}`, mapBbox, true);
    if (r) return r;
  }

  // 4. Búsqueda libre con ciudad (sin restricción de área)
  const r4 = await _nominatimFree(`${addr}, ${defaultCity}`, '', false);
  if (r4) return r4;

  // 5. Último recurso: centrar en la ciudad configurada
  const cityResult = await _nominatimFree(defaultCity, '', false);
  if (cityResult) return { ...cityResult, approximate: true };

  return null;
}

/**
 * Nominatim búsqueda estructurada:
 * street + city separados → mucho mejor para barrios y calles locales.
 */
function _nominatimStructured(street, city, bbox, bounded) {
  const params = new URLSearchParams({
    street,
    city,
    country: 'Ecuador',
    format: 'json',
    limit: '1',
    countrycodes: 'ec',
    addressdetails: '0',
  });
  if (bbox) {
    params.set('viewbox', bbox);
    params.set('bounded', bounded ? '1' : '0');
  }
  return _nominatimRequest(`/search?${params.toString()}`);
}

/**
 * Nominatim búsqueda libre (q=...).
 */
function _nominatimFree(query, bbox, bounded) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'ec',
    addressdetails: '0',
  });
  if (bbox) {
    params.set('viewbox', bbox);
    params.set('bounded', bounded ? '1' : '0');
  }
  return _nominatimRequest(`/search?${params.toString()}`);
}

function _nominatimRequest(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'IncidenciasISP/1.0 (contacto@incidenciasisp.com)',
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0) {
            resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = { geocodeAddress };
