/**
 * Horario hábil: lunes–sábado 08:30–18:00 hora Ecuador (UTC-5)
 */
const UTC_OFFSET_MS = -5 * 3600000; // Ecuador = UTC-5
const START_MINS = 8 * 60 + 30;     // 510  (08:30)
const END_MINS   = 18 * 60;          // 1080 (18:00)

/**
 * toLocal / toUTC almacenan la hora ECU en los campos UTC del objeto Date.
 * Usar siempre getUTC*() / setUTC*() para leer/escribir hora ECU,
 * así el resultado es correcto cualquiera sea el timezone del servidor.
 */
function toLocal(utcDate) {
  return new Date(utcDate.getTime() + UTC_OFFSET_MS);
}
function toUTC(localDate) {
  return new Date(localDate.getTime() - UTC_OFFSET_MS);
}

/** Lunes–Sábado son días hábiles (getUTCDay(): 0=dom,6=sáb) */
function isBusinessDay(localDate) {
  return localDate.getUTCDay() !== 0; // excluye domingo
}

function businessStartOfDay(localDate) {
  const d = new Date(localDate);
  d.setUTCHours(8, 30, 0, 0);
  return d;
}

/** Siguiente inicio de jornada (saltando domingos) */
function nextBusinessStart(localDate) {
  const d = new Date(localDate);
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(8, 30, 0, 0);
  while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); // saltar domingos
  return d;
}

/**
 * Agrega N horas hábiles (8:30-18:00 lun-sáb) a una fecha UTC.
 * Devuelve fecha UTC.
 */
function addBusinessHours(utcDate, hours) {
  let local = toLocal(new Date(utcDate));

  // Normalizar punto de inicio
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (!isBusinessDay(local) || mins >= END_MINS) {
    local = nextBusinessStart(local);
  } else if (mins < START_MINS) {
    local = businessStartOfDay(local);
  }

  let remaining = hours * 60; // en minutos

  while (remaining > 0) {
    const minsNow = local.getUTCHours() * 60 + local.getUTCMinutes();
    const minsLeft = END_MINS - minsNow;

    if (remaining <= minsLeft) {
      local = new Date(local.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= minsLeft;
      local = nextBusinessStart(local);
    }
  }

  return toUTC(local);
}

/**
 * Minutos hábiles que faltan hasta dueAtUTC desde ahora.
 * Negativo si ya venció.
 */
function businessMinutesUntil(dueAtUTC) {
  const nowLocal = toLocal(new Date());
  const dueLocal = toLocal(new Date(dueAtUTC));

  if (dueLocal <= nowLocal) {
    // Devolver diferencia negativa en minutos (aproximada en tiempo real)
    return (dueLocal.getTime() - nowLocal.getTime()) / 60000;
  }

  let remaining = 0;
  let cur = new Date(nowLocal);

  while (cur < dueLocal) {
    const day = cur.getUTCDay();
    const minsNow = cur.getUTCHours() * 60 + cur.getUTCMinutes();

    if (day === 0 || minsNow >= END_MINS) {
      cur = nextBusinessStart(cur);
      continue;
    }
    if (minsNow < START_MINS) {
      cur = businessStartOfDay(cur);
      continue;
    }

    const minsToEndOrDue = Math.min(
      END_MINS - minsNow,
      (dueLocal.getTime() - cur.getTime()) / 60000
    );
    remaining += minsToEndOrDue;
    cur = new Date(cur.getTime() + minsToEndOrDue * 60000);
  }

  return remaining;
}

/**
 * ¿Está ahora dentro del horario hábil?
 */
function isNowBusinessHours() {
  const local = toLocal(new Date());
  const mins  = local.getUTCHours() * 60 + local.getUTCMinutes();
  return isBusinessDay(local) && mins >= START_MINS && mins < END_MINS;
}

module.exports = { addBusinessHours, businessMinutesUntil, isNowBusinessHours, toLocal, nextBusinessStart };
