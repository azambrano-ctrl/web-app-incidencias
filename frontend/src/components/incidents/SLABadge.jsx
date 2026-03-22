// Horario hábil: 8:30 – 18:00, lunes a sábado (hora Ecuador = UTC-5)
const START_MINS = 8 * 60 + 30;  // 510
const END_MINS   = 18 * 60;       // 1080

/**
 * Convierte UTC → representación ECU almacenada en los campos UTC del objeto Date.
 * Usar siempre getUTC*() sobre el resultado para obtener hora/día ECU,
 * evitando doble-desplazamiento en navegadores que ya están en UTC-5.
 */
function toEcu(date) {
  return new Date(date.getTime() - 5 * 3600000);
}

function businessMinsUntil(dueAt) {
  const nowLocal = toEcu(new Date());
  const dueLocal = toEcu(new Date(dueAt));
  if (dueLocal <= nowLocal) return (dueLocal - nowLocal) / 60000; // negativo

  let remaining = 0;
  let cur = new Date(nowLocal);

  while (cur < dueLocal) {
    const day  = cur.getUTCDay();
    const mins = cur.getUTCHours() * 60 + cur.getUTCMinutes();

    if (day === 0 || mins >= END_MINS) {
      // Saltar al siguiente día hábil 8:30
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(8, 30, 0, 0);
      while (cur.getUTCDay() === 0) cur.setUTCDate(cur.getUTCDate() + 1);
      continue;
    }
    if (mins < START_MINS) {
      cur.setUTCHours(8, 30, 0, 0);
      continue;
    }

    const chunk = Math.min(END_MINS - mins, (dueLocal - cur) / 60000);
    remaining += chunk;
    cur = new Date(cur.getTime() + chunk * 60000);
  }
  return remaining;
}

function fmtDue(dueAt) {
  const ecuNow = toEcu(new Date());
  const ecuDue = toEcu(new Date(dueAt));

  // Formatear hora en 24h usando campos UTC (representan hora ECU)
  const h = String(ecuDue.getUTCHours()).padStart(2, '0');
  const m = String(ecuDue.getUTCMinutes()).padStart(2, '0');
  const timeStr = `${h}:${m}`;

  // Comparar fechas usando campos UTC (representan fecha ECU)
  const dayKey  = d => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  const tmrwEcu = new Date(ecuNow.getTime() + 24 * 3600000);

  if (dayKey(ecuDue) === dayKey(ecuNow))   return `hoy ${timeStr}`;
  if (dayKey(ecuDue) === dayKey(tmrwEcu))  return `mañana ${timeStr}`;

  const DAYS = ['dom','lun','mar','mié','jue','vie','sáb'];
  return `${DAYS[ecuDue.getUTCDay()]} ${timeStr}`;
}

export function SLABadge({ dueAt, status }) {
  if (!dueAt || ['resolved', 'cancelled', 'closed'].includes(status)) return null;

  const bizMins = businessMinsUntil(dueAt);
  const bizH    = bizMins / 60;
  const dueLabel = fmtDue(dueAt);

  let color, bg, label;

  if (bizMins < 0) {
    // Vencida
    const overH = Math.abs(bizH);
    label = `Vencida · ${dueLabel}`;
    color = '#fff'; bg = '#ef4444';
  } else if (bizMins < 60) {
    // Menos de 1 hora hábil
    label = `${Math.round(bizMins)}min · ${dueLabel}`;
    color = '#fff'; bg = '#f97316';
  } else if (bizH < 3) {
    // Menos de 3 horas hábiles
    label = `${Math.round(bizH)}h · ${dueLabel}`;
    color = '#fff'; bg = '#f97316';
  } else {
    // Con tiempo suficiente
    label = `Vence ${dueLabel}`;
    color = '#166534'; bg = '#dcfce7';
  }

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: bg, color, whiteSpace: 'nowrap', display: 'inline-flex',
      alignItems: 'center', gap: 3,
    }}>
      ⏱ {label}
    </span>
  );
}
