import { describe, expect, it } from 'vitest';
import { bandFor, computeScore } from './scoring';
import {
  canIncidentTransition, canRiskTransition, incidentNeedsNote, riskNeedsNote, riskTransitions,
} from './transitions';
import { INCIDENT_STATUSES, RISK_STATUSES } from './types';
import { validateAssessment, validateIncident, validateRisk } from './validation';
import type { RiskInput } from './validation';
import { seed } from './demo/seed';
import { DEMO_CLOCK, fixedClock, systemClock } from './clock';
import { ROLES } from './types';

const TODAY = DEMO_CLOCK.today();
const NOW = DEMO_CLOCK.now();

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
  it('accepts a valid risk', () => expect(validateRisk(base, seed.employees, TODAY)).toEqual({}));
  it('rejects short and long titles', () => {
    expect(validateRisk({ ...base, title: 'abc' }, seed.employees, TODAY).title).toBeTruthy();
    expect(validateRisk({ ...base, title: 'x'.repeat(151) }, seed.employees, TODAY).title).toBeTruthy();
  });
  it('rejects a future identified date', () => {
    expect(validateRisk({ ...base, identified_date: '2026-10-21' }, seed.employees, TODAY).identified_date).toBeTruthy();
  });
  it('accepts an owner from a different department (a Risk Officer can own risks across departments)', () => {
    expect(validateRisk({ ...base, owner_employee_id: 1 }, seed.employees, TODAY)).toEqual({});
  });
  it('rejects an unknown or inactive owner', () => {
    expect(validateRisk({ ...base, owner_employee_id: 9999 }, seed.employees, TODAY).owner_employee_id).toBeTruthy();
    const inactive = seed.employees.map((e) => (e.employee_id === 9 ? { ...e, is_active: false } : e));
    expect(validateRisk(base, inactive, TODAY).owner_employee_id).toBeTruthy();
  });
  it('requires both likelihood and impact when assessing', () => {
    expect(validateRisk({ ...base, likelihood: 3 }, seed.employees, TODAY).impact).toBeTruthy();
  });
  it('validates assessments', () => {
    expect(validateAssessment({ likelihood: null, impact: 3, assessment_date: '2026-10-01', mitigation_notes: '' }, TODAY).likelihood).toBeTruthy();
    expect(validateAssessment({ likelihood: 2, impact: 3, assessment_date: '2026-11-01', mitigation_notes: '' }, TODAY).assessment_date).toBeTruthy();
    expect(validateAssessment({ likelihood: 2, impact: 3, assessment_date: '2026-10-01', mitigation_notes: '' }, TODAY)).toEqual({});
  });
  it('validates incidents, including future occurrence', () => {
    const ok = { title: 'Valid incident', description: 'd', severity: 'High', department_id: 1, occurred_at: '2026-10-19T09:00' };
    expect(validateIncident(ok, NOW)).toEqual({});
    expect(validateIncident({ ...ok, occurred_at: '2026-10-21T09:00' }, NOW).occurred_at).toBeTruthy();
    expect(validateIncident({ ...ok, severity: 'Extreme' }, NOW).severity).toBeTruthy();
  });
});

describe('clock', () => {
  it('a fixed clock never moves', () => {
    const c = fixedClock('2031-02-03T04:05');
    expect(c.today()).toBe('2031-02-03');
    expect(c.now()).toBe('2031-02-03T04:05');
  });
  it('the system clock reports the real date in the expected formats', () => {
    expect(systemClock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(systemClock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(systemClock.now().startsWith(systemClock.today())).toBe(true);
  });
  it('validators judge "future" by the clock they are given, not by a global', () => {
    const input = { title: 'Valid incident', description: 'd', severity: 'High', department_id: 1, occurred_at: '2026-10-25T09:00' };
    expect(validateIncident(input, fixedClock('2026-10-20T10:00').now()).occurred_at).toBeTruthy();
    expect(validateIncident(input, fixedClock('2026-11-01T10:00').now())).toEqual({});
  });
});

describe('tenancy and roles', () => {
  it('the role list uses Org Admin, not Administrator', () => {
    expect(ROLES).toContain('Org Admin');
    expect(ROLES as readonly string[]).not.toContain('Administrator');
    expect(seed.employees.some((e) => e.role === 'Org Admin')).toBe(true);
  });
  it('every row in the sample dataset belongs to the one sample organisation', () => {
    const id = seed.organisation.organisation_id;
    expect(seed.organisation.is_demo).toBe(true);
    const all = [seed.departments, seed.employees, seed.risks, seed.risk_assessments, seed.incidents, seed.incident_updates];
    for (const rows of all) for (const r of rows) expect(r.organisation_id).toBe(id);
  });
  it('sample emails are derived from the organisation, not hardcoded in components', () => {
    for (const e of seed.employees) expect(e.email.endsWith(`@${seed.organisation.slug}.example`)).toBe(true);
  });
});
