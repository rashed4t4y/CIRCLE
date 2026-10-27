import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useCollection } from '../hooks/useApi';
import { api, relativeTime } from '../services/api';
import { Avatar, EmptyState, ErrorState, LoadMore, Skeleton } from '../components/UI';
export function NotificationItem({ item }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const types = { follow: { Icon: UserPlus, text: 'started following you.', style: 'follow' }, like: { Icon: Heart, text: 'liked your thought.', style: 'like' }, comment: { Icon: MessageCircle, text: 'added to your conversation.', style: 'comment' } };
  const info = types[item.type] || types.comment;
  const Icon = info.Icon;
  async function read() { setBusy(true); try { await api(`/notifications/${item.id}/read`, { method: 'PATCH' }); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); } }
  return <article className={`notification-item ${item.is_read ? 'is-read' : 'unread'}`}><div className="notification-avatar"><Link to={`/u/${item.actor.username}`}><Avatar user={item.actor} /></Link><span className={`notification-kind ${info.style}`}><Icon size={12} /></span></div><div className="notification-content"><p><Link to={`/u/${item.actor.username}`}><strong>{item.actor.full_name}</strong></Link> {info.text}</p><div><time dateTime={item.created_at}>{relativeTime(item.created_at)}</time>{item.post_id && <Link to={`/posts/${item.post_id}`}>View conversation</Link>}</div></div>{!item.is_read && <button className="icon-button mark-read" disabled={busy} onClick={read} aria-label={`Mark notification from ${item.actor.full_name} as read`} title="Mark as read"><Check size={17} /></button>}{!item.is_read && <span className="unread-dot" aria-label="Unread" />}</article>;
}
export default function NotificationsPage() {
  const notifications = useCollection('/notifications');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function readAll() { setBusy(true); try { await api('/notifications/read-all', { method: 'PATCH' }); toast('You’re all caught up.'); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); } }
  return <><header className="page-heading"><div><span className="eyebrow">A LITTLE HELLO FROM YOUR PEOPLE</span><h1>Notifications<span className="heading-dot">.</span></h1></div><Bell size={26} className="heading-icon" /></header><div className="notification-heading"><p className="muted">The little things that bring us closer.</p><button className="button button-ghost button-small" disabled={busy} onClick={readAll}><CheckCheck size={17} />{busy ? 'Marking…' : 'Mark all as read'}</button></div><section className="card notifications-list">{notifications.data.map(item => <NotificationItem key={item.id} item={item} />)}{notifications.error && <ErrorState message={notifications.error} onRetry={notifications.reload} />}{notifications.loading && !notifications.data.length ? <Skeleton count={2} /> : !notifications.error && !notifications.data.length ? <EmptyState icon={Bell} title="All quiet, in a good way" text="New followers, likes, and conversations will find you here." /> : null}</section><LoadMore collection={notifications} /></>;
}
