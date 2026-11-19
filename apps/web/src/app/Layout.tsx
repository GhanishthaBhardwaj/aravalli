import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSession } from './providers';
import { Sidebar } from '../components/shell/Sidebar';
import { Topbar } from '../components/shell/Topbar';
import { DataNote } from '../components/ui/DataNote';

export function Layout({ children }: { children: ReactNode }) {
  const { organisation } = useSession();
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-line md:block md:w-[72px] lg:w-[264px]">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fade-in absolute inset-0" style={{ background: 'var(--overlay)' }} onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className="slide-in absolute inset-y-0 left-0 w-[288px] border-r border-line bg-surface shadow-pop">
            <button type="button" className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close navigation" onClick={() => setDrawer(false)}>
              <XMarkIcon className="h-5 w-5" />
            </button>
            <Sidebar drawer onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <main className="app-main mx-auto w-full max-w-[1180px] flex-1 px-4 py-10 md:px-10 md:py-14">{children}</main>
        <footer className="app-footer mx-auto w-full max-w-[1180px] px-4 pb-8 text-[13px] text-subtle md:px-10">
          <span className="font-medium text-muted">{organisation.name}</span>
          {organisation.data_note && <div className="mt-1"><DataNote note={organisation.data_note} short /></div>}
        </footer>
      </div>
    </div>
  );
}
