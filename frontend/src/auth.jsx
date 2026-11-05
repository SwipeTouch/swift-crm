import { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => { setUser(r.data.user); setTenant(r.data.tenant || null); })
      .catch(() => localStorage.removeItem('crm_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (clientCode, email, password) => {
    const code = String(clientCode).toUpperCase().trim();
    const r = await api.post('/auth/login', { clientCode: code, email, password });
    localStorage.setItem('crm_token', r.data.token);
    localStorage.setItem('crm_client_code', code); // prefill next time
    setUser(r.data.user);
    setTenant(r.data.tenant || null);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem('crm_token');
    setUser(null);
    setTenant(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, tenant, setUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Role helpers used across the UI.
export const isAdmin = (u) => u?.role === 'SUPER_ADMIN';
export const isManager = (u) => u?.role === 'MANAGER';
export const canManageData = (u) => u?.role === 'SUPER_ADMIN' || u?.role === 'MANAGER';
