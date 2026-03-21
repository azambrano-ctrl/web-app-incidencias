import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotificationStore } from '../../store/notificationStore';
import { useNavigate } from 'react-router-dom';

export default function BottomNav() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const links = [
    { to: '/', label: 'Dashboard', icon: '📊', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/incidencias', label: 'Incidencias', icon: '🎫', roles: ['admin', 'supervisor', 'technician'] },
    { to: '/mapa', label: 'Mapa', icon: '🗺️', roles: ['admin', 'supervisor', 'technician'] },
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
        {/* Notificaciones en bottom nav */}
        <button className="bottom-nav-link" style={{ position: 'relative' }}
          onClick={() => document.querySelector('.bell-btn')?.click()}>
          <span className="nav-icon" style={{ position: 'relative', display: 'inline-block' }}>
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -6,
                background: '#ef4444', color: '#fff', borderRadius: '50%',
                width: 16, height: 16, fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </span>
          <span>Alertas</span>
        </button>
      </div>
    </nav>
  );
}
