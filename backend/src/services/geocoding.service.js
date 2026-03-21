const https = require('https');

async function geocodeAddress(address) {
  if (!address || address.trim().length < 5) return null;
  return new Promise((resolve) => {
    const query = encodeURIComponent(address.trim());
    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/search?q=${query}&format=json&limit=1`,
      method: 'GET',
      headers: {
        'User-Agent': 'IncidenciasISP/1.0',
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (data.length > 0) {
            resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = { geocodeAddress };
