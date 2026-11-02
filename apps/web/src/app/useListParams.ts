import { useSearchParams } from 'react-router-dom';

/** Sort, direction and page for a server-paged table, kept in the URL so views can be linked and reloaded. */
export function useListParams(defaults: { sort: string; dir: 'asc' | 'desc' }, pageSize: number) {
  const [params, setParams] = useSearchParams();
  const sort = params.get('sort') ?? defaults.sort;
  const dir = (params.get('dir') === 'asc' || params.get('dir') === 'desc' ? params.get('dir') : defaults.dir) as 'asc' | 'desc';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const update = (change: Record<string, string | null>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(change)) {
      if (v === null) n.delete(k);
      else n.set(k, v);
    }
    setParams(n, { replace: true });
  };
  return {
    sort, dir, page, limit: pageSize, offset: (page - 1) * pageSize,
    setSort: (key: string, d: 'asc' | 'desc') => update({ sort: key, dir: d, page: null }),
    setPage: (p: number) => update({ page: p <= 1 ? null : String(p) }),
  };
}
