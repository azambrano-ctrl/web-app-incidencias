const https = require('https');
const http = require('http');
const { getSetting } = require('../modules/settings/settings.service');

// Cache del token en memoria
let _token = null;
let _tokenExpiry = 0;

const TYPE_MAP = {
  internet: 'soporte_internet',
  tv: 'soporte_tvcable',
  both: 'soporte_tvcable',
};

function request(baseUrl, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = body ? JSON.stringify(body) : null;
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = lib.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const baseUrl = await getSetting('ext_api_url');
  const username = await getSetting('ext_api_user');
  const password = await getSetting('ext_api_pass');
  if (!baseUrl || !username || !password) throw new Error('API externa no configurada');

  const res = await request(baseUrl, 'POST', '/api/v1/users/sign/in', { username, password });
  const token = res.data?.data?.access;
  if (!token) throw new Error('No se pudo autenticar en API externa');

  _token = token;
  _tokenExpiry = Date.now() + 55 * 60 * 1000; // 55 minutos
  return _token;
}

async function createExternalIncident(incident) {
  const enabled = await getSetting('ext_api_enabled');
  if (enabled !== '1') return;

  const baseUrl = await getSetting('ext_api_url');
  const token = await getToken();

  const body = {
    customer: incident.client_identificacion || incident.client_phone || '',
    incidentType: TYPE_MAP[incident.type] || 'soporte_internet',
    observation: incident.description,
  };

  const res = await request(baseUrl, 'POST', '/api/v1/incidence', body, token);
  if (res.status >= 400) {
    console.error('[ExtAPI] Error al crear incidencia externa, status:', res.status);
    return null;
  }
  const externalId = res.data?.data?.incidence_id ?? null;
  console.log(`[ExtAPI] Incidencia creada en sistema externo, external_id: ${externalId}`);
  return externalId;
}

// Resetear token en memoria al cambiar credenciales
function resetToken() { _token = null; _tokenExpiry = 0; }

module.exports = { createExternalIncident, resetToken };
