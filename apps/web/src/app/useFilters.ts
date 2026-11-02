import { useSearchParams } from 'react-router-dom';

/** Filters live in the URL query string so views are linkable and survive reloads. */
export function useFilters(keys: string[]) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete('page');
    setParams(n, { replace: true });
  };
  const clear = () => {
    const n = new URLSearchParams(params);
    keys.forEach((k) => n.delete(k));
    n.delete('page');
    setParams(n, { replace: true });
  };
  return { get, set, clear, active: keys.some((k) => params.has(k)) };
}
