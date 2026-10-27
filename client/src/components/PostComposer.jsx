import { useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Avatar, Modal } from './UI';

export function ComposerPrompt({ onOpen }) {
  const { user } = useAuth();
  return <div className="card composer-prompt"><div className="composer-start"><Avatar user={user} /><button onClick={onOpen}>What’s on your mind, {user.full_name.split(' ')[0]}?</button></div><div className="composer-bottom"><span><span className="tiny-dot" />A small thought can start something good.</span><button className="button button-primary button-small" onClick={onOpen}><ImagePlus size={16} />Share a thought</button></div></div>;
}
export function PostComposer({ post, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [content, setContent] = useState(post?.content || '');
  const [imageUrl, setImageUrl] = useState(post?.image_url || '');
  const [showImage, setShowImage] = useState(Boolean(post?.image_url));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (!content.trim() || content.trim().length > 500) { setError('Write a thought between 1 and 500 characters.'); return; }
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) { setError('Use a complete http:// or https:// image URL.'); return; }
    setBusy(true);
    try { await api(post ? `/posts/${post.id}` : '/posts', { method: post ? 'PATCH' : 'POST', body: { content: content.trim(), image_url: imageUrl.trim() || null } }); toast(post ? 'Your thought has been updated.' : 'Your thought is out in the circle.'); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal title={post ? 'Edit your thought' : 'Make a little connection'} onClose={onClose}><form onSubmit={submit}><div className="composer-author"><Avatar user={user} /><div><strong>{user.full_name}</strong><span>Sharing with everyone</span></div></div><label className="sr-only" htmlFor="post-content">Your post</label><textarea id="post-content" className="compose-textarea" autoFocus value={content} maxLength={500} onChange={event => setContent(event.target.value)} placeholder="A thought, a discovery, a little moment from your day…" rows={5} required />{showImage && <div className="field image-field"><label htmlFor="image-url">Image URL <span className="muted">(optional)</span></label><div className="input-with-action"><input id="image-url" type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="https://example.com/your-image.jpg" maxLength={2048} /><button type="button" className="icon-button" aria-label="Remove image URL" onClick={() => { setImageUrl(''); setShowImage(false); }}><X size={18} /></button></div><small>Link to an image you have permission to share. No file is uploaded.</small></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="compose-footer"><button type="button" className="button button-ghost" onClick={() => setShowImage(value => !value)}><ImagePlus size={19} />Image URL</button><span className={`character-count ${content.length > 470 ? 'near-limit' : ''}`}>{content.length}/500</span><button type="submit" className="button button-primary" disabled={busy || !content.trim()}><Send size={17} />{busy ? 'Sharing…' : post ? 'Save changes' : 'Publish'}</button></div></form></Modal>;
}
