import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCollection, useResource } from '../hooks/useApi';
import { api } from '../services/api';
import { Avatar, EmptyState, ErrorState, FollowButton, LoadMore, Modal, Skeleton, UserCard } from '../components/UI';
import { PostFeed } from './HomePage';
function EditProfile({ person, onClose }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: person.full_name, bio: person.bio || '', avatar_url: person.avatar_url || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const change = event => setForm(values => ({ ...values, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('/users/me', { method: 'PATCH', body: { ...form, avatar_url: form.avatar_url.trim() || null } }); setUser(result.data); toast('Profile updated. Looking like you.'); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Make it yours" onClose={onClose}><form className="profile-form" onSubmit={submit}><Avatar user={{ ...person, ...form }} size="large" /><div className="field"><label htmlFor="edit-name">Full name</label><input id="edit-name" name="full_name" required maxLength={80} value={form.full_name} onChange={change} /></div><div className="field"><label htmlFor="edit-bio">A little about you</label><textarea id="edit-bio" name="bio" rows={4} maxLength={240} value={form.bio} onChange={change} placeholder="What makes you, you?" /><small>{form.bio.length}/240</small></div><div className="field"><label htmlFor="edit-avatar">Avatar URL <span className="muted">(optional)</span></label><input id="edit-avatar" name="avatar_url" type="url" maxLength={2048} value={form.avatar_url} onChange={change} placeholder="https://example.com/your-avatar.jpg" /><small>Leave blank for your initials. Use an image you have permission to share.</small></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose} className="button button-secondary" disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div></form></Modal>;
}
export function ProfileHeader({ person }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const own = String(user.id) === String(person.id);
  return <section className="card profile-header"><div className="profile-cover"><div /><div /><span>YOUR PEOPLE. YOUR SPACE.</span></div><div className="profile-body"><div className="profile-top"><Avatar user={person} size="large" />{own ? <button className="button button-secondary button-small" onClick={() => setEditing(true)}><Pencil size={15} />Edit profile</button> : <FollowButton person={person} />}</div><h1>{person.full_name}</h1><p className="profile-username">@{person.username}</p><p className="profile-bio">{person.bio || 'A new face. A fresh perspective.'}</p><p className="profile-joined"><CalendarDays size={15} />Joined {new Date(person.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p><div className="profile-stats"><span><strong>{person.posts_count}</strong> thoughts</span><Link to={`/u/${person.username}/followers`}><strong>{person.followers_count}</strong> followers</Link><Link to={`/u/${person.username}/following`}><strong>{person.following_count}</strong> following</Link></div></div>{editing && <EditProfile person={person} onClose={() => setEditing(false)} />}</section>;
}
export default function ProfilePage() {
  const { username } = useParams();
  const profile = useResource(`/users/${encodeURIComponent(username)}`);
  return <><Link to="/" className="back-link"><ArrowLeft size={17} />Back to your circle</Link>{profile.loading ? <Skeleton count={1} /> : profile.error ? <ErrorState message={profile.error} onRetry={profile.reload} /> : profile.data && <><ProfileHeader person={profile.data} /><div className="explore-section-heading"><h2>Thoughts & moments</h2><span className="muted small-text">A little window into their world</span></div><PostFeed key={username} path={`/posts?username=${encodeURIComponent(username)}`} emptyTitle="A story waiting to be told" emptyText="No thoughts shared yet. Good things take their time." /></>}</>;
}
export function ConnectionsPage({ type }) {
  const { username } = useParams();
  const people = useCollection(`/users/${encodeURIComponent(username)}/${type}`);
  return <><Link to={`/u/${username}`} className="back-link"><ArrowLeft size={17} />Back to @{username}</Link><header className="page-heading"><div><span className="eyebrow">PEOPLE MAKE THE CIRCLE</span><h1>{type === 'followers' ? 'Followers' : 'Following'}<span className="heading-dot">.</span></h1></div></header><section className="card people-list">{people.data.map(person => <UserCard key={person.id} person={person} />)}{people.error && <ErrorState message={people.error} onRetry={people.reload} />}{people.loading && !people.data.length ? <Skeleton count={2} /> : !people.error && !people.data.length ? <EmptyState title="Room for new connections" text={type === 'followers' ? 'Share your perspective and give people a reason to connect.' : 'Every circle starts with one person. Explore and say hello.'} action={<Link to="/explore" className="button button-soft">Explore people</Link>} /> : null}</section><LoadMore collection={people} /></>;
}
