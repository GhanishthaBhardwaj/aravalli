// Incidents and their append-only update log.
import type { IncidentListItem, IncidentStatus, IncidentUpdate, Scope, Severity } from '@aravalli/shared';
import type { Executor, PoolConnection } from '../core/db';
import { iso, isoOrNull, one, rows, run } from '../core/db';
import { likePattern } from './directory';

export interface IncidentFilters {
  q?: string;
  statuses?: string[];
  severities?: string[];
  department_id?: number;
  assignee_id?: number;
  risk_id?: number;
  /** true: no assignee. */
  unassigned?: boolean;
  /** true: Open / Investigating / Contained only. false: Resolved / Closed only. */
  open?: boolean;
  /** true: not Closed, and either unassigned or not linked to a risk. */
  needs_attention?: boolean;
  /** true: only imported rows. false: only rows created in the product. */
  imported?: boolean;
  /** Which rows the caller may see. Always set by the service from the session, never from the request. */
  scope?: Scope;
}

const SORT: Record<string, string> = {
  code: 'i.incident_id',
  title: 'i.title',
  severity: "FIELD(i.severity, 'Low', 'Medium', 'High', 'Critical')",
  status: "FIELD(i.status, 'Open', 'Investigating', 'Contained', 'Resolved', 'Closed')",
  department: 'd.name',
  reported_by: 'reported_by_name',
  assigned_to: 'assigned_to_name',
  reported_at: 'i.reported_at',
  occurred_at: 'i.occurred_at',
  resolved_at: 'i.resolved_at',
};
export const INCIDENT_SORTS = Object.keys(SORT);
const NULLABLE_SORTS = new Set(['assigned_to', 'resolved_at']);

const SELECT = `SELECT i.incident_id, i.incident_code, i.title, i.severity, i.status, i.department_id, d.name AS department_name,
       i.reported_by, CONCAT(rp.first_name, ' ', rp.last_name) AS reported_by_name,
       i.assigned_to, CONCAT(ag.first_name, ' ', ag.last_name) AS assigned_to_name,
       i.risk_id, rk.risk_code, i.occurred_at, i.reported_at, i.resolved_at, i.source_system, i.source_id
FROM incident i
JOIN department d  ON d.department_id = i.department_id AND d.organisation_id = i.organisation_id
JOIN employee rp   ON rp.employee_id = i.reported_by AND rp.organisation_id = i.organisation_id
LEFT JOIN employee ag ON ag.employee_id = i.assigned_to AND ag.organisation_id = i.organisation_id
LEFT JOIN risk rk  ON rk.risk_id = i.risk_id AND rk.organisation_id = i.organisation_id`;

function where(organisationId: number, f: IncidentFilters) {
  const w = ['i.organisation_id = ?'];
  const p: unknown[] = [organisationId];
  if (f.q) {
    w.push('(i.title LIKE ? OR i.incident_code LIKE ? OR i.source_id LIKE ?)');
    const pat = likePattern(f.q);
    p.push(pat, pat, pat);
  }
  if (f.statuses?.length) { w.push(`i.status IN (${f.statuses.map(() => '?').join(',')})`); p.push(...f.statuses); }
  if (f.severities?.length) { w.push(`i.severity IN (${f.severities.map(() => '?').join(',')})`); p.push(...f.severities); }
  if (f.department_id) { w.push('i.department_id = ?'); p.push(f.department_id); }
  if (f.assignee_id) { w.push('i.assigned_to = ?'); p.push(f.assignee_id); }
  if (f.unassigned) w.push('i.assigned_to IS NULL');
  if (f.risk_id) { w.push('i.risk_id = ?'); p.push(f.risk_id); }
  if (f.open === true) w.push("i.status IN ('Open', 'Investigating', 'Contained')");
  if (f.open === false) w.push("i.status IN ('Resolved', 'Closed')");
  if (f.needs_attention) w.push("i.status <> 'Closed' AND (i.assigned_to IS NULL OR i.risk_id IS NULL)");
  if (f.imported === true) w.push('i.source_id IS NOT NULL');
  if (f.imported === false) w.push('i.source_id IS NULL');
  if (f.scope?.kind === 'department') { w.push('i.department_id = ?'); p.push(f.scope.departmentId); }
  if (f.scope?.kind === 'own') { w.push('(i.reported_by = ? OR i.assigned_to = ?)'); p.push(f.scope.employeeId, f.scope.employeeId); }
  return { sql: w.join(' AND '), params: p };
}

type ListRow = IncidentListItem;
const toItem = (r: ListRow): IncidentListItem => ({
  ...r,
  severity: r.severity as Severity,
  status: r.status as IncidentStatus,
  occurred_at: iso(r.occurred_at),
  reported_at: iso(r.reported_at),
  resolved_at: isoOrNull(r.resolved_at),
});

export async function countIncidents(db: Executor, organisationId: number, f: IncidentFilters): Promise<number> {
  const w = where(organisationId, f);
  return (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM incident i WHERE ${w.sql}`, w.params))!.n;
}

export async function listIncidents(db: Executor, organisationId: number, f: IncidentFilters, sort: string, desc: boolean, limit: number, offset: number) {
  const w = where(organisationId, f);
  const total = await countIncidents(db, organisationId, f);
  const column = SORT[sort] ?? SORT.reported_at;
  // "col IS NULL" first only where the column can be empty; on the others it would stop MySQL reading the index in order.
  const nullFirst = NULLABLE_SORTS.has(sort) ? `${column} IS NULL, ` : '';
  const order = `${nullFirst}${column}${desc ? ' DESC' : ''}, i.incident_id DESC`;
  // Deferred join: find the page's ids from the narrow table first (an index can often do that alone), then join the other
  // tables for just those rows. A deep page used to join thousands of rows it then threw away.
  const needsJoinedSort = ['department', 'reported_by', 'assigned_to'].includes(sort);
  const data = needsJoinedSort
    ? await rows<ListRow>(db, `${SELECT} WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...w.params, limit, offset])
    : await rows<ListRow>(
        db,
        `${SELECT} JOIN (SELECT i.incident_id AS pid FROM incident i WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?) page ON page.pid = i.incident_id ORDER BY ${order}`,
        [...w.params, limit, offset],
      );
  return { data: data.map(toItem), total };
}

export async function getIncident(db: Executor, organisationId: number, incidentId: number) {
  const r = await one<ListRow & { description: string }>(
    db,
    `${SELECT.replace('SELECT i.incident_id,', 'SELECT i.description, i.incident_id,')} WHERE i.organisation_id = ? AND i.incident_id = ?`,
    [organisationId, incidentId],
  );
  return r ? { ...toItem(r), description: r.description } : undefined;
}

export async function findIncidentIdByCode(db: Executor, organisationId: number, code: string) {
  return (await one<{ incident_id: number }>(db, 'SELECT incident_id FROM incident WHERE organisation_id = ? AND incident_code = ?', [organisationId, code]))?.incident_id;
}

export async function listUpdates(db: Executor, organisationId: number, incidentId: number, newestFirst = true) {
  const data = await rows<IncidentUpdate & { updated_by_name: string; created_at: string }>(
    db,
    `SELECT u.update_id, u.organisation_id, u.incident_id, u.updated_by, CONCAT(e.first_name, ' ', e.last_name) AS updated_by_name,
            u.update_text, u.status_from, u.status_to, u.created_at
     FROM incident_update u
     JOIN employee e ON e.employee_id = u.updated_by AND e.organisation_id = u.organisation_id
     WHERE u.organisation_id = ? AND u.incident_id = ?
     ORDER BY u.created_at ${newestFirst ? 'DESC' : 'ASC'}, u.update_id ${newestFirst ? 'DESC' : 'ASC'}`,
    [organisationId, incidentId],
  );
  return data.map((u) => ({ ...u, created_at: iso(u.created_at) }));
}

/** Locks the incident row until the transaction ends, so two updates to one incident take turns. */
export async function lockIncident(conn: PoolConnection, organisationId: number, incidentId: number) {
  return one<{
    incident_id: number; incident_code: string; status: IncidentStatus; resolved_at: string | null;
    reported_by: number; assigned_to: number | null; risk_id: number | null; department_id: number;
  }>(
    conn,
    `SELECT incident_id, incident_code, status, resolved_at, reported_by, assigned_to, risk_id, department_id
     FROM incident WHERE organisation_id = ? AND incident_id = ? FOR UPDATE`,
    [organisationId, incidentId],
  );
}

export interface NewIncident {
  code: string;
  title: string;
  description: string;
  severity: string;
  department_id: number;
  reported_by: number;
  assigned_to: number | null;
  risk_id: number | null;
  occurred_at: string;
  reported_at: string;
}

export async function insertIncident(conn: PoolConnection, organisationId: number, n: NewIncident): Promise<number> {
  const result = await run(
    conn,
    `INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, assigned_to, risk_id, occurred_at, reported_at)
     VALUES (?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?)`,
    [organisationId, n.code, n.title, n.description, n.severity, n.department_id, n.reported_by, n.assigned_to, n.risk_id, n.occurred_at, n.reported_at],
  );
  return result.insertId;
}

export async function insertUpdate(
  conn: PoolConnection,
  organisationId: number,
  u: { incident_id: number; updated_by: number; text: string; from: IncidentStatus | null; to: IncidentStatus | null; at: string },
) {
  await run(
    conn,
    `INSERT INTO incident_update (organisation_id, incident_id, updated_by, update_text, status_from, status_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [organisationId, u.incident_id, u.updated_by, u.text, u.from, u.to, u.at],
  );
}

export async function setStatus(conn: PoolConnection, organisationId: number, incidentId: number, status: IncidentStatus, resolvedAt: string | null) {
  await run(conn, 'UPDATE incident SET status = ?, resolved_at = ? WHERE organisation_id = ? AND incident_id = ?', [status, resolvedAt, organisationId, incidentId]);
}

export async function setAssignee(conn: PoolConnection, organisationId: number, incidentId: number, employeeId: number | null) {
  await run(conn, 'UPDATE incident SET assigned_to = ? WHERE organisation_id = ? AND incident_id = ?', [employeeId, organisationId, incidentId]);
}

export async function setRiskLink(conn: PoolConnection, organisationId: number, incidentId: number, riskId: number | null) {
  await run(conn, 'UPDATE incident SET risk_id = ? WHERE organisation_id = ? AND incident_id = ?', [riskId, organisationId, incidentId]);
}
