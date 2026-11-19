// The shapes the API returns, shared so the server and the web client cannot drift apart.
// Dates: DATE columns are 'YYYY-MM-DD', DATETIME columns are 'YYYY-MM-DDTHH:mm:ss' (no zone: the organisation's local time).
import type { Department, Employee, Incident, IncidentStatus, IncidentUpdate, Organisation, Risk, RiskAssessment, Severity } from './types';

export interface PageInfo { limit: number; offset: number; total: number }
export interface Paged<T> { data: T[]; page: PageInfo }
export interface Single<T> { data: T }
export interface ApiErrorBody { error: { code: string; message: string; details: { field: string; message: string }[] } }

export type OrganisationSummary = Pick<Organisation, 'organisation_id' | 'name' | 'slug' | 'is_demo'>;

export interface DepartmentWithStats extends Department {
  open_risks: number;
  open_incidents: number;
  people: number;
}

export type EmployeeListItem = Employee & { department_name: string; open_risks: number; open_incidents: number };

export type RiskBand = Severity | 'Unrated';

/** One row of the risk register: the risk plus its current (latest) assessment. */
export interface RiskListItem {
  risk_id: number;
  risk_code: string;
  title: string;
  category: Risk['category'];
  status: Risk['status'];
  department_id: number;
  department_name: string;
  owner_employee_id: number;
  owner_name: string;
  identified_date: string;
  last_assessed: string | null;
  likelihood: number | null;
  impact: number | null;
  risk_score: number | null;
  severity_band: RiskBand;
  assessment_count: number;
}

export interface RiskDetail extends RiskListItem {
  description: string;
  created_at: string;
  updated_at: string;
  assessments: (RiskAssessment & { assessed_by_name: string })[];
  linked_incident_count: number;
}

export interface IncidentListItem {
  incident_id: number;
  incident_code: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  department_id: number;
  department_name: string;
  reported_by: number;
  reported_by_name: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  risk_id: number | null;
  risk_code: string | null;
  occurred_at: string;
  reported_at: string;
  resolved_at: string | null;
  source_system: string | null;
  source_id: string | null;
  /** The record's original timestamp in the public dataset, before the demo's dates were shifted ('YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'). */
  source_occurred_at: string | null;
}

export interface IncidentDetail extends IncidentListItem {
  description: string;
  updates: (IncidentUpdate & { updated_by_name: string })[];
}

export interface Kpis {
  openRisks: number;
  criticalHighRisks: number;
  openIncidents: number;
  resolvedLast30: number;
  meanHoursToResolve: number | null;
  criticalOpenIncidents: number;
  unassignedOpenIncidents: number;
  totalRisks: number;
}

export interface ActivityItem {
  kind: 'assessment' | 'update';
  at: string;
  who: string;
  text: string;
  code: string;
  /** 'risk' or 'incident': which register the code belongs to. */
  entity: 'risk' | 'incident';
}

export interface Overview {
  kpis: Kpis;
  incidentsByStatus: ({ status: IncidentStatus } & Record<Severity, number>)[];
  topRisks: RiskListItem[];
  recentActivity: ActivityItem[];
}

export interface HeatCell {
  likelihood: number;
  impact: number;
  risks: (Pick<RiskListItem, 'risk_id' | 'risk_code' | 'title' | 'risk_score' | 'severity_band' | 'department_name' | 'owner_name' | 'status'> & { first_score: number | null })[];
}

export interface RiskProfileRow {
  department_id: number;
  department: string;
  Critical: number;
  High: number;
  Medium: number;
  Low: number;
  Unrated: number;
  Total: number;
}

export interface ResolutionRow { group: string; resolved: number; meanHours: number | null; medianHours: number | null }

export type { Incident };
