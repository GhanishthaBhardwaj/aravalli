import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Severity } from '@aravalli/shared';
import { BAND_TEXT_VAR, BAND_VAR } from '../ui/Badge';
import { reducedMotion } from '../ui/CountUp';

/** Stack order runs from Low to Critical, so the worst sits at the end of each bar. */
const STACK: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

export type BandRow = { label: string; href?: string } & Record<Severity, number>;

export const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line-strong)',
  borderRadius: 10,
  color: 'var(--fg)',
  boxShadow: 'var(--shadow-pop)',
  fontSize: 13,
};

/** Horizontal stacked bars, one per row. The legend is the band names, shown in the same tones. */
export function BandBarChart({ rows, label, rowHeight = 40 }: { rows: BandRow[]; label: string; rowHeight?: number }) {
  const animate = !reducedMotion();
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-fg" aria-hidden="true">
        {STACK.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: BAND_VAR[s] }} />
            {s}
          </li>
        ))}
      </ul>
      <div style={{ height: rows.length * rowHeight + 8 }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={118} tickLine={false} axisLine={false} tick={{ fill: 'var(--fg)', fontSize: 13.5 }} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} />
            {STACK.map((s) => (
              <Bar key={s} dataKey={s} stackId="a" fill={BAND_VAR[s]} isAnimationActive={animate} animationDuration={600} stroke="var(--surface)" strokeWidth={1}>
                <LabelList dataKey={s} position="center" formatter={(v: number) => (v > 0 ? v : '')} style={{ fill: BAND_TEXT_VAR[s], fontSize: 12, fontWeight: 600, fontFamily: 'Geist Mono, monospace' }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Screen-reader copy of a chart's data. */
export function ChartTable({ caption, rows }: { caption: string; rows: BandRow[] }) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr><th>Name</th>{STACK.map((s) => <th key={s}>{s}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}><th scope="row">{r.label}</th>{STACK.map((s) => <td key={s}>{r[s]}</td>)}</tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
