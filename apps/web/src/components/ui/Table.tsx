import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Pagination } from './Pagination';

export interface Column<T> {
  key: string;
  header: string;
  render: (r: T) => ReactNode;
  sort?: (r: T) => string | number | null;
  align?: 'right';
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string | number;
  rowHref?: (r: T) => string;
  caption: string;
  /** Sync sort + page to the URL and show a results count. */
  urlState?: boolean;
  pageSize?: number;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  noun?: string;
  empty?: ReactNode;
}

export function Table<T>({ rows, columns, rowKey, rowHref, caption, urlState, pageSize, defaultSort, noun = 'rows', empty }: Props<T>) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<{ sort?: string; dir: 'asc' | 'desc'; page: number }>({
    sort: defaultSort?.key, dir: defaultSort?.dir ?? 'asc', page: 1,
  });

  const sortKey = urlState ? params.get('sort') ?? defaultSort?.key : local.sort;
  const dir = (urlState ? params.get('dir') ?? defaultSort?.dir ?? 'asc' : local.dir) as 'asc' | 'desc';
  const page = Math.max(1, Number(urlState ? params.get('page') ?? 1 : local.page) || 1);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const f = col.sort;
    const m = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : 1) * m;
    });
  }, [rows, columns, sortKey, dir]);

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const cur = Math.min(page, pages);
  const view = pageSize ? sorted.slice((cur - 1) * pageSize, cur * pageSize) : sorted;

  const setState = (next: { sort?: string; dir?: 'asc' | 'desc'; page?: number }) => {
    if (urlState) {
      const p = new URLSearchParams(params);
      if (next.sort !== undefined) p.set('sort', next.sort);
      if (next.dir !== undefined) p.set('dir', next.dir);
      if (next.page === 1) p.delete('page');
      else if (next.page !== undefined) p.set('page', String(next.page));
      setParams(p, { replace: true });
    } else setLocal((s) => ({ ...s, ...next }));
  };

  const toggle = (key: string) =>
    setState(sortKey === key ? { dir: dir === 'asc' ? 'desc' : 'asc', page: 1 } : { sort: key, dir: 'asc', page: 1 });

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="tbl">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = c.key === sortKey;
                return (
                  <th key={c.key} className={c.align === 'right' ? 'num' : ''} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sort ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                        {c.header}
                        {active ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr
                  key={rowKey(r)}
                  className={href ? 'row-link' : ''}
                  tabIndex={href ? 0 : undefined}
                  onClick={href ? () => nav(href) : undefined}
                  onKeyDown={href ? (e) => e.key === 'Enter' && nav(href) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(urlState || pageSize) && (
        <Pagination total={sorted.length} page={cur} pages={pages} pageSize={pageSize ?? sorted.length} noun={noun} onPage={(p) => setState({ page: p })} />
      )}
    </div>
  );
}
