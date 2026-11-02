import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { assessmentsFor, heatGrid } from '../data/selectors';
import type { HeatCell, HeatMode } from '../data/selectors';
import { bandFor } from '@aravalli/shared';
import { HeatMap } from '../components/risk/HeatMap';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { Panel } from '../components/ui/misc';

export function HeatMapPage() {
  const { ds } = useData();
  const [mode, setMode] = useState<HeatMode>('current');
  const [sel, setSel] = useState<{ likelihood: number; impact: number } | null>(null);
  const cells = useMemo(() => heatGrid(ds, mode), [ds, mode]);
  const selected: HeatCell | undefined = sel ? cells[(sel.likelihood - 1) * 5 + (sel.impact - 1)] : undefined;
  const total = cells.reduce((n, c) => n + c.rows.length, 0);

  return (
    <Page title="Heat Map" description="Open risks by likelihood and impact.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Position basis" className="inline-flex overflow-hidden rounded-md border border-[#aab2bf]">
          {([['current', 'Current'], ['first', 'As of first assessment']] as [HeatMode, string][]).map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`h-9 px-3 text-sm transition-colors duration-150 ${mode === m ? 'bg-ink text-white' : 'bg-surface hover:bg-[var(--hover)]'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">{total} open risks</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[auto_1fr]">
        <Panel title={mode === 'current' ? 'Current positions' : 'Positions at first assessment'}>
          <HeatMap cells={cells} onSelect={(c) => setSel({ likelihood: c.likelihood, impact: c.impact })} selected={sel} />
        </Panel>
        <Panel title={selected ? `Likelihood ${selected.likelihood} × Impact ${selected.impact} — ${bandFor(selected.likelihood * selected.impact)}` : 'Risks in cell'} flush>
          {!selected ? (
            <p className="p-4 text-[13px] text-muted">Select a cell to see its risks.</p>
          ) : selected.rows.length === 0 ? (
            <p className="p-4 text-[13px] text-muted">No open risks in this cell.</p>
          ) : (
            <ul className="divide-y divide-line">
              {selected.rows.map((r) => {
                const hist = assessmentsFor(ds, r.risk.risk_id);
                const first = hist[0];
                return (
                  <li key={r.risk.risk_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/risks/${r.risk.risk_code}`} className="mono text-[12px] font-medium underline">{r.risk.risk_code}</Link>
                      <p className="truncate">{r.risk.title}</p>
                      <p className="text-xs text-muted">{r.department.name} · {r.owner.first_name} {r.owner.last_name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      {first && r.current && first.assessment_id !== r.current.assessment_id && (
                        <span className="mono">{first.risk_score} → {r.current.risk_score}</span>
                      )}
                      <ScoreBadge score={r.score} band={r.band} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
