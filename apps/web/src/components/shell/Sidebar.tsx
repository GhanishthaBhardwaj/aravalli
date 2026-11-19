import { NavLink } from 'react-router-dom';
import type { Permission } from '@aravalli/shared';
import {
  BuildingOffice2Icon, ClipboardDocumentListIcon, DocumentChartBarIcon, ExclamationTriangleIcon,
  PlusCircleIcon, Squares2X2Icon, TableCellsIcon, UserPlusIcon, UsersIcon,
} from '@heroicons/react/24/outline';
import { useSession } from '../../app/providers';
import { Logo, LogoMark } from '../ui/Logo';
import { ThemeToggle } from '../ui/theme';

type Item = { to: string; label: string; icon: typeof UsersIcon; end?: boolean; needs?: Permission };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Overview', items: [{ to: '/', label: 'Overview', icon: Squares2X2Icon, end: true }] },
  { group: 'Risks', items: [
    { to: '/risks', label: 'Risk Register', icon: ClipboardDocumentListIcon, end: true, needs: 'risk.read' },
    { to: '/risks/heatmap', label: 'Heat Map', icon: TableCellsIcon, needs: 'report.read' },
  ] },
  { group: 'Incidents', items: [
    { to: '/incidents', label: 'Incident Register', icon: ExclamationTriangleIcon, end: true, needs: 'incident.read' },
    { to: '/incidents/new', label: 'Report Incident', icon: PlusCircleIcon, needs: 'incident.report' },
  ] },
  { group: 'Organization', items: [
    { to: '/departments', label: 'Departments', icon: BuildingOffice2Icon, needs: 'directory.read' },
    { to: '/people', label: 'People', icon: UsersIcon, needs: 'directory.read' },
    { to: '/users', label: 'Users', icon: UserPlusIcon, needs: 'user.manage' },
  ] },
  { group: 'Reports', items: [{ to: '/reports', label: 'Reports', icon: DocumentChartBarIcon, needs: 'report.read' }] },
];

/** `drawer` shows labels at every width and adds the theme switch (the top bar has it on larger screens). */
export function Sidebar({ drawer, onNavigate }: { drawer?: boolean; onNavigate?: () => void }) {
  const { can } = useSession();
  const label = drawer ? '' : 'hidden lg:inline';
  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar">
      <div className="flex h-[72px] items-center gap-3 px-5">
        <span className={drawer ? '' : 'hidden lg:block'}><Logo /></span>
        {!drawer && <span className="lg:hidden"><LogoMark size={26} /></span>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {NAV.map((g) => ({ ...g, items: g.items.filter((it) => !it.needs || can(it.needs)) })).filter((g) => g.items.length > 0).map((g) => (
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
                    isActive ? 'bg-surface font-semibold text-fg shadow-[inset_2px_0_0_var(--accent),0_0_0_1px_var(--line)]' : 'text-muted hover:bg-surface hover:text-fg'
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
