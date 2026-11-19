import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { INCIDENT_STATUSES, SEVERITIES } from '@aravalli/shared';
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
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CountUp } from '../components/ui/CountUp';
import { DataNote } from '../components/ui/DataNote';
import { Card, IdLink } from '../components/ui/layout';

const link = 'font-medium text-accent underline-offset-4 hover:underline';

/** A titled panel: a bordered surface with a small heading. */
function Panel({ title, aside, children, className = '' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`relative min-w-0 p-[18px] ${className}`}>
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** One figure in the row at the top: a label, a big number and a line of explanation. */
function Stat({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <Card className="p-[16px_18px]">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="num mt-1 text-[30px] font-semibold leading-tight tracking-[-0.03em]">{value}</div>
      <div className="mt-0.5 text-[12.5px] text-muted">{note}</div>
    </Card>
  );
}

/** Org Admin, Risk Officer and Auditor see the whole organisation; each gets a different line of introduction and next steps. */
export function Overview({ variant = 'officer' }: { variant?: 'admin' | 'officer' | 'auditor' }) {
  const { clock, organisation, can } = useSession();
  const nav = useNavigate();
  const { data, loading, error, reload } = useApi(
    async (signal) => {
      const [overview, cells, profile] = await Promise.all([api.overview(signal), api.heatmap('current', signal), api.riskProfile(signal)]);
      return { overview, cells, profile };
    },
    [],
  );

  const deptRows: BandRow[] = useMemo(
    () =>
      [...(data?.profile ?? [])]
        .sort((a, b) => b.Critical * 4 + b.High * 3 + b.Medium * 2 + b.Low - (a.Critical * 4 + a.High * 3 + a.Medium * 2 + a.Low))
        .map((d) => ({ label: d.department, Low: d.Low, Medium: d.Medium, High: d.High, Critical: d.Critical })),
    [data],
  );

  // Incidents per stage, all severities added together. Only the stages that still need work get a bar; Closed is just a number.
  const stages = useMemo(() => {
    const total = (status: string) => {
      const row = data?.overview.incidentsByStatus.find((r) => r.status === status);
      return row ? SEVERITIES.reduce((sum, s) => sum + row[s], 0) : 0;
    };
    const open = INCIDENT_STATUSES.filter((s) => s !== 'Closed').map((s) => ({ status: s, n: total(s) }));
    return { open, closed: total('Closed'), all: open.reduce((sum, s) => sum + s.n, 0) + total('Closed') };
  }, [data]);
  const stageRows: BandRow[] = useMemo(
    () => (data?.overview.incidentsByStatus ?? []).map((r) => ({ label: r.status, Low: r.Low, Medium: r.Medium, High: r.High, Critical: r.Critical })),
    [data],
  );

  const k = data?.overview.kpis;
  const unowned = k?.unassignedOpenIncidents ?? 0;
  const widest = Math.max(1, ...stages.open.map((s) => s.n));

  const attention = k && (
    <p className="mb-5 text-[15px] text-muted">
      <strong className="font-semibold text-fg">{k.criticalHighRisks} open risks</strong> are rated Critical or High
      {unowned > 0 && <>, and <strong className="font-semibold text-fg">{unowned} open incidents</strong> have nobody assigned</>}.{' '}
      <Link to="/risks?band=Critical" className={link}>Review Critical risks</Link>
      {unowned > 0 && variant !== 'auditor' && <> or <Link to="/incidents?assignee=none" className={link}>Assign incidents</Link></>}
      {variant === 'admin' && <> or <Link to="/users" className={link}>manage who has access</Link></>}
      {variant === 'auditor' && <>. This is a read-only view: you can look at everything and change nothing</>}.
    </p>
  );

  return (
    <Page
      title="Overview"
      description={k && (
        <>
          {organisation.name} · <span className="num">{stages.all.toLocaleString('en-US')}</span> incidents on record · <span className="num">{k.openIncidents.toLocaleString('en-US')}</span> open
        </>
      )}
      actions={can('incident.report') ? <Button to="/incidents/new" variant="primary">Report incident</Button> : undefined}
      loading={loading}
      error={error}
      onRetry={reload}
    >
      {data && k && (
        <div className="flex flex-col gap-5">
          {attention}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open incidents" value={<CountUp value={k.openIncidents} format={(n) => Math.round(n).toLocaleString('en-US')} />} note={`${k.criticalOpenIncidents} rated Critical`} />
            <Stat label="Open risks" value={<CountUp value={k.openRisks} />} note={`of ${k.totalRisks} on the register`} />
            <Stat label="Resolved in 30 days" value={<CountUp value={k.resolvedLast30} format={(n) => Math.round(n).toLocaleString('en-US')} />} note="incidents" />
            <Stat
              label="Average time to resolve"
              value={<CountUp value={k.meanHoursToResolve ?? 0} format={(n) => formatHours(k.meanHoursToResolve === null ? null : n)} />}
              note="from report to resolution"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
            <Panel title="Risk heat map" aside={<span className="text-[12px] text-muted">{k.totalRisks} risks</span>}>
              <HeatMap reveal compact cells={data.cells} onSelect={(c) => nav(`/risks?l=${c.likelihood}&i=${c.impact}`)} />
            </Panel>

            <Panel title="Open incidents by stage">
              <p className="-mt-2 mb-3.5 text-[12.5px] text-muted"><span className="num">{stages.closed.toLocaleString('en-US')}</span> closed incidents are not shown here</p>
              <div className="flex flex-col gap-3">
                {stages.open.map((s, i) => (
                  <div key={s.status}>
                    <div className="flex justify-between text-[13px]">
                      <span>{s.status === 'Resolved' ? 'Resolved, awaiting close' : s.status}</span>
                      <span className="num text-muted">{s.n.toLocaleString('en-US')}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded bg-track">
                      <div
                        className="grow-x h-2 rounded"
                        style={{ width: `${Math.round((s.n / widest) * 100)}%`, background: s.status === 'Resolved' ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--accent)', animationDelay: `${200 + i * 90}ms` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <ChartTable caption="Incidents by status and severity" rows={stageRows} />
            </Panel>

            <Panel title="Open risks by department">
              <BandBarChart rows={deptRows} label="Stacked bar chart of open risks by department, split by risk band" rowHeight={34} />
              <ChartTable caption="Open risks by department and risk band" rows={deptRows} />
            </Panel>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-4">
              <h2 className="text-[15px] font-semibold">Highest-scoring risks</h2>
              {can('risk.read') && <Link to="/risks" className={`text-[13px] ${link}`}>Open risk register</Link>}
            </div>
            {data.overview.topRisks.length === 0 ? (
              <p className="border-t border-line px-[18px] py-6 text-[15px] text-muted">No assessed risks yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl min-w-[760px]">
                  <caption className="sr-only">Highest-scoring risks</caption>
                  <thead>
                    <tr><th>Code</th><th>Title</th><th>Score</th><th>Status</th><th>Owner</th><th className="right">Last assessed</th></tr>
                  </thead>
                  <tbody>
                    {data.overview.topRisks.map((r) => (
                      <tr key={r.risk_id} className="row-link" tabIndex={0} onClick={() => nav(`/risks/${r.risk_code}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/risks/${r.risk_code}`)}>
                        <td><IdLink to={`/risks/${r.risk_code}`}>{r.risk_code}</IdLink></td>
                        <td className="max-w-[40ch] truncate font-medium">{r.title}</td>
                        <td><ScoreBadge score={r.risk_score} band={r.severity_band === 'Unrated' ? null : r.severity_band} /></td>
                        <td><StatusBadge status={r.status} /></td>
                        <td><NameChip name={r.owner_name} /></td>
                        <td className="right num text-muted">{r.last_assessed ? fmtDate(r.last_assessed) : 'Not yet'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {organisation.data_note && (
            <Card className="p-[16px_18px] text-[13.5px] text-muted">
              <h2 className="mb-1.5 text-[15px] font-semibold text-fg">Where this data comes from</h2>
              <DataNote note={organisation.data_note} />
            </Card>
          )}
          <p className="text-[12.5px] text-muted">As of {fmtDate(clock.today())}</p>
        </div>
      )}
    </Page>
  );
}
