import { RISK_CATEGORIES, SEVERITIES } from './types';
import type { Employee } from './types';

export type Errors = Record<string, string | undefined>;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isDateTime = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

export interface RiskInput {
  title: string;
  description: string;
  category: string;
  department_id: number | null;
  owner_employee_id: number | null;
  identified_date: string;
  likelihood: number | null;
  impact: number | null;
  mitigation_notes: string;
}

/** `today` is 'YYYY-MM-DD' from the caller's Clock. */
export function validateRisk(v: RiskInput, employees: Employee[], today: string): Errors {
  const e: Errors = {};
  const t = v.title.trim();
  if (!t) e.title = 'Title is required.';
  else if (t.length < 5 || t.length > 150) e.title = 'Title must be 5–150 characters.';
  if (!v.description.trim()) e.description = 'Description is required.';
  if (!(RISK_CATEGORIES as readonly string[]).includes(v.category)) e.category = 'Choose a category.';
  if (!v.department_id) e.department_id = 'Choose a department.';
  if (!v.owner_employee_id) e.owner_employee_id = 'Choose an owner.';
  else {
    // any active employee of the organisation may own a risk, whatever their department
    const o = employees.find((x) => x.employee_id === v.owner_employee_id);
    if (!o) e.owner_employee_id = 'Choose an owner from this organisation.';
    else if (!o.is_active) e.owner_employee_id = 'Owner must be an active employee.';
  }
  if (!isDate(v.identified_date)) e.identified_date = 'Enter a valid date.';
  else if (v.identified_date > today) e.identified_date = 'Date cannot be in the future.';
  const hasL = v.likelihood !== null;
  const hasI = v.impact !== null;
  if (hasL !== hasI) {
    if (!hasL) e.likelihood = 'Select likelihood, or clear impact to skip the assessment.';
    else e.impact = 'Select impact, or clear likelihood to skip the assessment.';
  }  else if (hasL && hasI) {
    if (!inRange(v.likelihood as number)) e.likelihood = 'Likelihood must be a whole number from 1 to 5.';
    if (!inRange(v.impact as number)) e.impact = 'Impact must be a whole number from 1 to 5.';
  }
  return e;
}

export interface AssessmentInput {
  likelihood: number | null;
  impact: number | null;
  assessment_date: string;
  mitigation_notes: string;
}

/** `today` is 'YYYY-MM-DD' from the caller's Clock. */
export function validateAssessment(v: AssessmentInput, today: string): Errors {
  const e: Errors = {};
  if (v.likelihood === null || !inRange(v.likelihood)) e.likelihood = 'Select likelihood (1–5).';
  if (v.impact === null || !inRange(v.impact)) e.impact = 'Select impact (1–5).';
  if (!isDate(v.assessment_date)) e.assessment_date = 'Enter a valid date.';
  else if (v.assessment_date > today) e.assessment_date = 'Date cannot be in the future.';
  return e;
}

export interface IncidentInput {
  title: string;
  description: string;
  severity: string;
  department_id: number | null;
  occurred_at: string;
}

/** `now` is 'YYYY-MM-DDTHH:mm' from the caller's Clock. */
export function validateIncident(v: IncidentInput, now: string): Errors {
  const e: Errors = {};
  const t = v.title.trim();
  if (!t) e.title = 'Title is required.';
  else if (t.length < 5 || t.length > 150) e.title = 'Title must be 5–150 characters.';
  if (!v.description.trim()) e.description = 'Description is required.';
  if (!(SEVERITIES as readonly string[]).includes(v.severity)) e.severity = 'Choose a severity.';
  if (!v.department_id) e.department_id = 'Choose the affected department.';
  if (!isDateTime(v.occurred_at)) e.occurred_at = 'Enter a valid date and time.';
  else if (v.occurred_at > now) e.occurred_at = 'Occurrence time cannot be in the future.';
  return e;
}

export function validateNote(text: string, label = 'Note'): string | undefined {
  return text.trim() ? undefined : `${label} is required.`;
}
