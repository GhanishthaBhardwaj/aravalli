import { Download, Printer } from 'lucide-react';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import {
  formatHours, fullName, incidentExceptions, resolutionByDepartment, resolutionBySeverity, riskProfileByDepartment,
} from '../data/selectors';
import type { ResolutionRow } from '../data/selectors';
import { Button } from '../components/ui/Button';
import { SeverityChip, StatusChip } from '../components/ui/Chip';
import { CodeLink, EmptyState } from '../components/ui/misc';
import { Table } from '../components/ui/Table';
import { downloadCsv, fmtDate } from '../app/format';

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

function ReportCard({ id, title, description, onCsv, children }: {
  id: string; title: string; description: string; onCsv: () => void; children: React.ReactNode;
}) {
  return (
    <section data-report={id} className="panel mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-[13px] text-muted">{description}</p>
        </div>
        <div className="no-print flex gap-2">
          <Button onClick={onCsv}><Download size={15} aria-hidden="true" /> Export CSV</Button>
          <Button onClick={() => printOnly(id)}><Printer size={15} aria-hidden="true" /> Print</Button>
        </div>
      </div>
      {children}
    </section>
  );
}

export function Reports() {
  const { ds, clock } = useData();
  const profile = riskProfileByDepartment(ds);
  const bySev = resolutionBySeverity(ds);
  const byDept = resolutionByDepartment(ds);
  const exceptions = incidentExceptions(ds, clock);

  const resCols = (label: string) => [
    { key: 'g', header: label, render: (r: ResolutionRow) => r.group },
    { key: 'n', header: 'Resolved', align: 'right' as const, render: (r: ResolutionRow) => <span className="mono">{r.resolved}</span> },
    { key: 'mean', header: 'Mean time', align: 'right' as const, render: (r: ResolutionRow) => <span className="mono">{formatHours(r.meanHours)}</span> },
    { key: 'med', header: 'Median time', align: 'right' as const, render: (r: ResolutionRow) => <span className="mono">{formatHours(r.medianHours)}</span> },
  ];

  const total = profile.reduce(
    (t, r) => ({ Critical: t.Critical + r.Critical, High: t.High + r.High, Medium: t.Medium + r.Medium, Low: t.Low + r.Low, Unrated: t.Unrated + r.Unrated, Total: t.Total + r.Total }),
    { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0, Total: 0 },
  );

  return (
    <Page title="Reports" description="Export management reports as CSV, or print them.">
      <ReportCard
        id="risk-profile"
        title="1. Risk profile by department"
        description="Open risks by department and severity."
        onCsv={() => downloadCsv('risk-profile-by-department.csv', ['Department', 'Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'],
          profile.map((r) => [r.department, r.Critical, r.High, r.Medium, r.Low, r.Unrated, r.Total]))}
      >
        <table className="tbl">
          <caption className="sr-only">Open risks by department and severity band</caption>
          <thead>
            <tr><th>Department</th>{['Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'].map((h) => <th key={h} className="num">{h}</th>)}</tr>
          </thead>
          <tbody>
            {profile.map((r) => (
              <tr key={r.department}>
                <td>{r.department}</td>
                {(['Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'] as const).map((h) => <td key={h} className="num mono">{r[h]}</td>)}
              </tr>
            ))}
            <tr>
              <td className="font-semibold">All departments</td>
              {(['Critical', 'High', 'Medium', 'Low', 'Unrated', 'Total'] as const).map((h) => <td key={h} className="num mono font-semibold">{total[h]}</td>)}
            </tr>
          </tbody>
        </table>
      </ReportCard>

      <ReportCard
        id="resolution"
        title="2. Incident resolution performance"
        description="Time from report to resolution."
        onCsv={() => downloadCsv('incident-resolution-performance.csv', ['Dimension', 'Group', 'Resolved', 'Mean hours', 'Median hours'], [
          ...bySev.map((r) => ['Severity', r.group, r.resolved, r.meanHours?.toFixed(1) ?? '', r.medianHours?.toFixed(1) ?? '']),
          ...byDept.map((r) => ['Department', r.group, r.resolved, r.meanHours?.toFixed(1) ?? '', r.medianHours?.toFixed(1) ?? '']),
        ])}
      >
        <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-line">
          <Table rows={bySev} rowKey={(r) => r.group} columns={resCols('Severity')} caption="Resolution time by severity" />
          <Table rows={byDept} rowKey={(r) => r.group} columns={resCols('Department')} caption="Resolution time by department" />
        </div>
      </ReportCard>

      <ReportCard
        id="exceptions"
        title="3. Unlinked and unassigned incidents"
        description="Incidents with no assignee or no linked risk."
        onCsv={() => downloadCsv('incident-exceptions.csv', ['Code', 'Title', 'Severity', 'Status', 'Department', 'Assignee', 'Linked risk', 'Occurred'],
          exceptions.map((r) => [r.incident.incident_code, r.incident.title, r.incident.severity, r.incident.status, r.department.name,
            r.assignee ? fullName(r.assignee) : 'Unassigned', r.risk?.risk_code ?? 'None', r.incident.occurred_at.slice(0, 10)]))}
      >
        <Table
          rows={exceptions}
          rowKey={(r) => r.incident.incident_id}
          rowHref={(r) => `/incidents/${r.incident.incident_code}`}
          caption="Incidents with a missing assignee or risk link"
          empty={<EmptyState title="No exceptions" body="Every incident has an assignee and a linked risk." />}
          columns={[
            { key: 'c', header: 'Code', render: (r) => <CodeLink to={`/incidents/${r.incident.incident_code}`}>{r.incident.incident_code}</CodeLink> },
            { key: 't', header: 'Title', render: (r) => <span className="block max-w-[36ch] truncate" title={r.incident.title}>{r.incident.title}</span> },
            { key: 's', header: 'Severity', render: (r) => <SeverityChip severity={r.incident.severity} /> },
            { key: 'st', header: 'Status', render: (r) => <StatusChip status={r.incident.status} /> },
            { key: 'd', header: 'Department', render: (r) => r.department.name },
            { key: 'a', header: 'Assignee', render: (r) => r.assignee ? fullName(r.assignee) : <strong>Unassigned</strong> },
            { key: 'r', header: 'Linked risk', render: (r) => r.risk?.risk_code ?? <strong>None</strong> },
            { key: 'o', header: 'Occurred', render: (r) => <span className="mono text-[12px]">{fmtDate(r.incident.occurred_at)}</span> },
          ]}
        />
      </ReportCard>
    </Page>
  );
}
