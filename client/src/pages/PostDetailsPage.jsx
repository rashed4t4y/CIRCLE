import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCollection, useResource } from '../hooks/useApi';
import { api, relativeTime } from '../services/api';
import { Avatar, ConfirmModal, EmptyState, ErrorState, LoadMore, Skeleton } from '../components/UI';
import PostCard from '../components/PostCard';
export function CommentList({ postId }) {
  const comments = useCollection(`/posts/${postId}/comments`);
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (!content.trim()) return; setBusy(true); setError('');
    try { await api(`/posts/${postId}/comments`, { method: 'POST', body: { content: content.trim() } }); setContent(''); toast('Your reply is part of the conversation.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setDeleteBusy(true);
    try { await api(`/comments/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); toast('Comment deleted.'); }
    catch (err) { toast(err.message, 'error'); }
    finally { setDeleteBusy(false); }
  }
  return <section className="card comments-section"><h2>The conversation</h2><form onSubmit={submit} className="comment-form"><Avatar user={user} size="small" /><div><label htmlFor="comment" className="sr-only">Add a comment</label><textarea id="comment" value={content} onChange={event => setContent(event.target.value)} maxLength={1000} rows={3} placeholder="Add a little to the conversation…" required /><div className="comment-form-footer"><span>{content.length}/1000</span><button className="button button-primary button-small" type="submit" disabled={busy || !content.trim()}><Send size={15} />{busy ? 'Sending…' : 'Reply'}</button></div>{error && <p className="form-error" role="alert">{error}</p>}</div></form>{comments.data.map(comment => <article className="comment" key={comment.id}><Link to={`/u/${comment.author.username}`}><Avatar user={comment.author} size="small" /></Link><div className="comment-content"><div><Link to={`/u/${comment.author.username}`}><strong>{comment.author.full_name}</strong></Link><span className="comment-time">{relativeTime(comment.created_at)}</span></div><p>{comment.content}</p></div>{String(comment.user_id) === String(user.id) && <button className="icon-button" aria-label="Delete your comment" onClick={() => setDeleting(comment)}><Trash2 size={16} /></button>}</article>)}{comments.error && <ErrorState message={comments.error} onRetry={comments.reload} />}{comments.loading && !comments.data.length ? <Skeleton count={1} /> : !comments.error && !comments.data.length ? <EmptyState icon={MessageCircle} title="Be the first to say something" text="A kind word can be the start of a good conversation." /> : null}<LoadMore collection={comments} />{deleting && <ConfirmModal title="Delete this comment?" text="Your comment will be permanently removed." busy={deleteBusy} onClose={() => setDeleting(null)} onConfirm={remove} />}</section>;
}
export default function PostDetailsPage() {
  const { id } = useParams();
  const post = useResource(`/posts/${id}`);
  return <><Link to="/" className="back-link"><ArrowLeft size={17} />Back to your circle</Link><header className="detail-heading"><span className="eyebrow">ONE THOUGHT. A NEW CONNECTION.</span><h1>A moment in CIRCLE</h1></header>{post.loading ? <Skeleton count={1} /> : post.error ? <ErrorState message={post.error} onRetry={post.reload} /> : post.data && <><PostCard post={post.data} detail /><CommentList postId={id} /></>}</>;
}
