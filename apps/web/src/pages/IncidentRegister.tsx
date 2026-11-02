import { useMemo } from 'react';
import { PlusIcon } from '@heroicons/react/20/solid';
import { INCIDENT_STATUSES, SEVERITIES, SEVERITY_ORDER } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { fullName, incidentRows, type IncidentRow } from '../data/selectors';
import { PersonName } from '../components/ui/Avatar';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

// `department` arrives from a link on the Departments page and is not shown as a control.
const KEYS = ['q', 'severity', 'status', 'department', 'assignee'];

export function IncidentRegister() {
  const { ds, clock } = useData();
  const f = useFilters(KEYS);
  const all = useMemo(() => incidentRows(ds, clock), [ds, clock]);
  const q = f.get('q').trim().toLowerCase();

  const rows = all.filter((r) => {
    const i = r.incident;
    return (
      (!q || i.incident_code.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)) &&
      (!f.get('severity') || i.severity === f.get('severity')) &&
      (!f.get('status') || i.status === f.get('status')) &&
      (!f.get('department') || String(i.department_id) === f.get('department')) &&
      (!f.get('assignee') || (f.get('assignee') === 'none' ? i.assigned_to === null : String(i.assigned_to) === f.get('assignee')))
    );
  });

  const assignees = [...new Set(all.map((r) => r.incident.assigned_to).filter((x): x is number => x !== null))]
    .map((id) => ds.employees.find((e) => e.employee_id === id)!)
    .sort((a, b) => a.last_name.localeCompare(b.last_name));

  const cols: Column<IncidentRow>[] = [
    { key: 'code', header: 'Code', sort: (r) => r.incident.incident_code, render: (r) => <IdLink to={`/incidents/${r.incident.incident_code}`}>{r.incident.incident_code}</IdLink> },
    { key: 'title', header: 'Incident', sort: (r) => r.incident.title, render: (r) => <span className="block max-w-[20ch] font-medium md:max-w-[40ch] md:truncate" title={r.incident.title}>{r.incident.title}</span> },
    { key: 'sev', header: 'Severity', sort: (r) => SEVERITY_ORDER[r.incident.severity], render: (r) => <SeverityBadge severity={r.incident.severity} /> },
    { key: 'status', header: 'Status', hideBelow: 'md', sort: (r) => INCIDENT_STATUSES.indexOf(r.incident.status), render: (r) => <StatusBadge status={r.incident.status} /> },
    { key: 'asg', header: 'Assignee', hideBelow: 'md', sort: (r) => r.assignee?.last_name ?? null, render: (r) => <PersonName person={r.assignee} /> },
    { key: 'risk', header: 'Risk', hideBelow: 'md', sort: (r) => r.risk?.risk_code ?? null, render: (r) => (r.risk ? <IdLink to={`/risks/${r.risk.risk_code}`}>{r.risk.risk_code}</IdLink> : <span className="text-subtle">None</span>) },
    { key: 'age', header: 'Age', align: 'right', hideBelow: 'md', sort: (r) => r.ageDays, render: (r) => <span className="num">{r.ageDays}d</span> },
  ];

  return (
    <Page
      title="Incident Register"
      description="Reported incidents and where each one stands."
      actions={<Button variant="primary" to="/incidents/new"><PlusIcon className="h-4 w-4" aria-hidden="true" /> Report incident</Button>}
    >
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} />
        <FilterSelect label="Severity" value={f.get('severity')} onChange={(v) => f.set('severity', v)} options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Assignee" value={f.get('assignee')} onChange={(v) => f.set('assignee', v)}
          options={[{ value: 'none', label: 'Unassigned' }, ...assignees.map((e) => ({ value: String(e.employee_id), label: fullName(e) }))]} />
        {f.active && <Button variant="ghost" onClick={f.clear}>Clear filters</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table
          rows={rows}
          columns={cols}
          rowKey={(r) => r.incident.incident_id}
          rowHref={(r) => `/incidents/${r.incident.incident_code}`}
          caption="Incident register"
          urlState
          pageSize={20}
          noun="incidents"
          defaultSort={{ key: 'code', dir: 'desc' }}
          empty={<EmptyState title="No incidents match these filters" body="Remove a filter or widen the search." action={<Button onClick={f.clear}>Clear filters</Button>} />}
        />
      </Card>
    </Page>
  );
}
