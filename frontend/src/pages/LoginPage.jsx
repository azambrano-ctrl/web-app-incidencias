import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { user } = await login(email, password);
      loginUser(user);
      const next = searchParams.get('next');
      navigate(next && next.startsWith('/') ? next : '/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* grid de fondo */}
      <div className="login-bg-grid" aria-hidden />

      <div className="login-card">

        {/* logo con animación de señal */}
        <div className="login-logo">
          <div className="signal-container" aria-hidden>
            <div className="signal-ring ring-1" />
            <div className="signal-ring ring-2" />
            <div className="signal-ring ring-3" />
            <span className="signal-icon-center">📡</span>
          </div>
          <h1>IncidenciasISP</h1>
          <p>Sistema de Gestión de Incidencias</p>

          <div className="login-status">
            <span className="login-status-dot" />
            Sistema operativo
          </div>
        </div>

        {/* formulario */}
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              autoComplete="email"
              required
              autoFocus
            />
          </label>

          <label>
            Contraseña
            <div className="login-input-wrap">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="pass-toggle"
                onClick={() => setShowPass(p => !p)}
                tabIndex={-1}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="btn btn-login-primary btn-full"
            disabled={loading}
          >
            {loading
              ? <><span className="login-spinner" />Verificando...</>
              : '→ Ingresar al sistema'}
          </button>
        </form>

        <p className="login-hint">Contacta al administrador para obtener acceso.</p>
      </div>
    </div>
  );
}
