import {
  canRiskTransition, inScope, permit, riskNeedsNote, validateAssessment, validateNote, validateRisk,
  type AssessmentInput, type RiskDetail, type RiskInput, type RiskStatus,
} from '@aravalli/shared';
import type { RequestContext } from '../core/context';
import { withTransaction } from '../core/db';
import { AppError, notFound, validationFailed } from '../core/errors';
import * as counters from '../repositories/counters';
import * as directory from '../repositories/directory';
import * as repo from '../repositories/risks';
import { stamp, type Deps } from './deps';

export const listRisks = (d: Deps, ctx: RequestContext, filters: repo.RiskFilters, ...rest: [string, boolean, number, number]) =>
  repo.listRisks(d.pool, ctx.organisationId, { ...filters, scope: ctx.scope }, ...rest);

/** A risk the caller may not see is reported as not found, exactly like one that belongs to another organisation. */
function visible(ctx: RequestContext, risk: RiskDetail | undefined): RiskDetail {
  if (!risk || !inScope(ctx.scope, { department_id: risk.department_id })) throw notFound('Risk');
  return risk;
}

export async function getRisk(d: Deps, ctx: RequestContext, id: number): Promise<RiskDetail> {
  return visible(ctx, await repo.getRisk(d.pool, ctx.organisationId, id));
}

export async function getRiskByCode(d: Deps, ctx: RequestContext, code: string): Promise<RiskDetail> {
  return visible(ctx, await repo.getRiskByCode(d.pool, ctx.organisationId, code));
}

export async function listAssessments(d: Deps, ctx: RequestContext, riskId: number) {
  await getRisk(d, ctx, riskId);
  return repo.listAssessments(d.pool, ctx.organisationId, riskId);
}

function denied(actorPermit: { allowed: boolean; reason?: string }) {
  if (!actorPermit.allowed) throw new AppError('forbidden', actorPermit.reason ?? 'Not allowed.');
}

export async function registerRisk(d: Deps, ctx: RequestContext, input: RiskInput): Promise<RiskDetail> {
  const org = ctx.organisationId;
  denied(permit(ctx.actor, 'risk.register', input.department_id ? { department_id: input.department_id } : undefined));
  const owner = input.owner_employee_id ? await directory.getEmployee(d.pool, org, input.owner_employee_id) : undefined;
  const errors = validateRisk(input, owner ? [owner] : [], d.clock.today());
  if (input.department_id && !(await directory.getDepartment(d.pool, org, input.department_id))) errors.department_id = 'Choose a department from this organisation.';
  if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);

  const assessed = input.likelihood !== null && input.impact !== null;
  const now = stamp(d.clock);
  const riskId = await withTransaction(d.pool, async (conn) => {
    const code = await counters.nextCode(conn, org, 'risk');
    const id = await repo.insertRisk(conn, org, {
      code,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      department_id: input.department_id!,
      owner_employee_id: input.owner_employee_id!,
      status: assessed ? 'Assessed' : 'Identified',
      identified_date: input.identified_date,
      stamp: now,
    });
    if (assessed) {
      await repo.insertAssessment(conn, org, {
        risk_id: id, assessed_by: ctx.actorId, assessment_date: input.identified_date, likelihood: input.likelihood!, impact: input.impact!,
        mitigation_notes: input.mitigation_notes.trim() || null, stamp: now,
      });
    }
    return id;
  });
  return getRisk(d, ctx, riskId);
}

export async function addAssessment(d: Deps, ctx: RequestContext, riskId: number, input: AssessmentInput): Promise<RiskDetail> {
  const org = ctx.organisationId;
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const risk = await repo.lockRisk(conn, org, riskId);
    if (!risk || !inScope(ctx.scope, { department_id: risk.department_id })) throw notFound('Risk');
    denied(permit(ctx.actor, 'risk.assess', { department_id: risk.department_id }));
    const errors = validateAssessment(input, d.clock.today());
    if (input.assessment_date && input.assessment_date < risk.identified_date) errors.assessment_date = 'Assessment cannot predate the date the risk was identified.';
    if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
    await repo.insertAssessment(conn, org, {
      risk_id: riskId, assessed_by: ctx.actorId, assessment_date: input.assessment_date, likelihood: input.likelihood!, impact: input.impact!,
      mitigation_notes: input.mitigation_notes.trim() || null, stamp: now,
    });
    // The score is computed by the database (generated column); this only advances the lifecycle.
    await repo.setRiskStatus(conn, org, riskId, risk.status === 'Identified' ? 'Assessed' : risk.status, now);
  });
  return getRisk(d, ctx, riskId);
}

export async function changeStatus(d: Deps, ctx: RequestContext, riskId: number, to: RiskStatus, note: string): Promise<RiskDetail> {
  const org = ctx.organisationId;
  await withTransaction(d.pool, async (conn) => {
    const risk = await repo.lockRisk(conn, org, riskId);
    if (!risk || !inScope(ctx.scope, { department_id: risk.department_id })) throw notFound('Risk');
    denied(permit(ctx.actor, 'risk.status', { department_id: risk.department_id }));
    const assessed = (await repo.countAssessments(conn, org, riskId)) > 0;
    if (!canRiskTransition(risk.status, to, assessed)) throw validationFailed({ status: `${risk.status} → ${to} is not a valid transition.` });
    if (riskNeedsNote(to)) {
      const n = validateNote(note, 'A closure note');
      if (n) throw validationFailed({ note: n });
    }
    await repo.setRiskStatus(conn, org, riskId, to, stamp(d.clock));
  });
  return getRisk(d, ctx, riskId);
}
