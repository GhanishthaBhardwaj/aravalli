import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bandFor } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { assessmentsFor, heatGrid, type HeatCell, type HeatMode } from '../data/selectors';
import { HeatMap } from '../components/risk/HeatMap';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { PersonName } from '../components/ui/Avatar';
import { Section } from '../components/ui/layout';
import { Tabs } from '../components/ui/Tabs';

export function HeatMapPage() {
  const { ds } = useData();
  const [mode, setMode] = useState<HeatMode>('current');
  const [sel, setSel] = useState<{ likelihood: number; impact: number } | null>(null);
  const cells = useMemo(() => heatGrid(ds, mode), [ds, mode]);
  const selected: HeatCell | undefined = sel ? cells[(sel.likelihood - 1) * 5 + (sel.impact - 1)] : undefined;
  const total = cells.reduce((n, c) => n + c.rows.length, 0);

  return (
    <Page title="Heat Map" description={`${total} open risks by likelihood and impact.`}>
      <Tabs
        label="Position basis"
        value={mode}
        onChange={setMode}
        tabs={[{ id: 'current', label: 'Current' }, { id: 'first', label: 'As of first assessment' }]}
      />
      <div className="mt-10 grid gap-x-16 gap-y-12 xl:grid-cols-[auto_minmax(0,1fr)]">
        <Section title={mode === 'current' ? 'Current positions' : 'Positions at first assessment'}>
          <HeatMap cells={cells} onSelect={(c) => setSel({ likelihood: c.likelihood, impact: c.impact })} selected={sel} />
        </Section>

        <Section title={selected ? `Likelihood ${selected.likelihood} × Impact ${selected.impact} — ${bandFor(selected.likelihood * selected.impact)}` : 'Risks in a cell'}>
          {!selected ? (
            <p className="text-[15px] text-muted">Select a cell to see its risks.</p>
          ) : selected.rows.length === 0 ? (
            <p className="text-[15px] text-muted">No open risks in this cell.</p>
          ) : (
            <ul>
              {selected.rows.map((r) => {
                const first = assessmentsFor(ds, r.risk.risk_id)[0];
                const moved = first && r.current && first.assessment_id !== r.current.assessment_id;
                return (
                  <li key={r.risk.risk_id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-4 last:border-0">
                    <div className="min-w-0">
                      <Link to={`/risks/${r.risk.risk_code}`} className="num text-[13px] font-medium underline underline-offset-4">{r.risk.risk_code}</Link>
                      <p className="mt-0.5 truncate text-[16px] font-medium">{r.risk.title}</p>
                      <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">{r.department.name} · <PersonName person={r.owner} /></p>
                    </div>
                    <div className="flex items-center gap-4">
                      {moved && <span className="num text-[13px] text-muted">{first.risk_score} → {r.current!.risk_score}</span>}
                      <ScoreBadge score={r.score} band={r.band} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </Page>
  );
}
