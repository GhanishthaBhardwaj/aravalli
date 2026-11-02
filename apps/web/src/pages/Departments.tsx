import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { departmentStats } from '../data/selectors';
import { Card } from '../components/ui/layout';
import { Table, type Column } from '../components/ui/Table';

type Row = ReturnType<typeof departmentStats>[number];

const count = 'num underline decoration-line-strong underline-offset-4 hover:decoration-fg';

export function Departments() {
  const { ds } = useData();
  const rows = departmentStats(ds);
  const cols: Column<Row>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="num text-[13px]">{r.department.code}</span>, sort: (r) => r.department.code },
    { key: 'name', header: 'Department', render: (r) => <span className="font-medium">{r.department.name}</span>, sort: (r) => r.department.name },
    { key: 'people', header: 'People', align: 'right', render: (r) => <span className="num">{r.people}</span>, sort: (r) => r.people },
    { key: 'risks', header: 'Open risks', align: 'right', sort: (r) => r.openRisks, render: (r) => <Link to={`/risks?department=${r.department.department_id}`} className={count}>{r.openRisks}</Link> },
    { key: 'inc', header: 'Open incidents', align: 'right', sort: (r) => r.openIncidents, render: (r) => <Link to={`/incidents?department=${r.department.department_id}`} className={count}>{r.openIncidents}</Link> },
  ];
  return (
    <Page title="Departments" description="Open risks and incidents in each department.">
      <Card className="overflow-hidden">
        <Table rows={rows} rowKey={(r) => r.department.department_id} caption="Departments with open risk and incident counts" columns={cols} />
      </Card>
    </Page>
  );
}
