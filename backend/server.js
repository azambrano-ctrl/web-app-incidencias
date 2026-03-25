require('dotenv').config();
const http = require('http');
const { initDb } = require('./src/config/database');
const app = require('./src/app');
const { initSocket } = require('./src/config/socket');
const { runMigrations } = require('./src/db/migrations/001_initial');
const { runMigrations002 } = require('./src/db/migrations/002_features');
const { runMigrations003 } = require('./src/db/migrations/003_maintenance_oncall');
const { runMigrations004 } = require('./src/db/migrations/004_audit_log');
const { runMigrations005 } = require('./src/db/migrations/005_network_nodes');
const { runMigrations006 } = require('./src/db/migrations/006_network_splices');
const { runMigrations007 } = require('./src/db/migrations/007_network_layer');
const { runMigrations008 } = require('./src/db/migrations/008_external_id');
const { runMigrations009 } = require('./src/db/migrations/009_routers');
const { runMigrations010 } = require('./src/db/migrations/010_olts');
const { runSeeds } = require('./src/db/seeds/001_admin');
const { startReminderJob, setIo: setReminderIo } = require('./src/jobs/reminder.job');
const { setIo: setIncidentsIo } = require('./src/modules/incidents/incidents.service');

const PORT = process.env.PORT || 3001;

async function main() {
  // 0. Validar JWT_SECRET antes de arrancar
  const INSECURE = ['cambia_esto_por_una_cadena_secreta_larga', 'secret', 'jwt_secret', ''];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || INSECURE.includes(process.env.JWT_SECRET)) {
    console.error('\n❌ SEGURIDAD: JWT_SECRET no configurado o es el valor de ejemplo.');
    console.error('   Genera uno seguro con:');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    console.error('   Luego agrégalo en las variables de entorno de Railway.\n');
    process.exit(1);
  }

  // 1. Inicializar base de datos
  initDb();

  // 2. Ejecutar migraciones y semillas
  await runMigrations();
  await runMigrations002();
  await runMigrations003();
  await runMigrations004();
  await runMigrations005();
  await runMigrations006();
  await runMigrations007();
  await runMigrations008();
  await runMigrations009();
  await runMigrations010();
  await runSeeds();

  // 2b. Validar configuración de APIs externas (advertencia, no fatal)
  try {
    const { getSetting } = require('./src/modules/settings/settings.service');
    const gmKey = await getSetting('google_maps_key');
    if (gmKey && !gmKey.startsWith('AIza')) {
      console.warn('⚠️  [Config] google_maps_key no tiene el formato esperado de Google Maps (debe empezar con "AIza"). Verifica la clave en Configuración.');
    }
    const waUrl = await getSetting('whatsapp_api_url');
    if (waUrl && !/^https?:\/\/.+/.test(waUrl)) {
      console.warn('⚠️  [Config] whatsapp_api_url no parece una URL válida.');
    }
  } catch (e) {
    // No detener el arranque si falla esta validación
  }

  // 3. Crear servidor HTTP
  const server = http.createServer(app);

  // 4. Inicializar Socket.io
  const io = initSocket(server);
  setIncidentsIo(io);
  setReminderIo(io);

  // 5. Iniciar job de recordatorios
  startReminderJob();

  // 6. Escuchar
  server.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Socket.io activo`);
    console.log(`🗄️  Base de datos: Supabase (PostgreSQL)\n`);
  });
}

main().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err.message);
  process.exit(1);
});
