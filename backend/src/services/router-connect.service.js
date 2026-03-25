/**
 * Servicio de conexión a routers MikroTik vía RouterOS API (puerto configurable).
 * Protocolo binario nativo de RouterOS — no requiere paquete externo.
 */
const net = require('net');

// ── Helpers del protocolo RouterOS ─────────────────────────────────────────

function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function encodeWord(word) {
  const w = Buffer.from(word, 'utf8');
  return Buffer.concat([encodeLength(w.length), w]);
}

function encodeSentence(words) {
  const parts = words.map(encodeWord);
  parts.push(Buffer.from([0])); // fin de sentencia
  return Buffer.concat(parts);
}

function decodeSentences(buf) {
  const sentences = [];
  let sentence = [];
  let i = 0;
  while (i < buf.length) {
    let len = buf[i];
    let extra = 0;
    if ((len & 0xe0) === 0xe0)      { len = ((len & 0x1f) << 24) | (buf[i+1] << 16) | (buf[i+2] << 8) | buf[i+3]; extra = 4; }
    else if ((len & 0xc0) === 0xc0) { len = ((len & 0x3f) << 16) | (buf[i+1] << 8) | buf[i+2]; extra = 3; }
    else if ((len & 0x80) === 0x80) { len = ((len & 0x7f) << 8) | buf[i+1]; extra = 2; }
    else extra = 1;

    i += extra;
    if (len === 0) { sentences.push(sentence); sentence = []; continue; }
    sentence.push(buf.slice(i, i + len).toString('utf8'));
    i += len;
  }
  return sentences;
}

// ── Conexión y ejecución de comandos ───────────────────────────────────────

function sendCommand(ip, port, username, password, commands, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let resolved = false;
    let commandsSent = false;
    const done = (val) => { if (!resolved) { resolved = true; socket.destroy(); resolve(val); } };
    const fail = (err) => { if (!resolved) { resolved = true; socket.destroy(); reject(err); } };

    socket.setTimeout(timeout);
    socket.on('timeout', () => fail(new Error('Timeout al conectar al router')));
    socket.on('error', fail);

    socket.connect(port, ip, () => {
      socket.write(encodeSentence(['/login', `=name=${username}`, `=password=${password}`]));
    });

    socket.on('data', (data) => {
      chunks.push(data);
      const buf = Buffer.concat(chunks);
      const sentences = decodeSentences(buf);
      if (sentences.length === 0) return;

      const hasDone = sentences.some(s => s.includes('!done'));
      const hasTrap = sentences.some(s => s.some(w => w.startsWith('!trap')));

      if (hasTrap) {
        const msg = sentences.flatMap(s => s).find(w => w.startsWith('=message='));
        return fail(new Error(msg ? msg.replace('=message=', '') : 'Error de autenticación'));
      }

      if (!hasDone) return; // respuesta incompleta, esperar más datos

      if (!commandsSent) {
        // Primera respuesta = login OK
        commandsSent = true;
        if (!commands) return done([]); // solo testConnection
        chunks.length = 0;
        for (const cmd of commands) socket.write(encodeSentence(cmd));
        return;
      }

      // Segunda respuesta = resultado de comandos
      const results = sentences
        .filter(s => s.length > 0 && s[0] === '!re')
        .map(s => {
          const obj = {};
          s.slice(1).forEach(w => {
            if (w.startsWith('=')) {
              const eq = w.indexOf('=', 1);
              obj[w.slice(1, eq)] = w.slice(eq + 1);
            }
          });
          return obj;
        });
      done(results);
    });
  });
}

// ── API pública ─────────────────────────────────────────────────────────────

async function testConnection(router) {
  try {
    await sendCommand(router.ip, router.api_port, router.username, router.password, null, 6000);
    return { ok: true, message: 'Conexión exitosa' };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function getClients(router) {
  const run = (cmds) => sendCommand(router.ip, router.api_port, router.username, router.password, cmds);
  const attempts = [
    { label: 'ppp',     cmds: [['/ppp/active/print']] },
    { label: 'hotspot', cmds: [['/ip/hotspot/active/print']] },
    { label: 'dhcp',    cmds: [['/ip/dhcp-server/lease/print']] },
    { label: 'queue',   cmds: [['/queue/simple/print']] },
  ];
  for (const { label, cmds } of attempts) {
    try {
      const rows = await run(cmds);
      console.log(`[RouterSvc] ${label}: ${rows.length} entradas`);
      if (rows.length) return { source: label, rows };
    } catch (e) {
      console.warn(`[RouterSvc] ${label} falló: ${e.message}`);
    }
  }
  return { source: null, rows: [] };
}

async function cutClient(router, address) {
  try {
    await sendCommand(
      router.ip, router.api_port, router.username, router.password,
      [['/ip/firewall/address-list/add', `=list=${router.cut_label}`, `=address=${address}`]]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

async function activateClient(router, address) {
  try {
    // Buscar entrada en la lista de corte y eliminarla
    const entries = await sendCommand(
      router.ip, router.api_port, router.username, router.password,
      [['/ip/firewall/address-list/print', `?list=${router.cut_label}`, `?address=${address}`]]
    );
    for (const entry of entries) {
      if (entry['.id']) {
        await sendCommand(
          router.ip, router.api_port, router.username, router.password,
          [['/ip/firewall/address-list/remove', `=.id=${entry['.id']}`]]
        );
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

module.exports = { testConnection, getClients, cutClient, activateClient };
