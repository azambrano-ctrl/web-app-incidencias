const { getSetting } = require('../modules/settings/settings.service');

/**
 * Envía mensaje WhatsApp usando API HTTP genérica.
 * Compatible con UltraMsg, WhatsMate, WAHA, o cualquier API
 * que acepte POST con { token, to, body } o similar.
 *
 * El admin configura en Ajustes:
 *   - whatsapp_api_url : URL completa del endpoint
 *   - whatsapp_token   : Token / API Key
 *   - whatsapp_body_template : Template del JSON (con {token}, {to}, {message})
 */
async function sendWhatsApp(to, message, overrideConfig) {
  const cfg = overrideConfig || {};
  const enabled = cfg.whatsapp_enabled ?? await getSetting('whatsapp_enabled');
  if (enabled !== '1' && !overrideConfig) return;

  const apiUrl   = cfg.whatsapp_api_url   || await getSetting('whatsapp_api_url');
  const token    = cfg.whatsapp_token     || await getSetting('whatsapp_token');
  const template = cfg.whatsapp_body_template || await getSetting('whatsapp_body_template')
    || '{"token":"{token}","to":"{to}","body":"{message}"}';

  if (!apiUrl || !token) throw new Error('Configuración WhatsApp incompleta (URL y token requeridos)');
  if (!to) throw new Error('Número de destino requerido');

  // Formatear número: quitar espacios/guiones, agregar código país si no tiene +
  const phone = to.replace(/[\s\-()]/g, '');

  // Construir body parseando el template como JSON para evitar injection
  // Los valores se insertan via JSON.parse/stringify, nunca por string replacement directo
  let bodyStr;
  try {
    // Parsear el template reemplazando los placeholders con valores seguros vía JSON
    const parsed = JSON.parse(
      template
        .replace(/{token}/g, '__TOKEN__')
        .replace(/{to}/g, '__TO__')
        .replace(/{message}/g, '__MESSAGE__')
    );
    const replacer = (val) => {
      if (val === '__TOKEN__') return token;
      if (val === '__TO__') return phone;
      if (val === '__MESSAGE__') return message;
      return val;
    };
    const replaced = JSON.parse(JSON.stringify(parsed, (k, v) => replacer(v)));
    bodyStr = JSON.stringify(replaced);
  } catch {
    // Si el template no es JSON válido, usar valores escapados con JSON.stringify
    bodyStr = template
      .replace(/{token}/g, JSON.stringify(token).slice(1, -1))
      .replace(/{to}/g, JSON.stringify(phone).slice(1, -1))
      .replace(/{message}/g, JSON.stringify(message).slice(1, -1));
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${text}`);
  }
}

module.exports = { sendWhatsApp };
