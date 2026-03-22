const https = require('https');
const { getSetting } = require('../modules/settings/settings.service');

async function geocodeAddress(address) {
  if (!address || address.trim().length < 5) return null;

  const addr = address.trim();

  // Leer ciudad configurada por el admin (ej: "La Troncal, Ecuador")
  const defaultCity = (await getSetting('default_city')) || 'Ecuador';

  // Intentos en orden: con ciudad + sin ciudad + solo Ecuador
  const attempts = [
    `${addr}, ${defaultCity}`,
    addr,
    `${addr}, Ecuador`,
  ];

  for (const attempt of attempts) {
    const result = await _nominatim(attempt);
    if (result) return result;
  }
  return null;
}

function _nominatim(query) {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query);
    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/search?q=${encoded}&format=json&limit=1&countrycodes=ec`,
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
