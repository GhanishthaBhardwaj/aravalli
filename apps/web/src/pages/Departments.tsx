import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { departmentStats } from '../data/selectors';
import { Panel } from '../components/ui/misc';
import { DeptTag } from '../components/ui/Avatar';
import { Table } from '../components/ui/Table';

type Row = ReturnType<typeof departmentStats>[number];

export function Departments() {
  const { ds } = useData();
  const rows = departmentStats(ds);
  return (
    <Page title="Departments" description="Open risks and incidents in each department.">
      <Panel flush>
        <Table
          rows={rows}
          rowKey={(r: Row) => r.department.department_id}
          caption="Departments with open risk and incident counts"
          columns={[
            { key: 'code', header: 'Code', render: (r: Row) => <span className="mono text-[12px]">{r.department.code}</span>, sort: (r: Row) => r.department.code },
            { key: 'name', header: 'Department', render: (r: Row) => <span className="font-semibold"><DeptTag department={r.department} /></span>, sort: (r: Row) => r.department.name },
            { key: 'people', header: 'People', align: 'right', render: (r: Row) => <span className="mono">{r.people}</span>, sort: (r: Row) => r.people },
            {
              key: 'risks', header: 'Open risks', align: 'right', sort: (r: Row) => r.openRisks,
              render: (r: Row) => <Link to={`/risks?department=${r.department.department_id}`} className="mono underline">{r.openRisks}</Link>,
            },
            {
              key: 'inc', header: 'Open incidents', align: 'right', sort: (r: Row) => r.openIncidents,
              render: (r: Row) => <Link to={`/incidents?department=${r.department.department_id}`} className="mono underline">{r.openIncidents}</Link>,
            },
          ]}
        />
      </Panel>
    </Page>
  );
}
