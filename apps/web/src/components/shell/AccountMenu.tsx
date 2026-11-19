import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useSession } from '../../app/providers';
import { Avatar } from '../ui/Avatar';
import { useExit } from '../../lib/useExit';

/** Who is signed in, which organisation, and the way out. */
export function AccountMenu() {
  const { actor, user, organisation, signOut } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useExit(open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const out = async () => {
    setOpen(false);
    await signOut();
    nav('/', { replace: true });
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${actor.first_name} ${actor.last_name}`}
        data-testid="account-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-2 sm:rounded-lg sm:py-1 sm:pl-1 sm:pr-3"
      >
        <Avatar person={actor} size={36} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[14px] font-medium">{actor.first_name} {actor.last_name}</span>
          <span className="block text-[12px] text-muted">{actor.role}</span>
        </span>
      </button>
      {menu.mounted && (
        <div role="menu" aria-label="Account" className={`${menu.closing ? 'menu-out pointer-events-none' : 'menu-in'} absolute right-0 z-40 mt-2 w-72 rounded-xl border border-line bg-surface p-2 shadow-pop`}>
          <div className="px-3 py-2.5">
            <div className="text-[15px] font-semibold">{actor.first_name} {actor.last_name}</div>
            <div className="text-[13px] text-muted">{actor.job_title}</div>
            <div className="mt-2 text-[13px]"><span className="text-subtle">Role</span> {actor.role}</div>
            <div className="text-[13px]"><span className="text-subtle">Organisation</span> {organisation.name}</div>
            <div className="truncate text-[13px] text-muted">{user.email}</div>
          </div>
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" onClick={out} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[14px] text-fg hover:bg-surface-2">
            <ArrowRightStartOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
