import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { normalizeRole } from '../utils/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nds_user');
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    const token = localStorage.getItem('nds_token');
    function clearSession() {
      localStorage.removeItem('nds_token');
      localStorage.removeItem('nds_user');
      localStorage.removeItem('nds_attendance_log_id');
      setUser(null);
    }

    window.addEventListener('nds-auth-cleared', clearSession);

    if (!token) {
      return () => window.removeEventListener('nds-auth-cleared', clearSession);
    }

    let isMounted = true;
    api.get('/auth/me')
      .then(({ data }) => {
        if (!isMounted) return;
        localStorage.setItem('nds_user', JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(() => {
        if (!isMounted) return;
        clearSession();
      });

    return () => {
      isMounted = false;
      window.removeEventListener('nds-auth-cleared', clearSession);
    };
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('nds_token', data.token);
    localStorage.setItem('nds_user', JSON.stringify(data.user));
    if (data.attendanceLogId) {
      localStorage.setItem('nds_attendance_log_id', String(data.attendanceLogId));
    }
    setUser(data.user);
    if (data.attendanceStatus === 'created' && ['CO_ADMIN', 'PRODUCTION_EMPLOYEE'].includes(normalizeRole(data.user.role))) {
      window.setTimeout(() => window.alert('Morning attendance confirmed for today.'), 250);
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Local session cleanup should still happen if the network is unavailable.
    }
    localStorage.removeItem('nds_token');
    localStorage.removeItem('nds_user');
    localStorage.removeItem('nds_attendance_log_id');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
