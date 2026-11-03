import {
  canClose, canIncidentTransition, incidentNeedsNote, inScope, isIncidentFinal, permit, validateIncident, validateNote,
  type Errors, type IncidentDetail, type IncidentInput, type IncidentStatus,
} from '@aravalli/shared';
import type { RequestContext } from '../core/context';
import { withTransaction } from '../core/db';
import { AppError, notFound, validationFailed } from '../core/errors';
import * as counters from '../repositories/counters';
import * as directory from '../repositories/directory';
import * as repo from '../repositories/incidents';
import * as risks from '../repositories/risks';
import { stamp, type Deps } from './deps';

export const listIncidents = (d: Deps, ctx: RequestContext, filters: repo.IncidentFilters, ...rest: [string, boolean, number, number]) =>
  repo.listIncidents(d.pool, ctx.organisationId, { ...filters, scope: ctx.scope }, ...rest);

/** An incident the caller may not see is reported as not found, exactly like one that belongs to another organisation. */
export async function getIncident(d: Deps, ctx: RequestContext, id: number): Promise<IncidentDetail> {
  const org = ctx.organisationId;
  const incident = await repo.getIncident(d.pool, org, id);
  if (!incident || !inScope(ctx.scope, incident)) throw notFound('Incident');
  return { ...incident, updates: (await repo.listUpdates(d.pool, org, id)) as IncidentDetail['updates'] };
}

export async function getIncidentByCode(d: Deps, ctx: RequestContext, code: string): Promise<IncidentDetail> {
  const id = await repo.findIncidentIdByCode(d.pool, ctx.organisationId, code);
  if (id === undefined) throw notFound('Incident');
  return getIncident(d, ctx, id);
}

export async function listUpdates(d: Deps, ctx: RequestContext, id: number) {
  await getIncident(d, ctx, id);
  return repo.listUpdates(d.pool, ctx.organisationId, id);
}

function denied(p: { allowed: boolean; reason?: string }) {
  if (!p.allowed) throw new AppError('forbidden', p.reason ?? 'Not allowed.');
}

export interface ReportIncidentInput extends IncidentInput {
  assigned_to: number | null;
  risk_id: number | null;
}

export async function reportIncident(d: Deps, ctx: RequestContext, input: ReportIncidentInput): Promise<IncidentDetail> {
  const org = ctx.organisationId;
  const actorId = ctx.actorId;
  const actor = ctx.actor;
  denied(permit(actor, 'incident.report', actor.role === 'Department Head' && input.department_id ? { department_id: input.department_id } : undefined));
  // reporting is open to everyone who may report, but assigning and linking are separate rights
  if (input.assigned_to !== null) denied(permit(actor, 'incident.assign'));
  if (input.risk_id !== null) denied(permit(actor, 'incident.link'));
  const errors: Errors = validateIncident(input, d.clock.now());
  if (input.department_id && !(await directory.getDepartment(d.pool, org, input.department_id))) errors.department_id = 'Choose a department from this organisation.';
  let assignee = null;
  if (input.assigned_to !== null) {
    assignee = await directory.getEmployee(d.pool, org, input.assigned_to);
    if (!assignee?.is_active) errors.assigned_to = 'Choose an active employee.';
    else if (actor.role === 'Department Head' && assignee.department_id !== actor.department_id) errors.assigned_to = 'Choose someone from your own department.';
  }
  if (input.risk_id !== null) {
    const risk = await risks.getRisk(d.pool, org, input.risk_id);
    if (!risk || !inScope(ctx.scope, { department_id: risk.department_id })) errors.risk_id = 'Risk not found.';
  }
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
  return getIncident(d, ctx, id);
}

export async function addUpdate(d: Deps, ctx: RequestContext, incidentId: number, text: string, to: IncidentStatus | null): Promise<IncidentDetail> {
  const org = ctx.organisationId;
  const actorId = ctx.actorId;
  const actor = ctx.actor;
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc) throw notFound('Incident');
    if (!inScope(ctx.scope, inc)) throw notFound('Incident');
    denied(permit(actor, 'incident.update', inc));
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
  return getIncident(d, ctx, incidentId);
}

export async function assign(d: Deps, ctx: RequestContext, incidentId: number, employeeId: number | null): Promise<IncidentDetail> {
  const org = ctx.organisationId;
  const actorId = ctx.actorId;
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc || !inScope(ctx.scope, inc)) throw notFound('Incident');
    denied(permit(ctx.actor, 'incident.assign', inc));
    if (isIncidentFinal(inc.status)) throw new AppError('conflict', 'Closed incidents are final.');
    const person = employeeId === null ? null : await directory.getEmployee(conn, org, employeeId);
    if (employeeId !== null && !person?.is_active) throw validationFailed({ assigned_to: 'Choose an active employee.' });
    if (person && ctx.role === 'Department Head' && person.department_id !== ctx.departmentId) throw validationFailed({ assigned_to: 'Choose someone from your own department.' });
    if (employeeId === inc.assigned_to) throw validationFailed({ assigned_to: 'Incident is already assigned to this person.' });
    await repo.setAssignee(conn, org, incidentId, employeeId);
    const text = person ? `Assigned to ${person.first_name} ${person.last_name}` : 'Assignment removed';
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text, from: null, to: null, at: now });
  });
  return getIncident(d, ctx, incidentId);
}

export async function linkRisk(d: Deps, ctx: RequestContext, incidentId: number, riskId: number | null): Promise<IncidentDetail> {
  const org = ctx.organisationId;
  const actorId = ctx.actorId;
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const inc = await repo.lockIncident(conn, org, incidentId);
    if (!inc || !inScope(ctx.scope, inc)) throw notFound('Incident');
    denied(permit(ctx.actor, 'incident.link', inc));
    if (isIncidentFinal(inc.status)) throw new AppError('conflict', 'Closed incidents are final.');
    const risk = riskId === null ? null : await risks.getRisk(conn, org, riskId);
    if (riskId !== null && (!risk || !inScope(ctx.scope, { department_id: risk.department_id }))) throw validationFailed({ risk_id: 'Risk not found.' });
    if (riskId === inc.risk_id) throw validationFailed({ risk_id: 'No change.' });
    await repo.setRiskLink(conn, org, incidentId, riskId);
    const text = risk ? `Linked to risk ${risk.risk_code}` : 'Risk link removed';
    await repo.insertUpdate(conn, org, { incident_id: incidentId, updated_by: actorId, text, from: null, to: null, at: now });
  });
  return getIncident(d, ctx, incidentId);
}
