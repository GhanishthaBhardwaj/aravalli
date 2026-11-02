import { NavLink } from 'react-router-dom';
import {
  BuildingOffice2Icon, ClipboardDocumentListIcon, DocumentChartBarIcon, ExclamationTriangleIcon,
  PlusCircleIcon, Squares2X2Icon, TableCellsIcon, UsersIcon,
} from '@heroicons/react/24/outline';
import { useSession } from '../../app/providers';
import { PRODUCT } from '../../app/brand';
import { ThemeToggle } from '../ui/theme';

type Item = { to: string; label: string; icon: typeof UsersIcon; end?: boolean };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Overview', icon: Squares2X2Icon, end: true }] },
  { group: 'Risks', items: [
    { to: '/risks', label: 'Risk Register', icon: ClipboardDocumentListIcon, end: true },
    { to: '/risks/heatmap', label: 'Heat Map', icon: TableCellsIcon },
  ] },
  { group: 'Incidents', items: [
    { to: '/incidents', label: 'Incident Register', icon: ExclamationTriangleIcon, end: true },
    { to: '/incidents/new', label: 'Report Incident', icon: PlusCircleIcon },
  ] },
  { group: 'Organization', items: [
    { to: '/departments', label: 'Departments', icon: BuildingOffice2Icon },
    { to: '/people', label: 'People', icon: UsersIcon },
  ] },
  { group: 'Reports', items: [{ to: '/reports', label: 'Reports', icon: DocumentChartBarIcon }] },
];

/** `drawer` shows labels at every width and adds the theme switch (the top bar has it on larger screens). */
export function Sidebar({ drawer, onNavigate }: { drawer?: boolean; onNavigate?: () => void }) {
  const { organisation } = useSession();
  const label = drawer ? '' : 'hidden lg:inline';
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-surface">
      <div className="flex h-[72px] items-center gap-3 px-5">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fg text-[17px] font-bold text-bg">
          {PRODUCT.name[0]}
        </span>
        <span className={`${label} min-w-0 leading-tight`}>
          <span className="block text-[16px] font-semibold tracking-[-0.02em]">{PRODUCT.name}</span>
          <span className="block truncate text-[13px] text-muted">{organisation.name}</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {NAV.map((g) => (
          <div key={g.group} className="mb-5">
            <div className={`px-3 pb-1.5 text-[13px] text-subtle ${drawer ? '' : 'hidden lg:block'}`}>{g.group}</div>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                title={it.label}
                className={({ isActive }) =>
                  `flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors duration-150 ${
                    isActive ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`
                }
              >
                <it.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className={label}>{it.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      {drawer && (
        <div className="border-t border-line px-3 py-3">
          <div className="px-3 pb-2 pt-1"><ThemeToggle /></div>
        </div>
      )}
    </nav>
  );
}
