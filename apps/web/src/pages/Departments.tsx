import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { departmentStats } from '../data/selectors';
import { Card } from '../components/ui/layout';
import { EmptyState } from '../components/ui/states';
import { Table, type Column } from '../components/ui/Table';

type Row = ReturnType<typeof departmentStats>[number];

const count = 'num underline decoration-line-strong underline-offset-4 hover:decoration-fg';

export function Departments() {
  const { ds } = useData();
  const rows = departmentStats(ds);
  const cols: Column<Row>[] = [
    { key: 'code', header: 'Code', hideBelow: 'sm', render: (r) => <span className="num text-[13px]">{r.department.code}</span>, sort: (r) => r.department.code },
    { key: 'name', header: 'Department', render: (r) => <span className="font-medium">{r.department.name}</span>, sort: (r) => r.department.name },
    { key: 'people', header: 'People', align: 'right', hideBelow: 'sm', render: (r) => <span className="num">{r.people}</span>, sort: (r) => r.people },
    { key: 'risks', header: 'Risks', align: 'right', sort: (r) => r.openRisks, render: (r) => (r.openRisks ? <Link to={`/risks?department=${r.department.department_id}`} className={count}>{r.openRisks}</Link> : <span className="num text-subtle">0</span>) },
    { key: 'inc', header: 'Incidents', align: 'right', sort: (r) => r.openIncidents, render: (r) => (r.openIncidents ? <Link to={`/incidents?department=${r.department.department_id}`} className={count}>{r.openIncidents}</Link> : <span className="num text-subtle">0</span>) },
  ];
  return (
    <Page title="Departments" description="The open risks and open incidents in each department.">
      <Card className="overflow-hidden">
        <Table
          rows={rows}
          rowKey={(r) => r.department.department_id}
          caption="Departments with open risk and incident counts"
          columns={cols}
          empty={<EmptyState title="No departments yet" body="Departments appear here once they have been set up for this organisation. Risks and incidents are filed under a department." />}
        />
      </Card>
    </Page>
  );
}
