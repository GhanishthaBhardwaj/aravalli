// Derived data. Every KPI / report here has a matching query in database/queries.sql.
import { bandFor, type Clock, type Dataset, type Department, type Employee, type Incident, INCIDENT_STATUSES, type IncidentStatus, type IncidentUpdate, type Risk, type RiskAssessment, SEVERITIES, type Severity } from '@aravalli/shared';

const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;
export const toMs = (s: string) => Date.parse(s.length === 10 ? s : `${s.slice(0, 19)}Z`);
/** The clock's current moment in milliseconds. */
export const clockMs = (clock: Clock) => toMs(`${clock.now()}:00`);

export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['Open', 'Investigating', 'Contained'];
export const isOpenIncident = (i: Incident) => OPEN_INCIDENT_STATUSES.includes(i.status);
export const fullName = (e: Employee | undefined) => (e ? `${e.first_name} ${e.last_name}` : '—');

const byLatest = (a: RiskAssessment, b: RiskAssessment) =>
  a.assessment_date === b.assessment_date ? a.assessment_id - b.assessment_id : a.assessment_date < b.assessment_date ? -1 : 1;

/** Assessments for a risk, oldest first. */
export const assessmentsFor = (ds: Dataset, risk_id: number) =>
  ds.risk_assessments.filter((a) => a.risk_id === risk_id).sort(byLatest);

export const currentAssessment = (ds: Dataset, risk_id: number) => assessmentsFor(ds, risk_id).at(-1);

export interface RiskRow {
  risk: Risk;
  department: Department;
  owner: Employee;
  current: RiskAssessment | undefined;
  score: number | null;
  band: Severity | null;
  lastAssessed: string | null;
  assessmentCount: number;
}

export function riskRows(ds: Dataset): RiskRow[] {
  const byRisk = new Map<number, RiskAssessment[]>();
  for (const a of ds.risk_assessments) byRisk.set(a.risk_id, [...(byRisk.get(a.risk_id) ?? []), a]);
  return ds.risks.map((risk) => {
    const list = (byRisk.get(risk.risk_id) ?? []).sort(byLatest);
    const current = list.at(-1);
    return {
      risk,
      department: ds.departments.find((d) => d.department_id === risk.department_id)!,
      owner: ds.employees.find((e) => e.employee_id === risk.owner_employee_id)!,
      current,
      score: current?.risk_score ?? null,
      band: current ? bandFor(current.risk_score) : null,
      lastAssessed: current?.assessment_date ?? null,
      assessmentCount: list.length,
    };
  });
}

export interface IncidentRow {
  incident: Incident;
  department: Department;
  reporter: Employee;
  assignee: Employee | undefined;
  risk: Risk | undefined;
  ageDays: number;
}

/** Age in whole days: occurrence to resolution, or to "now" while still open. */
export const incidentAgeDays = (i: Incident, clock: Clock) =>
  Math.floor(((i.resolved_at && !isOpenIncident(i) ? toMs(i.resolved_at) : clockMs(clock)) - toMs(i.occurred_at)) / MS_DAY);

export function incidentRows(ds: Dataset, clock: Clock): IncidentRow[] {
  return ds.incidents.map((incident) => ({
    incident,
    department: ds.departments.find((d) => d.department_id === incident.department_id)!,
    reporter: ds.employees.find((e) => e.employee_id === incident.reported_by)!,
    assignee: ds.employees.find((e) => e.employee_id === incident.assigned_to),
    risk: ds.risks.find((r) => r.risk_id === incident.risk_id),
    ageDays: incidentAgeDays(incident, clock),
  }));
}

/** Hours from report to resolution. Only incidents that have a resolved_at. */
export const hoursToResolve = (i: Incident) =>
  i.resolved_at ? (toMs(i.resolved_at) - toMs(i.reported_at)) / MS_HOUR : null;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const isOpenRisk = (r: Risk) => r.status !== 'Closed';

export interface Kpis {
  openRisks: number;
  criticalHighRisks: number;
  openIncidents: number;
  resolvedLast30: number;
  meanHoursToResolve: number | null;
  criticalOpenIncidents: number;
  totalRisks: number;
}

export function kpis(ds: Dataset, clock: Clock): Kpis {
  const rows = riskRows(ds).filter((r) => isOpenRisk(r.risk));
  const open = ds.incidents.filter(isOpenIncident);
  const cutoff = clockMs(clock) - 30 * MS_DAY;
  const hours = ds.incidents.map(hoursToResolve).filter((h): h is number => h !== null);
  return {
    openRisks: rows.length,
    criticalHighRisks: rows.filter((r) => r.band === 'Critical' || r.band === 'High').length,
    openIncidents: open.length,
    resolvedLast30: ds.incidents.filter((i) => i.resolved_at && toMs(i.resolved_at) >= cutoff).length,
    meanHoursToResolve: mean(hours),
    criticalOpenIncidents: open.filter((i) => i.severity === 'Critical').length,
    totalRisks: ds.risks.length,
  };
}

export type HeatMode = 'current' | 'first';
export interface HeatCell { likelihood: number; impact: number; rows: RiskRow[] }

/** 5×5 grid of open risks by position. `first` uses each risk's first assessment. */
export function heatGrid(ds: Dataset, mode: HeatMode): HeatCell[] {
  const cells: HeatCell[] = [];
  for (let l = 1; l <= 5; l++) for (let i = 1; i <= 5; i++) cells.push({ likelihood: l, impact: i, rows: [] });
  for (const row of riskRows(ds)) {
    if (!isOpenRisk(row.risk)) continue;
    const a = mode === 'first' ? assessmentsFor(ds, row.risk.risk_id)[0] : row.current;
    if (!a) continue;
    cells[(a.likelihood - 1) * 5 + (a.impact - 1)].rows.push(row);
  }
  return cells;
}

export function incidentsByStatus(ds: Dataset) {
  return INCIDENT_STATUSES.map((status) => {
    const row: Record<string, number | string> = { status };
    for (const s of SEVERITIES) row[s] = ds.incidents.filter((i) => i.status === status && i.severity === s).length;
    return row as { status: IncidentStatus } & Record<Severity, number>;
  });
}

export const topRisks = (ds: Dataset, n: number) =>
  riskRows(ds)
    .filter((r) => isOpenRisk(r.risk) && r.score !== null)
    .sort((a, b) => b.score! - a.score! || a.risk.risk_code.localeCompare(b.risk.risk_code))
    .slice(0, n);

export interface Activity {
  kind: 'assessment' | 'update';
  at: string;
  who: Employee | undefined;
  text: string;
  href: string;
  code: string;
}

export function recentActivity(ds: Dataset, n: number): Activity[] {
  const items: Activity[] = [];
  const stamp = (a: RiskAssessment) => (a.created_at.startsWith(a.assessment_date) ? a.created_at : `${a.assessment_date}T11:00:00`);
  for (const a of ds.risk_assessments) {
    const risk = ds.risks.find((r) => r.risk_id === a.risk_id)!;
    items.push({
      kind: 'assessment', at: stamp(a), who: ds.employees.find((e) => e.employee_id === a.assessed_by),
      text: `Assessed ${risk.title} — score ${a.risk_score} (${bandFor(a.risk_score)})`,
      href: `/risks/${risk.risk_code}`, code: risk.risk_code,
    });
  }
  for (const u of ds.incident_updates) {
    const inc = ds.incidents.find((i) => i.incident_id === u.incident_id)!;
    items.push({
      kind: 'update', at: u.created_at, who: ds.employees.find((e) => e.employee_id === u.updated_by),
      text: `${inc.title}: ${u.update_text}`, href: `/incidents/${inc.incident_code}`, code: inc.incident_code,
    });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, n);
}

export const updatesFor = (ds: Dataset, incident_id: number): IncidentUpdate[] =>
  ds.incident_updates.filter((u) => u.incident_id === incident_id).sort((a, b) => b.update_id - a.update_id);

export function departmentStats(ds: Dataset) {
  return ds.departments.map((department) => ({
    department,
    openRisks: ds.risks.filter((r) => r.department_id === department.department_id && isOpenRisk(r)).length,
    openIncidents: ds.incidents.filter((i) => i.department_id === department.department_id && isOpenIncident(i)).length,
    people: ds.employees.filter((e) => e.department_id === department.department_id).length,
  }));
}

// ------------------------------------------------------------------- reports
export function riskProfileByDepartment(ds: Dataset) {
  const rows = riskRows(ds).filter((r) => isOpenRisk(r.risk));
  return ds.departments.map((d) => {
    const mine = rows.filter((r) => r.department.department_id === d.department_id);
    const count = (b: Severity | null) => mine.filter((r) => r.band === b).length;
    return {
      department_id: d.department_id, department: d.name, Critical: count('Critical'), High: count('High'), Medium: count('Medium'), Low: count('Low'),
      Unrated: count(null), Total: mine.length,
    };
  });
}

export interface ResolutionRow { group: string; resolved: number; meanHours: number | null; medianHours: number | null }

function resolutionBy(ds: Dataset, keys: string[], pick: (i: Incident) => string): ResolutionRow[] {
  return keys.map((group) => {
    const hrs = ds.incidents.filter((i) => pick(i) === group).map(hoursToResolve).filter((h): h is number => h !== null);
    return { group, resolved: hrs.length, meanHours: mean(hrs), medianHours: median(hrs) };
  });
}

export const resolutionBySeverity = (ds: Dataset) => resolutionBy(ds, [...SEVERITIES].reverse(), (i) => i.severity);
export const resolutionByDepartment = (ds: Dataset) =>
  resolutionBy(ds, ds.departments.map((d) => d.name), (i) => ds.departments.find((d) => d.department_id === i.department_id)!.name);

export const incidentExceptions = (ds: Dataset, clock: Clock) =>
  incidentRows(ds, clock).filter((r) => r.incident.status !== 'Closed' && (r.incident.assigned_to === null || r.incident.risk_id === null));

export const formatHours = (h: number | null) => {
  if (h === null) return '—';
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
};
