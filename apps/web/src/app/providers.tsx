import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DEMO_CLOCK, systemClock } from '@aravalli/shared';
import type { Clock, Dataset, Employee, Organisation } from '@aravalli/shared';
import { initialData } from '../data/store';
import type { Result } from '../data/store';

// ------------------------------------------------------------ saved data
// The demo keeps its data in the browser. A saved copy is only trusted if it was
// written by this storage version AND from the same sample dataset; otherwise it is
// thrown away. The fingerprint makes that automatic when the sample data changes.
const STORAGE_KEY = 'aravalli:state';
const STORAGE_VERSION = 1;

interface Persisted { version: number; fingerprint: string; actorId: number; ds: Dataset }

/** FNV-1a hash of the sample dataset: changes whenever the sample data changes. */
function fingerprintOf(ds: Dataset): string {
  const text = JSON.stringify(ds);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const SAMPLE_FINGERPRINT = fingerprintOf(initialData());

/** The person the demo starts as: the first Risk Officer, else the first employee. */
const defaultActorId = (ds: Dataset) => (ds.employees.find((e) => e.role === 'Risk Officer') ?? ds.employees[0]).employee_id;

const looksLikeDataset = (ds: unknown): ds is Dataset => {
  const d = ds as Partial<Dataset> | null;
  return Boolean(d && d.organisation && ['departments', 'employees', 'risks', 'risk_assessments', 'incidents', 'incident_updates']
    .every((k) => Array.isArray((d as Record<string, unknown>)[k])));
};

function fresh(): Persisted {
  const ds = initialData();
  return { version: STORAGE_VERSION, fingerprint: SAMPLE_FINGERPRINT, actorId: defaultActorId(ds), ds };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Persisted;
      if (p.version === STORAGE_VERSION && p.fingerprint === SAMPLE_FINGERPRINT && typeof p.actorId === 'number' && looksLikeDataset(p.ds)) return p;
    }
  } catch {
    /* storage unavailable or unreadable: start from the sample data */
  }
  return fresh();
}

function save(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / private mode */
  }
}

// ------------------------------------------------------------------- data
interface DataCtx {
  ds: Dataset;
  organisation: Organisation;
  actor: Employee;
  /** Real time for real organisations, a fixed moment for the sample one. */
  clock: Clock;
  setActorId: (id: number) => void;
  /** Runs a store function against the latest data; commits the result if ok. */
  act: <T>(fn: (ds: Dataset, actor: Employee, clock: Clock) => Result<T>) => Result<T>;
  reset: () => void;
}
const DataContext = createContext<DataCtx | null>(null);

const clockFor = (org: Organisation): Clock => (org.is_demo ? DEMO_CLOCK : systemClock);

// ------------------------------------------------------------------ toasts
interface Toast { id: number; message: string }
interface ToastCtx { push: (message: string) => void }
const ToastContext = createContext<ToastCtx | null>(null);

// -------------------------------------------------------------- page meta
export interface Meta { title: string }
interface MetaCtx { meta: Meta; setMeta: (m: Meta) => void }
const MetaContext = createContext<MetaCtx | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);
  const ref = useRef(state);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [meta, setMeta] = useState<Meta>({ title: '' });

  useEffect(() => {
    ref.current = state;
    save(state);
  }, [state]);

  const actor = state.ds.employees.find((e) => e.employee_id === state.actorId) ?? state.ds.employees[0];
  const clock = clockFor(state.ds.organisation);

  const act = useCallback<DataCtx['act']>((fn) => {
    const cur = ref.current;
    const who = cur.ds.employees.find((e) => e.employee_id === cur.actorId) ?? cur.ds.employees[0];
    const r = fn(cur.ds, who, clockFor(cur.ds.organisation));
    if (r.ok) {
      ref.current = { ...cur, ds: r.data };
      setState(ref.current);
    }
    return r;
  }, []);

  const data = useMemo<DataCtx>(
    () => ({
      ds: state.ds,
      organisation: state.ds.organisation,
      actor,
      clock,
      setActorId: (id) => setState((s) => ({ ...s, actorId: id })),
      act,
      reset: () => {
        ref.current = fresh();
        setState(ref.current);
      },
    }),
    [state, actor, clock, act],
  );

  const push = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    // saved changes in the sample organisation are labelled as demo changes
    const text = ref.current.ds.organisation.is_demo ? `${message} (demo)` : message;
    setToasts((t) => [...t, { id, message: text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const toast = useMemo(() => ({ push }), [push]);
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta]);

  return (
    <DataContext.Provider value={data}>
      <ToastContext.Provider value={toast}>
        <MetaContext.Provider value={metaCtx}>
          {children}
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
