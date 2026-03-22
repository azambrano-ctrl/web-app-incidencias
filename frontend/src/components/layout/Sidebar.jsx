import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const { user, logout } = useAuth();

  const links = [
    { to: '/', label: '📊 Dashboard', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/incidencias', label: '🎫 Incidencias', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/mapa', label: '🗺️ Mapa', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/clientes', label: '🏠 Clientes', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/mantenimientos', label: '🔧 Mantenimientos', roles: ['admin', 'supervisor'] },
    { to: '/guardia', label: '🛡️ Guardia', roles: ['admin', 'supervisor'] },
    { to: '/usuarios', label: '👥 Usuarios', roles: ['admin'] },
    { to: '/reportes', label: '📈 Reportes', roles: ['admin', 'supervisor'] },
    { to: '/configuracion', label: '⚙️ Configuración', roles: ['admin'] },
  ].filter(l => l.roles.includes(user?.role));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">📡</span>
        <span className="logo-text">IncidenciasISP</span>
      </div>

      <nav className="sidebar-nav">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className="user-role">{user?.role === 'admin' ? 'Administrador' : user?.role === 'supervisor' ? 'Supervisor' : 'Técnico'}</span>
        </div>
        <button onClick={logout} className="logout-btn" title="Cerrar sesión">⏻</button>
      </div>
    </aside>
  );
}
