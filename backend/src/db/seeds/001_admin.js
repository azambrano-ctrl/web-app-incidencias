const bcrypt = require('bcryptjs');
const { getDb } = require('../../config/database');

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let p = '';
  for (let i = 0; i < 16; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

async function runSeeds() {
  const db = getDb();
  const { rows } = await db.query('SELECT COUNT(*) as c FROM users');
  if (parseInt(rows[0].c) > 0) return; // ya hay usuarios, no sobrescribir

  // Usar contraseña de env si existe, sino generar una aleatoria segura
  const adminPass = process.env.INITIAL_ADMIN_PASSWORD || generatePassword();
  const hash = bcrypt.hashSync(adminPass, 10);

  await db.query(
    `INSERT INTO users (name, email, password, role, phone) VALUES ($1,$2,$3,$4,$5)`,
    ['Administrador', 'admin@incidencias.com', hash, 'admin', '00000000']
  );

  console.log('\n========================================');
  console.log('  ✅ USUARIO ADMIN CREADO (primer inicio)');
  console.log('  Email:    admin@incidencias.com');
  console.log(`  Password: ${adminPass}`);
  console.log('  ⚠️  Cambia esta contraseña inmediatamente');
  console.log('========================================\n');
}

module.exports = { runSeeds };
