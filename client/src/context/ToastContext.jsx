import { createContext, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = id => setToasts(items => items.filter(item => item.id !== id));
  function toast(message, type = 'success') {
    const id = crypto.randomUUID();
    setToasts(items => [...items.slice(-3), { id, message, type }]);
    setTimeout(() => dismiss(id), 5000);
  }
  return <ToastContext.Provider value={toast}>{children}<div className="toast-stack" aria-live="polite">{toasts.map(item => <div key={item.id} className={`toast ${item.type}`}>{item.type === 'error' ? <AlertCircle2 /> : <CheckCircle2 />}<span>{item.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><X size={16} /></button></div>)}</div></ToastContext.Provider>;
}
function AlertCircle2() { return <AlertCircle />; }
export const useToast = () => useContext(ToastContext);
