import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { motion } from 'motion/react';

export interface TabItem<T extends string> { id: T; label: string; count?: number }

interface Props<T extends string> {
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
}

/** Accessible tabs: arrow keys move between tabs, and the underline slides to the active one. */
export function Tabs<T extends string>({ label, tabs, value, onChange }: Props<T>) {
  const group = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent, i: number) => {
    const move = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const t = tabs[e.key === 'Home' ? 0 : tabs.length - 1];
      onChange(t.id);
      refs.current[t.id]?.focus();
    } else if (move) {
      e.preventDefault();
      const t = tabs[(i + move + tabs.length) % tabs.length];
      onChange(t.id);
      refs.current[t.id]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} className="no-print flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`${group}-${t.id}`}
            aria-selected={active}
            aria-controls={`${group}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative -mb-px whitespace-nowrap py-3 text-[14px] font-medium transition-colors duration-150 ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
          >
            {t.label}
            {t.count !== undefined && <span className="num ml-2 text-[13px] text-subtle">{t.count}</span>}
            {active && <motion.span layoutId={`${group}-underline`} className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" transition={{ duration: 0.18 }} />}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return <div role="tabpanel" aria-labelledby={labelledBy} tabIndex={0} className="pt-6">{children}</div>;
}
