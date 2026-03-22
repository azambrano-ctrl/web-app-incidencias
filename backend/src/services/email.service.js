const nodemailer = require('nodemailer');
const { getSetting } = require('../modules/settings/settings.service');

async function sendEmail(to, subject, html, overrideConfig) {
  const cfg = overrideConfig || {};
  const enabled = cfg.email_enabled ?? await getSetting('email_enabled');
  if (enabled !== '1' && !overrideConfig) return;

  const host     = cfg.email_host     || await getSetting('email_host');
  const port     = Number(cfg.email_port || await getSetting('email_port') || 587);
  const secure   = (cfg.email_secure  || await getSetting('email_secure')) === '1';
  const user     = cfg.email_user     || await getSetting('email_user');
  const pass     = cfg.email_pass     || await getSetting('email_pass');
  const fromName = cfg.email_from_name  || await getSetting('email_from_name')  || 'IncidenciasISP';
  const fromAddr = cfg.email_from_email || await getSetting('email_from_email') || user;

  if (!host || !user || !pass) throw new Error('Configuración SMTP incompleta');

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({ from: `"${fromName}" <${fromAddr}>`, to, subject, html });
}

module.exports = { sendEmail };
