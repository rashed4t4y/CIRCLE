import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ErrorState, Logo } from './components/UI';
import AppLayout from './layouts/AppLayout';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import ExplorePage from './pages/ExplorePage';
import ProfilePage, { ConnectionsPage } from './pages/ProfilePage';
import PostDetailsPage from './pages/PostDetailsPage';
import NotificationsPage from './pages/NotificationsPage';
import NotFoundPage from './pages/NotFoundPage';
function SessionGate() {
  const auth = useAuth();
  if (auth.loading) return <div className="standalone-page loading-app"><Logo /><span className="loading-ring" /><p>Finding your circle…</p></div>;
  if (auth.error) return <div className="standalone-page"><Logo /><h1>Let’s reconnect.</h1><ErrorState message={auth.error} onRetry={auth.refresh} /></div>;
  return <Outlet />;
}
function ProtectedRoute() { return useAuth().user ? <Outlet /> : <Navigate to="/login" replace />; }
export default function App() {
  return <BrowserRouter><ToastProvider><AuthProvider><Routes><Route element={<SessionGate />}><Route path="/login" element={<AuthPage key="login" />} /><Route path="/register" element={<AuthPage key="register" register />} /><Route element={<ProtectedRoute />}><Route element={<AppLayout />}><Route index element={<HomePage />} /><Route path="explore" element={<ExplorePage />} /><Route path="notifications" element={<NotificationsPage />} /><Route path="u/:username" element={<ProfilePage />} /><Route path="u/:username/followers" element={<ConnectionsPage type="followers" />} /><Route path="u/:username/following" element={<ConnectionsPage type="following" />} /><Route path="posts/:id" element={<PostDetailsPage />} /></Route></Route><Route path="*" element={<NotFoundPage />} /></Route></Routes></AuthProvider></ToastProvider></BrowserRouter>;
}
