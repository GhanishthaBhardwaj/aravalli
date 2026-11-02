import { describe, expect, it } from 'vitest';
import { bandFor, computeScore } from './scoring';
import {
  canIncidentTransition, canRiskTransition, incidentNeedsNote, riskNeedsNote, riskTransitions,
} from './transitions';
import { INCIDENT_STATUSES, RISK_STATUSES } from './types';
import { validateAssessment, validateIncident, validateRisk } from './validation';
import type { RiskInput } from './validation';
import { seed } from '../data/seed';

describe('scoring', () => {
  it('multiplies likelihood by impact', () => expect(computeScore(4, 5)).toBe(20));
  it.each([
    [1, 'Low'], [4, 'Low'], [5, 'Medium'], [9, 'Medium'], [10, 'High'], [16, 'High'], [20, 'Critical'], [25, 'Critical'],
  ])('score %i is %s', (s, b) => expect(bandFor(s)).toBe(b));
  it('every reachable score maps to a band', () => {
    for (let l = 1; l <= 5; l++) for (let i = 1; i <= 5; i++) expect(bandFor(l * i)).toBeTruthy();
  });
});

describe('incident transitions', () => {
  const allowed = new Set(['Open>Investigating', 'Investigating>Contained', 'Investigating>Resolved', 'Contained>Resolved', 'Resolved>Closed', 'Resolved>Investigating']);
  for (const from of INCIDENT_STATUSES) {
    for (const to of INCIDENT_STATUSES) {
      it(`${from} → ${to} is ${allowed.has(`${from}>${to}`) ? 'allowed' : 'rejected'}`, () => {
        expect(canIncidentTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
      });
    }
  }
  it('requires a note only for Resolved', () => {
    expect(incidentNeedsNote('Resolved')).toBe(true);
    expect(incidentNeedsNote('Closed')).toBe(false);
  });
});

describe('risk transitions', () => {
  const allowed = new Set(['Identified>Assessed', 'Assessed>Mitigating', 'Assessed>Monitoring', 'Mitigating>Monitoring', 'Monitoring>Mitigating', 'Closed>Monitoring']);
  for (const from of RISK_STATUSES) {
    for (const to of RISK_STATUSES) {
      it(`${from} → ${to}`, () => {
        const expected = allowed.has(`${from}>${to}`) || (to === 'Closed' && from !== 'Closed');
        expect(canRiskTransition(from, to, true)).toBe(expected);
      });
    }
  }
  it('Identified → Assessed requires an assessment', () => {
    expect(canRiskTransition('Identified', 'Assessed', false)).toBe(false);
    expect(riskTransitions('Identified', false)).toEqual(['Closed']);
  });
  it('closing requires a note', () => expect(riskNeedsNote('Closed')).toBe(true));
});

describe('validators', () => {
  const base: RiskInput = {
    title: 'A valid risk title', description: 'desc', category: 'Operational', department_id: 3,
    owner_employee_id: 9, identified_date: '2026-10-01', likelihood: null, impact: null, mitigation_notes: '',
  };
  it('accepts a valid risk', () => expect(validateRisk(base, seed.employees)).toEqual({}));
  it('rejects short and long titles', () => {
    expect(validateRisk({ ...base, title: 'abc' }, seed.employees).title).toBeTruthy();
    expect(validateRisk({ ...base, title: 'x'.repeat(151) }, seed.employees).title).toBeTruthy();
  });
  it('rejects a future identified date', () => {
    expect(validateRisk({ ...base, identified_date: '2026-10-21' }, seed.employees).identified_date).toBeTruthy();
  });
  it('rejects an owner outside the department', () => {
    expect(validateRisk({ ...base, owner_employee_id: 1 }, seed.employees).owner_employee_id).toBeTruthy();
  });
  it('requires both likelihood and impact when assessing', () => {
    expect(validateRisk({ ...base, likelihood: 3 }, seed.employees).impact).toBeTruthy();
  });
  it('validates assessments', () => {
    expect(validateAssessment({ likelihood: null, impact: 3, assessment_date: '2026-10-01', mitigation_notes: '' }).likelihood).toBeTruthy();
    expect(validateAssessment({ likelihood: 2, impact: 3, assessment_date: '2026-11-01', mitigation_notes: '' }).assessment_date).toBeTruthy();
    expect(validateAssessment({ likelihood: 2, impact: 3, assessment_date: '2026-10-01', mitigation_notes: '' })).toEqual({});
  });
  it('validates incidents, including future occurrence', () => {
    const ok = { title: 'Valid incident', description: 'd', severity: 'High', department_id: 1, occurred_at: '2026-10-19T09:00' };
    expect(validateIncident(ok)).toEqual({});
    expect(validateIncident({ ...ok, occurred_at: '2026-10-21T09:00' }).occurred_at).toBeTruthy();
    expect(validateIncident({ ...ok, severity: 'Extreme' }).severity).toBeTruthy();
  });
});
