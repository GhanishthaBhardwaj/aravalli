import { PlusIcon } from '@heroicons/react/20/solid';
import { INCIDENT_STATUSES, SEVERITIES, type IncidentListItem } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { useListParams } from '../app/useListParams';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { incidentAgeDays } from '../lib/derive';
import { NameChip } from '../components/ui/Avatar';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { Card, IdLink } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

// `department` arrives from a link on the Departments page and is not shown as a control.
const KEYS = ['q', 'severity', 'status', 'department', 'assignee'];
const PAGE_SIZE = 20;

export function IncidentRegister() {
  const { clock, actor } = useSession();
  const f = useFilters(KEYS);
  const list = useListParams({ sort: 'reported_at', dir: 'desc' }, PAGE_SIZE);
  const assignee = f.get('assignee');

  const { data, loading, refreshing, error, reload } = useApi(
    (signal) =>
      api.incidents(
        {
          q: f.get('q').trim() || undefined,
          severities: f.get('severity') || undefined,
          statuses: f.get('status') || undefined,
          department_id: f.get('department') || undefined,
          unassigned: assignee === 'none' ? true : undefined,
          assignee_id: assignee && assignee !== 'none' ? assignee : undefined,
          sort: list.sort, order: list.dir, limit: list.limit, offset: list.offset,
        },
        signal,
      ),
    [f.get('q'), f.get('severity'), f.get('status'), f.get('department'), assignee, list.sort, list.dir, list.page],
  );

  const now = clock.now();
  const cols: Column<IncidentListItem>[] = [
    { key: 'code', header: 'Code', sortKey: 'code', render: (r) => <IdLink to={`/incidents/${r.incident_code}`}>{r.incident_code}</IdLink> },
    { key: 'title', header: 'Incident', sortKey: 'title', render: (r) => <span className="block max-w-[20ch] font-medium md:max-w-[40ch] md:truncate" title={r.title}>{r.title}</span> },
    { key: 'sev', header: 'Severity', sortKey: 'severity', render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: 'status', header: 'Status', hideBelow: 'md', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'asg', header: 'Assignee', hideBelow: 'md', sortKey: 'assigned_to', render: (r) => <NameChip name={r.assigned_to_name} /> },
    { key: 'risk', header: 'Risk', hideBelow: 'md', render: (r) => (r.risk_code ? <IdLink to={`/risks/${r.risk_code}`}>{r.risk_code}</IdLink> : <span className="text-subtle">None</span>) },
    { key: 'age', header: 'Age', align: 'right', hideBelow: 'md', render: (r) => <span className="num">{incidentAgeDays(r, now)}d</span> },
  ];

  return (
    <Page
      title="Incident Register"
      description="Reported incidents and where each one stands."
      actions={<Button variant="primary" to="/incidents/new"><PlusIcon className="h-4 w-4" aria-hidden="true" /> Report incident</Button>}
    >
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} placeholder="Code, title or source ID" />
        <FilterSelect label="Severity" value={f.get('severity')} onChange={(v) => f.set('severity', v)} options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Assignee" value={assignee} onChange={(v) => f.set('assignee', v)}
          options={[{ value: 'none', label: 'Unassigned' }, { value: String(actor.employee_id), label: 'Assigned to me' }]} />
        {f.active && <Button variant="ghost" onClick={f.clear}>Clear filters</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table
          rows={data?.data ?? []}
          columns={cols}
          rowKey={(r) => r.incident_id}
          rowHref={(r) => `/incidents/${r.incident_code}`}
          caption="Incident register"
          noun="incidents"
          loading={loading || (refreshing && !data)}
          error={error?.message}
          onRetry={reload}
          server={{ total: data?.page.total ?? 0, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir, onSort: list.setSort, onPage: list.setPage }}
          empty={<EmptyState title="No incidents match these filters" body="Remove a filter or widen the search." action={<Button onClick={f.clear}>Clear filters</Button>} />}
        />
      </Card>
    </Page>
  );
}
