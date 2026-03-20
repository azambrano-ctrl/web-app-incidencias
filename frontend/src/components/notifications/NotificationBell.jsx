import { useEffect, useState, useRef } from 'react';
import { useNotificationStore } from '../../store/notificationStore';
import { useSocket } from '../../context/SocketContext';
import { getNotifications, getUnreadCount, markAllAsRead, markAsRead } from '../../api/notifications.api';
import { toast } from 'react-hot-toast';
import { STATUS_LABELS } from '../../utils/constants';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const { unreadCount, setUnreadCount, increment, resetCount } = useNotificationStore();
  const { socket } = useSocket();
  const ref = useRef();

  useEffect(() => {
    getUnreadCount().then(d => setUnreadCount(d.unread)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      increment();
      setNotifications(prev => [notif, ...prev]);
      toast(notif.message, { icon: '🔔', duration: 5000 });
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [socket]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = async () => {
    if (!open) {
      const data = await getNotifications();
      setNotifications(data);
    }
    setOpen(!open);
  };

  const handleMarkAll = async () => {
    await markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    resetCount();
  };

  const handleMarkOne = async (id) => {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: 1 } : n));
    setUnreadCount(Math.max(0, unreadCount - 1));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={handleOpen} className="bell-btn" aria-label="Notificaciones">
        🔔
        {unreadCount > 0 && (
          <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-drawer">
          <div className="notif-header">
            <span>Notificaciones</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} className="notif-mark-all">
                Marcar todo leído
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 && (
              <p className="notif-empty">Sin notificaciones</p>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                className={`notif-item ${n.read ? 'read' : 'unread'}`}
                onClick={() => !n.read && handleMarkOne(n.id)}
              >
                <p className="notif-msg">{n.message}</p>
                {n.ticket_number && (
                  <span className="notif-ticket">{n.ticket_number}</span>
                )}
                <span className="notif-time">
                  {new Date(n.created_at).toLocaleString('es-HN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
