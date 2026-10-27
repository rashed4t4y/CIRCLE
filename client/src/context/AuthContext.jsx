import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const activeRequest = useRef(null);
  async function refresh() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try { const result = await api('/auth/me', { signal: controller.signal }); if (requestVersion.current === version) setUser(result.data); }
    catch (err) { if (err.name !== 'AbortError' && requestVersion.current === version) { if (err.status !== 401) setError(err.message); setUser(null); } }
    finally { if (requestVersion.current === version && !controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { refresh(); const expire = () => { requestVersion.current++; activeRequest.current?.abort(); setLoading(false); setUser(null); }; window.addEventListener('circle:session-expired', expire); return () => { activeRequest.current?.abort(); window.removeEventListener('circle:session-expired', expire); }; }, []);
  function acceptSession(person) { requestVersion.current++; activeRequest.current?.abort(); setUser(person); setLoading(false); setError(''); }
  async function login(body) { const result = await api('/auth/login', { method: 'POST', body }); acceptSession(result.data); return result.data; }
  async function register(body) { const result = await api('/auth/register', { method: 'POST', body }); acceptSession(result.data); return result.data; }
  async function logout() { await api('/auth/logout', { method: 'POST' }); acceptSession(null); }
  return <AuthContext.Provider value={{ user, setUser, loading, error, refresh, login, register, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
