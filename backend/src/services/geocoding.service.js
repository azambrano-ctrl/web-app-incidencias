const https = require('https');
const { getSetting } = require('../modules/settings/settings.service');

async function geocodeAddress(address) {
  if (!address || address.trim().length < 5) return null;

  const addr        = address.trim();
  const googleKey   = (await getSetting('google_maps_key')) || '';
  const defaultCity = (await getSetting('default_city')) || 'Ecuador';
  const mapBbox     = (await getSetting('map_bbox')) || '';

  // ── Si hay API key de Google → usarla (mucho más preciso para Ecuador) ──
  if (googleKey) {
    const result = await _googleGeocode(addr, defaultCity, googleKey);
    if (result) return result;
    // Si Google no encontró nada, caer en Nominatim como respaldo
  }

  // ── Nominatim como respaldo ───────────────────────────────────────────────

  // 1. Búsqueda estructurada con bbox
  if (mapBbox) {
    const r = await _nominatimStructured(addr, defaultCity, mapBbox, true);
    if (r) return r;
  }

  // 2. Búsqueda estructurada sin restricción de área
  const r2 = await _nominatimStructured(addr, defaultCity, '', false);
  if (r2) return r2;

  // 3. Búsqueda libre con ciudad + bbox
  if (mapBbox) {
    const r = await _nominatimFree(`${addr}, ${defaultCity}`, mapBbox, true);
    if (r) return r;
  }

  // 4. Búsqueda libre con ciudad
  const r4 = await _nominatimFree(`${addr}, ${defaultCity}`, '', false);
  if (r4) return r4;

  // 5. Último recurso: centro de la ciudad configurada
  const city = await _nominatimFree(defaultCity, '', false);
  if (city) return { ...city, approximate: true };

  return null;
}

// ── Google Maps Geocoding API ─────────────────────────────────────────────────
function _googleGeocode(address, defaultCity, apiKey) {
  return new Promise((resolve) => {
    // Convertir " Y " (intersección en español) a " & " que Google entiende
    const normalized = address.replace(/\bY\b/gi, '&');
    const query      = encodeURIComponent(`${normalized}, ${defaultCity}, Ecuador`);
    const path       = `/maps/api/geocode/json?address=${query}&key=${apiKey}&region=ec&language=es&components=country:EC`;

    const options = {
      hostname: 'maps.googleapis.com',
      path,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.status === 'OK' && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            resolve({ lat: loc.lat, lng: loc.lng });
          } else {
            console.warn(`[Geocode] Google sin resultado para "${address}": ${data.status}`);
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

// ── Nominatim búsqueda estructurada ──────────────────────────────────────────
function _nominatimStructured(street, city, bbox, bounded) {
  const params = new URLSearchParams({
    street, city, country: 'Ecuador',
    format: 'json', limit: '1', countrycodes: 'ec', addressdetails: '0',
  });
  if (bbox) { params.set('viewbox', bbox); params.set('bounded', bounded ? '1' : '0'); }
  return _nominatimRequest(`/search?${params.toString()}`);
}

// ── Nominatim búsqueda libre ──────────────────────────────────────────────────
function _nominatimFree(query, bbox, bounded) {
  const params = new URLSearchParams({
    q: query, format: 'json', limit: '1', countrycodes: 'ec', addressdetails: '0',
  });
  if (bbox) { params.set('viewbox', bbox); params.set('bounded', bounded ? '1' : '0'); }
  return _nominatimRequest(`/search?${params.toString()}`);
}

function _nominatimRequest(path) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'nominatim.openstreetmap.org',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'IncidenciasISP/1.0 (contacto@incidenciasisp.com)',
        'Accept': 'application/json',
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (Array.isArray(data) && data.length > 0)
            resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = { geocodeAddress };
