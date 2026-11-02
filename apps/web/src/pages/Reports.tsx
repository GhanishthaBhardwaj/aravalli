import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownTrayIcon, PrinterIcon } from '@heroicons/react/20/solid';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { downloadCsv, fmtDate } from '../app/format';
import {
  formatHours, fullName, incidentExceptions, resolutionByDepartment, resolutionBySeverity, riskProfileByDepartment, type ResolutionRow,
} from '../data/selectors';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
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

function Report({ id, title, description, onCsv, children }: { id: string; title: string; description: string; onCsv: () => void; children: ReactNode }) {
  return (
    <section data-report={id}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold">{title}</h2>
          <p className="mt-1 text-[15px] text-muted">{description}</p>
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

export function Reports() {
  const { ds, clock } = useData();
  const [tab, setTab] = useState<ReportId>('risk-profile');
  const profile = riskProfileByDepartment(ds);
  const bySev = resolutionBySeverity(ds);
  const byDept = resolutionByDepartment(ds);
  const exceptions = incidentExceptions(ds, clock);

  const resCols = (label: string) => [
    { key: 'g', header: label, render: (r: ResolutionRow) => r.group },
    { key: 'n', header: 'Resolved', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{r.resolved}</span> },
    { key: 'mean', header: 'Mean time', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{formatHours(r.meanHours)}</span> },
    { key: 'med', header: 'Median time', align: 'right' as const, render: (r: ResolutionRow) => <span className="num">{formatHours(r.medianHours)}</span> },
  ];

  const bands = ['Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'] as const;
  const total = profile.reduce(
    (t, r) => ({ Critical: t.Critical + r.Critical, High: t.High + r.High, Medium: t.Medium + r.Medium, Low: t.Low + r.Low, Unrated: t.Unrated + r.Unrated, Total: t.Total + r.Total }),
    { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0, Total: 0 },
  );

  return (
    <Page title="Reports" description="Export management reports as CSV, or print them.">
      <Tabs
        label="Reports"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'risk-profile', label: 'Risk profile' },
          { id: 'resolution', label: 'Resolution performance' },
          { id: 'exceptions', label: 'Exceptions', count: exceptions.length },
        ]}
      />
      <div className="pt-10">
        {tab === 'risk-profile' && (
          <Report
            id="risk-profile"
            title="Risk profile by department"
            description="Open risks by department and risk band."
            onCsv={() => downloadCsv('risk-profile-by-department.csv', ['Department', ...bands], profile.map((r) => [r.department, ...bands.map((b) => r[b])]))}
          >
            <Card className="overflow-hidden">
              <table className="tbl">
                <caption className="sr-only">Open risks by department and risk band</caption>
                <thead>
                  <tr><th>Department</th>{bands.map((h) => <th key={h} className="right">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {profile.map((r) => (
                    <tr key={r.department}>
                      <td className="font-medium">{r.department}</td>
                      {bands.map((h) => <td key={h} className="right num">{r[h]}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="font-semibold">All departments</td>
                    {bands.map((h) => <td key={h} className="right num font-semibold">{total[h]}</td>)}
                  </tr>
                </tbody>
              </table>
            </Card>
          </Report>
        )}

        {tab === 'resolution' && (
          <Report
            id="resolution"
            title="Incident resolution performance"
            description="Time from report to resolution, for incidents that have been resolved."
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

        {tab === 'exceptions' && (
          <Report
            id="exceptions"
            title="Unlinked and unassigned incidents"
            description="Open incidents with no assignee or no linked risk. Closed incidents are final and are not listed."
            onCsv={() => downloadCsv('incident-exceptions.csv', ['Code', 'Title', 'Severity', 'Status', 'Department', 'Assignee', 'Linked risk', 'Occurred'],
              exceptions.map((r) => [r.incident.incident_code, r.incident.title, r.incident.severity, r.incident.status, r.department.name,
                r.assignee ? fullName(r.assignee) : 'Unassigned', r.risk?.risk_code ?? 'None', r.incident.occurred_at.slice(0, 10)]))}
          >
            <Card className="overflow-hidden">
              <Table
                rows={exceptions}
                rowKey={(r) => r.incident.incident_id}
                rowHref={(r) => `/incidents/${r.incident.incident_code}`}
                caption="Open incidents with a missing assignee or risk link"
                empty={<EmptyState title="No exceptions" body="Every open incident has an assignee and a linked risk." />}
                columns={[
                  { key: 'c', header: 'Code', render: (r) => <IdLink to={`/incidents/${r.incident.incident_code}`}>{r.incident.incident_code}</IdLink> },
                  { key: 't', header: 'Incident', render: (r) => <span className="block max-w-[36ch] truncate font-medium" title={r.incident.title}>{r.incident.title}</span> },
                  { key: 's', header: 'Severity', render: (r) => <SeverityBadge severity={r.incident.severity} /> },
                  { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.incident.status} /> },
                  { key: 'd', header: 'Department', hideBelow: 'md', render: (r) => r.department.name },
                  { key: 'a', header: 'Assignee', hideBelow: 'md', render: (r) => (r.assignee ? fullName(r.assignee) : <strong className="font-semibold">Unassigned</strong>) },
                  { key: 'r', header: 'Linked risk', render: (r) => r.risk?.risk_code ?? <strong className="font-semibold">None</strong> },
                  { key: 'o', header: 'Occurred', hideBelow: 'md', render: (r) => fmtDate(r.incident.occurred_at) },
                ]}
              />
            </Card>
          </Report>
        )}
      </div>
    </Page>
  );
}
