import { useRef } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Leaf, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCollection } from '../hooks/useApi';
import { EmptyState, ErrorState, LoadMore, Skeleton } from '../components/UI';
import { ComposerPrompt } from '../components/PostComposer';
import PostCard from '../components/PostCard';
export function PostFeed({ path, emptyTitle, emptyText }) {
  const feed = useCollection(path);
  return <><div className="feed-posts">{feed.data.map(post => <PostCard post={post} key={post.id} />)}</div>{feed.error && <ErrorState message={feed.error} onRetry={feed.reload} />}{feed.loading && !feed.data.length ? <Skeleton /> : !feed.error && !feed.data.length ? <EmptyState title={emptyTitle} text={emptyText} action={<Link to="/explore" className="button button-soft">Find your people <ArrowUpRight size={16} /></Link>} /> : null}<LoadMore collection={feed} />{!feed.loading && feed.data.length > 0 && !feed.hasMore && <p className="feed-end"><span />You’re all caught up. Take a little breath.<span /></p>}</>;
}
export default function HomePage() {
  const { user } = useAuth();
  const { openComposer } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const following = params.get('feed') === 'following';
  const tabRefs = useRef([]);
  function chooseFeed(nextFollowing) { setParams(nextFollowing ? { feed: 'following' } : {}); }
  function tabKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : following ? 0 : 1;
    chooseFeed(next === 1);
    tabRefs.current[next]?.focus();
  }
  return <><header className="page-heading"><div><span className="eyebrow">YOUR DAILY DOSE OF CONNECTION</span><h1>Home<span className="heading-dot">.</span></h1></div><span className="home-label"><span className="live-dot" />Your circle is here</span></header><section className="welcome-banner"><div><span className="welcome-eyebrow"><Leaf size={14} />A SPACE TO BELONG</span><h2>A little closer<br />to your people.</h2><p>Big ideas, small moments, and everything in between.</p></div><div className="welcome-art" aria-hidden="true"><div className="welcome-circle circle-a" /><div className="welcome-circle circle-b" /><span className="welcome-star">✳</span><span className="welcome-mini-dot" /></div></section><div className="feed-tabs" role="tablist" aria-label="Feed"><button ref={element => { tabRefs.current[0] = element; }} id="feed-for-you" role="tab" aria-controls="feed-panel" tabIndex={!following ? 0 : -1} onKeyDown={tabKeydown} aria-selected={!following} className={!following ? 'active' : ''} onClick={() => chooseFeed(false)}><Sparkles size={16} />For you</button><button ref={element => { tabRefs.current[1] = element; }} id="feed-following" role="tab" aria-controls="feed-panel" tabIndex={following ? 0 : -1} onKeyDown={tabKeydown} aria-selected={following} className={following ? 'active' : ''} onClick={() => chooseFeed(true)}>Following</button><span>Fresh perspectives, every day</span></div><ComposerPrompt onOpen={openComposer} /><div className="section-divider"><span>{following ? 'FROM YOUR CIRCLE' : 'THE LATEST IN YOUR CIRCLE'}</span><span>Most recent</span></div><section id="feed-panel" role="tabpanel" aria-labelledby={following ? 'feed-following' : 'feed-for-you'} tabIndex={0}><PostFeed key={following ? 'following' : 'all'} path={following ? '/posts/following' : '/posts'} emptyTitle={following ? 'Your circle is taking shape' : 'The first thought is yours'} emptyText={following ? 'Follow a few people and their latest thoughts will find you here.' : `Share something, ${user.full_name.split(' ')[0]}. Every conversation starts somewhere.`} /></section></>;
}
