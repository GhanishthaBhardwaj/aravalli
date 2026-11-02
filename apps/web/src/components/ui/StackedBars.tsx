import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reducedMotion } from './CountUp';

export interface Part { key: string; value: number; color: string; text: string }
export interface BarRow { label: string; parts: Part[]; href?: string }

const sum = (r: BarRow) => r.parts.reduce((n, p) => n + p.value, 0);

/** Horizontal stacked bars. The total sits at the end of each bar; bars grow in once on mount. */
export function StackedBars({ rows, legend }: { rows: BarRow[]; legend: { key: string; color: string }[] }) {
  const still = reducedMotion();
  const [on, setOn] = useState(still);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const max = Math.max(1, ...rows.map(sum));

  return (
    <div>
      <ul className={`mb-2 flex min-h-[20px] flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted ${legend.length ? '' : 'hidden lg:flex lg:invisible'}`} aria-hidden="true">
        {legend.map((l) => (
          <li key={l.key} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[2px]" style={{ background: l.color }} />
            {l.key}
          </li>
        ))}
      </ul>
      <div>
        {rows.map((r, i) => {
          const total = sum(r);
          return (
            <div key={r.label} className="flex items-center gap-3 border-b border-line py-1.5 last:border-0">
              <div className="w-28 shrink-0 text-[14px] font-medium sm:w-36">
                {r.href ? <Link to={r.href} className="block truncate text-ink hover:text-accent hover:underline">{r.label}</Link> : <span className="block truncate">{r.label}</span>}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className="flex h-6 overflow-hidden rounded-md"
                  style={{ width: on ? `${(total / max) * 88}%` : '0%', transition: still ? 'none' : `width 700ms var(--ease) ${i * 60}ms` }}
                >
                  {r.parts.filter((p) => p.value > 0).map((p) => (
                    <div
                      key={p.key}
                      title={`${p.key}: ${p.value}`}
                      className="flex items-center justify-center text-[11px] font-semibold tabular-nums"
                      style={{ flex: `${p.value} 1 0`, background: p.color, color: p.text, borderRight: '1px solid rgba(255,255,255,.7)' }}
                    >
                      {p.value}
                    </div>
                  ))}
                </div>
                <span className="text-[14px] font-semibold tabular-nums leading-none">{total}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
