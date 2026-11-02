import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownIcon, ArrowUpIcon, ChevronUpDownIcon } from '@heroicons/react/16/solid';
import { Pagination } from './Pagination';
import { ErrorState, Skeleton } from './states';

export interface Column<T> {
  key: string;
  header: string;
  render: (r: T) => ReactNode;
  /** Client-side sorting of the rows already loaded. */
  sort?: (r: T) => string | number | null;
  /** Server-side sorting: the `sort` value the API understands. */
  sortKey?: string;
  align?: 'right';
  /** Hide this column below a breakpoint (sm = 640px, md = 768px). The record page still shows everything. */
  hideBelow?: 'sm' | 'md';
}

const HIDE: Record<string, string> = { '': '', sm: 'hidden sm:table-cell', md: 'hidden md:table-cell' };

/** The page, sort and total live on the server; the table only shows what it is given. */
export interface ServerPaging {
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (key: string, dir: 'asc' | 'desc') => void;
  onPage: (page: number) => void;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string | number;
  rowHref?: (r: T) => string;
  caption: string;
  /** Client mode: sync sort + page to the URL and show a results count. */
  urlState?: boolean;
  pageSize?: number;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Server mode (overrides the client sorting and paging above). */
  server?: ServerPaging;
  noun?: string;
  /** Shown when there are no rows. */
  empty?: ReactNode;
  loading?: boolean;
  /** When set, replaces the table with an error state. */
  error?: string | null;
  onRetry?: () => void;
}

export function Table<T>({
  rows, columns, rowKey, rowHref, caption, urlState, pageSize, defaultSort, server, noun = 'rows', empty, loading, error, onRetry,
}: Props<T>) {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<{ sort?: string; dir: 'asc' | 'desc'; page: number }>({
    sort: defaultSort?.key, dir: defaultSort?.dir ?? 'asc', page: 1,
  });

  const sortKey = server ? server.sort : urlState ? params.get('sort') ?? defaultSort?.key : local.sort;
  const dir = (server ? server.dir : urlState ? params.get('dir') ?? defaultSort?.dir ?? 'asc' : local.dir) as 'asc' | 'desc';
  const page = server ? server.page : Math.max(1, Number(urlState ? params.get('page') ?? 1 : local.page) || 1);

  const sorted = useMemo(() => {
    if (server) return rows;
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
  }, [rows, columns, sortKey, dir, server]);

  const total = server ? server.total : sorted.length;
  const size = server ? server.pageSize : pageSize;
  const pages = size ? Math.max(1, Math.ceil(total / size)) : 1;
  const cur = Math.min(page, pages);
  const view = server || !pageSize ? sorted : sorted.slice((cur - 1) * pageSize, cur * pageSize);

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

  const toggle = (c: Column<T>) => {
    if (server) {
      const key = c.sortKey!;
      server.onSort(key, sortKey === key ? (dir === 'asc' ? 'desc' : 'asc') : 'asc');
      return;
    }
    setState(sortKey === c.key ? { dir: dir === 'asc' ? 'desc' : 'asc', page: 1 } : { sort: c.key, dir: 'asc', page: 1 });
  };

  if (error) return <ErrorState title="These rows could not be loaded" body={error} onRetry={onRetry} />;
  if (!loading && !rows.length && empty) return <>{empty}</>;

  return (
    <div>
      <div className="max-h-[75vh] overflow-auto" aria-busy={loading || undefined}>
        <table className="tbl">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = server ? Boolean(c.sortKey) : Boolean(c.sort);
                const active = server ? c.sortKey === sortKey : c.key === sortKey;
                return (
                  <th key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${HIDE[c.hideBelow ?? '']}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {sortable ? (
                      <button type="button" onClick={() => toggle(c)} className="inline-flex items-center gap-1 hover:text-fg">
                        {c.header}
                        {active ? (dir === 'asc' ? <ArrowUpIcon className="h-3.5 w-3.5" /> : <ArrowDownIcon className="h-3.5 w-3.5" />) : <ChevronUpDownIcon className="h-3.5 w-3.5 opacity-50" />}
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
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    {columns.map((c) => <td key={c.key} className={HIDE[c.hideBelow ?? '']}><Skeleton className="h-4 w-full max-w-[160px]" /></td>)}
                  </tr>
                ))
              : view.map((r) => {
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
                        <td key={c.key} className={`${c.align === 'right' ? 'right' : ''} ${HIDE[c.hideBelow ?? '']}`}>{c.render(r)}</td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {!loading && (server || urlState || pageSize) && (
        <Pagination
          total={total}
          page={cur}
          pages={pages}
          pageSize={size ?? total}
          noun={noun}
          onPage={(p) => (server ? server.onPage(p) : setState({ page: p }))}
        />
      )}
    </div>
  );
}
