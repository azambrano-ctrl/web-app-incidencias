/**
 * Servicio de conexión a OLTs vía SSH.
 * Soporta: ZTE C300/C320/C600, Huawei MA5600/MA5800, FiberHome AN5516, VSOL V1600D, Nokia 7360
 */
const { Client } = require('ssh2');

// ── Utilidad SSH ─────────────────────────────────────────────────────────────

function sshExec(olt, commands, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; conn.end(); resolve(val); } };
    const fail = (err) => { if (!resolved) { resolved = true; conn.end(); reject(err); } };

    const timer = setTimeout(() => fail(new Error('Timeout SSH')), timeout);

    conn.on('ready', () => {
      conn.shell({ term: 'vt100', cols: 300, rows: 9999 }, (err, stream) => {
        if (err) return fail(err);
        stream.on('data', d => { output += d.toString(); });
        stream.stderr.on('data', d => { output += d.toString(); });
        stream.on('close', () => { clearTimeout(timer); done(output); });

        const cmds = Array.isArray(commands) ? commands : [commands];
        for (const cmd of cmds) stream.write(cmd + '\n');
        stream.write('exit\n');
      });
    });

    conn.on('error', fail);
    conn.connect({
      host: olt.ip,
      port: olt.ssh_port || 22,
      username: olt.username,
      password: olt.password,
      readyTimeout: timeout,
      algorithms: {
        kex: ['diffie-hellman-group14-sha1','diffie-hellman-group1-sha1','ecdh-sha2-nistp256','ecdh-sha2-nistp384','ecdh-sha2-nistp521'],
        cipher: ['aes128-ctr','aes192-ctr','aes256-ctr','aes128-cbc','3des-cbc'],
        serverHostKey: ['ssh-rsa','ssh-dss','ecdsa-sha2-nistp256','ecdsa-sha2-nistp384'],
        hmac: ['hmac-sha2-256','hmac-sha1','hmac-md5'],
      },
    });
  });
}

// ── Parsers por marca ────────────────────────────────────────────────────────

const BRANDS = {

  zte: {
    listONUs: async (olt, { port } = {}) => {
      const frame = olt.pon_frame || 1;
      const slot  = olt.pon_slot  || 1;
      const ports = olt.pon_ports || 8;
      const portList = port ? [parseInt(port)] : Array.from({ length: ports }, (_, i) => i + 1);
      const allCmds = ['terminal length 0'];
      for (const p of portList) {
        allCmds.push(`show gpon onu state gpon-olt_${frame}/${slot}/${p}`);
        allCmds.push(`show gpon onu baseinfo gpon-olt_${frame}/${slot}/${p}`);
      }
      const timeout = Math.max(30000, portList.length * 6000);
      const combined = await sshExec(olt, allCmds, timeout);
      if (process.env.OLT_DEBUG === '1') console.log('[OLT:ZTE] combined output:\n', combined);

      // Separar state y baseinfo del output combinado
      const stateOut = combined;
      const baseOut  = combined;

      // Parsear SN desde baseinfo: gpon-onu_1/1/1:10   ZTE-F625  sn  SN:GPON007AAE50  ready
      const snMap = {};
      const snRe = /gpon-onu_(\d+\/\d+\/\d+):(\d+)\s+\S+\s+\S+\s+SN:(\S+)/gi;
      let ms;
      while ((ms = snRe.exec(baseOut)) !== null) {
        snMap[`gpon-onu_${ms[1]}:${ms[2]}`] = ms[3];
      }

      // Parsear estado desde state: 5 columnas — OnuIndex Admin OMCC O7 Phase
      // gpon-onu_1/1/1:10   enable  enable  operation  working
      const onus = [];
      const stateRe = /gpon-onu_(\d+\/\d+\/\d+):(\d+)\s+\S+\s+\S+\s+\S+\s+(\S+)/gi;
      let m;
      while ((m = stateRe.exec(stateOut)) !== null) {
        const id = `gpon-onu_${m[1]}:${m[2]}`;
        const phase = m[3].toLowerCase();
        const status = phase === 'working' ? 'online' : 'offline';
        onus.push({ id, mac: snMap[id] || null, status, port: m[1] });
      }

      return onus;
    },

    // Señales ópticas en sesión separada (llamar después de listONUs)
    // Usa "show pon power onu-rx gpon-olt_F/S/P" por puerto — coincide con CLI real del ZTE
    getSignals: async (olt, onuIds) => {
      const online = onuIds.filter(Boolean);
      if (!online.length) return {};

      // Extraer puertos únicos desde los IDs: gpon-onu_1/1/4:10 → 1/1/4
      const portsSet = new Set();
      for (const id of online) {
        const m = id.match(/gpon-onu_(\d+\/\d+\/\d+):/i);
        if (m) portsSet.add(m[1]);
      }
      const ports = [...portsSet];

      const rxCmds = ports.map(p => `show pon power onu-rx gpon-olt_${p}`);
      const txCmds = ports.map(p => `show pon power onu-tx gpon-olt_${p}`);
      const powerTimeout = Math.max(30000, ports.length * 6000);

      let rxOut = '', txOut = '';
      try {
        const combined = await sshExec(olt, ['terminal length 0', ...rxCmds, ...txCmds], powerTimeout);
        rxOut = combined;
        txOut = combined;
      } catch (e) {
        console.error('[OLT:ZTE] Error señal óptica:', e.message);
      }

      if (process.env.OLT_DEBUG === '1') console.log('[OLT:ZTE] signal output:\n', rxOut);

      // Parsear Rx: "gpon-onu_1/1/1:10  -26.384(dbm)" o "N/A"
      const rxMap = {};
      const rxRe = /gpon-onu_(\d+\/\d+\/\d+):(\d+)\s+([-\d.]+)\(dbm\)/gi;
      let m;
      while ((m = rxRe.exec(rxOut)) !== null) {
        rxMap[`gpon-onu_${m[1]}:${m[2]}`] = parseFloat(m[3]);
      }

      // Parsear Tx: mismo formato
      const txMap = {};
      const txRe = /gpon-onu_(\d+\/\d+\/\d+):(\d+)\s+([-\d.]+)\(dbm\)/gi;
      // Buscar solo en el bloque después de los comandos onu-tx
      const txSection = txOut.split(/show pon power onu-tx/i).slice(1).join('');
      let t;
      while ((t = txRe.exec(txSection)) !== null) {
        txMap[`gpon-onu_${t[1]}:${t[2]}`] = parseFloat(t[3]);
      }

      const result = {};
      for (const id of online) {
        result[id] = {
          rxPower: rxMap[id] ?? null,
          txPower: txMap[id] ?? null,
        };
      }
      return result;
    },

    getSignal: async (olt, onuId) => {
      // onuId formato: gpon-onu_1/1/1:10
      // Comando correcto ZTE C320: show pon power attenuation gpon-onu_1/1/1:10
      // Salida:
      //  up    Rx :-29.013(dbm)   Tx:1.926(dbm)   30.939(dB)
      //  down  Tx :6.545(dbm)     Rx:-26.576(dbm)  33.121(dB)
      const out = await sshExec(olt, ['terminal length 0', `show pon power attenuation ${onuId}`]);
      if (process.env.OLT_DEBUG === '1') console.log('[OLT:ZTE] getSignal raw output:\n', out);
      const rx = (out.match(/up\s+Rx\s*:\s*([-\d.]+)\s*\(dbm\)/i) || [])[1];
      const tx = (out.match(/up\s+.*?Tx\s*:([-\d.]+)\s*\(dbm\)/i) || [])[1];
      return {
        rxPower: rx ? parseFloat(rx) : null,
        txPower: tx ? parseFloat(tx) : null,
      };
    },

    reboot: async (olt, onuId) => {
      await sshExec(olt, ['enable', `reboot gpon onu ${onuId}`, 'y']);
      return { ok: true };
    },

    deleteONU: async (olt, onuId) => {
      // onuId: gpon-onu_1/1/2:24 → interface gpon-olt_1/1/2, no onu 24
      const m = onuId.match(/gpon-onu_(\d+\/\d+\/\d+):(\d+)/i);
      if (!m) throw new Error(`ONU ID inválido: ${onuId}`);
      const [, port, index] = m;
      const cmds = ['enable', 'config', `interface gpon-olt_${port}`, `no onu ${index}`, 'quit', 'quit'];
      await sshExec(olt, cmds, 20000);
      return { ok: true };
    },

    provision: async (olt, { port, sn, profile, vlan, nombre, description }) => {
      const desc = nombre || description || sn;
      const cmds = [
        'enable', 'config',
        `interface gpon-olt_${port}`,
        `onu ${sn.slice(-2)} type AUTO sn-auth ${sn} omci ont-lineprofile-id ${profile} ont-srvprofile-id ${profile}`,
        `onu-id ${sn.slice(-2)} description ${desc}`,
        'quit',
        `interface gpon-onu_${port}:${sn.slice(-2)}`,
        `service-port 1 vport 1 user-vlan ${vlan} vlan ${vlan}`,
        'quit',
      ];
      await sshExec(olt, cmds);
      return { ok: true };
    },
  },

  huawei: {
    listONUs: async (olt) => {
      const out = await sshExec(olt, ['enable', 'display ont info summary all']);
      const onus = [];
      const re = /(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+(online|offline|los)\s+(\S+)/gi;
      let m;
      while ((m = re.exec(out)) !== null) {
        onus.push({ id: `${m[1]}/${m[2]}/${m[3]}`, mac: m[5], status: m[4].toLowerCase(), port: `${m[1]}/${m[2]}` });
      }
      return onus;
    },

    getSignal: async (olt, onuId) => {
      const [frame, slot, port, ont] = onuId.split('/');
      const out = await sshExec(olt, ['enable', `display ont optical-info ${frame} ${slot} ${port} ${ont}`]);
      const rx = (out.match(/Rx optical power\(dBm\)\s*:\s*([-\d.]+)/i) || [])[1];
      const tx = (out.match(/Tx optical power\(dBm\)\s*:\s*([-\d.]+)/i) || [])[1];
      return { rxPower: rx ? parseFloat(rx) : null, txPower: tx ? parseFloat(tx) : null };
    },

    reboot: async (olt, onuId) => {
      const parts = onuId.split('/');
      const [frame, slot, port, ont] = parts;
      await sshExec(olt, ['enable', `ont reset ${frame} ${slot} ${port} ${ont}`, 'y']);
      return { ok: true };
    },

    provision: async (olt, { port, sn, profile, vlan, description }) => {
      const [frame, slot, ponPort] = port.split('/');
      const cmds = [
        'enable', 'config',
        `interface gpon ${frame}/${slot}`,
        `ont add ${ponPort} sn-auth ${sn} omci ont-lineprofile-id ${profile} ont-srvprofile-id ${profile} desc ${description}`,
        'quit',
      ];
      await sshExec(olt, cmds);
      return { ok: true };
    },
  },

  fiberhome: {
    listONUs: async (olt) => {
      const out = await sshExec(olt, ['showonu allinfo']);
      const onus = [];
      const re = /(\S+)\s+(\S+)\s+(active|inactive|los|losi)\s*/gi;
      let m;
      while ((m = re.exec(out)) !== null) {
        const status = m[3].toLowerCase() === 'active' ? 'online' : 'offline';
        onus.push({ id: m[1], mac: m[2], status, port: m[1].split('-')[0] });
      }
      return onus;
    },

    getSignal: async (olt, onuId) => {
      const out = await sshExec(olt, [`showonu optical ${onuId}`]);
      const rx = (out.match(/RxPower\s*:\s*([-\d.]+)/i) || [])[1];
      const tx = (out.match(/TxPower\s*:\s*([-\d.]+)/i) || [])[1];
      return { rxPower: rx ? parseFloat(rx) : null, txPower: tx ? parseFloat(tx) : null };
    },

    reboot: async (olt, onuId) => {
      await sshExec(olt, [`reboot onu ${onuId}`]);
      return { ok: true };
    },

    provision: async (olt, { port, sn, profile, vlan, description }) => {
      await sshExec(olt, [`addonu port ${port} sn ${sn} profile ${profile} vlan ${vlan} name ${description}`]);
      return { ok: true };
    },
  },

  vsol: {
    listONUs: async (olt) => {
      const out = await sshExec(olt, ['show onu all']);
      const onus = [];
      const re = /(\d+\/\d+\/\d+)\s+(\S+)\s+(online|offline)\s*/gi;
      let m;
      while ((m = re.exec(out)) !== null) {
        onus.push({ id: m[1], mac: m[2], status: m[3].toLowerCase(), port: m[1].split('/').slice(0, 2).join('/') });
      }
      return onus;
    },

    getSignal: async (olt, onuId) => {
      const out = await sshExec(olt, [`show onu optical-info ${onuId}`]);
      const rx = (out.match(/rx[-_]power\s*:\s*([-\d.]+)/i) || [])[1];
      const tx = (out.match(/tx[-_]power\s*:\s*([-\d.]+)/i) || [])[1];
      return { rxPower: rx ? parseFloat(rx) : null, txPower: tx ? parseFloat(tx) : null };
    },

    reboot: async (olt, onuId) => {
      await sshExec(olt, [`reboot onu ${onuId}`]);
      return { ok: true };
    },

    provision: async (olt, { port, sn, profile, vlan, description }) => {
      await sshExec(olt, [`add onu port ${port} sn ${sn} vlan ${vlan} profile ${profile} desc ${description}`]);
      return { ok: true };
    },
  },

  nokia: {
    listONUs: async (olt) => {
      const out = await sshExec(olt, ['environment no more', 'show equipment ont summary']);
      const onus = [];
      const re = /(\d+\/\d+\/\d+\/\d+)\s+(\S+)\s+(operational|los|mismatch)\s*/gi;
      let m;
      while ((m = re.exec(out)) !== null) {
        const status = m[3].toLowerCase() === 'operational' ? 'online' : 'offline';
        onus.push({ id: m[1], mac: m[2], status, port: m[1].split('/').slice(0, 3).join('/') });
      }
      return onus;
    },

    getSignal: async (olt, onuId) => {
      const out = await sshExec(olt, [`show equipment ont optics ${onuId}`]);
      const rx = (out.match(/rx-signal-level\s+([-\d.]+)/i) || [])[1];
      const tx = (out.match(/tx-signal-level\s+([-\d.]+)/i) || [])[1];
      return { rxPower: rx ? parseFloat(rx) : null, txPower: tx ? parseFloat(tx) : null };
    },

    reboot: async (olt, onuId) => {
      await sshExec(olt, [`reboot ont ${onuId}`]);
      return { ok: true };
    },

    provision: async (olt, { port, sn, profile, vlan, description }) => {
      await sshExec(olt, [
        `configure equipment ont interface ${port}/1 sw-ver-pland disabled`,
        `configure equipment ont interface ${port}/1 sernum ${sn}`,
        `configure equipment ont interface ${port}/1 desc "${description}"`,
      ]);
      return { ok: true };
    },
  },
};

// ── API pública ──────────────────────────────────────────────────────────────

function getBrand(olt) {
  const b = BRANDS[olt.brand];
  if (!b) throw new Error(`Marca OLT no soportada: ${olt.brand}`);
  return b;
}

async function testConnection(olt) {
  try {
    await sshExec(olt, ['exit'], 8000);
    return { ok: true, message: 'Conexión SSH exitosa' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function listONUs(olt, options = {}) {
  return getBrand(olt).listONUs(olt, options);
}

async function getSignal(olt, onuId) {
  return getBrand(olt).getSignal(olt, onuId);
}

async function rebootONU(olt, onuId) {
  return getBrand(olt).reboot(olt, onuId);
}

async function deleteONU(olt, onuId) {
  const b = getBrand(olt);
  if (!b.deleteONU) throw new Error('Esta marca no soporta eliminación de ONU');
  return b.deleteONU(olt, onuId);
}

async function provisionONU(olt, data) {
  return getBrand(olt).provision(olt, data);
}

async function getSignals(olt, onuIds) {
  const b = BRANDS[olt.brand];
  if (b?.getSignals) return b.getSignals(olt, onuIds);
  // Fallback para marcas sin getSignals: consultar una por una
  const result = {};
  for (const id of onuIds) {
    try { result[id] = await b.getSignal(olt, id); }
    catch { result[id] = { rxPower: null, txPower: null }; }
  }
  return result;
}

module.exports = { testConnection, listONUs, getSignal, getSignals, rebootONU, provisionONU, deleteONU };
