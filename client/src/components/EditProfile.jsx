import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { Avatar, Modal } from './UI';

function ImageControl({ kind, person, value, onChange, disabled }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!value.file) { setPreview(''); return; }
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value.file]);
  const url = value.remove ? null : preview || person[kind + '_url'];
  return <div className="field media-control">
    <label htmlFor={'image-' + kind}>{kind === 'avatar' ? 'Profile photo' : 'Cover photo'}</label>
    {kind === 'avatar' ? <Avatar user={{ ...person, avatar_url: url }} size="large" /> : <CoverImage url={url} />}
    <input id={'image-' + kind} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
      onChange={event => { const file = event.target.files?.[0]; if (file) onChange({ file, remove: false }); event.target.value = ''; }} />
    <small>Choose a photo to upload or replace. JPEG, PNG, WebP; up to 5 MB.</small>
    {url && <button type="button" className="button button-secondary button-small" disabled={disabled}
      onClick={() => onChange({ file: null, remove: true })}>Remove {kind === 'avatar' ? 'profile' : 'cover'} photo</button>}
  </div>;
}
export function CoverImage({ url }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <div className="profile-cover">{url && !failed
    ? <img src={url} alt="Profile cover" onError={() => setFailed(true)} />
    : <><div /><div /><span>YOUR PEOPLE. YOUR SPACE.</span></>}</div>;
}
export default function EditProfile({ person, onClose }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: person.full_name, bio: person.bio || '' });
  const [media, setMedia] = useState({ avatar: { file: null, remove: false }, cover: { file: null, remove: false } });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) onClose(); };
  function select(kind, value) {
    if (value.file && (value.file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(value.file.type))) {
      setError('Choose a JPEG, PNG, or WebP image up to 5 MB.'); return;
    }
    setError(''); setMedia(old => ({ ...old, [kind]: value }));
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    for (const kind of ['avatar', 'cover']) {
      if (media[kind].file) body.append(kind, media[kind].file);
      if (media[kind].remove) body.append('remove_' + kind, 'true');
    }
    try {
      const result = await api('/users/me/media', { method: 'POST', body });
      setUser(result.data); toast('Profile saved. Looking like you.'); onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Make it yours" onClose={close}><form className="profile-form" onSubmit={submit}>
    <div className="field"><label htmlFor="edit-name">Full name</label><input id="edit-name" required maxLength={80} disabled={busy} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
    <div className="field"><label htmlFor="edit-bio">A little about you</label><textarea id="edit-bio" rows={3} maxLength={240} disabled={busy} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} /><small>{form.bio.length}/240</small></div>
    {['avatar', 'cover'].map(kind => <ImageControl key={kind} kind={kind} person={person} value={media[kind]} disabled={busy} onChange={value => select(kind, value)} />)}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" onClick={close} className="button button-secondary" disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form></Modal>;
}
