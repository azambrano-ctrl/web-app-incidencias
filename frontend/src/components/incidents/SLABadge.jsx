// Horario hábil: 8:30 – 18:00, lunes a sábado (hora Ecuador)
const START_MINS = 8 * 60 + 30;  // 510
const END_MINS   = 18 * 60;       // 1080

function toEcu(date) {
  // Ecuador = UTC-5
  return new Date(date.getTime() - 5 * 3600000);
}

function businessMinsUntil(dueAt) {
  const nowLocal = toEcu(new Date());
  const dueLocal = toEcu(new Date(dueAt));
  if (dueLocal <= nowLocal) return (dueLocal - nowLocal) / 60000; // negativo

  let remaining = 0;
  let cur = new Date(nowLocal);

  while (cur < dueLocal) {
    const day  = cur.getDay();
    const mins = cur.getHours() * 60 + cur.getMinutes();

    if (day === 0 || mins >= END_MINS) {
      // Saltar al siguiente día hábil 8:30
      cur.setDate(cur.getDate() + 1);
      cur.setHours(8, 30, 0, 0);
      while (cur.getDay() === 0) cur.setDate(cur.getDate() + 1);
      continue;
    }
    if (mins < START_MINS) {
      cur.setHours(8, 30, 0, 0);
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

  const timeStr = ecuDue.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const nowDay  = ecuNow.toDateString();
  const dueDay  = ecuDue.toDateString();

  const tmrw = new Date(ecuNow);
  tmrw.setDate(tmrw.getDate() + 1);

  if (dueDay === nowDay)            return `hoy ${timeStr}`;
  if (dueDay === tmrw.toDateString()) return `mañana ${timeStr}`;

  const DAYS = ['dom','lun','mar','mié','jue','vie','sáb'];
  return `${DAYS[ecuDue.getDay()]} ${timeStr}`;
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
