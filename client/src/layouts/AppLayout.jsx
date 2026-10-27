import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bell, CircleHelp, Compass, Feather, Home, LogOut, Plus, Search, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useResource } from '../hooks/useApi';
import { Avatar, ErrorState, Logo, Modal, UserCard } from '../components/UI';
import { PostComposer } from '../components/PostComposer';
function Navigation({ unread, onCompose, mobile = false }) {
  const { user } = useAuth();
  const items = [{ to: '/', label: 'Home', Icon: Home, end: true }, { to: '/explore', label: 'Explore', Icon: Compass }, { to: '/notifications', label: 'Notifications', Icon: Bell }, { to: `/u/${user.username}`, label: 'Profile', Icon: UserRound }];
  return <nav className={mobile ? 'mobile-nav' : 'main-nav'} aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}>{items.map(({ to, label, Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><span className="nav-icon"><Icon size={21} />{label === 'Notifications' && unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}</span><span>{label}</span>{label === 'Home' && <span className="nav-active-dot" />}</NavLink>)}{mobile && <button className="nav-link mobile-compose" onClick={onCompose}><Plus size={22} /><span>Create</span></button>}</nav>;
}
function RightSidebar() {
  const people = useResource('/users/search?limit=3');
  const topics = useResource('/topics');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  return <aside className="right-sidebar" aria-label="Discover your circle"><form className="sidebar-search" onSubmit={event => { event.preventDefault(); navigate(`/explore?q=${encodeURIComponent(query.trim())}`); }}><Search size={18} /><input aria-label="Search CIRCLE" placeholder="Search CIRCLE" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} /><kbd>↵</kbd></form><section className="side-section"><div className="side-heading"><h2>Good people to know</h2><Sparkles size={17} /></div><p className="section-caption">A few new faces for your circle.</p>{people.error ? <ErrorState message={people.error} onRetry={people.reload} /> : people.loading ? <p className="muted">Finding your people…</p> : people.data?.length ? people.data.map(person => <UserCard person={person} compact key={person.id} />) : <p className="muted small-text">You’ve found everyone. Check back soon.</p>}<Link to="/explore" className="text-link discover-link">Discover more people <ArrowUpRight size={16} /></Link></section><section className="side-section topics-section"><div className="side-heading"><h2>In the conversation</h2><span className="live-dot" /></div><p className="section-caption">Ideas bringing us together.</p>{topics.error ? <ErrorState message={topics.error} onRetry={topics.reload} /> : topics.loading ? <p className="muted">Finding conversations…</p> : topics.data?.length ? topics.data.slice(0, 4).map((item, index) => <Link className="topic-link" key={item.topic} to={`/explore?topic=${encodeURIComponent(item.topic.startsWith('#') ? item.topic : `#${item.topic}`)}`}><span className="topic-number">0{index + 1}</span><div><strong>{item.topic.startsWith('#') ? item.topic : `#${item.topic}`}</strong><span>{item.posts_count} {Number(item.posts_count) === 1 ? 'thought' : 'thoughts'} shared</span></div><ArrowUpRight size={16} /></Link>) : <p className="muted small-text">Add a #topic to a post to start a conversation.</p>}</section><div className="kindness-card"><Feather size={23} /><h3>Small circle.<br />Big possibilities.</h3><p>A kind word. A shared idea.<br />You never know where it leads.</p><span className="kindness-orbit" /></div><footer className="sidebar-footer"><span>Made for meaningful connections.</span><span>© {new Date().getFullYear()} CIRCLE <span className="footer-dot">·</span> A little more human.</span></footer></aside>;
}
export default function AppLayout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const notifications = useResource('/notifications?limit=1');
  const [composing, setComposing] = useState(false);
  const [about, setAbout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => { const timer = setInterval(notifications.reload, 30000); return () => clearInterval(timer); }, [notifications.reload]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  async function signOut() { setLoggingOut(true); try { await logout(); } catch (error) { toast(error.message, 'error'); } finally { setLoggingOut(false); } }
  const unread = notifications.unread_count || 0;
  return <><a className="skip-link" href="#main-content">Skip to content</a><div className="app-grid"><aside className="left-sidebar"><Logo /><div className="nav-eyebrow">YOUR LITTLE CORNER</div><Navigation unread={unread} /><button className="button button-primary create-button" onClick={() => setComposing(true)}><Plus size={21} />Create a post</button><div className="sidebar-bottom"><button className="quiet-button" onClick={() => setAbout(true)}><CircleHelp size={18} />About CIRCLE</button><button className="quiet-button" disabled={loggingOut} onClick={signOut}><LogOut size={18} />{loggingOut ? 'Logging out…' : 'Log out'}</button><Link to={`/u/${user.username}`} className="sidebar-account"><Avatar user={user} /><div><strong>{user.full_name}</strong><span>@{user.username}</span></div><ArrowUpRight size={17} /></Link></div></aside><div className="mobile-header"><Logo /><button className="icon-button" aria-label="Log out" onClick={signOut} disabled={loggingOut}><LogOut size={20} /></button></div><main id="main-content" className="main-content"><Outlet context={{ openComposer: () => setComposing(true) }} /></main><RightSidebar /></div><Navigation mobile unread={unread} onCompose={() => setComposing(true)} />{composing && <PostComposer onClose={() => setComposing(false)} />}{about && <Modal title="A little more human." onClose={() => setAbout(false)}><p>CIRCLE is a welcoming space to share ideas, discover people, and find your own kind of community.</p><p className="muted">Be thoughtful. Be curious. Be kind. Every good connection starts with a little conversation.</p><p className="about-tagline">Your people. Your space. Your Circle.</p></Modal>}</>;
}
