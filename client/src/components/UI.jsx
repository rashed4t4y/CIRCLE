import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, Compass, LoaderCircle, Search, UserPlus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

export function Logo({ light = false }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="CIRCLE home"><svg viewBox="0 0 44 36" aria-hidden="true"><circle cx="16" cy="18" r="13" /><circle cx="28" cy="18" r="13" /></svg><span>CIRCLE<span className="brand-dot">.</span></span></Link>;
}
export function Avatar({ user, size = 'medium' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.avatar_url]);
  const name = user?.full_name || user?.username || 'Circle member';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const colors = ['lavender', 'sage', 'peach', 'blue', 'rose'];
  const color = colors[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % colors.length];
  return <span className={`avatar avatar-${size} ${color}`} aria-label={name}>{user?.avatar_url && !failed ? <img src={user.avatar_url} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" /> : initials}</span>;
}
export function Modal({ title, children, onClose, className = '' }) {
  const ref = useRef(null);
  const titleId = useId();
  // Keep dismissal current without resetting focus when the parent refreshes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
        const first = nodes[0], last = nodes.at(-1);
        if (!nodes.length) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${className}`}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21} /></button></div>{children}</section></div>;
}
export function ConfirmModal({ title, text, busy, onClose, onConfirm }) {
  return <Modal title={title} onClose={onClose}><p className="muted">{text}</p><div className="modal-actions"><button className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete'}</button></div></Modal>;
}
export function EmptyState({ title = 'A little quiet here', text = 'Start a conversation and make this space your own.', action, icon: Icon = Compass }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={26} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
export function ErrorState({ message, onRetry }) {
  return <div className="error-state" role="alert"><AlertCircle size={21} /><div><strong>Let’s try that again</strong><p>{message}</p></div>{onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Retry</button>}</div>;
}
export function Skeleton({ count = 3 }) {
  return <div aria-label="Loading" role="status" className="skeleton-list">{Array.from({ length: count }, (_, i) => <div key={i} className="card skeleton-card"><div className="skeleton-row"><span className="skeleton skeleton-avatar" /><span className="skeleton skeleton-name" /></div><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line short" /></div>)}</div>;
}
export function LoadMore({ collection }) {
  return collection.hasMore ? <button disabled={collection.loading} className="button button-secondary load-more" onClick={collection.loadMore}>{collection.loading ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{collection.loading ? 'Loading…' : 'Show a little more'}</button> : null;
}
export function SearchInput({ value, onChange, placeholder = 'Search people by name or username', autoFocus = false }) {
  return <label className="search-input"><Search size={18} aria-hidden="true" /><span className="sr-only">{placeholder}</span><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} maxLength={100} />{value && <button className="icon-button" type="button" aria-label="Clear search" onClick={() => onChange('')}><X size={16} /></button>}</label>;
}
export function FollowButton({ person: incomingPerson, onChange, compact = false }) {
  const [person, setPerson] = useState(incomingPerson);
  useEffect(() => setPerson(incomingPerson), [incomingPerson]);
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!person || String(person.id) === String(user?.id)) return null;
  async function toggle() {
    setBusy(true);
    try { const result = await api(`/users/${person.id}/follow`, { method: person.is_following ? 'DELETE' : 'POST' }); setPerson(result.data); onChange?.(result.data); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }
  return <button className={`button ${person.is_following ? 'button-secondary' : 'button-soft'} ${compact ? 'button-small' : ''}`} disabled={busy} onClick={toggle} aria-label={`${person.is_following ? 'Unfollow' : 'Follow'} ${person.full_name}`}>{busy ? <LoaderCircle size={15} className="spin" /> : person.is_following ? <Check size={15} /> : <UserPlus size={15} />}{person.is_following ? 'Following' : 'Follow'}</button>;
}
export function UserCard({ person, compact = false }) {
  return <article className={`user-card ${compact ? 'compact' : ''}`}><Link to={`/u/${person.username}`} className="user-identity"><Avatar user={person} /><div><strong>{person.full_name}</strong><span>@{person.username}</span>{!compact && person.bio && <p>{person.bio}</p>}</div></Link><FollowButton person={person} compact /></article>;
}

