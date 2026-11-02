import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { systemClock } from '@aravalli/shared';
import type { Clock, Employee, OrganisationSummary } from '@aravalli/shared';
import { api, getSession, setSession } from '../api/client';
import { ErrorState, PageSkeleton } from '../components/ui/states';

// ---------------------------------------------------------------- session
// Which organisation we are looking at and who is "acting". DEV ONLY until Phase 3 replaces this with a login;
// the choice is sent to the API as headers (see api/client.ts). No business data is kept in the browser.
interface SessionCtx {
  organisations: OrganisationSummary[];
  organisation: OrganisationSummary;
  /** People offered by the "Acting as" picker (the full employee record, so role rules can disable buttons). */
  people: Employee[];
  actor: Employee;
  /** The real clock: the server decides what "now" means for stored data, this only limits date pickers. */
  clock: Clock;
  setActorId: (id: number) => void;
  setOrganisationId: (id: number) => void;
}
const SessionContext = createContext<SessionCtx | null>(null);

// ------------------------------------------------------------------ toasts
interface Toast { id: number; message: string }
interface ToastCtx { push: (message: string) => void }
const ToastContext = createContext<ToastCtx | null>(null);

// -------------------------------------------------------------- page meta
export interface Meta { title: string }
interface MetaCtx { meta: Meta; setMeta: (m: Meta) => void }
const MetaContext = createContext<MetaCtx | null>(null);

type Boot =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; organisations: OrganisationSummary[]; organisationId: number; people: Employee[]; actorId: number };

const PICKER_SIZE = 100;

async function boot(wantedOrg: number | null, wantedActor: number | null): Promise<Boot> {
  const organisations = await api.organisations();
  if (!organisations.length) return { state: 'error', message: 'There are no organisations in the database yet. Run npm run db:seed.' };
  const organisation = organisations.find((o) => o.organisation_id === wantedOrg) ?? organisations[0];
  setSession({ organisationId: organisation.organisation_id });
  const page = await api.employees({ limit: PICKER_SIZE, sort: 'role', active: true });
  const people = page.data as Employee[];
  if (!people.length) return { state: 'error', message: `${organisation.name} has no employees yet, so nobody can act.` };
  const actor = people.find((p) => p.employee_id === wantedActor) ?? people.find((p) => p.role === 'Risk Officer') ?? people[0];
  setSession({ actorId: actor.employee_id });
  return { state: 'ready', organisations, organisationId: organisation.organisation_id, people, actorId: actor.employee_id };
}

export function Providers({ children }: { children: ReactNode }) {
  const [b, setB] = useState<Boot>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [meta, setMeta] = useState<Meta>({ title: '' });

  useEffect(() => {
    let live = true;
    const s = getSession();
    boot(s.organisationId, s.actorId).then(
      (r) => live && setB(r),
      (e: unknown) => live && setB({ state: 'error', message: e instanceof Error ? e.message : 'The server could not be reached.' }),
    );
    return () => { live = false; };
  }, [attempt]);

  const setActorId = useCallback((id: number) => {
    setSession({ actorId: id });
    setB((s) => (s.state === 'ready' ? { ...s, actorId: id } : s));
  }, []);

  const setOrganisationId = useCallback((id: number) => {
    setSession({ organisationId: id, actorId: null });
    setB({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const session = useMemo<SessionCtx | null>(() => {
    if (b.state !== 'ready') return null;
    const organisation = b.organisations.find((o) => o.organisation_id === b.organisationId)!;
    const actor = b.people.find((p) => p.employee_id === b.actorId) ?? b.people[0];
    return { organisations: b.organisations, organisation, people: b.people, actor, clock: systemClock, setActorId, setOrganisationId };
  }, [b, setActorId, setOrganisationId]);

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const toast = useMemo(() => ({ push }), [push]);
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta]);

  return (
    <ToastContext.Provider value={toast}>
      <MetaContext.Provider value={metaCtx}>
        {session ? (
          // keyed by organisation, so switching organisation throws away every screen's loaded data
          <SessionContext.Provider key={session.organisation.organisation_id} value={session}>{children}</SessionContext.Provider>
        ) : (
          <div className="mx-auto max-w-[1180px] px-4 py-14 md:px-10">
            {b.state === 'error' ? (
              <ErrorState title="Aravalli can't load" body={b.message} onRetry={() => { setB({ state: 'loading' }); setAttempt((n) => n + 1); }} />
            ) : (
              <PageSkeleton />
            )}
          </div>
        )}
        <div className="no-print fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                data-testid="toast"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
                className="rounded-xl border border-line-strong bg-fg px-4 py-3 text-[14px] font-medium text-bg shadow-pop"
              >
                {t.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </MetaContext.Provider>
    </ToastContext.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside Providers');
  return c;
}
export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast outside Providers');
  return c;
}
export function useMeta() {
  const c = useContext(MetaContext);
  if (!c) throw new Error('useMeta outside Providers');
  return c;
}
