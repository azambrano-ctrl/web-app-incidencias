/**
 * Script de prueba para la API externa LSF Cloud
 * Uso: node test-external-api.js <url> <usuario> <password>
 * Ejemplo: node test-external-api.js https://api.lsfcloud.com usuario pass
 */
const https = require('https');
const http = require('http');

const [,, BASE_URL, USERNAME, PASSWORD] = process.argv;

if (!BASE_URL || !USERNAME || !PASSWORD) {
  console.error('Uso: node test-external-api.js <url> <usuario> <password>');
  process.exit(1);
}

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
      rejectUnauthorized: false,
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

async function main() {
  console.log('\n=== TEST API EXTERNA LSF CLOUD ===');
  console.log('URL:', BASE_URL);

  // 1. Login
  console.log('\n[1] Autenticando...');
  const loginRes = await request(BASE_URL, 'POST', '/api/v1/users/sign/in', { username: USERNAME, password: PASSWORD });
  console.log('   Status:', loginRes.status);
  console.log('   Response:', JSON.stringify(loginRes.data, null, 2));

  const token = loginRes.data?.data?.access ?? loginRes.data?.token;
  if (!token) {
    console.error('\n❌ No se obtuvo token. Verifica credenciales y URL.');
    return;
  }
  console.log('   Token obtenido:', token.substring(0, 30) + '...');

  // 2. Crear incidencia de prueba
  console.log('\n[2] Creando incidencia de prueba...');
  const incRes = await request(BASE_URL, 'POST', '/api/v1/incidence', {
    customer: '0000000000',
    incidentType: 'soporte_internet',
    observation: '[PRUEBA] Test desde script de integración - puede eliminarse',
  }, token);
  console.log('   Status:', incRes.status);
  console.log('   Response completo:', JSON.stringify(incRes.data, null, 2));

  // 3. Mostrar el ID retornado
  const extId = incRes.data?.data?.incidence_id ?? incRes.data?.id ?? incRes.data?.incidence_id;
  if (extId) {
    console.log('\n✅ ID externo retornado:', extId);
    console.log('   (Este es el valor que se guardará en incidents.external_id)');
  } else {
    console.log('\n⚠️  No se encontró ID en el response. Revisa la estructura del response arriba.');
  }
}

main().catch(e => console.error('\n❌ Error:', e.message));
