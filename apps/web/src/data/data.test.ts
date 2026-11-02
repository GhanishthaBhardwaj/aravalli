import { describe, expect, it } from 'vitest';
import {
  bandFor, canIncidentTransition, DEMO_CLOCK, INCIDENT_STATUSES, RISK_CATEGORIES, RISK_STATUSES, ROLES, seed, SEVERITIES,
  type AssessmentInput, type Dataset, type Employee, type IncidentStatus, type RiskInput, type RiskStatus,
} from '@aravalli/shared';
import * as store from './store';
import type { ReportIncidentInput } from './store';
import * as select from './selectors';
import { heatGrid, riskRows, topRisks } from './selectors';

// The sample organisation runs on its fixed demo clock; these wrappers pass it in.
const clock = DEMO_CLOCK;
const DEMO_NOW = clock.now();
const DEMO_TODAY = clock.today();
const initialData = store.initialData;
const registerRisk = (ds: Dataset, v: RiskInput, a: Employee) => store.registerRisk(ds, v, a, clock);
const addAssessment = (ds: Dataset, id: number, v: AssessmentInput, a: Employee) => store.addAssessment(ds, id, v, a, clock);
const changeRiskStatus = (ds: Dataset, id: number, to: RiskStatus, note: string, a: Employee) => store.changeRiskStatus(ds, id, to, note, a, clock);
const reportIncident = (ds: Dataset, v: ReportIncidentInput, a: Employee) => store.reportIncident(ds, v, a, clock);
const addIncidentUpdate = (ds: Dataset, id: number, text: string, to: IncidentStatus | null, a: Employee) => store.addIncidentUpdate(ds, id, text, to, a, clock);
const assignIncident = (ds: Dataset, id: number, emp: number | null, a: Employee) => store.assignIncident(ds, id, emp, a, clock);
const linkRisk = (ds: Dataset, id: number, risk: number | null, a: Employee) => store.linkRisk(ds, id, risk, a, clock);
const kpis = (ds: Dataset) => select.kpis(ds, clock);
const incidentExceptions = (ds: Dataset) => select.incidentExceptions(ds, clock);

const ids = <T>(rows: T[], key: keyof T) => new Set(rows.map((r) => r[key] as unknown as number));
const NOW = `${DEMO_NOW}:00`;

describe('seed integrity', () => {
  const s = seed;
  const dept = ids(s.departments, 'department_id');
  const emp = ids(s.employees, 'employee_id');
  const risk = ids(s.risks, 'risk_id');
  const inc = ids(s.incidents, 'incident_id');

  it('has the planned volume', () => {
    expect(s.departments).toHaveLength(8);
    expect(s.employees).toHaveLength(32);
    expect(s.risks.length).toBeGreaterThanOrEqual(38);
    expect(s.risk_assessments.length).toBeGreaterThanOrEqual(90);
    expect(s.incidents).toHaveLength(36);
    expect(s.incident_updates.length).toBeGreaterThanOrEqual(110);
  });

  it('has unique PKs and codes', () => {
    const uniq = (a: string[]) => expect(new Set(a).size).toBe(a.length);
    uniq(s.departments.map((d) => d.code)); uniq(s.departments.map((d) => d.name));
    uniq(s.employees.map((e) => e.employee_code)); uniq(s.employees.map((e) => e.email));
    uniq(s.risks.map((r) => r.risk_code)); uniq(s.incidents.map((i) => i.incident_code));
  });

  it('resolves all foreign keys', () => {
    s.employees.forEach((e) => expect(dept.has(e.department_id)).toBe(true));
    s.risks.forEach((r) => {
      expect(dept.has(r.department_id)).toBe(true);
      expect(emp.has(r.owner_employee_id)).toBe(true);
    });
    s.risk_assessments.forEach((a) => { expect(risk.has(a.risk_id)).toBe(true); expect(emp.has(a.assessed_by)).toBe(true); });
    s.incidents.forEach((i) => {
      expect(dept.has(i.department_id)).toBe(true);
      expect(emp.has(i.reported_by)).toBe(true);
      if (i.assigned_to !== null) expect(emp.has(i.assigned_to)).toBe(true);
      if (i.risk_id !== null) expect(risk.has(i.risk_id)).toBe(true);
    });
    s.incident_updates.forEach((u) => { expect(inc.has(u.incident_id)).toBe(true); expect(emp.has(u.updated_by)).toBe(true); });
  });

  it('satisfies CHECK value lists', () => {
    s.employees.forEach((e) => expect(ROLES).toContain(e.role));
    s.risks.forEach((r) => { expect(RISK_CATEGORIES).toContain(r.category); expect(RISK_STATUSES).toContain(r.status); });
    s.risk_assessments.forEach((a) => {
      expect(a.likelihood >= 1 && a.likelihood <= 5).toBe(true);
      expect(a.impact >= 1 && a.impact <= 5).toBe(true);
      expect(a.risk_score).toBe(a.likelihood * a.impact);
    });
    s.incidents.forEach((i) => { expect(SEVERITIES).toContain(i.severity); expect(INCIDENT_STATUSES).toContain(i.status); });
    s.risks.forEach((r) => expect(r.title.length >= 5 && r.title.length <= 150).toBe(true));
  });

  it('keeps dates in range and ordered', () => {
    s.risks.forEach((r) => { expect(r.identified_date >= '2025-11-01').toBe(true); expect(r.identified_date <= DEMO_TODAY).toBe(true); });
    s.risk_assessments.forEach((a) => {
      const r = s.risks.find((x) => x.risk_id === a.risk_id)!;
      expect(a.assessment_date >= r.identified_date).toBe(true);
      expect(a.assessment_date <= DEMO_TODAY).toBe(true);
    });
    s.incidents.forEach((i) => {
      expect(i.occurred_at >= '2025-11-01').toBe(true);
      expect(i.reported_at >= i.occurred_at).toBe(true);
      expect(i.reported_at <= NOW).toBe(true);
      if (i.resolved_at) { expect(i.resolved_at >= i.occurred_at).toBe(true); expect(i.resolved_at <= NOW).toBe(true); }
    });
    s.incident_updates.forEach((u) => expect(u.created_at <= NOW).toBe(true));
  });

  it('keeps risk status consistent with assessment history', () => {
    s.risks.forEach((r) => {
      const n = s.risk_assessments.filter((a) => a.risk_id === r.risk_id).length;
      if (r.status === 'Identified') expect(n).toBe(0);
      else expect(n).toBeGreaterThan(0);
    });
  });

  it('starts every incident with an Open update and keeps status chains valid', () => {
    s.incidents.forEach((i) => {
      const ups = s.incident_updates.filter((u) => u.incident_id === i.incident_id).sort((a, b) => a.update_id - b.update_id);
      expect(ups[0].update_text).toBe('Incident reported');
      expect(ups[0].status_to).toBe('Open');
      expect(ups[0].status_from).toBeNull();
      let cur = 'Open' as (typeof INCIDENT_STATUSES)[number];
      for (const u of ups.slice(1)) {
        if (u.status_to) {
          expect(u.status_from).toBe(cur);
          expect(canIncidentTransition(cur, u.status_to)).toBe(true);
          cur = u.status_to;
        }
      }
      expect(cur).toBe(i.status);
      // resolved_at present iff the incident has been (and remains) resolved or closed
      if (i.status === 'Open' || i.status === 'Investigating' || i.status === 'Contained') expect(i.resolved_at).toBeNull();
      else expect(i.resolved_at).not.toBeNull();
    });
  });

  it('represents every incident status and has realistic gaps', () => {
    INCIDENT_STATUSES.forEach((st) => expect(s.incidents.some((i) => i.status === st)).toBe(true));
    const gaps = s.incidents.filter((i) => i.assigned_to === null || i.risk_id === null).length;
    expect(gaps / s.incidents.length).toBeGreaterThan(0.15);
    expect(gaps / s.incidents.length).toBeLessThan(0.35);
  });

  it('spreads current risk scores over every band', () => {
    const bands = new Set(riskRows(s).map((r) => r.band));
    SEVERITIES.forEach((b) => expect(bands.has(b)).toBe(true));
  });

  it('has no duplicated narrative text', () => {
    const texts = [...s.incident_updates.map((u) => u.update_text).filter((t) => !t.startsWith('Assigned to') && t !== 'Incident reported'),
      ...s.incidents.map((i) => i.description), ...s.risks.map((r) => r.description)];
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('KPI selectors on the seed', () => {
  it('computes consistent KPIs', () => {
    const k = kpis(seed);
    expect(k.openRisks).toBe(seed.risks.filter((r) => r.status !== 'Closed').length);
    expect(k.openIncidents).toBe(seed.incidents.filter((i) => ['Open', 'Investigating', 'Contained'].includes(i.status)).length);
    expect(k.criticalHighRisks).toBeGreaterThan(0);
    expect(k.meanHoursToResolve).toBeGreaterThan(0);
    expect(k.resolvedLast30).toBeGreaterThanOrEqual(0);
  });
  it('orders top risks by current score', () => {
    const top = topRisks(seed, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score!).toBeGreaterThanOrEqual(top[i].score!);
  });
  it('heat grid counts open assessed risks', () => {
    const total = heatGrid(seed, 'current').reduce((n, c) => n + c.rows.length, 0);
    expect(total).toBe(riskRows(seed).filter((r) => r.risk.status !== 'Closed' && r.score !== null).length);
  });
  it('finds data-quality exceptions', () => expect(incidentExceptions(seed).length).toBeGreaterThan(0));
});

describe('store actions', () => {
  const ds = initialData();
  const officer = seed.employees.find((e) => e.role === 'Risk Officer')!;
  const auditor = seed.employees.find((e) => e.role === 'Auditor')!;
  const worker = seed.employees.find((e) => e.role === 'Employee')!;
  const riskInput = {
    title: 'Test risk about supplier insolvency', description: 'desc', category: 'Financial', department_id: 4,
    owner_employee_id: 13, identified_date: '2026-10-10', likelihood: 4, impact: 4, mitigation_notes: '',
  };

  it('registers a risk with an initial assessment and generates the next code', () => {
    const r = registerRisk(ds, riskInput, officer);
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.risk_code).toBe(`RSK-${String(seed.risks.length + 1).padStart(4, '0')}`);
    expect(r.value.status).toBe('Assessed');
    expect(r.data.risk_assessments.at(-1)!.risk_score).toBe(16);
    expect(ds.risks).toHaveLength(seed.risks.length); // input not mutated
  });
  it('lets a risk be owned by someone from another department', () => {
    const r = registerRisk(ds, { ...riskInput, owner_employee_id: 1 }, officer); // Finance owner, Supply Chain risk
    expect(r.ok && r.value.owner_employee_id).toBe(1);
    expect(r.ok && r.value.department_id).toBe(4);
  });
  it('registers without assessment as Identified', () => {
    const r = registerRisk(ds, { ...riskInput, likelihood: null, impact: null }, officer);
    expect(r.ok && r.value.status).toBe('Identified');
  });
  it('blocks employees and auditors from risk actions', () => {
    expect(registerRisk(ds, riskInput, worker).ok).toBe(false);
    expect(registerRisk(ds, riskInput, auditor).ok).toBe(false);
    expect(addAssessment(ds, 1, { likelihood: 2, impact: 2, assessment_date: '2026-10-01', mitigation_notes: '' }, worker).ok).toBe(false);
  });
  it('adds assessments, promotes Identified → Assessed and keeps history', () => {
    const r1 = registerRisk(ds, { ...riskInput, likelihood: null, impact: null }, officer);
    if (!r1.ok) throw new Error();
    const r2 = addAssessment(r1.data, r1.value.risk_id, { likelihood: 2, impact: 3, assessment_date: '2026-10-12', mitigation_notes: 'x' }, officer);
    if (!r2.ok) throw new Error();
    expect(r2.data.risks.find((r) => r.risk_id === r1.value.risk_id)!.status).toBe('Assessed');
    const r3 = addAssessment(r2.data, r1.value.risk_id, { likelihood: 3, impact: 3, assessment_date: '2026-10-15', mitigation_notes: '' }, officer);
    if (!r3.ok) throw new Error();
    expect(r3.data.risk_assessments.filter((a) => a.risk_id === r1.value.risk_id)).toHaveLength(2);
  });
  it('rejects assessments dated before the risk was identified', () => {
    expect(addAssessment(ds, 1, { likelihood: 2, impact: 2, assessment_date: '2025-01-01', mitigation_notes: '' }, officer).ok).toBe(false);
  });
  it('enforces risk status transitions and the closure note', () => {
    const closedNoNote = changeRiskStatus(ds, 1, 'Closed', ' ', officer);
    expect(closedNoNote.ok).toBe(false);
    expect(changeRiskStatus(ds, 1, 'Identified', '', officer).ok).toBe(false);
    expect(changeRiskStatus(ds, 1, 'Monitoring', '', officer).ok).toBe(true);
    expect(changeRiskStatus(ds, 1, 'Closed', 'Mitigated fully', officer).ok).toBe(true);
  });

  const incInput = { title: 'Pump house short circuit', description: 'desc', severity: 'High', department_id: 3, occurred_at: '2026-10-20T09:00', assigned_to: null, risk_id: null };
  it('reports an incident as Open with an initial update', () => {
    const r = reportIncident(ds, incInput, worker);
    if (!r.ok) throw new Error();
    expect(r.value.status).toBe('Open');
    expect(r.value.reported_by).toBe(worker.employee_id);
    const ups = r.data.incident_updates.filter((u) => u.incident_id === r.value.incident_id);
    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ update_text: 'Incident reported', status_to: 'Open' });
  });
  it('rejects a future occurrence time', () => {
    expect(reportIncident(ds, { ...incInput, occurred_at: '2026-10-21T09:00' }, worker).ok).toBe(false);
  });
  it('walks an incident to Resolved and Closed, setting and clearing resolved_at', () => {
    const r = reportIncident(ds, incInput, officer);
    if (!r.ok) throw new Error();
    const id = r.value.incident_id;
    let d = r.data;
    const step = (to: Parameters<typeof addIncidentUpdate>[3], text: string) => {
      const x = addIncidentUpdate(d, id, text, to, officer);
      if (x.ok) d = x.data;
      return x;
    };
    expect(step('Resolved', 'skip').ok).toBe(false); // Open → Resolved invalid
    expect(step('Investigating', 'Looking into it').ok).toBe(true);
    expect(step('Resolved', '  ').ok).toBe(false); // needs a note
    expect(step('Resolved', 'Replaced fuse').ok).toBe(true);
    expect(d.incidents.find((i) => i.incident_id === id)!.resolved_at).not.toBeNull();
    expect(step('Investigating', 'Reopened after recurrence').ok).toBe(true);
    expect(d.incidents.find((i) => i.incident_id === id)!.resolved_at).toBeNull();
    expect(step('Resolved', 'Rewired').ok).toBe(true);
    expect(step('Closed', 'Verified').ok).toBe(true);
    expect(d.incident_updates.filter((u) => u.incident_id === id).map((u) => u.status_to).filter(Boolean))
      .toEqual(['Open', 'Investigating', 'Resolved', 'Investigating', 'Resolved', 'Closed']);
  });
  it('restricts employees to their own incidents and to non-closing updates', () => {
    const mine = reportIncident(ds, incInput, worker);
    if (!mine.ok) throw new Error();
    expect(addIncidentUpdate(mine.data, mine.value.incident_id, 'More detail', null, worker).ok).toBe(true);
    const other = seed.incidents.find((i) => i.reported_by !== worker.employee_id && i.assigned_to !== worker.employee_id)!;
    expect(addIncidentUpdate(ds, other.incident_id, 'x', null, worker).ok).toBe(false);
    expect(addIncidentUpdate(ds, other.incident_id, 'x', null, auditor).ok).toBe(false);
  });
  it('assigns and links with an update entry', () => {
    const a = assignIncident(ds, 30, 12, officer);
    if (!a.ok) throw new Error();
    expect(a.data.incident_updates.at(-1)!.update_text).toBe('Assigned to Neha Kapoor');
    expect(assignIncident(a.data, 30, 12, officer).ok).toBe(false); // no-op rejected
    const l = linkRisk(ds, 32, 3, officer);
    expect(l.ok && l.data.incidents.find((i) => i.incident_id === 32)!.risk_id).toBe(3);
    expect(assignIncident(ds, 30, 12, worker).ok).toBe(false);
  });
  it('treats a closed incident as final: no notes, reassignment or link changes', () => {
    const closed = seed.incidents.find((i) => i.status === 'Closed')!;
    expect(addIncidentUpdate(ds, closed.incident_id, 'A late note', null, officer).ok).toBe(false);
    expect(assignIncident(ds, closed.incident_id, 12, officer).ok).toBe(false);
    expect(linkRisk(ds, closed.incident_id, 3, officer).ok).toBe(false);
  });
  it('lists only open incidents as data-quality exceptions', () => {
    expect(incidentExceptions(seed).every((r) => r.incident.status !== 'Closed')).toBe(true);
  });
  it('bands match scoring for every current score', () => {
    riskRows(ds).forEach((r) => { if (r.score) expect(r.band).toBe(bandFor(r.score)); });
  });
});
