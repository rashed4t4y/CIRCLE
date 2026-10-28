import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMessaging } from '../context/MessagingContext';
import { api, relativeTime } from '../services/api';
import { Avatar, EmptyState, ErrorState, Skeleton } from '../components/UI';

export default function MessagesPage() {
  const { conversationId } = useParams();
  const { revision, connected } = useMessaging();
  const [pages, setPages] = useState(1);
  const [inbox, setInbox] = useState({ data: [], loading: true, error: '', more: false });
  useEffect(() => {
    const abort = new AbortController();
    Promise.all(Array.from({ length: pages }, (_, i) => api('/conversations?page=' + (i + 1) + '&limit=20', { signal: abort.signal })))
      .then(results => setInbox({ data: [...new Map(results.flatMap(r => r.data).map(c => [c.id, c])).values()], loading: false, error: '', more: results.at(-1).pagination.has_more }))
      .catch(error => { if (error.name !== 'AbortError') setInbox(old => ({ ...old, loading: false, error: error.message })); });
    return () => abort.abort();
  }, [revision, pages]);
  const { refresh } = useMessaging();
  return <><header className="page-heading"><div><span className="eyebrow">A LITTLE CLOSER</span><h1>Messages<span className="heading-dot">.</span></h1><p className="muted" role="status">{connected ? 'Your private conversations.' : 'Reconnecting… messages are still saved securely.'}</p></div></header>
    <section className={'card messages-layout ' + (conversationId ? 'has-chat' : '')}>
      <aside className="inbox" aria-label="Conversations">
        <h2>Your conversations</h2>
        {inbox.loading && <Skeleton count={1} />}
        {inbox.error && <ErrorState message={inbox.error} onRetry={refresh} />}
        {!inbox.loading && !inbox.error && !inbox.data.length && <EmptyState icon={MessageCircle} title="Say a little hello" text="Open someone's profile and choose Message to start a conversation." action={<Link className="button button-soft" to="/explore">Find your people</Link>} />}
        {inbox.data.map(conversation => <Link key={conversation.id} to={'/messages/' + conversation.id} className={'conversation-row ' + (String(conversation.id) === conversationId ? 'selected' : '')}>
          <Avatar user={conversation.participant} /><div className="conversation-summary"><strong>{conversation.participant.full_name}</strong><span>@{conversation.participant.username}</span><p>{conversation.latest_message?.content || 'Start the conversation'}</p><time dateTime={conversation.latest_message?.created_at || conversation.created_at}>{relativeTime(conversation.latest_message?.created_at || conversation.created_at)}</time></div>
          {conversation.unread_count > 0 && <span className="message-unread" aria-label={conversation.unread_count + ' unread messages'}>{conversation.unread_count}</span>}
        </Link>)}
        {inbox.more && <button className="button button-secondary load-more" onClick={() => setPages(n => n + 1)}>More conversations</button>}
      </aside>
      {conversationId ? <Chat key={conversationId} conversationId={conversationId} /> : <div className="chat-placeholder"><EmptyState icon={MessageCircle} title="Make room for connection" text="Choose a conversation, or visit a profile to send a message." /></div>}
    </section></>;
}
function Chat({ conversationId }) {
  const { user } = useAuth();
  const { revision, refresh } = useMessaging();
  const [person, setPerson] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const retry = useRef(null);
  const mounted = useRef(true);
  const list = useRef(null);
  const scroll = useRef({ bottom: true, height: 0, top: 0, older: false });
  useEffect(() => {
    mounted.current = true;
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    async function load() {
      try {
        const conversation = await api('/conversations/' + conversationId, { signal: abort.signal });
        let before, all = [], result;
        for (let page = 0; page < pages; page++) {
          result = await api('/conversations/' + conversationId + '/messages?limit=30' + (before ? '&before=' + before : ''), { signal: abort.signal });
          all = [...result.data, ...all];
          before = result.pagination.before;
          if (!result.pagination.has_more) break;
        }
        const element = list.current;
        if (element) scroll.current = { ...scroll.current, height: element.scrollHeight, top: element.scrollTop, bottom: element.scrollHeight - element.scrollTop - element.clientHeight < 80 };
        setPerson(conversation.data.participant); setMessages(all); setMore(result.pagination.has_more); setLoading(false); setError('');
      } catch (err) { if (err.name !== 'AbortError') { setError(err.message); setLoading(false); } }
    }
    load();
    return () => abort.abort();
  }, [conversationId, revision, pages]);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    if (scroll.current.older) element.scrollTop = scroll.current.top + element.scrollHeight - scroll.current.height;
    else if (scroll.current.bottom) element.scrollTop = element.scrollHeight;
    scroll.current.older = false;
  }, [messages]);
  const lastId = messages.at(-1)?.id;
  const unread = messages.some(message => message.recipient_id === user.id && !message.read_at);
  useEffect(() => {
    if (!visible || !lastId || !unread) return;
    const abort = new AbortController();
    api('/conversations/' + conversationId + '/read', { method: 'PATCH', body: { through_id: lastId }, signal: abort.signal })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => abort.abort();
  }, [conversationId, lastId, unread, visible, messages]);
  async function send(event) {
    event?.preventDefault();
    if (sending || !draft.trim()) return;
    const content = draft.trim();
    if (!retry.current || retry.current.content !== content) retry.current = { content, client_id: crypto.randomUUID() };
    setSending(true); setSendError('');
    try {
      await api('/conversations/' + conversationId + '/messages', { method: 'POST', body: retry.current });
      if (mounted.current) { setDraft(''); retry.current = null; scroll.current.bottom = true; refresh(); }
    } catch (err) { if (mounted.current) setSendError(err.message); }
    finally { if (mounted.current) setSending(false); }
  }
  return <section className="chat" aria-label="Private chat">
    <header className="chat-heading"><Link className="icon-button chat-back" to="/messages" aria-label="Back to inbox"><ArrowLeft size={20} /></Link>
      {person && <Link className="user-identity" to={'/u/' + person.username}><Avatar user={person} /><div><strong>{person.full_name}</strong><span>@{person.username}</span></div></Link>}
    </header>
    {error && <ErrorState message={error} onRetry={refresh} />}
    {loading ? <Skeleton count={2} /> : <div ref={list} className="message-history" aria-label="Message history">
      {more && <button className="button button-secondary load-more" onClick={() => { scroll.current.older = true; setPages(n => n + 1); }}>Load older messages</button>}
      {!messages.length && !error && <EmptyState icon={MessageCircle} title="Every connection starts somewhere" text="Send your first message below." />}
      {messages.map(message => <article key={message.id} className={'chat-message ' + (message.sender_id === user.id ? 'own' : '')}>
        <strong>{message.sender_id === user.id ? 'You' : person?.full_name}</strong><p>{message.content}</p>
        <small><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>{message.sender_id === user.id && <span> · {message.read_at ? 'Read' : 'Sent'}</span>}</small>
      </article>)}
    </div>}
    <form className="message-composer" onSubmit={send}>
      <label className="sr-only" htmlFor="message-draft">Your message</label><textarea id="message-draft" rows={3} maxLength={4000} value={draft} disabled={sending || !person} placeholder="A little hello…" onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
      <div className="composer-footer"><small>{draft.length}/4000 · Shift+Enter for a new line</small><button className="button button-primary" disabled={sending || !draft.trim() || !person}><Send size={16} />{sending ? 'Sending…' : 'Send'}</button></div>
      {sendError && <p className="form-error" role="alert">{sendError} Your draft is kept; try sending again.</p>}
    </form>
  </section>;
}
