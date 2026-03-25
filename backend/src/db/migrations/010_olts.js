const { getDb } = require('../../config/database');

async function runMigrations010() {
  const db = getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS olts (
      id               SERIAL PRIMARY KEY,
      description      TEXT NOT NULL,
      ip               TEXT NOT NULL,
      username         TEXT NOT NULL,
      password         TEXT NOT NULL,
      ssh_port         INTEGER NOT NULL DEFAULT 22,
      brand            TEXT NOT NULL DEFAULT 'zte'
                         CHECK (brand IN ('zte','huawei','fiberhome','vsol','nokia')),
      connection_type  TEXT NOT NULL DEFAULT 'ssh'
                         CHECK (connection_type IN ('ssh','telnet','snmp')),
      snmp_community   TEXT DEFAULT 'public',
      status           TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','inactive')),
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Insertar OLTs de ejemplo si la tabla está vacía
  const { rows } = await db.query('SELECT COUNT(*) as c FROM olts');
  if (parseInt(rows[0].c) === 0) {
    await db.query(`
      INSERT INTO olts (description, ip, username, password, ssh_port, brand, connection_type, status) VALUES
        ('OLT-CENTRAL ZTE C300',   '192.168.1.10', 'admin', 'admin123', 22, 'zte',      'ssh', 'active'),
        ('OLT-NORTE Huawei MA5800','192.168.1.11', 'root',  'huawei',   22, 'huawei',   'ssh', 'active'),
        ('OLT-SUR FiberHome',      '192.168.1.12', 'admin', 'fiberhome',22, 'fiberhome','ssh', 'inactive'),
        ('OLT-ESTE VSOL V1600D',   '192.168.1.13', 'admin', 'vsol1234', 22, 'vsol',     'ssh', 'active'),
        ('OLT-OESTE Nokia 7360',   '192.168.1.14', 'isadmin','nokia123',22, 'nokia',    'ssh', 'inactive')
    `);
    console.log('[Migration 010] OLTs de ejemplo insertadas');
  }

  console.log('[Migration 010] olts OK');
}

module.exports = { runMigrations010 };
