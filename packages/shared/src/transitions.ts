import type { IncidentStatus, RiskStatus } from './types';

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  Open: ['Investigating'],
  Investigating: ['Contained', 'Resolved'],
  Contained: ['Resolved'],
  Resolved: ['Closed', 'Investigating'],
  Closed: [],
};

export function canIncidentTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

/** A resolution note is mandatory when moving to Resolved. */
export const incidentNeedsNote = (to: IncidentStatus): boolean => to === 'Resolved';

/** Valid next risk statuses. `hasAssessment` gates Identified → Assessed. */
export function riskTransitions(from: RiskStatus, hasAssessment: boolean): RiskStatus[] {
  switch (from) {
    case 'Identified':
      return hasAssessment ? ['Assessed', 'Closed'] : ['Closed'];
    case 'Assessed':
      return ['Mitigating', 'Monitoring', 'Closed'];
    case 'Mitigating':
      return ['Monitoring', 'Closed'];
    case 'Monitoring':
      return ['Mitigating', 'Closed'];
    case 'Closed':
      return ['Monitoring'];
  }
}

export const canRiskTransition = (from: RiskStatus, to: RiskStatus, hasAssessment: boolean): boolean =>
  riskTransitions(from, hasAssessment).includes(to);

/** Closing a risk requires a note. */
export const riskNeedsNote = (to: RiskStatus): boolean => to === 'Closed';
