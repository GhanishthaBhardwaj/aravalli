import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bars3Icon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { useData } from '../../app/providers';
import { Avatar } from '../ui/Avatar';
import { ThemeToggle } from '../ui/theme';

interface Crumb { label: string; to?: string }

function crumbsFor(path: string): Crumb[] {
  const [a, b] = path.split('/').filter(Boolean);
  if (!a) return [{ label: 'Overview' }];
  if (a === 'risks') {
    if (b === 'heatmap') return [{ label: 'Risks' }, { label: 'Heat Map' }];
    if (b === 'new') return [{ label: 'Risks' }, { label: 'Risk Register', to: '/risks' }, { label: 'Register risk' }];
    return b ? [{ label: 'Risks' }, { label: 'Risk Register', to: '/risks' }, { label: b }] : [{ label: 'Risks' }, { label: 'Risk Register' }];
  }
  if (a === 'incidents') {
    if (b === 'new') return [{ label: 'Incidents' }, { label: 'Incident Register', to: '/incidents' }, { label: 'Report incident' }];
    return b ? [{ label: 'Incidents' }, { label: 'Incident Register', to: '/incidents' }, { label: b }] : [{ label: 'Incidents' }, { label: 'Incident Register' }];
  }
  if (a === 'departments') return [{ label: 'Organization' }, { label: 'Departments' }];
  if (a === 'people') return [{ label: 'Organization' }, { label: 'People' }];
  if (a === 'reports') return [{ label: 'Reports' }];
  return [{ label: 'Not found' }];
}

function GlobalSearch() {
  const { ds } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const hit = (code: string, title: string) => code.toLowerCase().includes(t) || title.toLowerCase().includes(t);
    return [
      ...ds.risks.filter((r) => hit(r.risk_code, r.title)).map((r) => ({ code: r.risk_code, title: r.title, to: `/risks/${r.risk_code}` })),
      ...ds.incidents.filter((i) => hit(i.incident_code, i.title)).map((i) => ({ code: i.incident_code, title: i.title, to: `/incidents/${i.incident_code}` })),
    ].slice(0, 8);
  }, [q, ds]);

  const go = (to: string) => { nav(to); setQ(''); setOpen(false); };

  return (
    <div className="relative order-3 min-w-0 basis-full md:order-none md:w-80 md:flex-none md:basis-auto">
      <label htmlFor="global-search" className="sr-only">Search risks and incidents</label>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-[12px] h-4 w-4 text-subtle" aria-hidden="true" />
      <input
        id="global-search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-list"
        className="control pl-9"
        placeholder="Search risks and incidents"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && results[hi]) go(results[hi].to);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul id="global-search-list" role="listbox" className="absolute z-30 mt-1 w-full min-w-[300px] rounded-lg border border-line bg-surface py-1 shadow-pop">
          {results.length === 0 && <li className="px-3 py-2 text-[14px] text-muted">No matches</li>}
          {results.map((r, i) => (
            <li
              key={r.code}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); go(r.to); }}
              className={`flex cursor-pointer gap-3 px-3 py-2 ${i === hi ? 'bg-surface-2' : ''}`}
            >
              <span className="num shrink-0 text-[12px] text-subtle">{r.code}</span>
              <span className="truncate text-[14px]">{r.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { ds, actor, setActorId } = useData();
  const crumbs = crumbsFor(pathname);
  return (
    <header className="topbar relative z-20 border-b border-line bg-bg px-4 py-3 md:sticky md:top-0 md:px-10">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" className="-ml-1.5 rounded-lg p-1.5 hover:bg-surface-2 md:hidden" aria-label="Open navigation" onClick={onMenu}>
          <Bars3Icon className="h-6 w-6" />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.label} className={`min-w-0 items-center gap-1.5 ${i < crumbs.length - 2 ? 'hidden md:flex' : 'flex'}`}>
                {i > 0 && <ChevronRightIcon className={`h-4 w-4 shrink-0 text-subtle ${i === crumbs.length - 2 ? 'hidden md:block' : ''}`} aria-hidden="true" />}
                {c.to ? (
                  <Link to={c.to} className="truncate text-muted hover:text-fg">{c.label}</Link>
                ) : (
                  <span className={`truncate ${last ? `font-medium text-fg ${/^[A-Z]{3}-\d{4}$/.test(c.label) ? 'num' : ''}` : 'text-muted'}`} aria-current={last ? 'page' : undefined}>{c.label}</span>
                )}
              </span>
            );
          })}
        </nav>
        <GlobalSearch />
        <div className="order-2 flex items-center gap-3 md:order-none">
          <div className="hidden md:block"><ThemeToggle /></div>
          <label htmlFor="acting-as" className="sr-only">Acting as</label>
          <select
            id="acting-as"
            className="control w-auto max-w-[230px]"
            value={actor.employee_id}
            onChange={(e) => setActorId(Number(e.target.value))}
          >
            {ds.employees.filter((e) => e.is_active).map((e) => (
              <option key={e.employee_id} value={e.employee_id}>{e.first_name} {e.last_name} · {e.role}</option>
            ))}
          </select>
          <Avatar person={actor} size={36} />
        </div>
      </div>
    </header>
  );
}
