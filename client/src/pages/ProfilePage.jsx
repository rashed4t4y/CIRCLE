import EditProfile, { CoverImage } from '../components/EditProfile';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Pencil } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCollection, useResource } from '../hooks/useApi';
import { api } from '../services/api';
import { Avatar, EmptyState, ErrorState, FollowButton, LoadMore, Skeleton, UserCard } from '../components/UI';
import { PostFeed } from './HomePage';
export function ProfileHeader({ person }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const [messaging, setMessaging] = useState(false);
  async function message() {
    setMessaging(true);
    try { const result = await api('/conversations', { method: 'POST', body: { user_id: person.id } }); navigate('/messages/' + result.data.id); }
    catch (error) { toast(error.message, 'error'); }
    finally { setMessaging(false); }
  }
  const own = String(user.id) === String(person.id);
  return <section className="card profile-header"><CoverImage url={person.cover_url} /><div className="profile-body"><div className="profile-top"><Avatar user={person} size="large" />{own ? <button className="button button-secondary button-small" onClick={() => setEditing(true)}><Pencil size={15} />Edit profile</button> : <div className="profile-actions"><button className="button button-secondary button-small" disabled={messaging} onClick={message}>{messaging ? 'Opening…' : 'Message'}</button><FollowButton person={person} /></div>}</div><h1>{person.full_name}</h1><p className="profile-username">@{person.username}</p><p className="profile-bio">{person.bio || 'A new face. A fresh perspective.'}</p><p className="profile-joined"><CalendarDays size={15} />Joined {new Date(person.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p><div className="profile-stats"><span><strong>{person.posts_count}</strong> thoughts</span><Link to={`/u/${person.username}/followers`}><strong>{person.followers_count}</strong> followers</Link><Link to={`/u/${person.username}/following`}><strong>{person.following_count}</strong> following</Link></div></div>{editing && <EditProfile person={person} onClose={() => setEditing(false)} />}</section>;
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
