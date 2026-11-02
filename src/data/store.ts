// All writes go through these functions. They validate, enforce transitions and
// permissions, and return a new Dataset (never mutate). The UI never writes data directly.
import type {
  Dataset, Employee, Incident, IncidentStatus, IncidentUpdate, Risk, RiskAssessment, RiskStatus,
} from '../domain/types';
import { computeScore } from '../domain/scoring';
import {
  canIncidentTransition, canRiskTransition, incidentNeedsNote, riskNeedsNote,
} from '../domain/transitions';
import {
  DEMO_NOW, DEMO_TODAY, validateAssessment, validateIncident, validateNote, validateRisk,
} from '../domain/validation';
import type { AssessmentInput, Errors, IncidentInput, RiskInput } from '../domain/validation';
import { canClose, permit } from '../domain/permissions';
import type { Action } from '../domain/permissions';
import { seed } from './seed';

export type Result<T = unknown> =
  | { ok: true; data: Dataset; value: T }
  | { ok: false; errors: Errors };

const fail = (errors: Errors): { ok: false; errors: Errors } => ({ ok: false, errors });
const nowTs = () => `${DEMO_NOW}:00`;
const pad = (n: number) => String(n).padStart(4, '0');
const nextId = (rows: number[]) => (rows.length ? Math.max(...rows) : 0) + 1;

function denied(actor: Employee, action: Action, incident?: Incident) {
  const p = permit(actor, action, incident);
  return p.allowed ? null : fail({ _form: p.reason });
}

function withUpdate(
  ds: Dataset, incident_id: number, by: number, text: string,
  from: IncidentStatus | null, to: IncidentStatus | null,
): IncidentUpdate[] {
  const u: IncidentUpdate = {
    update_id: nextId(ds.incident_updates.map((x) => x.update_id)), incident_id, updated_by: by,
    update_text: text, status_from: from, status_to: to, created_at: nowTs(),
  };
  return [...ds.incident_updates, u];
}

export const hasAssessment = (ds: Dataset, risk_id: number) =>
  ds.risk_assessments.some((a) => a.risk_id === risk_id);

// ---------------------------------------------------------------------- risks
export function registerRisk(ds: Dataset, v: RiskInput, actor: Employee): Result<Risk> {
  const d = denied(actor, 'risk.register');
  if (d) return d;
  const errors = validateRisk(v, ds.employees);
  if (Object.keys(errors).length) return fail(errors);
  const risk_id = nextId(ds.risks.map((r) => r.risk_id));
  const assessed = v.likelihood !== null && v.impact !== null;
  const risk: Risk = {
    risk_id, risk_code: `RSK-${pad(risk_id)}`, title: v.title.trim(), description: v.description.trim(),
    category: v.category as Risk['category'], department_id: v.department_id!, owner_employee_id: v.owner_employee_id!,
    status: assessed ? 'Assessed' : 'Identified', identified_date: v.identified_date,
    created_at: nowTs(), updated_at: nowTs(),
  };
  const assessments = [...ds.risk_assessments];
  if (assessed) {
    assessments.push({
      assessment_id: nextId(ds.risk_assessments.map((a) => a.assessment_id)), risk_id, assessed_by: actor.employee_id,
      assessment_date: v.identified_date, likelihood: v.likelihood!, impact: v.impact!,
      risk_score: computeScore(v.likelihood!, v.impact!), mitigation_notes: v.mitigation_notes.trim() || null,
      created_at: nowTs(),
    });
  }
  return { ok: true, data: { ...ds, risks: [...ds.risks, risk], risk_assessments: assessments }, value: risk };
}

export function addAssessment(ds: Dataset, risk_id: number, v: AssessmentInput, actor: Employee): Result<RiskAssessment> {
  const d = denied(actor, 'risk.assess');
  if (d) return d;
  const risk = ds.risks.find((r) => r.risk_id === risk_id);
  if (!risk) return fail({ _form: 'Risk not found.' });
  const errors = validateAssessment(v);
  if (v.assessment_date && v.assessment_date < risk.identified_date) errors.assessment_date = 'Assessment cannot predate the date the risk was identified.';
  if (Object.keys(errors).length) return fail(errors);
  const a: RiskAssessment = {
    assessment_id: nextId(ds.risk_assessments.map((x) => x.assessment_id)), risk_id, assessed_by: actor.employee_id,
    assessment_date: v.assessment_date, likelihood: v.likelihood!, impact: v.impact!,
    risk_score: computeScore(v.likelihood!, v.impact!), mitigation_notes: v.mitigation_notes.trim() || null,
    created_at: nowTs(),
  };
  const risks = ds.risks.map((r) =>
    r.risk_id === risk_id
      ? { ...r, status: (r.status === 'Identified' ? 'Assessed' : r.status) as RiskStatus, updated_at: nowTs() }
      : r);
  return { ok: true, data: { ...ds, risks, risk_assessments: [...ds.risk_assessments, a] }, value: a };
}

export function changeRiskStatus(ds: Dataset, risk_id: number, to: RiskStatus, note: string, actor: Employee): Result<Risk> {
  const d = denied(actor, 'risk.status');
  if (d) return d;
  const risk = ds.risks.find((r) => r.risk_id === risk_id);
  if (!risk) return fail({ _form: 'Risk not found.' });
  if (!canRiskTransition(risk.status, to, hasAssessment(ds, risk_id))) {
    return fail({ status: `${risk.status} → ${to} is not a valid transition.` });
  }
  if (riskNeedsNote(to)) {
    const n = validateNote(note, 'A closure note');
    if (n) return fail({ note: n });
  }
  const next = { ...risk, status: to, updated_at: nowTs() };
  return { ok: true, data: { ...ds, risks: ds.risks.map((r) => (r.risk_id === risk_id ? next : r)) }, value: next };
}

// ------------------------------------------------------------------ incidents
export interface ReportIncidentInput extends IncidentInput {
  assigned_to: number | null;
  risk_id: number | null;
}

export function reportIncident(ds: Dataset, v: ReportIncidentInput, actor: Employee): Result<Incident> {
  const d = denied(actor, 'incident.report');
  if (d) return d;
  const errors = validateIncident(v);
  if (Object.keys(errors).length) return fail(errors);
  if (v.assigned_to !== null && !ds.employees.some((e) => e.employee_id === v.assigned_to && e.is_active)) {
    return fail({ assigned_to: 'Choose an active employee.' });
  }
  if (v.risk_id !== null && !ds.risks.some((r) => r.risk_id === v.risk_id)) return fail({ risk_id: 'Risk not found.' });
  const incident_id = nextId(ds.incidents.map((i) => i.incident_id));
  const inc: Incident = {
    incident_id, incident_code: `INC-${pad(incident_id)}`, title: v.title.trim(), description: v.description.trim(),
    severity: v.severity as Incident['severity'], status: 'Open', department_id: v.department_id!,
    reported_by: actor.employee_id, assigned_to: v.assigned_to, risk_id: v.risk_id,
    occurred_at: `${v.occurred_at.slice(0, 16)}:00`, reported_at: nowTs(), resolved_at: null,
  };
  let next: Dataset = { ...ds, incidents: [...ds.incidents, inc] };
  next = { ...next, incident_updates: withUpdate(next, incident_id, actor.employee_id, 'Incident reported', null, 'Open') };
  if (v.assigned_to) {
    const a = ds.employees.find((e) => e.employee_id === v.assigned_to)!;
    next = { ...next, incident_updates: withUpdate(next, incident_id, actor.employee_id, `Assigned to ${a.first_name} ${a.last_name}`, null, null) };
  }
  return { ok: true, data: next, value: inc };
}

export function addIncidentUpdate(
  ds: Dataset, incident_id: number, text: string, to: IncidentStatus | null, actor: Employee,
): Result<Incident> {
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  const d = denied(actor, 'incident.update', inc);
  if (d) return d;
  const errors: Errors = {};
  const textErr = validateNote(text, to && incidentNeedsNote(to) ? 'A resolution note' : 'Update text');
  if (textErr) errors.update_text = textErr;
  if (to && to !== inc.status) {
    if (!canIncidentTransition(inc.status, to)) errors.status_to = `${inc.status} → ${to} is not a valid transition.`;
    else if (to === 'Closed' && !canClose(actor).allowed) errors.status_to = canClose(actor).reason;
  }
  if (Object.keys(errors).length) return fail(errors);
  const change = to && to !== inc.status ? to : null;
  const next: Incident = {
    ...inc,
    status: change ?? inc.status,
    resolved_at: change === 'Resolved' ? nowTs() : change === 'Investigating' ? null : inc.resolved_at,
  };
  return {
    ok: true,
    data: {
      ...ds,
      incidents: ds.incidents.map((i) => (i.incident_id === incident_id ? next : i)),
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text.trim(), change ? inc.status : null, change),
    },
    value: next,
  };
}

export function assignIncident(ds: Dataset, incident_id: number, employee_id: number | null, actor: Employee): Result<Incident> {
  const d = denied(actor, 'incident.assign');
  if (d) return d;
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  if (inc.status === 'Closed') return fail({ _form: 'Closed incidents cannot be reassigned.' });
  const emp = employee_id === null ? null : ds.employees.find((e) => e.employee_id === employee_id && e.is_active);
  if (employee_id !== null && !emp) return fail({ assigned_to: 'Choose an active employee.' });
  if (employee_id === inc.assigned_to) return fail({ assigned_to: 'Incident is already assigned to this person.' });
  const text = emp ? `Assigned to ${emp.first_name} ${emp.last_name}` : 'Assignment removed';
  const next = { ...inc, assigned_to: employee_id };
  return {
    ok: true,
    data: {
      ...ds,
      incidents: ds.incidents.map((i) => (i.incident_id === incident_id ? next : i)),
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text, null, null),
    },
    value: next,
  };
}

export function linkRisk(ds: Dataset, incident_id: number, risk_id: number | null, actor: Employee): Result<Incident> {
  const d = denied(actor, 'incident.link');
  if (d) return d;
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  const risk = risk_id === null ? null : ds.risks.find((r) => r.risk_id === risk_id);
  if (risk_id !== null && !risk) return fail({ risk_id: 'Risk not found.' });
  if (risk_id === inc.risk_id) return fail({ risk_id: 'No change.' });
  const text = risk ? `Linked to risk ${risk.risk_code}` : 'Risk link removed';
  const next = { ...inc, risk_id };
  return {
    ok: true,
    data: {
      ...ds,
      incidents: ds.incidents.map((i) => (i.incident_id === incident_id ? next : i)),
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text, null, null),
    },
    value: next,
  };
}

export const initialData = (): Dataset => structuredClone(seed);
export { DEMO_TODAY };
