// Organisations, departments and employees: the reference data the other screens hang off.
import type { DepartmentWithStats, EmployeeListItem, Employee, OrganisationSummary } from '@aravalli/shared';
import type { Executor } from '../core/db';
import { iso, one, rows } from '../core/db';

const OPEN_INCIDENT = "('Open', 'Investigating', 'Contained')";

// ---------------------------------------------------------------- organisations
interface OrgRow { organisation_id: number; name: string; slug: string; is_demo: number; created_at: string }
const toOrg = (r: OrgRow) => ({ organisation_id: r.organisation_id, name: r.name, slug: r.slug, is_demo: Boolean(r.is_demo), created_at: iso(r.created_at) });

/** DEV ONLY: lists every organisation so the web app can offer a switcher. Phase 3 restricts this to the signed-in organisation. */
export async function listOrganisations(db: Executor): Promise<OrganisationSummary[]> {
  return (await rows<OrgRow>(db, 'SELECT organisation_id, name, slug, is_demo, created_at FROM organisation ORDER BY organisation_id')).map(toOrg);
}

export async function getOrganisation(db: Executor, organisationId: number) {
  const r = await one<OrgRow>(db, 'SELECT organisation_id, name, slug, is_demo, created_at FROM organisation WHERE organisation_id = ?', [organisationId]);
  return r ? toOrg(r) : undefined;
}

// ----------------------------------------------------------------- departments
export async function listDepartments(db: Executor, organisationId: number): Promise<DepartmentWithStats[]> {
  const result = await rows<DepartmentWithStats & { created_at: string }>(
    db,
    `SELECT d.department_id, d.organisation_id, d.code, d.name, d.created_at,
            (SELECT COUNT(*) FROM risk r WHERE r.organisation_id = d.organisation_id AND r.department_id = d.department_id AND r.status <> 'Closed') AS open_risks,
            (SELECT COUNT(*) FROM incident i WHERE i.organisation_id = d.organisation_id AND i.department_id = d.department_id AND i.status IN ${OPEN_INCIDENT}) AS open_incidents,
            (SELECT COUNT(*) FROM employee e WHERE e.organisation_id = d.organisation_id AND e.department_id = d.department_id) AS people
     FROM department d
     WHERE d.organisation_id = ?
     ORDER BY d.name`,
    [organisationId],
  );
  return result.map((r) => ({ ...r, created_at: iso(r.created_at) }));
}

export async function getDepartment(db: Executor, organisationId: number, departmentId: number) {
  return (await listDepartments(db, organisationId)).find((d) => d.department_id === departmentId);
}

// ------------------------------------------------------------------- employees
interface EmployeeRow extends Omit<Employee, 'is_active' | 'created_at'> {
  is_active: number; created_at: string; department_name: string; open_risks: number; open_incidents: number;
}
const toEmployee = (r: EmployeeRow): EmployeeListItem => ({ ...r, is_active: Boolean(r.is_active), created_at: iso(r.created_at) });

const EMPLOYEE_SELECT = `SELECT e.employee_id, e.organisation_id, e.employee_code, e.department_id, d.name AS department_name,
       e.first_name, e.last_name, e.email, e.job_title, e.role, e.is_active, e.created_at,
       (SELECT COUNT(*) FROM risk r WHERE r.organisation_id = e.organisation_id AND r.owner_employee_id = e.employee_id AND r.status <> 'Closed') AS open_risks,
       (SELECT COUNT(*) FROM incident i WHERE i.organisation_id = e.organisation_id AND i.assigned_to = e.employee_id AND i.status IN ('Open', 'Investigating', 'Contained')) AS open_incidents
FROM employee e
JOIN department d ON d.department_id = e.department_id AND d.organisation_id = e.organisation_id`;

export interface EmployeeFilters { q?: string; department_id?: number; roles?: string[]; active?: boolean }

const EMPLOYEE_SORT: Record<string, string> = {
  name: 'e.last_name, e.first_name',
  code: 'e.employee_id',
  role: "FIELD(e.role, 'Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee')",
  department: 'd.name',
};

export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function employeeWhere(organisationId: number, f: EmployeeFilters) {
  const where = ['e.organisation_id = ?'];
  const params: unknown[] = [organisationId];
  if (f.q) {
    where.push('(e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_code LIKE ? OR CONCAT(e.first_name, " ", e.last_name) LIKE ?)');
    const p = likePattern(f.q);
    params.push(p, p, p, p, p);
  }
  if (f.department_id) { where.push('e.department_id = ?'); params.push(f.department_id); }
  if (f.roles?.length) { where.push(`e.role IN (${f.roles.map(() => '?').join(',')})`); params.push(...f.roles); }
  if (f.active !== undefined) { where.push('e.is_active = ?'); params.push(f.active ? 1 : 0); }
  return { sql: where.join(' AND '), params };
}

export async function listEmployees(db: Executor, organisationId: number, f: EmployeeFilters, sort: string, desc: boolean, limit: number, offset: number) {
  const w = employeeWhere(organisationId, f);
  const total = (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM employee e WHERE ${w.sql}`, w.params))!.n;
  const order = `${EMPLOYEE_SORT[sort] ?? EMPLOYEE_SORT.name}${desc ? ' DESC' : ''}, e.employee_id`;
  const data = await rows<EmployeeRow>(db, `${EMPLOYEE_SELECT} WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...w.params, limit, offset]);
  return { data: data.map(toEmployee), total };
}

export const EMPLOYEE_SORTS = Object.keys(EMPLOYEE_SORT);

export async function getEmployee(db: Executor, organisationId: number, employeeId: number) {
  const r = await one<EmployeeRow>(db, `${EMPLOYEE_SELECT} WHERE e.organisation_id = ? AND e.employee_id = ?`, [organisationId, employeeId]);
  return r ? toEmployee(r) : undefined;
}
