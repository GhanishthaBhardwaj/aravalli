// Types mirror the SQL tables in database/schema.sql (snake_case on purpose).
export const ROLES = ['Administrator', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'] as const;
export type Role = (typeof ROLES)[number];

export const RISK_CATEGORIES = ['Operational', 'Financial', 'Compliance', 'Technology', 'Strategic', 'Reputational'] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_STATUSES = ['Identified', 'Assessed', 'Mitigating', 'Monitoring', 'Closed'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INCIDENT_STATUSES = ['Open', 'Investigating', 'Contained', 'Resolved', 'Closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export interface Department {
  department_id: number;
  code: string;
  name: string;
  created_at: string;
}

export interface Employee {
  employee_id: number;
  employee_code: string;
  department_id: number;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Risk {
  risk_id: number;
  risk_code: string;
  title: string;
  description: string;
  category: RiskCategory;
  department_id: number;
  owner_employee_id: number;
  status: RiskStatus;
  identified_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface RiskAssessment {
  assessment_id: number;
  risk_id: number;
  assessed_by: number;
  assessment_date: string; // YYYY-MM-DD
  likelihood: number;
  impact: number;
  risk_score: number; // generated: likelihood * impact
  mitigation_notes: string | null;
  created_at: string;
}

export interface Incident {
  incident_id: number;
  incident_code: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  department_id: number;
  reported_by: number;
  assigned_to: number | null;
  risk_id: number | null;
  occurred_at: string; // YYYY-MM-DDTHH:mm:ss
  reported_at: string;
  resolved_at: string | null;
}

export interface IncidentUpdate {
  update_id: number;
  incident_id: number;
  updated_by: number;
  update_text: string;
  status_from: IncidentStatus | null;
  status_to: IncidentStatus | null;
  created_at: string;
}

export interface Dataset {
  departments: Department[];
  employees: Employee[];
  risks: Risk[];
  risk_assessments: RiskAssessment[];
  incidents: Incident[];
  incident_updates: IncidentUpdate[];
}
