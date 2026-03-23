import { createContext, useContext, useState, useCallback } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

// Solo guardamos info del usuario (nombre, rol) — nunca el token
// El token JWT vive en cookie httpOnly: JS no puede leerlo ni robarlo
function loadUser() {
  try {
    const raw = sessionStorage.getItem('user_info');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUser);

  const loginUser = useCallback((userInfo) => {
    sessionStorage.setItem('user_info', JSON.stringify(userInfo));
    // Backup en localStorage para permitir acceso offline
    localStorage.setItem('offline_user_info', JSON.stringify(userInfo));
    setUser(userInfo);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignorar */ }
    sessionStorage.removeItem('user_info');
    localStorage.removeItem('offline_user_info');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loginUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
