import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dataset, Employee } from '@aravalli/shared';
import { initialData } from '../data/store';
import type { Result } from '../data/store';

const KEY = 'arii-demo-v1';
const DEFAULT_ACTOR = 2; // Meera Iyer, Risk Officer

interface Persisted { ds: Dataset; actorId: number }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p?.ds && Array.isArray(p.ds.risks) && Array.isArray(p.ds.incidents) && Array.isArray(p.ds.employees)) return p;
    }
  } catch {
    /* storage unavailable or corrupt: fall back to seed */
  }
  return { ds: initialData(), actorId: DEFAULT_ACTOR };
}

function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / private mode */
  }
}

// ------------------------------------------------------------------- data
interface DataCtx {
  ds: Dataset;
  actor: Employee;
  setActorId: (id: number) => void;
  /** Runs a store function against the latest data; commits the result if ok. */
  act: <T>(fn: (ds: Dataset, actor: Employee) => Result<T>) => Result<T>;
  reset: () => void;
}
const DataContext = createContext<DataCtx | null>(null);

// ------------------------------------------------------------------ toasts
interface Toast { id: number; message: string }
interface ToastCtx { push: (message: string) => void }
const ToastContext = createContext<ToastCtx | null>(null);

// -------------------------------------------------------------- page meta
export interface Crumb { label: string; to?: string }
export interface Meta { title: string; crumbs: Crumb[] }
interface MetaCtx { meta: Meta; setMeta: (m: Meta) => void }
const MetaContext = createContext<MetaCtx | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const ref = useRef(state);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [meta, setMeta] = useState<Meta>({ title: '', crumbs: [] });

  useEffect(() => {
    ref.current = state;
    save(state);
  }, [state]);

  const actor = state.ds.employees.find((e) => e.employee_id === state.actorId) ?? state.ds.employees[0];

  const act = useCallback<DataCtx['act']>((fn) => {
    const cur = ref.current;
    const who = cur.ds.employees.find((e) => e.employee_id === cur.actorId) ?? cur.ds.employees[0];
    const r = fn(cur.ds, who);
    if (r.ok) {
      ref.current = { ...cur, ds: r.data };
      setState(ref.current);
    }
    return r;
  }, []);

  const data = useMemo<DataCtx>(
    () => ({
      ds: state.ds,
      actor,
      setActorId: (id) => setState((s) => ({ ...s, actorId: id })),
      act,
      reset: () => {
        ref.current = { ds: initialData(), actorId: DEFAULT_ACTOR };
        setState(ref.current);
      },
    }),
    [state, actor, act],
  );

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const toast = useMemo(() => ({ push }), [push]);
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta]);

  return (
    <DataContext.Provider value={data}>
      <ToastContext.Provider value={toast}>
        <MetaContext.Provider value={metaCtx}>
          {children}
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 no-print" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className="panel toast-in px-4 py-2.5 text-sm font-medium" style={{ boxShadow: 'var(--popover-shadow)', borderLeft: '4px solid #2e9e5b' }}>
                {t.message}
              </div>
            ))}
          </div>
        </MetaContext.Provider>
      </ToastContext.Provider>
    </DataContext.Provider>
  );
}

export function useData() {
  const c = useContext(DataContext);
  if (!c) throw new Error('useData outside Providers');
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
