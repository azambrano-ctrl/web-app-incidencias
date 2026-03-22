function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    // En producción no exponer detalles internos (rutas de archivo, esquema de BD, etc.)
    console.error('[Error]', err.stack || err.message);
    return res.status(status).json({ error: 'Error interno del servidor' });
  }

  // Errores 4xx (validación, autorización) sí se devuelven al cliente
  console.warn('[Warn]', err.message);
  res.status(status).json({ error: err.message });
}

module.exports = { errorHandler };
