import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownTrayIcon, PrinterIcon } from '@heroicons/react/20/solid';
import type { IncidentListItem, ResolutionRow } from '@aravalli/shared';
import { Page } from '../app/Page';
import { downloadCsv, fmtDate } from '../app/format';
import { api } from '../api/client';
import { useApi, type ApiState } from '../api/useApi';
import { formatHours } from '../lib/derive';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/states';
import { Table } from '../components/ui/Table';
import { Tabs } from '../components/ui/Tabs';

type ReportId = 'risk-profile' | 'resolution' | 'exceptions';

function printOnly(id: string) {
  const el = document.querySelector(`[data-report="${id}"]`);
  if (!el) return;
  el.setAttribute('data-print-active', '');
  document.body.classList.add('print-single');
  const done = () => {
    el.removeAttribute('data-print-active');
    document.body.classList.remove('print-single');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function Report({ id, title, description, onCsv, children }: { id: string; title: string; description?: string; onCsv: () => void; children: ReactNode }) {
  return (
    <section data-report={id}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
        </div>
        <div className="no-print flex gap-2">
          <Button onClick={onCsv}><ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" /> Export CSV</Button>
          <Button onClick={() => printOnly(id)}><PrinterIcon className="h-4 w-4" aria-hidden="true" /> Print</Button>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Shows a skeleton or an error until the report's data is there, then renders it. */
function Loaded<T>({ state, children }: { state: ApiState<T>; children: (data: T) => ReactNode }) {
  if (state.error) return <ErrorState title="This report could not be loaded" body={state.error.message} onRetry={state.reload} />;
  if (!state.data) return <Skeleton className="h-48" />;
  return <>{children(state.data)}</>;
}

const BANDS = ['Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'] as const;

export function Reports() {
  const [tab, setTab] = useState<ReportId>('risk-profile');
  const profile = useApi((signal) => api.riskProfile(signal), []);
  const resolution = useApi(
    async (signal) => ({ bySev: await api.resolution('severity', signal), byDept: await api.resolution('department', signal) }),
    [],
  );
  const exceptions = useApi((signal) => api.incidents({ needs_attention: true, limit: 100, sort: 'occurred_at', order: 'desc' }, signal), []);

  const resCols = (label: string) => [
    { key: 'g', header: label, render: (r: ResolutionRow) => r.group },
    { key: 'n', header: 'Resolved', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{r.resolved}</span> },
    { key: 'mean', header: 'Mean time', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{formatHours(r.meanHours)}</span> },
    { key: 'med', header: 'Median time', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{formatHours(r.medianHours)}</span> },
  ];

  return (
    <Page title="Reports">
      <Tabs
        label="Reports"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'risk-profile', label: 'Risk profile' },
          { id: 'resolution', label: 'Resolution performance' },
          { id: 'exceptions', label: 'Exceptions', count: exceptions.data?.page.total },
        ]}
      />
      <div className="pt-10">
        {tab === 'risk-profile' && (
          <Loaded state={profile}>
            {(rows) => {
              const total = rows.reduce(
                (t, r) => ({ Critical: t.Critical + r.Critical, High: t.High + r.High, Medium: t.Medium + r.Medium, Low: t.Low + r.Low, Unrated: t.Unrated + r.Unrated, Total: t.Total + r.Total }),
                { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0, Total: 0 },
              );
              return (
                <Report
                  id="risk-profile"
                  title="Risk profile by department"
                  onCsv={() => downloadCsv('risk-profile-by-department.csv', ['Department', ...BANDS], rows.map((r) => [r.department, ...BANDS.map((b) => r[b])]))}
                >
                  <Card className="overflow-hidden">
                    <table className="tbl">
                      <caption className="sr-only">Open risks by department and risk band</caption>
                      <thead>
                        <tr><th>Department</th>{BANDS.map((h) => <th key={h} className="right">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.department_id}>
                            <td className="font-medium">{r.department}</td>
                            {BANDS.map((h) => <td key={h} className="right num">{r[h]}</td>)}
                          </tr>
                        ))}
                        <tr>
                          <td className="font-semibold">All departments</td>
                          {BANDS.map((h) => <td key={h} className="right num font-semibold">{total[h]}</td>)}
                        </tr>
                      </tbody>
                    </table>
                  </Card>
                </Report>
              );
            }}
          </Loaded>
        )}

        {tab === 'resolution' && (
          <Loaded state={resolution}>
            {({ bySev, byDept }) => (
              <Report
                id="resolution"
                title="Incident resolution performance"
                onCsv={() => downloadCsv('incident-resolution-performance.csv', ['Dimension', 'Group', 'Resolved', 'Mean hours', 'Median hours'], [
                  ...bySev.map((r) => ['Severity', r.group, r.resolved, r.meanHours?.toFixed(1) ?? '', r.medianHours?.toFixed(1) ?? '']),
                  ...byDept.map((r) => ['Department', r.group, r.resolved, r.meanHours?.toFixed(1) ?? '', r.medianHours?.toFixed(1) ?? '']),
                ])}
              >
                <div className="grid gap-8 lg:grid-cols-2">
                  <Card className="overflow-hidden"><Table rows={bySev} rowKey={(r) => r.group} columns={resCols('Severity')} caption="Resolution time by severity" /></Card>
                  <Card className="overflow-hidden"><Table rows={byDept} rowKey={(r) => r.group} columns={resCols('Department')} caption="Resolution time by department" /></Card>
                </div>
              </Report>
            )}
          </Loaded>
        )}

        {tab === 'exceptions' && (
          <Loaded state={exceptions}>
            {({ data: rows, page }) => (
              <Report
                id="exceptions"
                title="Unlinked and unassigned incidents"
                description={page.total > rows.length ? `Showing ${rows.length} of ${page.total}` : undefined}
                onCsv={() => downloadCsv('incident-exceptions.csv', ['Code', 'Title', 'Severity', 'Status', 'Department', 'Assignee', 'Linked risk', 'Occurred'],
                  rows.map((r) => [r.incident_code, r.title, r.severity, r.status, r.department_name, r.assigned_to_name ?? 'Unassigned', r.risk_code ?? 'None', r.occurred_at.slice(0, 10)]))}
              >
                <Card className="overflow-hidden">
                  <Table<IncidentListItem>
                    rows={rows}
                    rowKey={(r) => r.incident_id}
                    rowHref={(r) => `/incidents/${r.incident_code}`}
                    caption="Open incidents with a missing assignee or risk link"
                    empty={<EmptyState title="No exceptions" />}
                    columns={[
                      { key: 'c', header: 'Code', render: (r) => <IdLink to={`/incidents/${r.incident_code}`}>{r.incident_code}</IdLink> },
                      { key: 't', header: 'Incident', render: (r) => <span className="block max-w-[36ch] truncate font-medium" title={r.title}>{r.title}</span> },
                      { key: 's', header: 'Severity', render: (r) => <SeverityBadge severity={r.severity} /> },
                      { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                      { key: 'd', header: 'Department', hideBelow: 'md', render: (r) => r.department_name },
                      { key: 'a', header: 'Assignee', hideBelow: 'md', render: (r) => r.assigned_to_name ?? <strong className="font-semibold">Unassigned</strong> },
                      { key: 'r', header: 'Linked risk', render: (r) => r.risk_code ?? <strong className="font-semibold">None</strong> },
                      { key: 'o', header: 'Occurred', hideBelow: 'md', render: (r) => fmtDate(r.occurred_at) },
                    ]}
                  />
                </Card>
              </Report>
            )}
          </Loaded>
        )}
      </div>
    </Page>
  );
}
