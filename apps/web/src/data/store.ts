// All writes go through these functions. They validate, enforce transitions and
// permissions, and return a new Dataset (never mutate). The UI never writes data directly.
// Time comes from the Clock the caller passes in; nothing here reads the real clock.
import {
  type Action,
  type AssessmentInput,
  canClose,
  canIncidentTransition,
  canRiskTransition,
  type Clock,
  computeScore,
  type Dataset,
  type Employee,
  type Errors,
  type Incident,
  type IncidentInput,
  incidentNeedsNote,
  isIncidentFinal,
  type IncidentStatus,
  type IncidentUpdate,
  permit,
  type Risk,
  type RiskAssessment,
  type RiskInput,
  riskNeedsNote,
  type RiskStatus,
  seed,
  validateAssessment,
  validateIncident,
  validateNote,
  validateRisk,
} from '@aravalli/shared';

export type Result<T = unknown> =
  | { ok: true; data: Dataset; value: T }
  | { ok: false; errors: Errors };

const fail = (errors: Errors): { ok: false; errors: Errors } => ({ ok: false, errors });
const stamp = (clock: Clock) => `${clock.now()}:00`;
const code = (n: number) => String(n).padStart(4, '0');
const nextId = (rows: number[]) => (rows.length ? Math.max(...rows) : 0) + 1;

function denied(actor: Employee, action: Action, incident?: Incident) {
  const p = permit(actor, action, incident);
  return p.allowed ? null : fail({ _form: p.reason });
}

function withUpdate(
  ds: Dataset, incident_id: number, by: number, text: string,
  from: IncidentStatus | null, to: IncidentStatus | null, clock: Clock,
): IncidentUpdate[] {
  const u: IncidentUpdate = {
    update_id: nextId(ds.incident_updates.map((x) => x.update_id)),
    organisation_id: ds.organisation.organisation_id, incident_id, updated_by: by,
    update_text: text, status_from: from, status_to: to, created_at: stamp(clock),
  };
  return [...ds.incident_updates, u];
}

export const hasAssessment = (ds: Dataset, risk_id: number) =>
  ds.risk_assessments.some((a) => a.risk_id === risk_id);

// ---------------------------------------------------------------------- risks
export function registerRisk(ds: Dataset, v: RiskInput, actor: Employee, clock: Clock): Result<Risk> {
  const d = denied(actor, 'risk.register');
  if (d) return d;
  const errors = validateRisk(v, ds.employees, clock.today());
  if (Object.keys(errors).length) return fail(errors);
  const organisation_id = ds.organisation.organisation_id;
  const risk_id = nextId(ds.risks.map((r) => r.risk_id));
  const assessed = v.likelihood !== null && v.impact !== null;
  const risk: Risk = {
    risk_id, organisation_id, risk_code: `RSK-${code(risk_id)}`, title: v.title.trim(), description: v.description.trim(),
    category: v.category as Risk['category'], department_id: v.department_id!, owner_employee_id: v.owner_employee_id!,
    status: assessed ? 'Assessed' : 'Identified', identified_date: v.identified_date,
    created_at: stamp(clock), updated_at: stamp(clock),
  };
  const assessments = [...ds.risk_assessments];
  if (assessed) {
    assessments.push({
      assessment_id: nextId(ds.risk_assessments.map((a) => a.assessment_id)), organisation_id, risk_id, assessed_by: actor.employee_id,
      assessment_date: v.identified_date, likelihood: v.likelihood!, impact: v.impact!,
      risk_score: computeScore(v.likelihood!, v.impact!), mitigation_notes: v.mitigation_notes.trim() || null,
      created_at: stamp(clock),
    });
  }
  return { ok: true, data: { ...ds, risks: [...ds.risks, risk], risk_assessments: assessments }, value: risk };
}

export function addAssessment(ds: Dataset, risk_id: number, v: AssessmentInput, actor: Employee, clock: Clock): Result<RiskAssessment> {
  const d = denied(actor, 'risk.assess');
  if (d) return d;
  const risk = ds.risks.find((r) => r.risk_id === risk_id);
  if (!risk) return fail({ _form: 'Risk not found.' });
  const errors = validateAssessment(v, clock.today());
  if (v.assessment_date && v.assessment_date < risk.identified_date) errors.assessment_date = 'Assessment cannot predate the date the risk was identified.';
  if (Object.keys(errors).length) return fail(errors);
  const a: RiskAssessment = {
    assessment_id: nextId(ds.risk_assessments.map((x) => x.assessment_id)), organisation_id: ds.organisation.organisation_id,
    risk_id, assessed_by: actor.employee_id,
    assessment_date: v.assessment_date, likelihood: v.likelihood!, impact: v.impact!,
    risk_score: computeScore(v.likelihood!, v.impact!), mitigation_notes: v.mitigation_notes.trim() || null,
    created_at: stamp(clock),
  };
  const risks = ds.risks.map((r) =>
    r.risk_id === risk_id
      ? { ...r, status: (r.status === 'Identified' ? 'Assessed' : r.status) as RiskStatus, updated_at: stamp(clock) }
      : r);
  return { ok: true, data: { ...ds, risks, risk_assessments: [...ds.risk_assessments, a] }, value: a };
}

export function changeRiskStatus(ds: Dataset, risk_id: number, to: RiskStatus, note: string, actor: Employee, clock: Clock): Result<Risk> {
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
  const next = { ...risk, status: to, updated_at: stamp(clock) };
  return { ok: true, data: { ...ds, risks: ds.risks.map((r) => (r.risk_id === risk_id ? next : r)) }, value: next };
}

// ------------------------------------------------------------------ incidents
export interface ReportIncidentInput extends IncidentInput {
  assigned_to: number | null;
  risk_id: number | null;
}

export function reportIncident(ds: Dataset, v: ReportIncidentInput, actor: Employee, clock: Clock): Result<Incident> {
  const d = denied(actor, 'incident.report');
  if (d) return d;
  const errors = validateIncident(v, clock.now());
  if (Object.keys(errors).length) return fail(errors);
  if (v.assigned_to !== null && !ds.employees.some((e) => e.employee_id === v.assigned_to && e.is_active)) {
    return fail({ assigned_to: 'Choose an active employee.' });
  }
  if (v.risk_id !== null && !ds.risks.some((r) => r.risk_id === v.risk_id)) return fail({ risk_id: 'Risk not found.' });
  const incident_id = nextId(ds.incidents.map((i) => i.incident_id));
  const inc: Incident = {
    incident_id, organisation_id: ds.organisation.organisation_id, incident_code: `INC-${code(incident_id)}`,
    title: v.title.trim(), description: v.description.trim(),
    severity: v.severity as Incident['severity'], status: 'Open', department_id: v.department_id!,
    reported_by: actor.employee_id, assigned_to: v.assigned_to, risk_id: v.risk_id,
    occurred_at: `${v.occurred_at.slice(0, 16)}:00`, reported_at: stamp(clock), resolved_at: null,
  };
  let next: Dataset = { ...ds, incidents: [...ds.incidents, inc] };
  next = { ...next, incident_updates: withUpdate(next, incident_id, actor.employee_id, 'Incident reported', null, 'Open', clock) };
  if (v.assigned_to) {
    const a = ds.employees.find((e) => e.employee_id === v.assigned_to)!;
    next = { ...next, incident_updates: withUpdate(next, incident_id, actor.employee_id, `Assigned to ${a.first_name} ${a.last_name}`, null, null, clock) };
  }
  return { ok: true, data: next, value: inc };
}

export function addIncidentUpdate(
  ds: Dataset, incident_id: number, text: string, to: IncidentStatus | null, actor: Employee, clock: Clock,
): Result<Incident> {
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  const d = denied(actor, 'incident.update', inc);
  if (d) return d;
  if (isIncidentFinal(inc.status)) return fail({ _form: 'Closed incidents are final.' });
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
    resolved_at: change === 'Resolved' ? stamp(clock) : change === 'Investigating' ? null : inc.resolved_at,
  };
  return {
    ok: true,
    data: {
      ...ds,
      incidents: ds.incidents.map((i) => (i.incident_id === incident_id ? next : i)),
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text.trim(), change ? inc.status : null, change, clock),
    },
    value: next,
  };
}

export function assignIncident(ds: Dataset, incident_id: number, employee_id: number | null, actor: Employee, clock: Clock): Result<Incident> {
  const d = denied(actor, 'incident.assign');
  if (d) return d;
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  if (isIncidentFinal(inc.status)) return fail({ _form: 'Closed incidents are final.' });
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
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text, null, null, clock),
    },
    value: next,
  };
}

export function linkRisk(ds: Dataset, incident_id: number, risk_id: number | null, actor: Employee, clock: Clock): Result<Incident> {
  const d = denied(actor, 'incident.link');
  if (d) return d;
  const inc = ds.incidents.find((i) => i.incident_id === incident_id);
  if (!inc) return fail({ _form: 'Incident not found.' });
  if (isIncidentFinal(inc.status)) return fail({ _form: 'Closed incidents are final.' });
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
      incident_updates: withUpdate(ds, incident_id, actor.employee_id, text, null, null, clock),
    },
    value: next,
  };
}

/** A fresh copy of the sample organisation's data. */
export const initialData = (): Dataset => structuredClone(seed);
