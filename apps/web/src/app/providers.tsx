import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { hasPermission, systemClock } from '@aravalli/shared';
import type { Clock, Employee, Permission, SessionUser } from '@aravalli/shared';
import { auth, onSignedOut, refreshSession } from '../api/client';

// ------------------------------------------------------------------------------------------------------------- auth
// Whether anybody is signed in. The answer comes from the server: on load we ask it to exchange the httpOnly refresh cookie
// for an access token. Nothing about the user is kept in localStorage.
type Status = 'loading' | 'out' | 'in' | 'error';
interface AuthCtx {
  status: Status;
  user: SessionUser | null;
  /** Why the app could not start (the server is unreachable), when status is 'error'. */
  error: string;
  retry: () => void;
  /** Called by the log-in and sign-up forms with the user the server returned. */
  setUser: (u: SessionUser) => void;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthCtx | null>(null);

// -------------------------------------------------------------------------------------------------- session (signed in)
interface SessionCtx {
  user: SessionUser;
  organisation: { organisation_id: number; name: string; data_note: string | null; is_demo: boolean };
  /** The signed-in person's employee record (role, department), so role rules can disable buttons. */
  actor: Employee;
  /** The real clock: the server decides what "now" means for stored data, this only limits date pickers. */
  clock: Clock;
  can: (permission: Permission) => boolean;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<SessionCtx | null>(null);

// ------------------------------------------------------------------ toasts
interface Toast { id: number; message: string; leaving?: boolean }
interface ToastCtx { push: (message: string) => void }
const ToastContext = createContext<ToastCtx | null>(null);

// -------------------------------------------------------------- page meta
export interface Meta { title: string }
interface MetaCtx { meta: Meta; setMeta: (m: Meta) => void }
const MetaContext = createContext<MetaCtx | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [meta, setMeta] = useState<Meta>({ title: '' });
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // on load: is there a valid refresh cookie?
  useEffect(() => {
    let live = true;
    refreshSession().then(
      (u) => {
        if (!live) return;
        setUserState(u);
        setStatus(u ? 'in' : 'out');
      },
      (e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : 'The server could not be reached.');
        setStatus('error');
      },
    );
    return () => { live = false; };
  }, [attempt]);
  const retry = useCallback(() => { setStatus('loading'); setAttempt((n) => n + 1); }, []);

  // the server says the session is over (refresh failed mid-use, or the account was deactivated)
  useEffect(() => onSignedOut(() => { setUserState(null); setStatus('out'); }), []);

  const setUser = useCallback((u: SessionUser) => { setUserState(u); setStatus('in'); }, []);
  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUserState(null);
      setStatus('out');
    }
  }, []);
  const authCtx = useMemo<AuthCtx>(() => ({ status, user, error, retry, setUser, signOut }), [status, user, error, retry, setUser, signOut]);

  const session = useMemo<SessionCtx | null>(() => {
    if (!user) return null;
    return {
      user,
      organisation: { organisation_id: user.organisation_id, name: user.organisation_name, data_note: user.organisation_data_note, is_demo: user.is_demo },
      actor: user.employee,
      clock: systemClock,
      can: (p) => hasPermission(user.employee.role, p),
      signOut,
    };
  }, [user, signOut]);

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 3750); // slides out
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const toast = useMemo(() => ({ push }), [push]);
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta]);

  return (
    <ToastContext.Provider value={toast}>
      <MetaContext.Provider value={metaCtx}>
        <AuthContext.Provider value={authCtx}>
          {/* keyed by user, so signing in as someone else throws away every screen's loaded data */}
          <SessionContext.Provider key={user?.user_id ?? 'none'} value={session}>{children}</SessionContext.Provider>
        </AuthContext.Provider>
        <div className="no-print fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
          {toasts.map((t) => (
              <div
                key={t.id}
                data-testid="toast"
                className={`${t.leaving ? 'toast-out' : 'toast-in'} rounded-xl border border-line-strong bg-fg px-4 py-3 text-[14px] font-medium text-bg shadow-pop`}
              >
                {t.message}
              </div>
            ))}
        </div>
      </MetaContext.Provider>
    </ToastContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth outside Providers');
  return c;
}
/** Only inside the signed-in app. */
export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside a signed-in screen');
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
