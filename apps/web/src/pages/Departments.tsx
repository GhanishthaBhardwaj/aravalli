import { Link } from 'react-router-dom';
import type { DepartmentWithStats } from '@aravalli/shared';
import { Page } from '../app/Page';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { Card } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

const count = 'num underline decoration-line-strong underline-offset-4 hover:decoration-fg';

export function Departments() {
  const { data, loading, error, reload } = useApi((signal) => api.departments(signal), []);
  const cols: Column<DepartmentWithStats>[] = [
    { key: 'code', header: 'Code', hideBelow: 'sm', render: (r) => <span className="num text-[13px]">{r.code}</span>, sort: (r) => r.code },
    { key: 'name', header: 'Department', render: (r) => <span className="font-medium">{r.name}</span>, sort: (r) => r.name },
    { key: 'people', header: 'People', align: 'right', hideBelow: 'sm', render: (r) => <span className="num">{r.people}</span>, sort: (r) => r.people },
    { key: 'risks', header: 'Risks', align: 'right', sort: (r) => r.open_risks, render: (r) => (r.open_risks ? <Link to={`/risks?department=${r.department_id}`} className={count}>{r.open_risks}</Link> : <span className="num text-subtle">0</span>) },
    { key: 'inc', header: 'Incidents', align: 'right', sort: (r) => r.open_incidents, render: (r) => (r.open_incidents ? <Link to={`/incidents?department=${r.department_id}`} className={count}>{r.open_incidents}</Link> : <span className="num text-subtle">0</span>) },
  ];
  return (
    <Page title="Departments" description="The open risks and open incidents in each department.">
      <Card className="overflow-hidden">
        <Table
          rows={data ?? []}
          loading={loading}
          error={error?.message}
          onRetry={reload}
          rowKey={(r) => r.department_id}
          caption="Departments with open risk and incident counts"
          columns={cols}
          empty={<EmptyState title="No departments yet" body="Departments appear here once they have been set up for this organisation. Risks and incidents are filed under a department." />}
        />
      </Card>
    </Page>
  );
}
