import type { Overview } from '@aravalli/shared';
import * as reports from '../repositories/reports';
import * as risks from '../repositories/risks';
import type { Deps } from './deps';

export async function overview(d: Deps, org: number): Promise<Overview> {
  const [kpis, incidentsByStatus, topRisks, recentActivity] = await Promise.all([
    reports.kpis(d.pool, org, d.clock.now()),
    reports.incidentsByStatus(d.pool, org),
    risks.topOpenRisks(d.pool, org, 5),
    reports.recentActivity(d.pool, org, 8),
  ]);
  return { kpis, incidentsByStatus, topRisks, recentActivity };
}

export const heatmap = (d: Deps, org: number, mode: 'current' | 'first') => reports.heatmap(d.pool, org, mode);
export const riskProfile = (d: Deps, org: number) => reports.riskProfileByDepartment(d.pool, org);
export const resolution = (d: Deps, org: number, groupBy: 'severity' | 'department') => reports.resolution(d.pool, org, groupBy);
