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
  const enabled = cfg.whatsapp_enabled ?? getSetting('whatsapp_enabled');
  if (enabled !== '1' && !overrideConfig) return;

  const apiUrl   = cfg.whatsapp_api_url   || getSetting('whatsapp_api_url');
  const token    = cfg.whatsapp_token     || getSetting('whatsapp_token');
  const template = cfg.whatsapp_body_template || getSetting('whatsapp_body_template')
    || '{"token":"{token}","to":"{to}","body":"{message}"}';

  if (!apiUrl || !token) throw new Error('Configuración WhatsApp incompleta (URL y token requeridos)');
  if (!to) throw new Error('Número de destino requerido');

  // Formatear número: quitar espacios/guiones, agregar código país si no tiene +
  const phone = to.replace(/[\s\-()]/g, '');

  const bodyStr = template
    .replace(/{token}/g, token)
    .replace(/{to}/g, phone)
    .replace(/{message}/g, message.replace(/"/g, '\\"'));

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
