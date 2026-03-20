import NotificationBell from '../notifications/NotificationBell';
import { useSocket } from '../../context/SocketContext';

export default function Topbar({ title }) {
  const { connected } = useSocket();

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        <span className={`socket-status ${connected ? 'online' : 'offline'}`} title={connected ? 'Conectado en tiempo real' : 'Sin conexión en tiempo real'}>
          {connected ? '● En vivo' : '○ Desconectado'}
        </span>
        <NotificationBell />
      </div>
    </header>
  );
}
