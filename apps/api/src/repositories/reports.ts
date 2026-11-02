// Aggregates behind the dashboard and the reports. The matching hand-written SQL is in database/queries.sql.
// Every query is scoped to one organisation. "Now" is passed in (from the injected clock), never read from the database.
import {
  INCIDENT_STATUSES, SEVERITIES,
  type ActivityItem, type HeatCell, type IncidentStatus, type Kpis, type ResolutionRow, type RiskBand, type RiskProfileRow, type Severity,
} from '@aravalli/shared';
import type { Executor } from '../core/db';
import { iso, one, rows } from '../core/db';

const OPEN = "('Open', 'Investigating', 'Contained')";

export async function kpis(db: Executor, organisationId: number, now: string): Promise<Kpis> {
  const risks = await one<{ open_risks: number; critical_high: number; total: number }>(
    db,
    `SELECT SUM(status <> 'Closed') AS open_risks,
            SUM(status <> 'Closed' AND severity_band IN ('Critical', 'High')) AS critical_high,
            COUNT(*) AS total
     FROM v_risk_current WHERE organisation_id = ?`,
    [organisationId],
  );
  const inc = await one<{ open_incidents: number; critical_open: number; resolved_30: number; mean_hours: number | null }>(
    db,
    `SELECT SUM(status IN ${OPEN}) AS open_incidents,
            SUM(status IN ${OPEN} AND severity = 'Critical') AS critical_open,
            SUM(resolved_at IS NOT NULL AND resolved_at >= DATE_SUB(?, INTERVAL 30 DAY)) AS resolved_30,
            AVG(TIMESTAMPDIFF(SECOND, reported_at, resolved_at)) / 3600 AS mean_hours
     FROM incident WHERE organisation_id = ?`,
    [now.replace('T', ' '), organisationId],
  );
  return {
    openRisks: Number(risks?.open_risks ?? 0),
    criticalHighRisks: Number(risks?.critical_high ?? 0),
    totalRisks: Number(risks?.total ?? 0),
    openIncidents: Number(inc?.open_incidents ?? 0),
    criticalOpenIncidents: Number(inc?.critical_open ?? 0),
    resolvedLast30: Number(inc?.resolved_30 ?? 0),
    meanHoursToResolve: inc?.mean_hours === null || inc?.mean_hours === undefined ? null : Number(inc.mean_hours),
  };
}

export async function incidentsByStatus(db: Executor, organisationId: number) {
  const data = await rows<{ status: IncidentStatus; severity: Severity; n: number }>(
    db,
    'SELECT status, severity, COUNT(*) AS n FROM incident WHERE organisation_id = ? GROUP BY status, severity',
    [organisationId],
  );
  return INCIDENT_STATUSES.map((status) => {
    const row = { status } as { status: IncidentStatus } & Record<Severity, number>;
    for (const s of SEVERITIES) row[s] = Number(data.find((d) => d.status === status && d.severity === s)?.n ?? 0);
    return row;
  });
}

export async function recentActivity(db: Executor, organisationId: number, n: number): Promise<ActivityItem[]> {
  const data = await rows<{ kind: 'assessment' | 'update'; at: string; who: string; text: string; code: string; entity: 'risk' | 'incident' }>(
    db,
    `(SELECT 'assessment' AS kind, a.created_at AS at, CONCAT(e.first_name, ' ', e.last_name) AS who,
             CONCAT('Assessed ', r.title, ' - score ', a.risk_score) AS text, r.risk_code AS code, 'risk' AS entity
      FROM risk_assessment a
      JOIN risk r ON r.risk_id = a.risk_id AND r.organisation_id = a.organisation_id
      JOIN employee e ON e.employee_id = a.assessed_by AND e.organisation_id = a.organisation_id
      WHERE a.organisation_id = ? ORDER BY a.created_at DESC LIMIT ?)
     UNION ALL
     (SELECT 'update', u.created_at, CONCAT(e.first_name, ' ', e.last_name),
             CONCAT(i.title, ': ', u.update_text), i.incident_code, 'incident'
      FROM incident_update u
      JOIN incident i ON i.incident_id = u.incident_id AND i.organisation_id = u.organisation_id
      JOIN employee e ON e.employee_id = u.updated_by AND e.organisation_id = u.organisation_id
      WHERE u.organisation_id = ? ORDER BY u.created_at DESC LIMIT ?)
     ORDER BY at DESC LIMIT ?`,
    [organisationId, n, organisationId, n, n],
  );
  return data.map((d) => ({ ...d, at: iso(d.at) }));
}

/** 5x5 grid of open risks. `current` uses each risk's latest assessment, `first` its first one. */
export async function heatmap(db: Executor, organisationId: number, mode: 'current' | 'first'): Promise<HeatCell[]> {
  const sql =
    mode === 'current'
      ? `SELECT v.likelihood, v.impact, v.risk_id, v.risk_code, v.title, v.risk_score, v.severity_band, v.department_name, v.owner_name, v.status
         FROM v_risk_current v
         WHERE v.organisation_id = ? AND v.status <> 'Closed' AND v.likelihood IS NOT NULL
         ORDER BY v.risk_score DESC, v.risk_code`
      : `SELECT f.likelihood, f.impact, v.risk_id, v.risk_code, v.title, f.risk_score,
                CASE WHEN f.risk_score >= 20 THEN 'Critical' WHEN f.risk_score >= 10 THEN 'High' WHEN f.risk_score >= 5 THEN 'Medium' ELSE 'Low' END AS severity_band,
                v.department_name, v.owner_name, v.status
         FROM v_risk_current v
         JOIN (SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.risk_id ORDER BY a.assessment_date, a.assessment_id) AS rn
               FROM risk_assessment a WHERE a.organisation_id = ?) f ON f.risk_id = v.risk_id AND f.organisation_id = v.organisation_id AND f.rn = 1
         WHERE v.organisation_id = ? AND v.status <> 'Closed'
         ORDER BY f.risk_score DESC, v.risk_code`;
  const data = await rows<{ likelihood: number; impact: number } & HeatCell['risks'][number]>(db, sql, mode === 'current' ? [organisationId] : [organisationId, organisationId]);
  const cells: HeatCell[] = [];
  for (let l = 1; l <= 5; l++) for (let i = 1; i <= 5; i++) cells.push({ likelihood: l, impact: i, risks: [] });
  for (const { likelihood, impact, ...risk } of data) cells[(likelihood - 1) * 5 + (impact - 1)].risks.push({ ...risk, severity_band: risk.severity_band as RiskBand });
  return cells;
}

export async function riskProfileByDepartment(db: Executor, organisationId: number): Promise<RiskProfileRow[]> {
  const data = await rows<{ department_id: number; department: string; band: string | null; n: number }>(
    db,
    `SELECT d.department_id, d.name AS department, v.severity_band AS band, COUNT(v.risk_id) AS n
     FROM department d
     LEFT JOIN v_risk_current v ON v.department_id = d.department_id AND v.organisation_id = d.organisation_id AND v.status <> 'Closed'
     WHERE d.organisation_id = ?
     GROUP BY d.department_id, d.name, v.severity_band
     ORDER BY d.name`,
    [organisationId],
  );
  const byDept = new Map<number, RiskProfileRow>();
  for (const r of data) {
    const row = byDept.get(r.department_id) ?? { department_id: r.department_id, department: r.department, Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0, Total: 0 };
    if (r.band) {
      row[r.band as RiskBand] = Number(r.n);
      row.Total += Number(r.n);
    }
    byDept.set(r.department_id, row);
  }
  return [...byDept.values()];
}

/** Hours from report to resolution, with a median computed in SQL (MySQL has no MEDIAN). */
export async function resolution(db: Executor, organisationId: number, groupBy: 'severity' | 'department'): Promise<ResolutionRow[]> {
  const groupColumn = groupBy === 'severity' ? 'i.severity' : 'd.name';
  const data = await rows<{ grp: string; resolved: number; mean_h: number; median_h: number }>(
    db,
    `SELECT grp, COUNT(*) AS resolved, AVG(h) AS mean_h,
            AVG(CASE WHEN rn IN (FLOOR((cnt + 1) / 2), FLOOR((cnt + 2) / 2)) THEN h END) AS median_h
     FROM (SELECT grp, h, ROW_NUMBER() OVER (PARTITION BY grp ORDER BY h) AS rn, COUNT(*) OVER (PARTITION BY grp) AS cnt
           FROM (SELECT ${groupColumn} AS grp, TIMESTAMPDIFF(SECOND, i.reported_at, i.resolved_at) / 3600 AS h
                 FROM incident i JOIN department d ON d.department_id = i.department_id AND d.organisation_id = i.organisation_id
                 WHERE i.organisation_id = ? AND i.resolved_at IS NOT NULL) t) u
     GROUP BY grp`,
    [organisationId],
  );
  const byGroup = new Map(data.map((d) => [d.grp, d]));
  const keys = groupBy === 'severity' ? [...SEVERITIES].reverse() : null;
  const names = keys ?? (await rows<{ name: string }>(db, 'SELECT name FROM department WHERE organisation_id = ? ORDER BY name', [organisationId])).map((d) => d.name);
  return names.map((group) => {
    const d = byGroup.get(group);
    return { group, resolved: Number(d?.resolved ?? 0), meanHours: d ? Number(d.mean_h) : null, medianHours: d ? Number(d.median_h) : null };
  });
}
