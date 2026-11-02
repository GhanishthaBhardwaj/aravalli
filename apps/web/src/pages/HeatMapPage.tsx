import { useState } from 'react';
import { Link } from 'react-router-dom';
import { bandFor } from '@aravalli/shared';
import { Page } from '../app/Page';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { HeatMap } from '../components/risk/HeatMap';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { NameChip } from '../components/ui/Avatar';
import { Section } from '../components/ui/layout';
import { Tabs } from '../components/ui/Tabs';

type Mode = 'current' | 'first';

export function HeatMapPage() {
  const [mode, setMode] = useState<Mode>('current');
  const [sel, setSel] = useState<{ likelihood: number; impact: number } | null>(null);
  const { data: cells, loading, error, reload } = useApi((signal) => api.heatmap(mode, signal), [mode]);
  const selected = cells && sel ? cells[(sel.likelihood - 1) * 5 + (sel.impact - 1)] : undefined;
  const total = (cells ?? []).reduce((n, c) => n + c.risks.length, 0);

  return (
    <Page title="Heat Map" description={cells ? `${total} open risks by likelihood and impact.` : 'Open risks by likelihood and impact.'} error={cells ? null : error} onRetry={reload}>
      <Tabs
        label="Position basis"
        value={mode}
        onChange={setMode}
        tabs={[{ id: 'current', label: 'Current' }, { id: 'first', label: 'As of first assessment' }]}
      />
      {loading && !cells ? (
        <p className="mt-10 text-[15px] text-muted" role="status">Loading the heat map…</p>
      ) : cells ? (
        <div className="mt-10 grid gap-x-16 gap-y-12 xl:grid-cols-[auto_minmax(0,1fr)]">
          <Section title={mode === 'current' ? 'Current positions' : 'Positions at first assessment'}>
            <HeatMap cells={cells} onSelect={(c) => setSel({ likelihood: c.likelihood, impact: c.impact })} selected={sel} />
          </Section>

          <Section title={selected ? `Likelihood ${selected.likelihood} × Impact ${selected.impact} — ${bandFor(selected.likelihood * selected.impact)}` : 'Risks in a cell'}>
            {!selected ? (
              <p className="text-[15px] text-muted">Select a cell to see its risks.</p>
            ) : selected.risks.length === 0 ? (
              <p className="text-[15px] text-muted">No open risks in this cell.</p>
            ) : (
              <ul>
                {selected.risks.map((r) => {
                  const moved = mode === 'current' && r.first_score !== null && r.first_score !== r.risk_score;
                  return (
                    <li key={r.risk_id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-4 last:border-0">
                      <div className="min-w-0">
                        <Link to={`/risks/${r.risk_code}`} className="num text-[13px] font-medium underline underline-offset-4">{r.risk_code}</Link>
                        <p className="mt-0.5 truncate text-[16px] font-medium">{r.title}</p>
                        <p className="mt-1 flex items-center gap-2 text-[13px] text-muted">{r.department_name} · <NameChip name={r.owner_name} /></p>
                      </div>
                      <div className="flex items-center gap-4">
                        {moved && <span className="num text-[13px] text-muted">{r.first_score} → {r.risk_score}</span>}
                        <ScoreBadge score={r.risk_score} band={r.severity_band === 'Unrated' ? null : r.severity_band} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      ) : null}
    </Page>
  );
}
