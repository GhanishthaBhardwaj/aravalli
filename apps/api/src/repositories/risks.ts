// Risks and their assessments. Reads use the v_risk_current view (a risk plus its latest assessment).
import type { RiskAssessment, RiskBand, RiskDetail, RiskListItem, RiskStatus } from '@aravalli/shared';
import type { Executor, PoolConnection } from '../core/db';
import { iso, one, rows, run } from '../core/db';
import { likePattern } from './directory';

export interface RiskFilters {
  q?: string;
  statuses?: string[];
  categories?: string[];
  bands?: string[];
  department_id?: number;
  owner_id?: number;
  likelihood?: number;
  impact?: number;
  /** true: only risks that are not Closed. */
  open?: boolean;
}

const SORT: Record<string, string> = {
  code: 'v.risk_id',
  title: 'v.title',
  category: 'v.category',
  status: "FIELD(v.status, 'Identified', 'Assessed', 'Mitigating', 'Monitoring', 'Closed')",
  department: 'v.department_name',
  owner: 'v.owner_name',
  score: 'v.risk_score',
  last_assessed: 'v.last_assessed',
  identified: 'v.identified_date',
};
export const RISK_SORTS = Object.keys(SORT);

const SELECT = `SELECT v.risk_id, v.risk_code, v.title, v.category, v.status, v.department_id, v.department_name,
       v.owner_employee_id, v.owner_name, v.identified_date, v.last_assessed, v.likelihood, v.impact, v.risk_score,
       v.severity_band,
       (SELECT COUNT(*) FROM risk_assessment a WHERE a.risk_id = v.risk_id AND a.organisation_id = v.organisation_id) AS assessment_count
FROM v_risk_current v`;

function where(organisationId: number, f: RiskFilters) {
  const w = ['v.organisation_id = ?'];
  const p: unknown[] = [organisationId];
  if (f.q) { w.push('(v.title LIKE ? OR v.risk_code LIKE ?)'); p.push(likePattern(f.q), likePattern(f.q)); }
  if (f.statuses?.length) { w.push(`v.status IN (${f.statuses.map(() => '?').join(',')})`); p.push(...f.statuses); }
  if (f.categories?.length) { w.push(`v.category IN (${f.categories.map(() => '?').join(',')})`); p.push(...f.categories); }
  if (f.bands?.length) { w.push(`v.severity_band IN (${f.bands.map(() => '?').join(',')})`); p.push(...f.bands); }
  if (f.department_id) { w.push('v.department_id = ?'); p.push(f.department_id); }
  if (f.owner_id) { w.push('v.owner_employee_id = ?'); p.push(f.owner_id); }
  if (f.likelihood) { w.push('v.likelihood = ?'); p.push(f.likelihood); }
  if (f.impact) { w.push('v.impact = ?'); p.push(f.impact); }
  if (f.open) w.push("v.status <> 'Closed'");
  return { sql: w.join(' AND '), params: p };
}

interface ListRow extends Omit<RiskListItem, 'identified_date' | 'last_assessed'> { identified_date: string; last_assessed: string | null }
const toItem = (r: ListRow): RiskListItem => ({ ...r, severity_band: r.severity_band as RiskBand });

export async function listRisks(db: Executor, organisationId: number, f: RiskFilters, sort: string, desc: boolean, limit: number, offset: number) {
  const w = where(organisationId, f);
  const total = (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM v_risk_current v WHERE ${w.sql}`, w.params))!.n;
  // NULL scores (unrated risks) always sort last, whichever direction was asked for
  const column = SORT[sort] ?? SORT.code;
  const order = `${column} IS NULL, ${column}${desc ? ' DESC' : ''}, v.risk_id`;
  const data = await rows<ListRow>(db, `${SELECT} WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [...w.params, limit, offset]);
  return { data: data.map(toItem), total };
}

export async function topOpenRisks(db: Executor, organisationId: number, n: number): Promise<RiskListItem[]> {
  const data = await rows<ListRow>(
    db,
    `${SELECT} WHERE v.organisation_id = ? AND v.status <> 'Closed' AND v.risk_score IS NOT NULL ORDER BY v.risk_score DESC, v.risk_code LIMIT ?`,
    [organisationId, n],
  );
  return data.map(toItem);
}

interface AssessmentRow extends Omit<RiskAssessment, 'created_at'> { created_at: string; assessed_by_name: string }

export async function listAssessments(db: Executor, organisationId: number, riskId: number) {
  const data = await rows<AssessmentRow>(
    db,
    `SELECT a.assessment_id, a.organisation_id, a.risk_id, a.assessed_by, a.assessment_date, a.likelihood, a.impact, a.risk_score,
            a.mitigation_notes, a.created_at, CONCAT(e.first_name, ' ', e.last_name) AS assessed_by_name
     FROM risk_assessment a
     JOIN employee e ON e.employee_id = a.assessed_by AND e.organisation_id = a.organisation_id
     WHERE a.organisation_id = ? AND a.risk_id = ?
     ORDER BY a.assessment_date, a.assessment_id`,
    [organisationId, riskId],
  );
  return data.map((a) => ({ ...a, created_at: iso(a.created_at) }));
}

export async function getRisk(db: Executor, organisationId: number, riskId: number, byCode = false): Promise<RiskDetail | undefined> {
  const r = await one<ListRow & { description: string; created_at: string; updated_at: string }>(
    db,
    `${SELECT.replace('FROM v_risk_current v', 'FROM v_risk_current v JOIN risk rr ON rr.risk_id = v.risk_id AND rr.organisation_id = v.organisation_id').replace('SELECT v.risk_id,', 'SELECT rr.description, rr.created_at, rr.updated_at, v.risk_id,')}
     WHERE v.organisation_id = ? AND ${byCode ? 'v.risk_code' : 'v.risk_id'} = ?`,
    [organisationId, riskId],
  );
  if (!r) return undefined;
  const linked = await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM incident WHERE organisation_id = ? AND risk_id = ?', [organisationId, r.risk_id]);
  return {
    ...toItem(r),
    description: r.description,
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    assessments: await listAssessments(db, organisationId, r.risk_id),
    linked_incident_count: linked!.n,
  };
}

export async function getRiskByCode(db: Executor, organisationId: number, code: string) {
  const r = await one<{ risk_id: number }>(db, 'SELECT risk_id FROM risk WHERE organisation_id = ? AND risk_code = ?', [organisationId, code]);
  return r ? getRisk(db, organisationId, r.risk_id) : undefined;
}

/** Locks the risk row until the transaction ends, so two status changes cannot interleave. */
export async function lockRisk(conn: PoolConnection, organisationId: number, riskId: number) {
  return one<{ risk_id: number; status: RiskStatus; identified_date: string; risk_code: string }>(
    conn,
    'SELECT risk_id, status, identified_date, risk_code FROM risk WHERE organisation_id = ? AND risk_id = ? FOR UPDATE',
    [organisationId, riskId],
  );
}

export async function countAssessments(db: Executor, organisationId: number, riskId: number): Promise<number> {
  return (await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM risk_assessment WHERE organisation_id = ? AND risk_id = ?', [organisationId, riskId]))!.n;
}

export interface NewRisk {
  code: string;
  title: string;
  description: string;
  category: string;
  department_id: number;
  owner_employee_id: number;
  status: RiskStatus;
  identified_date: string;
  stamp: string;
}

export async function insertRisk(conn: PoolConnection, organisationId: number, r: NewRisk): Promise<number> {
  const result = await run(
    conn,
    `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, status, identified_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [organisationId, r.code, r.title, r.description, r.category, r.department_id, r.owner_employee_id, r.status, r.identified_date, r.stamp, r.stamp],
  );
  return result.insertId;
}

export async function insertAssessment(
  conn: PoolConnection,
  organisationId: number,
  a: { risk_id: number; assessed_by: number; assessment_date: string; likelihood: number; impact: number; mitigation_notes: string | null; stamp: string },
): Promise<number> {
  const result = await run(
    conn,
    `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact, mitigation_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [organisationId, a.risk_id, a.assessed_by, a.assessment_date, a.likelihood, a.impact, a.mitigation_notes, a.stamp],
  );
  return result.insertId;
}

export async function setRiskStatus(conn: PoolConnection, organisationId: number, riskId: number, status: RiskStatus, stamp: string) {
  await run(conn, 'UPDATE risk SET status = ?, updated_at = ? WHERE organisation_id = ? AND risk_id = ?', [status, stamp, organisationId, riskId]);
}
