import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!user || !token) return;

    // Usar VITE_SOCKET_URL si está definida, sino derivar desde VITE_API_URL
    const socketUrl = import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.VITE_API_URL || '').replace('/api/v1', '');

    console.log('[Socket] Conectando a:', socketUrl);

    const socket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      timeout: 20000,
      forceNew: true,
    });

    socket.on('connect', () => {
      console.log('[Socket] Conectado ✅ id:', socket.id);
      setConnected(true);
    });
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Desconectado:', reason);
      setConnected(false);
    });
    socket.on('connect_error', (err) => {
      console.error('[Socket] Error de conexión:', err.message, err);
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
