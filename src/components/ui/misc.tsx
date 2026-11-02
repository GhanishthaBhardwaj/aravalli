import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <SearchX size={22} className="text-muted" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="mb-3 h-10 w-1/2" />
      <Skeleton className="h-64" />
    </div>
  );
}

export function Panel({ title, actions, children, className = '', flush }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <h2 className="section-title">{title}</h2>
          {actions}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export const CodeLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="mono whitespace-nowrap text-[12px] font-medium underline-offset-2 hover:underline">
    {children}
  </Link>
);

export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} variant="secondary">
      Clear filters
    </Button>
  );
}

// ------------------------------------------------------- searchable select
export interface Opt { value: string; label: string; hint?: string }

interface SSProps {
  id?: string;
  options: Opt[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

export function SearchableSelect({ id, options, value, onChange, placeholder = 'Search…', invalid, disabled }: SSProps) {
  const lid = useId();
  const sel = options.find((o) => o.value === value);
  const [q, setQ] = useState(sel?.label ?? '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => setQ(sel?.label ?? ''), [sel?.label]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (!t || q === sel?.label ? options : options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(t))).slice(0, 50);
  }, [q, options, sel?.label]);

  const pick = (o: Opt | null) => {
    onChange(o?.value ?? null);
    setQ(o?.label ?? '');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={lid}
        aria-autocomplete="list"
        aria-invalid={invalid}
        disabled={disabled}
        className="field-input"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
          if (!e.target.value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul id={lid} role="listbox" className="panel absolute z-30 mt-1 max-h-60 w-full overflow-auto py-1" style={{ boxShadow: 'var(--popover-shadow)' }}>
          {shown.length === 0 && <li className="px-3 py-2 text-muted">No matches</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={`cursor-pointer px-3 py-1.5 ${i === hi ? 'bg-[var(--hover)]' : ''}`}
            >
              <span className="block truncate">{o.label}</span>
              {o.hint && <span className="mono block text-[11px] text-muted">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
