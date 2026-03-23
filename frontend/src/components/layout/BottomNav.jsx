import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function BottomNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const links = [
    { to: '/', label: 'Dashboard', icon: '📊', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/incidencias', label: 'Incidencias', icon: '🎫', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/mapa', label: 'Mapa', icon: '🗺️', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/clientes', label: 'Clientes', icon: '🏠', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/mantenimientos', label: 'Mantenim.', icon: '🔧', roles: ['admin', 'supervisor'] },
    { to: '/guardia', label: 'Guardia', icon: '🛡️', roles: ['admin', 'supervisor'] },
    { to: '/configuracion', label: 'Config', icon: '⚙️', roles: ['admin'] },
    { to: '/reportes', label: 'Reportes', icon: '📈', roles: ['admin', 'supervisor'] },
  ].filter(l => l.roles.includes(user?.role));

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) => `bottom-nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{l.icon}</span>
            <span>{l.label}</span>
          </NavLink>
        ))}
        <button className="bottom-nav-link" onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          <span>Salir</span>
        </button>
      </div>
    </nav>
  );
}
