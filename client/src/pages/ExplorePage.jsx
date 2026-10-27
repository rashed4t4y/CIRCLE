import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, X } from 'lucide-react';
import { useCollection, useDebounce } from '../hooks/useApi';
import { EmptyState, ErrorState, LoadMore, SearchInput, Skeleton, UserCard } from '../components/UI';
import { PostFeed } from './HomePage';
export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic');
  const [query, setQuery] = useState(params.get('q') || '');
  const debounced = useDebounce(query);
  useEffect(() => { setQuery(params.get('q') || ''); }, [params.get('q')]);
  const people = useCollection(`/users/search?q=${encodeURIComponent(debounced)}`);
  function changeQuery(value) { setQuery(value); if (topic) setParams({}); }
  return <><header className="page-heading"><div><span className="eyebrow">THERE’S A WHOLE WORLD HERE</span><h1>Explore<span className="heading-dot">.</span></h1></div><Compass size={28} className="heading-icon" /></header><p className="page-intro">Find a fresh perspective. Meet your kind of people.</p><SearchInput value={query} onChange={changeQuery} />{topic ? <><div className="explore-section-heading"><h2>{topic}</h2><Link className="button button-ghost button-small" to="/explore"><X size={16} />Clear topic</Link></div><PostFeed key={topic} path={`/posts?q=${encodeURIComponent(topic)}`} emptyTitle="The conversation is just beginning" emptyText="There aren’t any thoughts in this topic yet." /></> : <><div className="explore-section-heading"><h2>{debounced ? `People matching “${debounced}”` : 'Good people to know'}</h2><span className="muted small-text">A connection starts with hello.</span></div><section className="card people-list">{people.data.map(person => <UserCard key={person.id} person={person} />)}{people.error && <ErrorState message={people.error} onRetry={people.reload} />}{people.loading && !people.data.length ? <Skeleton count={2} /> : !people.error && !people.data.length ? <EmptyState title="No one here by that name" text="Try another name or username. Your people are out there." /> : null}</section><LoadMore collection={people} /></>}</>;
}
