import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { api } from '../services/api';
const MessagingContext = createContext(null);
export function MessagingProvider({ children }) {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const socket = io({ withCredentials: true });
    socket.on('connect', () => { setConnected(true); refresh(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('conversation:changed', refresh);
    window.addEventListener('circle:messages', refresh);
    const wake = () => { if (!document.hidden) { if (!socket.connected) socket.connect(); refresh(); } };
    document.addEventListener('visibilitychange', wake);
    // Also reconciles rare dropped invalidations or a temporarily unavailable socket.
    const timer = setInterval(wake, 30_000);
    return () => {
      socket.disconnect(); clearInterval(timer);
      window.removeEventListener('circle:messages', refresh);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [user.id, refresh]);
  useEffect(() => {
    const abort = new AbortController();
    api('/conversations/unread', { signal: abort.signal }).then(result => setUnread(result.data.count)).catch(() => {});
    return () => abort.abort();
  }, [revision]);
  return <MessagingContext.Provider value={{ unread, revision, connected, refresh }}>{children}</MessagingContext.Provider>;
}
export const useMessaging = () => useContext(MessagingContext);
