import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
function useRevision() {
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { window.addEventListener('circle:changed', reload); return () => window.removeEventListener('circle:changed', reload); }, [reload]);
  return [revision, reload];
}
export function useResource(path) {
  const [revision, reload] = useRevision();
  const [state, setState] = useState({ path, data: null, loading: true, error: '' });
  useEffect(() => {
    if (!path) { setState({ path, data: null, loading: false, error: '' }); return; }
    const abort = new AbortController();
    setState(old => old.path === path ? { ...old, loading: old.data === null, error: '' } : { path, data: null, loading: true, error: '' });
    api(path, { signal: abort.signal }).then(result => setState({ ...result, path, loading: false, error: '' })).catch(error => { if (error.name !== 'AbortError') setState({ path, data: null, loading: false, error: error.message }); });
    return () => abort.abort();
  }, [path, revision]);
  return state.path === path ? { ...state, reload } : { data: null, loading: true, error: '', reload };
}
export function useCollection(path) {
  const [pages, setPages] = useState(1);
  const [revision, reload] = useRevision();
  const [state, setState] = useState({ path, data: [], loading: true, error: '', hasMore: false });
  useEffect(() => { setPages(1); setState({ path, data: [], loading: true, error: '', hasMore: false }); }, [path]);
  useEffect(() => {
    const abort = new AbortController();
    setState(old => ({ ...old, loading: true, error: '' }));
    const separator = path.includes('?') ? '&' : '?';
    Promise.all(Array.from({ length: pages }, (_, index) => api(`${path}${separator}page=${index + 1}&limit=10`, { signal: abort.signal }))).then(results => {
      const unique = new Map(results.flatMap(result => result.data || []).map(item => [item.id, item]));
      setState({ path, data: [...unique.values()], loading: false, error: '', hasMore: Boolean(results.at(-1)?.pagination?.has_more) });
    }).catch(error => { if (error.name !== 'AbortError') setState(old => ({ ...old, path, loading: false, error: error.message })); });
    return () => abort.abort();
  }, [path, pages, revision]);
  return { ...(state.path === path ? state : { data: [], loading: true, error: '', hasMore: false }), reload, loadMore: () => setPages(value => value + 1) };
}
export function useDebounce(value, milliseconds = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), milliseconds); return () => clearTimeout(timer); }, [value, milliseconds]);
  return debounced;
}
