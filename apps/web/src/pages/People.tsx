import { Link } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData } from '../app/providers';
import { fullName, isOpenIncident, isOpenRisk } from '../data/selectors';
import type { Employee } from '@aravalli/shared';
import { Panel } from '../components/ui/misc';
import { Avatar } from '../components/ui/Avatar';
import { Table } from '../components/ui/Table';

export function People() {
  const { ds } = useData();
  const dept = (id: number) => ds.departments.find((d) => d.department_id === id)?.name ?? '';
  const owned = (e: Employee) => ds.risks.filter((r) => r.owner_employee_id === e.employee_id && isOpenRisk(r)).length;
  const assigned = (e: Employee) => ds.incidents.filter((i) => i.assigned_to === e.employee_id && isOpenIncident(i)).length;
  return (
    <Page title="People" description="Everyone in the organization, and what they own.">
      <Panel flush>
        <Table
          rows={ds.employees}
          rowKey={(e) => e.employee_id}
          caption="Employees"
          columns={[
            { key: 'code', header: 'Code', render: (e) => <span className="mono text-[12px]">{e.employee_code}</span>, sort: (e) => e.employee_code },
            { key: 'name', header: 'Name', render: (e) => <span className="inline-flex items-center gap-2 font-semibold"><Avatar person={e} size={26} />{fullName(e)}</span>, sort: (e) => e.last_name },
            { key: 'title', header: 'Job title', render: (e) => e.job_title, sort: (e) => e.job_title },
            { key: 'role', header: 'Role', render: (e) => e.role, sort: (e) => e.role },
            { key: 'dept', header: 'Department', render: (e) => dept(e.department_id), sort: (e) => dept(e.department_id) },
            { key: 'active', header: 'Active', render: (e) => (e.is_active ? 'Yes' : 'No') },
            {
              key: 'risks', header: 'Owned risks', align: 'right', sort: owned,
              render: (e) => (owned(e) ? <Link to={`/risks?owner=${e.employee_id}`} className="mono underline">{owned(e)}</Link> : <span className="mono text-muted">0</span>),
            },
            {
              key: 'inc', header: 'Assigned incidents', align: 'right', sort: assigned,
              render: (e) => (assigned(e) ? <Link to={`/incidents?assignee=${e.employee_id}`} className="mono underline">{assigned(e)}</Link> : <span className="mono text-muted">0</span>),
            },
          ]}
        />
      </Panel>
    </Page>
  );
}
