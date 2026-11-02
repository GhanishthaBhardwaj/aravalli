import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, ChevronRight, FileBarChart, Grid3x3, LayoutDashboard, ListChecks, Menu, PlusCircle,
  RotateCcw, Search, Users, X,
} from 'lucide-react';
import { useData } from './providers';
import { Avatar } from '../components/ui/Avatar';

type Item = { to: string; label: string; icon: typeof Users; end?: boolean };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] },
  { group: 'Risks', items: [
    { to: '/risks', label: 'Risk Register', icon: ListChecks, end: true },
    { to: '/risks/heatmap', label: 'Heat Map', icon: Grid3x3 },
  ] },
  { group: 'Incidents', items: [
    { to: '/incidents', label: 'Incident Register', icon: AlertTriangle, end: true },
    { to: '/incidents/new', label: 'Report Incident', icon: PlusCircle },
  ] },
  { group: 'Organization', items: [
    { to: '/departments', label: 'Departments', icon: Building2 },
    { to: '/people', label: 'People', icon: Users },
  ] },
  { group: 'Reports', items: [{ to: '/reports', label: 'Reports', icon: FileBarChart }] },
];

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

function ResetLink({ mobile }: { mobile?: boolean }) {
  const { reset } = useData();
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 4000);
    return () => clearTimeout(t);
  }, [sure]);
  return (
    <button
      type="button"
      title="Restore the original sample data"
      onClick={() => (sure ? (reset(), setSure(false)) : setSure(true))}
      className="mx-3 mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-[#98a2b3] transition-colors duration-150 hover:bg-[var(--nav-hover)] hover:text-white"
    >
      <RotateCcw size={16} className="shrink-0" aria-hidden="true" />
      <span className={mobile ? '' : 'hidden lg:inline'}>{sure ? 'Click again to reset' : 'Reset sample data'}</span>
    </button>
  );
}

function SidebarContent({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const text = mobile ? '' : 'hidden lg:inline';
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-[var(--nav)] text-[var(--nav-text)]">
      <div className="flex h-16 items-center gap-3 px-5 text-white">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-signal text-[15px] font-bold text-white">A</span>
        <span className={`${text} leading-tight`}>
          <span className="block text-[15px] font-semibold">Aravalli</span>
          <span className="block text-[12px] text-[#98a2b3]">Risk &amp; Incident</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {NAV.map((g) => (
          <div key={g.group} className="mb-3">
            <div className={`px-3 pb-1 pt-2 text-xs font-medium text-[#98a2b3] ${mobile ? '' : 'hidden lg:block'}`}>{g.group}</div>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                title={it.label}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
                    isActive ? 'bg-[var(--nav-hover)] text-white' : 'text-[var(--nav-text)] hover:bg-[var(--nav-hover)] hover:text-white'
                  }`
                }
              >
                <it.icon size={18} className="shrink-0" aria-hidden="true" />
                <span className={text}>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <ResetLink mobile={mobile} />
    </nav>
  );
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
      <Search size={16} className="pointer-events-none absolute left-3 top-[12px] text-[#98a2b3]" aria-hidden="true" />
      <input
        id="global-search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="global-search-list"
        className="field-input pl-9"
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
        <ul id="global-search-list" role="listbox" className="panel absolute z-30 mt-1 w-full min-w-[300px] py-1" style={{ boxShadow: 'var(--popover-shadow)' }}>
          {results.length === 0 && <li className="px-3 py-2 text-muted">No matches</li>}
          {results.map((r, i) => (
            <li key={r.code} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); go(r.to); }}
              className={`flex cursor-pointer gap-3 px-3 py-2 ${i === hi ? 'bg-[var(--hover)]' : ''}`}>
              <span className="mono shrink-0 text-xs text-muted">{r.code}</span>
              <span className="truncate">{r.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { ds, actor, setActorId } = useData();
  const crumbs = crumbsFor(pathname);
  return (
    <header className="app-header relative z-20 border-b border-line bg-surface px-4 py-3 md:sticky md:top-0 md:px-8">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--hover)] md:hidden" aria-label="Open navigation" onClick={onMenu}>
          <Menu size={20} />
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={c.label} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRight size={14} className="shrink-0 text-[#98a2b3]" aria-hidden="true" />}
                {c.to ? (
                  <Link to={c.to} className="truncate text-muted hover:text-ink">{c.label}</Link>
                ) : (
                  <span className={`truncate ${last ? 'font-medium text-ink' : 'text-muted'}`} aria-current={last ? 'page' : undefined}>{c.label}</span>
                )}
              </span>
            );
          })}
        </nav>
        <GlobalSearch />
        <div className="order-2 flex items-center gap-2.5 md:order-none">
          <label htmlFor="acting-as" className="sr-only">Acting as</label>
          <select
            id="acting-as"
            className="field-input w-auto max-w-[240px]"
            value={actor.employee_id}
            onChange={(e) => setActorId(Number(e.target.value))}
          >
            {ds.employees.filter((e) => e.is_active).map((e) => (
              <option key={e.employee_id} value={e.employee_id}>
                {e.first_name} {e.last_name} · {e.role}
              </option>
            ))}
          </select>
          <Avatar person={actor} size={36} />
        </div>
      </div>
    </header>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMobile(false), [pathname]);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block md:w-[72px] lg:w-[256px]">
        <SidebarContent />
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobile(false)} aria-hidden="true" />
          <aside className="relative h-full w-[272px]">
            <button type="button" className="absolute right-3 top-4 z-10 rounded p-1 text-white hover:bg-[var(--nav-hover)]" aria-label="Close navigation" onClick={() => setMobile(false)}>
              <X size={18} />
            </button>
            <SidebarContent mobile onNavigate={() => setMobile(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobile(true)} />
        <main className="app-main flex-1 px-4 py-6 md:px-8">{children}</main>
        <footer className="app-footer px-4 pb-4 text-xs text-muted md:px-8">
          <div className="mx-auto max-w-[1280px]">Aravalli Industries Ltd. is a fictional company. Demo data, not connected to a database.</div>
        </footer>
      </div>
    </div>
  );
}
