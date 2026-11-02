import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { fullName, incidentRows } from '../data/selectors';
import type { IncidentRow } from '../data/selectors';
import { INCIDENT_STATUSES, SEVERITIES } from '../domain/types';
import { Button } from '../components/ui/Button';
import { SeverityChip, StatusChip } from '../components/ui/Chip';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { ClearFilters, CodeLink, EmptyState } from '../components/ui/misc';
import { Table } from '../components/ui/Table';
import type { Column } from '../components/ui/Table';
import { SEVERITY_ORDER } from '../domain/scoring';
import { PersonName } from '../components/ui/Avatar';

// `department` comes from a link on the Departments page and is not shown as a control.
const KEYS = ['q', 'severity', 'status', 'department', 'assignee'];

export function IncidentRegister() {
  const { ds } = useData();
  const f = useFilters(KEYS);
  const all = useMemo(() => incidentRows(ds), [ds]);
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
    { key: 'code', header: 'Code', sort: (r) => r.incident.incident_code, render: (r) => <CodeLink to={`/incidents/${r.incident.incident_code}`}>{r.incident.incident_code}</CodeLink> },
    { key: 'title', header: 'Incident', sort: (r) => r.incident.title, render: (r) => <span className="block max-w-[40ch] truncate" title={r.incident.title}>{r.incident.title}</span> },
    { key: 'sev', header: 'Severity', sort: (r) => SEVERITY_ORDER[r.incident.severity], render: (r) => <SeverityChip severity={r.incident.severity} /> },
    { key: 'status', header: 'Status', sort: (r) => INCIDENT_STATUSES.indexOf(r.incident.status), render: (r) => <StatusChip status={r.incident.status} /> },
    { key: 'asg', header: 'Assignee', sort: (r) => r.assignee?.last_name ?? null, render: (r) => <PersonName person={r.assignee} /> },
    { key: 'risk', header: 'Risk', sort: (r) => r.risk?.risk_code ?? null, render: (r) => (r.risk ? <CodeLink to={`/risks/${r.risk.risk_code}`}>{r.risk.risk_code}</CodeLink> : <span className="text-muted">None</span>) },
    { key: 'age', header: 'Age', align: 'right', sort: (r) => r.ageDays, render: (r) => <span className="mono">{r.ageDays}d</span> },
  ];

  return (
    <Page
      title="Incident Register"
      description="Reported incidents and where each one stands."
      actions={<Link to="/incidents/new"><Button variant="primary"><Plus size={16} aria-hidden="true" /> Report incident</Button></Link>}
    >
      <div className="panel mb-4 flex flex-wrap items-end gap-3 p-3">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} />
        <FilterSelect label="Severity" value={f.get('severity')} onChange={(v) => f.set('severity', v)} options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Assignee" value={f.get('assignee')} onChange={(v) => f.set('assignee', v)}
          options={[{ value: 'none', label: 'Unassigned' }, ...assignees.map((e) => ({ value: String(e.employee_id), label: fullName(e) }))]} />
        {f.active && <ClearFilters onClick={f.clear} />}
      </div>
      <div className="panel overflow-hidden">
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
          empty={<EmptyState title="No incidents match these filters" action={<ClearFilters onClick={f.clear} />} />}
        />
      </div>
    </Page>
  );
}
