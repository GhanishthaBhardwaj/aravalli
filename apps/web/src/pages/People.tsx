import { Link } from 'react-router-dom';
import { ROLES, type EmployeeListItem } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useFilters } from '../app/useFilters';
import { useListParams } from '../app/useListParams';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { fullName } from '../lib/derive';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { FilterSearch, FilterSelect } from '../components/ui/FilterControls';
import { Card } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

const count = 'num underline decoration-line-strong underline-offset-4 hover:decoration-fg';
const KEYS = ['q', 'department', 'role'];
const PAGE_SIZE = 25;

export function People() {
  const f = useFilters(KEYS);
  const list = useListParams({ sort: 'name', dir: 'asc' }, PAGE_SIZE);
  const departments = useApi((signal) => api.departments(signal), []);
  const { data, loading, refreshing, error, reload } = useApi(
    (signal) =>
      api.employees(
        { q: f.get('q').trim() || undefined, department_id: f.get('department') || undefined, role: f.get('role') || undefined, sort: list.sort, order: list.dir, limit: list.limit, offset: list.offset },
        signal,
      ),
    [f.get('q'), f.get('department'), f.get('role'), list.sort, list.dir, list.page],
  );

  const cols: Column<EmployeeListItem>[] = [
    { key: 'code', header: 'Code', hideBelow: 'md', sortKey: 'code', render: (e) => <span className="code text-[13px]">{e.employee_code}</span> },
    { key: 'name', header: 'Name', sortKey: 'name', render: (e) => <span className="inline-flex items-center gap-2 font-medium"><Avatar person={e} size={26} />{fullName(e)}</span> },
    { key: 'title', header: 'Job title', hideBelow: 'md', render: (e) => e.job_title },
    { key: 'role', header: 'Role', hideBelow: 'sm', sortKey: 'role', render: (e) => e.role },
    { key: 'dept', header: 'Department', hideBelow: 'md', sortKey: 'department', render: (e) => e.department_name },
    { key: 'active', header: 'Active', hideBelow: 'md', render: (e) => (e.is_active ? 'Yes' : 'No') },
    { key: 'risks', header: 'Risks', align: 'right', render: (e) => (e.open_risks ? <Link to={`/risks?owner=${e.employee_id}`} className={count}>{e.open_risks}</Link> : <span className="num text-subtle">0</span>) },
    { key: 'inc', header: 'Incidents', align: 'right', render: (e) => (e.open_incidents ? <Link to={`/incidents?assignee=${e.employee_id}`} className={count}>{e.open_incidents}</Link> : <span className="num text-subtle">0</span>) },
  ];

  return (
    <Page title="People">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <FilterSearch label="Search" value={f.get('q')} onChange={(v) => f.set('q', v)} placeholder="Name, email or code" />
        <FilterSelect label="Department" value={f.get('department')} onChange={(v) => f.set('department', v)} options={(departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }))} />
        <FilterSelect label="Role" value={f.get('role')} onChange={(v) => f.set('role', v)} options={ROLES.map((r) => ({ value: r, label: r }))} />
        {f.active && <Button variant="ghost" onClick={f.clear}>Clear filters</Button>}
      </div>
      <Card className="overflow-hidden">
        <Table
          rows={data?.data ?? []}
          rowKey={(e) => e.employee_id}
          caption="Employees"
          columns={cols}
          noun="people"
          loading={loading || (refreshing && !data)}
          error={error?.message}
          onRetry={reload}
          server={{ total: data?.page.total ?? 0, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir, onSort: list.setSort, onPage: list.setPage }}
          empty={<EmptyState title="No people match" />}
        />
      </Card>
    </Page>
  );
}
