import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ListChecks, Timer, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import {
  formatHours, heatGrid, incidentsByStatus, isOpenIncident, kpis, riskProfileByDepartment, topRisks,
} from '../data/selectors';
import { SEVERITIES, type Severity } from '@aravalli/shared';
import { HeatMap } from '../components/risk/HeatMap';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { ChartCard } from '../components/ui/ChartCard';
import { SEV_COLOR, SEV_TEXT } from '../components/ui/Chip';
import { CountUp } from '../components/ui/CountUp';
import { PersonName } from '../components/ui/Avatar';
import { Panel } from '../components/ui/misc';
import { fmtDate } from '../app/format';
import { StackedBars } from '../components/ui/StackedBars';
import type { Part } from '../components/ui/StackedBars';

const ORDER_DESC: Severity[] = ['Critical', 'High', 'Medium', 'Low'];
const LEGEND = ORDER_DESC.map((s) => ({ key: s, color: SEV_COLOR[s] }));
const parts = (get: (s: Severity) => number): Part[] =>
  ORDER_DESC.map((s) => ({ key: s, value: get(s), color: SEV_COLOR[s], text: SEV_TEXT[s] }));

function Stat({ label, value, format, note, icon: Icon, color, tint }: {
  label: string; value: number; format?: (n: number) => string; note: string; icon: LucideIcon; color: string; tint: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[14px] font-medium text-muted">{label}</div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: tint }}>
          <Icon size={18} color={color} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 text-[30px] font-semibold leading-9 tracking-tight tabular-nums">
        <CountUp value={value} format={format} />
      </div>
      <div className="mt-1 text-[13px] text-muted">{note}</div>
    </div>
  );
}

export function Overview() {
  const { ds, clock } = useData();
  const nav = useNavigate();
  const k = useMemo(() => kpis(ds, clock), [ds, clock]);
  const cells = useMemo(() => heatGrid(ds, 'current'), [ds]);
  const byStatus = useMemo(() => incidentsByStatus(ds), [ds]);
  const byDept = useMemo(
    () => riskProfileByDepartment(ds).sort((a, b) => b.Critical * 4 + b.High * 3 + b.Medium * 2 + b.Low - (a.Critical * 4 + a.High * 3 + a.Medium * 2 + a.Low)),
    [ds],
  );
  const top = useMemo(() => topRisks(ds, 5), [ds]);

  const unowned = ds.incidents.filter((i) => isOpenIncident(i) && i.assigned_to === null).length;
  const deptId = (name: string) => ds.departments.find((d) => d.name === name)?.department_id;
  const deptRows = byDept.map((d) => ({
    label: d.department,
    parts: parts((s) => d[s]),
    href: deptId(d.department) ? `/risks?department=${deptId(d.department)}` : undefined,
  }));

  return (
    <Page title="Overview" description={`Risk and incident position as of ${fmtDate(clock.today())}.`}>
      {(k.criticalHighRisks > 0 || unowned > 0) && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[#fedf89] bg-[#fffaeb] px-4 py-3 text-[14px] text-[#93370d]">
          <TriangleAlert size={18} className="shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">{k.criticalHighRisks} open risks</strong> are rated Critical or High
            {unowned > 0 && <>, and <strong className="font-semibold">{unowned} open incidents</strong> have nobody assigned</>}.
          </p>
          <div className="flex gap-4 font-medium">
            <Link to="/risks?band=Critical" className="text-[#93370d] underline-offset-2 hover:underline">Review Critical risks</Link>
            {unowned > 0 && <Link to="/incidents?assignee=none" className="text-[#93370d] underline-offset-2 hover:underline">Assign incidents</Link>}
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open risks" value={k.openRisks} note={`of ${k.totalRisks} on the register`} icon={ListChecks} color="#2563eb" tint="#eff6ff" />
        <Stat label="Open incidents" value={k.openIncidents} note={`${k.criticalOpenIncidents} rated Critical`} icon={AlertTriangle} color="#dc6803" tint="#fffaeb" />
        <Stat label="Resolved in 30 days" value={k.resolvedLast30} note="incidents resolved" icon={CheckCircle2} color="#079455" tint="#ecfdf3" />
        <Stat
          label="Average time to resolve"
          value={k.meanHoursToResolve ?? 0}
          format={(n) => formatHours(k.meanHoursToResolve === null ? null : n)}
          note="from report to resolution"
          icon={Timer}
          color="#7a5af8"
          tint="#f4f3ff"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Risk heat map">
            <HeatMap reveal cells={cells} onSelect={(c) => nav(`/risks?l=${c.likelihood}&i=${c.impact}`)} />
          </Panel>
          <ChartCard
            title="Open risks by department"
            table={{ headers: ['Department', ...ORDER_DESC], rows: byDept.map((d) => [d.department, ...ORDER_DESC.map((s) => d[s])]) }}
          >
            <StackedBars legend={LEGEND} rows={deptRows} />
          </ChartCard>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Highest-scoring risks" flush>
            <ol>
              {top.map((r) => (
                <li key={r.risk.risk_id} className="border-b border-line last:border-0">
                  <Link
                    to={`/risks/${r.risk.risk_code}`}
                    className="flex items-center gap-4 px-5 py-3 text-ink transition-colors duration-150 hover:bg-[var(--hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{r.risk.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
                        <span className="mono text-xs">{r.risk.risk_code}</span>
                        <PersonName person={r.owner} />
                      </div>
                    </div>
                    <ScoreBadge score={r.score} band={r.band} />
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>

          <ChartCard
            title="Incidents by stage"
            table={{ headers: ['Status', ...SEVERITIES.map(String)], rows: byStatus.map((r) => [r.status, ...SEVERITIES.map((s) => r[s])]) }}
          >
            <StackedBars legend={LEGEND} rows={byStatus.map((r) => ({ label: r.status, parts: parts((s) => r[s]) }))} />
          </ChartCard>
        </div>
      </div>

    </Page>
  );
}
