import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, relativeTime } from '../services/api';
import { Avatar, ConfirmModal } from './UI';
import { PostComposer } from './PostComposer';
function PostText({ content }) {
  return <p className="post-content">{content.split(/(#[\p{L}\p{N}_]+)/u).map((text, index) => text.startsWith('#') ? <Link key={index} to={`/explore?topic=${encodeURIComponent(text)}`}>{text}</Link> : text)}</p>;
}
export default function PostCard({ post: incomingPost, detail = false }) {
  const [post, setPost] = useState(incomingPost);
  useEffect(() => setPost(incomingPost), [incomingPost]);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [post.image_url]);
  const own = String(user?.id) === String(post.user_id);
  async function like() {
    setLikeBusy(true);
    try { const result = await api(`/posts/${post.id}/like`, { method: post.is_liked ? 'DELETE' : 'POST' }); setPost(result.data); }
    catch (error) { toast(error.message, 'error'); }
    finally { setLikeBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await api(`/posts/${post.id}`, { method: 'DELETE' }); toast('Post deleted.'); setConfirm(false); if (detail) navigate('/'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`); toast('Post link copied.'); }
    catch { toast('Couldn’t copy the link. Open the post and copy its address.', 'error'); }
  }
  return <article className="card post-card"><header className="post-header"><div className="post-author"><Link to={`/u/${post.author.username}`}><Avatar user={post.author} /></Link><div><Link to={`/u/${post.author.username}`}><strong>{post.author.full_name}</strong></Link><div className="post-meta">@{post.author.username}<span>·</span><Link to={`/posts/${post.id}`} title={new Date(post.created_at).toLocaleString()}>{relativeTime(post.created_at)}</Link></div></div></div>{own && <div className="post-menu-wrap"><button className="icon-button" aria-label="Post options" aria-expanded={menu} onClick={() => setMenu(value => !value)}><MoreHorizontal size={21} /></button>{menu && <><button className="menu-dismiss" aria-label="Close post options" onClick={() => setMenu(false)} /><div className="post-menu"><button onClick={() => { setEditing(true); setMenu(false); }}><Pencil size={15} />Edit post</button><button className="danger-text" onClick={() => { setConfirm(true); setMenu(false); }}><Trash2 size={15} />Delete post</button></div></>}</div>}</header><PostText content={post.content} />{post.image_url && (imageFailed ? <div className="image-unavailable">This image is no longer available.</div> : <Link to={`/posts/${post.id}`} tabIndex={-1} aria-hidden="true"><img className="post-image" src={post.image_url} alt={`Image shared by ${post.author.full_name}`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></Link>)}<footer className="post-actions"><button className={`post-action ${post.is_liked ? 'liked' : ''}`} onClick={like} disabled={likeBusy} aria-pressed={Boolean(post.is_liked)} aria-label={`${post.is_liked ? 'Unlike' : 'Like'} post, ${post.likes_count} likes`}><Heart size={19} fill={post.is_liked ? 'currentColor' : 'none'} /><span>{post.likes_count}</span></button><Link className="post-action" to={`/posts/${post.id}`} aria-label={`View ${post.comments_count} comments`}><MessageCircle size={19} /><span>{post.comments_count}</span></Link><button className="post-action copy-link" onClick={copyLink} aria-label="Copy post link"><Copy size={17} /><span>Share</span></button></footer>{editing && <PostComposer post={post} onClose={() => setEditing(false)} />}{confirm && <ConfirmModal title="Delete this post?" text="This will also remove its comments and likes. This action can’t be undone." busy={busy} onClose={() => setConfirm(false)} onConfirm={remove} />}</article>;
}



