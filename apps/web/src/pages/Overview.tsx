import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '../app/Page';
import { useSession } from '../app/providers';
import { fmtDate } from '../app/format';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { formatHours } from '../lib/derive';
import { HeatMap } from '../components/risk/HeatMap';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { BandBarChart, ChartTable, type BandRow } from '../components/charts/BandBarChart';
import { NameChip } from '../components/ui/Avatar';
import { CountUp } from '../components/ui/CountUp';
import { Figure, Section } from '../components/ui/layout';

const link = 'font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg';

export function Overview() {
  const { clock } = useSession();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(
    async (signal) => {
      const [overview, cells, profile] = await Promise.all([api.overview(signal), api.heatmap('current', signal), api.riskProfile(signal)]);
      return { overview, cells, profile };
    },
    [],
  );

  const stageRows: BandRow[] = useMemo(
    () => (data?.overview.incidentsByStatus ?? []).map((r) => ({ label: r.status, Low: r.Low, Medium: r.Medium, High: r.High, Critical: r.Critical })),
    [data],
  );
  const deptRows: BandRow[] = useMemo(
    () =>
      [...(data?.profile ?? [])]
        .sort((a, b) => b.Critical * 4 + b.High * 3 + b.Medium * 2 + b.Low - (a.Critical * 4 + a.High * 3 + a.Medium * 2 + a.Low))
        .map((d) => ({ label: d.department, Low: d.Low, Medium: d.Medium, High: d.High, Critical: d.Critical })),
    [data],
  );

  const k = data?.overview.kpis;
  const unowned = k?.unassignedOpenIncidents ?? 0;

  const description = k && (
    <>
      <strong className="font-semibold text-fg">{k.criticalHighRisks} open risks</strong> are rated Critical or High
      {unowned > 0 && <>, and <strong className="font-semibold text-fg">{unowned} open incidents</strong> have nobody assigned</>}.{' '}
      <Link to="/risks?band=Critical" className={link}>Review Critical risks</Link>
      {unowned > 0 && <> or <Link to="/incidents?assignee=none" className={link}>Assign incidents</Link></>}.
    </>
  );

  return (
    <Page title="Overview" description={description} loading={loading} error={error} onRetry={reload}>
      {data && k && (
        <>
          <p className="mb-4 text-[13px] text-subtle">As of {fmtDate(clock.today())}</p>
          <div className="mb-16 grid grid-cols-2 gap-y-10 border-y border-line py-9 lg:grid-cols-4">
            {[
              <Figure key="r" label="Open risks" value={<CountUp value={k.openRisks} />} note={`of ${k.totalRisks} on the register`} />,
              <Figure key="i" label="Open incidents" value={<CountUp value={k.openIncidents} />} note={`${k.criticalOpenIncidents} rated Critical`} />,
              <Figure key="s" label="Resolved in 30 days" value={<CountUp value={k.resolvedLast30} />} note="incidents" />,
              <Figure
                key="t"
                label="Average time to resolve"
                value={<CountUp value={k.meanHoursToResolve ?? 0} format={(n) => formatHours(k.meanHoursToResolve === null ? null : n)} />}
                note="report to resolution"
              />,
            ].map((f, i) => (
              <div key={i} className={`min-w-0 pr-4 ${i % 2 === 1 ? 'border-l border-line pl-6 sm:pl-8' : ''} ${i > 0 ? 'lg:border-l lg:border-line lg:pl-8' : ''}`}>
                {f}
              </div>
            ))}
          </div>

          <div className="mb-16 grid gap-x-16 gap-y-14 lg:grid-cols-[auto_1fr]">
            <Section title="Where the risks sit">
              <HeatMap reveal cells={data.cells} onSelect={(c) => nav(`/risks?l=${c.likelihood}&i=${c.impact}`)} />
            </Section>

            <Section title="Highest-scoring risks" className="min-w-0">
              {data.overview.topRisks.length === 0 ? (
                <p className="text-[15px] text-muted">No assessed risks yet.</p>
              ) : (
                <ol>
                  {data.overview.topRisks.map((r) => (
                    <li key={r.risk_id} className="border-b border-line last:border-0">
                      <Link to={`/risks/${r.risk_code}`} className="flex items-center gap-4 py-4 transition-colors hover:bg-surface-2 sm:-mx-3 sm:px-3 sm:rounded-lg">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-medium">{r.title}</div>
                          <div className="mt-1 flex items-center gap-3 text-[13px] text-muted">
                            <span className="num">{r.risk_code}</span>
                            <NameChip name={r.owner_name} />
                          </div>
                        </div>
                        <ScoreBadge score={r.risk_score} band={r.severity_band === 'Unrated' ? null : r.severity_band} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          <div className="grid gap-x-16 gap-y-14 lg:grid-cols-2">
            <Section title="Incidents by stage">
              <BandBarChart rows={stageRows} label="Stacked bar chart of incident counts by status, split by severity" />
              <ChartTable caption="Incidents by status and severity" rows={stageRows} />
            </Section>
            <Section title="Open risks by department">
              <BandBarChart rows={deptRows} label="Stacked bar chart of open risks by department, split by risk band" rowHeight={34} />
              <ChartTable caption="Open risks by department and risk band" rows={deptRows} />
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}
