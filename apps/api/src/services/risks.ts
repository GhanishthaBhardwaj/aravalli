import {
  canRiskTransition, permit, riskNeedsNote, validateAssessment, validateNote, validateRisk,
  type AssessmentInput, type RiskDetail, type RiskInput, type RiskStatus,
} from '@aravalli/shared';
import { withTransaction } from '../core/db';
import { AppError, notFound, validationFailed } from '../core/errors';
import * as counters from '../repositories/counters';
import * as directory from '../repositories/directory';
import * as repo from '../repositories/risks';
import { actorFor, stamp, type Deps } from './deps';

export const listRisks = (d: Deps, org: number, ...args: [repo.RiskFilters, string, boolean, number, number]) => repo.listRisks(d.pool, org, ...args);

export async function getRisk(d: Deps, org: number, id: number): Promise<RiskDetail> {
  return (await repo.getRisk(d.pool, org, id)) ?? Promise.reject(notFound('Risk'));
}

export async function getRiskByCode(d: Deps, org: number, code: string): Promise<RiskDetail> {
  return (await repo.getRiskByCode(d.pool, org, code)) ?? Promise.reject(notFound('Risk'));
}

export async function listAssessments(d: Deps, org: number, riskId: number) {
  await getRisk(d, org, riskId);
  return repo.listAssessments(d.pool, org, riskId);
}

function denied(actorPermit: { allowed: boolean; reason?: string }) {
  if (!actorPermit.allowed) throw new AppError('forbidden', actorPermit.reason ?? 'Not allowed.');
}

export async function registerRisk(d: Deps, org: number, actorId: number, input: RiskInput): Promise<RiskDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'risk.register'));
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
        risk_id: id, assessed_by: actorId, assessment_date: input.identified_date, likelihood: input.likelihood!, impact: input.impact!,
        mitigation_notes: input.mitigation_notes.trim() || null, stamp: now,
      });
    }
    return id;
  });
  return getRisk(d, org, riskId);
}

export async function addAssessment(d: Deps, org: number, actorId: number, riskId: number, input: AssessmentInput): Promise<RiskDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'risk.assess'));
  const now = stamp(d.clock);
  await withTransaction(d.pool, async (conn) => {
    const risk = await repo.lockRisk(conn, org, riskId);
    if (!risk) throw notFound('Risk');
    const errors = validateAssessment(input, d.clock.today());
    if (input.assessment_date && input.assessment_date < risk.identified_date) errors.assessment_date = 'Assessment cannot predate the date the risk was identified.';
    if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
    await repo.insertAssessment(conn, org, {
      risk_id: riskId, assessed_by: actorId, assessment_date: input.assessment_date, likelihood: input.likelihood!, impact: input.impact!,
      mitigation_notes: input.mitigation_notes.trim() || null, stamp: now,
    });
    // The score is computed by the database (generated column); this only advances the lifecycle.
    await repo.setRiskStatus(conn, org, riskId, risk.status === 'Identified' ? 'Assessed' : risk.status, now);
  });
  return getRisk(d, org, riskId);
}

export async function changeStatus(d: Deps, org: number, actorId: number, riskId: number, to: RiskStatus, note: string): Promise<RiskDetail> {
  const actor = await actorFor(d.pool, org, actorId);
  denied(permit(actor, 'risk.status'));
  await withTransaction(d.pool, async (conn) => {
    const risk = await repo.lockRisk(conn, org, riskId);
    if (!risk) throw notFound('Risk');
    const assessed = (await repo.countAssessments(conn, org, riskId)) > 0;
    if (!canRiskTransition(risk.status, to, assessed)) throw validationFailed({ status: `${risk.status} → ${to} is not a valid transition.` });
    if (riskNeedsNote(to)) {
      const n = validateNote(note, 'A closure note');
      if (n) throw validationFailed({ note: n });
    }
    await repo.setRiskStatus(conn, org, riskId, to, stamp(d.clock));
  });
  return getRisk(d, org, riskId);
}
