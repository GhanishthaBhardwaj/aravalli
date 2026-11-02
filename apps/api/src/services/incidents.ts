import {
  canClose, canIncidentTransition, incidentNeedsNote, isIncidentFinal, permit, validateIncident, validateNote,
  type Errors, type IncidentDetail, type IncidentInput, type IncidentStatus,
} from '@aravalli/shared';
import { withTransaction } from '../core/db';
import { AppError, notFound, validationFailed } from '../core/errors';
import * as counters from '../repositories/counters';
import * as directory from '../repositories/directory';
import * as repo from '../repositories/incidents';
import * as risks from '../repositories/risks';
import { actorFor, stamp, type Deps } from './deps';

export const listIncidents = (d: Deps, org: number, ...args: [repo.IncidentFilters, string, boolean, number, number]) => repo.listIncidents(d.pool, org, ...args);

export async function getIncident(d: Deps, org: number, id: number): Promise<IncidentDetail> {
  const incident = await repo.getIncident(d.pool, org, id);
  if (!incident) throw notFound('Incident');
  return { ...incident, updates: (await repo.listUpdates(d.pool, org, id)) as IncidentDetail['updates'] };
}

export async function getIncidentByCode(d: Deps, org: number, code: string): Promise<IncidentDetail> {
  const id = await repo.findIncidentIdByCode(d.pool, org, code);
  if (id === undefined) throw notFound('Incident');
  return getIncident(d, org, id);
}

export async function listUpdates(d: Deps, org: number, id: number) {
  await getIncident(d, org, id);
  return repo.listUpdates(d.pool, org, id);
}

function denied(p: { allowed: boolean; reason?: string }) {
  if (!p.allowed) throw new AppError('forbidden', p.reason ?? 'Not allowed.');
}

export interface ReportIncidentInput extends IncidentInput {
  assigned_to: number | null;
  risk_id: number | null;
}

export async function reportIncident(d: Deps, org: number, actorId: number, input: ReportIncidentInput): Promise<IncidentDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'incident.report'));
  const errors: Errors = validateIncident(input, d.clock.now());
  if (input.department_id && !(await directory.getDepartment(d.pool, org, input.department_id))) errors.department_id = 'Choose a department from this organisation.';
  let assignee = null;
  if (input.assigned_to !== null) {
    assignee = await directory.getEmployee(d.pool, org, input.assigned_to);
    if (!assignee?.is_active) errors.assigned_to = 'Choose an active employee.';
  }
  if (input.risk_id !== null && !(await risks.getRisk(d.pool, org, input.risk_id))) errors.risk_id = 'Risk not found.';
  if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);

  const now = stamp(d.clock);
  const id = await withTransaction(d.pool, async (conn) => {
    const code = await counters.nextCode(conn, org, 'incident');
    const incidentId = await repo.insertIncident(conn, org, {
      code,
      title: input.title.trim(),
      description: input.description.trim(),
      severity: input.severity,
      department_id: input.department_id!,
      reported_by: actorId,
      assigned_to: input.assigned_to,
      risk_id: input.risk_id,
      occurred_at: `${input.occurred_at.slice(0, 16).replace('T', ' ')}:00`,
      reported_at: now,
    });
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text: 'Incident reported', from: null, to: 'Open', at: now });
    if (assignee) {
      await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text: `Assigned to ${assignee.first_name} ${assignee.last_name}`, from: null, to: null, at: now });
    }
    return incidentId;
  });
  return getIncident(d, org, id);
}

export async function addUpdate(d: Deps, org: number, actorId: number, incidentId: number, text: string, to: IncidentStatus | null): Promise<IncidentDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc) throw notFound('Incident');
    denied(permit(actor, 'incident.update', { reported_by: inc.reported_by, assigned_to: inc.assigned_to } as never));
    if (isIncidentFinal(inc.status)) throw new AppError('conflict', 'Closed incidents are final.');
    const errors: Errors = {};
    const textErr = validateNote(text, to && incidentNeedsNote(to) ? 'A resolution note' : 'Update text');
    if (textErr) errors.update_text = textErr;
    if (to && to !== inc.status) {
      if (!canIncidentTransition(inc.status, to)) errors.status_to = `${inc.status} → ${to} is not a valid transition.`;
      else if (to === 'Closed' && !canClose(actor).allowed) errors.status_to = canClose(actor).reason;
    }
    if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
    const change = to && to !== inc.status ? to : null;
    if (change) {
      // Resolving stamps the time, reopening clears it, every other move keeps it (the database CHECK enforces the pairing).
      const resolvedAt = change === 'Resolved' ? now : change === 'Investigating' ? null : inc.resolved_at;
      await repo.setStatus(conn, org, incidentId, change, resolvedAt);
    }
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text: text.trim(), from: change ? inc.status : null, to: change, at: now });
  });
  return getIncident(d, org, incidentId);
}

export async function assign(d: Deps, org: number, actorId: number, incidentId: number, employeeId: number | null): Promise<IncidentDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'incident.assign'));
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc) throw notFound('Incident');
    if (isIncidentFinal(inc.status)) throw new AppError('conflict', 'Closed incidents are final.');
    const person = employeeId === null ? null : await directory.getEmployee(conn, org, employeeId);
    if (employeeId !== null && !person?.is_active) throw validationFailed({ assigned_to: 'Choose an active employee.' });
    if (employeeId === inc.assigned_to) throw validationFailed({ assigned_to: 'Incident is already assigned to this person.' });
    await repo.setAssignee(conn, org, incidentId, employeeId);
    const text = person ? `Assigned to ${person.first_name} ${person.last_name}` : 'Assignment removed';
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text, from: null, to: null, at: now });
  });
  return getIncident(d, org, incidentId);
}

export async function linkRisk(d: Deps, org: number, actorId: number, incidentId: number, riskId: number | null): Promise<IncidentDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'incident.link'));
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc) throw notFound('Incident');
    if (isIncidentFinal(inc.status)) throw new AppError('conflict', 'Closed incidents are final.');
    const risk = riskId === null ? null : await risks.getRisk(conn, org, riskId);
    if (riskId !== null && !risk) throw validationFailed({ risk_id: 'Risk not found.' });
    if (riskId === inc.risk_id) throw validationFailed({ risk_id: 'No change.' });
    await repo.setRiskLink(conn, org, incidentId, riskId);
    const text = risk ? `Linked to risk ${risk.risk_code}` : 'Risk link removed';
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text, from: null, to: null, at: now });
  });
  return getIncident(d, org, incidentId);
}
