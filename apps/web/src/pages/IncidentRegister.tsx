import { PlusIcon } from '@heroicons/react/20/solid';
import { INCIDENT_STATUSES, SEVERITIES, type IncidentListItem } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession } from '../app/providers';
import { useFilters } from '../app/useFilters';
import { useListParams } from '../app/useListParams';
import { fmtDate } from '../app/format';
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
import { Tabs } from '../components/ui/Tabs';

// `view` is the saved-view tab; `department` can also arrive from a link on the Departments page.
const KEYS = ['q', 'severity', 'status', 'department', 'assignee'];
const PAGE_SIZE = 20;

type View = 'all' | 'open' | 'mine' | 'critical';
const VIEW_NOUN: Record<View, string> = { all: 'incidents', open: 'open incidents', mine: 'incidents assigned to you', critical: 'Critical incidents' };

export function IncidentRegister() {
  const { clock, actor } = useSession();
  const f = useFilters(KEYS);
  const list = useListParams({ sort: 'reported_at', dir: 'desc' }, PAGE_SIZE);
  const assignee = f.get('assignee');
  const view = (['open', 'mine', 'critical'].includes(f.get('view')) ? f.get('view') : 'all') as View;
  const departments = useApi((signal) => api.departments(signal), []);

  // The number on each saved-view tab: the size of that view with no other filters.
  const counts = useApi(async (signal) => {
    const [all, open, mine, critical] = await Promise.all([
      api.incidents({ limit: 1 }, signal),
      api.incidents({ open: true, limit: 1 }, signal),
      api.incidents({ assignee_id: actor.employee_id, limit: 1 }, signal),
      api.incidents({ severities: 'Critical', limit: 1 }, signal),
    ]);
    return { all: all.page.total, open: open.page.total, mine: mine.page.total, critical: critical.page.total };
  }, [actor.employee_id]);

  const { data, loading, refreshing, error, reload } = useApi(
    (signal) =>
      api.incidents(
        {
          q: f.get('q').trim() || undefined,
          severities: view === 'critical' ? 'Critical' : f.get('severity') || undefined,
          statuses: f.get('status') || undefined,
          open: view === 'open' ? true : undefined,
          department_id: f.get('department') || undefined,
          unassigned: assignee === 'none' ? true : undefined,
          assignee_id: view === 'mine' ? actor.employee_id : assignee && assignee !== 'none' ? assignee : undefined,
          sort: list.sort, order: list.dir, limit: list.limit, offset: list.offset,
        },
        signal,
      ),
    [f.get('q'), f.get('severity'), f.get('status'), f.get('department'), assignee, view, list.sort, list.dir, list.page],
  );

  const now = clock.now();
  const cols: Column<IncidentListItem>[] = [
    { key: 'code', header: 'Code', sortKey: 'code', render: (r) => <IdLink to={`/incidents/${r.incident_code}`}>{r.incident_code}</IdLink> },
    { key: 'title', header: 'Title', sortKey: 'title', render: (r) => <span className="block max-w-[20ch] font-medium md:max-w-[26ch] md:truncate" title={r.title}>{r.title}</span> },
    { key: 'dept', header: 'Department', hideBelow: 'md', render: (r) => <span className="text-muted">{r.department_name}</span> },
    { key: 'sev', header: 'Severity', sortKey: 'severity', render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: 'status', header: 'Status', hideBelow: 'md', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'asg', header: 'Assignee', hideBelow: 'md', sortKey: 'assigned_to', render: (r) => (r.assigned_to_name ? <NameChip name={r.assigned_to_name} /> : <span className="font-medium text-[color:var(--sev-high-text)]">Unassigned</span>) },
    { key: 'rep', header: 'Reported', hideBelow: 'md', sortKey: 'reported_at', render: (r) => <span className="num text-[12.5px] text-muted">{fmtDate(r.reported_at)}</span> },
    { key: 'age', header: 'Age', align: 'right', hideBelow: 'md', render: (r) => <span className="num text-muted">{incidentAgeDays(r, now)} d</span> },
  ];

  const c = counts.data;
  const total = c?.all.toLocaleString('en-US');
  return (
    <Page
      title="Incident Register"
      description={c && <><span className="num">{c.open.toLocaleString('en-US')}</span> open · <span className="num">{total}</span> in total</>}
      actions={<Button variant="primary" to="/incidents/new"><PlusIcon className="h-4 w-4" aria-hidden="true" /> Report incident</Button>}
    >
      <div className="mb-5">
        <Tabs
          label="Saved views"
          value={view}
          onChange={(v) => f.set('view', v === 'all' ? '' : v)}
          tabs={[
            { id: 'all', label: 'All', count: c?.all },
            { id: 'open', label: 'Open', count: c?.open },
            { id: 'mine', label: 'Assigned to me', count: c?.mine },
            { id: 'critical', label: 'Critical', count: c?.critical },
          ]}
        />
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} placeholder="Code, title or source ID" />
        <FilterSelect label="Status" value={f.get('status')} onChange={(v) => f.set('status', v)} options={INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Severity" value={view === 'critical' ? 'Critical' : f.get('severity')} onChange={(v) => f.set('severity', v)} options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />
        <FilterSelect label="Department" value={f.get('department')} onChange={(v) => f.set('department', v)} options={(departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }))} />
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
          noun={VIEW_NOUN[view]}
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
