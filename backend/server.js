require('dotenv').config();
const http = require('http');
const { initDb } = require('./src/config/database');
const app = require('./src/app');
const { initSocket } = require('./src/config/socket');
const { runMigrations } = require('./src/db/migrations/001_initial');
const { runMigrations002 } = require('./src/db/migrations/002_features');
const { runSeeds } = require('./src/db/seeds/001_admin');
const { startReminderJob, setIo: setReminderIo } = require('./src/jobs/reminder.job');
const { setIo: setIncidentsIo } = require('./src/modules/incidents/incidents.service');

const PORT = process.env.PORT || 3001;

async function main() {
  // 1. Inicializar base de datos
  initDb();

  // 2. Ejecutar migraciones y semillas
  await runMigrations();
  await runMigrations002();
  await runSeeds();

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
    console.log(`🗄️  Base de datos: Supabase (PostgreSQL)`);
    console.log(`\nUsuarios de prueba:`);
    console.log(`  Admin:      admin@incidencias.com / admin123`);
    console.log(`  Supervisor: supervisor@incidencias.com / supervisor123`);
    console.log(`  Técnico:    tecnico@incidencias.com / tecnico123\n`);
  });
}

main().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err.message);
  process.exit(1);
});
