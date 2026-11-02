import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, startTestApp, validIncident, validRisk, type TestContext } from './helpers';

let t: TestContext;
const api = () => request(t.app);

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.pool.end();
});

describe('health, docs and the error format', () => {
  it('reports health with a database check', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('serves Swagger UI and an OpenAPI document that lists the endpoints', async () => {
    expect((await api().get('/api/docs/')).status).toBe(200);
    const spec = (await api().get('/api/openapi.json')).body;
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/api/risks', '/api/incidents/{id}/updates', '/api/reports/overview']));
    expect(spec.paths['/api/risks'].post.requestBody).toBeTruthy();
  });

  it('answers every failure with { error: { code, message, details } }', async () => {
    const unknown = await api().get('/api/nothing-here');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: { code: 'not_found', message: expect.any(String), details: [] } });

    const badId = await api().get('/api/risks/abc');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('validation_error');

    const badJson = await api().post('/api/risks').set(as(t.people.admin)).set('Content-Type', 'application/json').send('{not json');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('validation_error');

    const missing = await api().get('/api/risks/999999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');
  });

  it('lists every field that failed validation, with a message each', async () => {
    const res = await api().post('/api/risks').set(as(t.people.admin)).send({ title: 'x' });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['description', 'category', 'department_id']));
  });
});

describe('request context', () => {
  it('rejects an organisation that does not exist and malformed headers', async () => {
    expect((await api().get('/api/risks').set('X-Organisation-Id', '9999')).body.error.code).toBe('organisation_not_found');
    expect((await api().get('/api/risks').set('X-Organisation-Id', 'abc')).status).toBe(400);
    expect((await api().get('/api/risks').set('X-Actor-Id', '-1')).status).toBe(400);
  });

  it('needs an acting employee for writes, and that employee must belong to the organisation', async () => {
    const none = await api().post('/api/risks').send(validRisk());
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('actor_required');
    const foreign = await api().post('/api/risks').set(as(t.other.employeeId, 1)).send(validRisk());
    expect(foreign.status).toBe(401);
  });

  it('lets an organisation read only itself', async () => {
    expect((await api().get('/api/organisations/current')).body.data.slug).toBe('aravalli-industries');
    expect((await api().get(`/api/organisations/${t.other.organisationId}`)).status).toBe(404);
    expect((await api().get('/api/organisations/1')).status).toBe(200);
  });
});

describe('listing: filtering, sorting and paging', () => {
  it('pages risks and reports the total', async () => {
    const all = await api().get('/api/risks').query({ limit: 100 });
    const total = all.body.page.total as number;
    expect(total).toBeGreaterThanOrEqual(40);
    const first = await api().get('/api/risks').query({ limit: 10, offset: 0, sort: 'code', order: 'asc' });
    const second = await api().get('/api/risks').query({ limit: 10, offset: 10, sort: 'code', order: 'asc' });
    expect(first.body.data).toHaveLength(10);
    expect(first.body.page).toEqual({ limit: 10, offset: 0, total });
    const codes = [...first.body.data, ...second.body.data].map((r: { risk_code: string }) => r.risk_code);
    expect(new Set(codes).size).toBe(20);
    expect(codes).toEqual([...codes].sort());
  });

  it('refuses a page size above the maximum', async () => {
    expect((await api().get('/api/risks').query({ limit: 101 })).status).toBe(400);
    expect((await api().get('/api/risks').query({ limit: 0 })).status).toBe(400);
    expect((await api().get('/api/risks').query({ offset: -1 })).status).toBe(400);
    expect((await api().get('/api/risks').query({ sort: 'password' })).status).toBe(400);
  });

  it('sorts by score and puts unrated risks last in both directions', async () => {
    for (const order of ['asc', 'desc']) {
      const res = await api().get('/api/risks').query({ sort: 'score', order, limit: 100 });
      const scores = res.body.data.map((r: { risk_score: number | null }) => r.risk_score);
      const rated = scores.filter((s: number | null) => s !== null);
      expect(rated).toEqual([...rated].sort((a, b) => (order === 'asc' ? a - b : b - a)));
      expect(scores.slice(rated.length).every((s: number | null) => s === null)).toBe(true);
    }
  });

  it('filters risks by band, status list, category, department and text', async () => {
    const critical = await api().get('/api/risks').query({ bands: 'Critical', limit: 100 });
    expect(critical.body.data.length).toBeGreaterThan(0);
    expect(critical.body.data.every((r: { severity_band: string }) => r.severity_band === 'Critical')).toBe(true);

    const statuses = await api().get('/api/risks').query({ statuses: 'Mitigating,Monitoring', limit: 100 });
    expect(statuses.body.data.every((r: { status: string }) => ['Mitigating', 'Monitoring'].includes(r.status))).toBe(true);

    const finance = await api().get('/api/risks').query({ department_id: 1, categories: 'Compliance', limit: 100 });
    expect(finance.body.data.every((r: { department_id: number; category: string }) => r.department_id === 1 && r.category === 'Compliance')).toBe(true);

    const search = await api().get('/api/risks').query({ q: 'phishing' });
    expect(search.body.data.map((r: { title: string }) => r.title)).toContain('Phishing compromise of finance mailboxes');
    expect((await api().get('/api/risks').query({ q: 'p%ishing' })).body.page.total).toBe(0); // % is typed text, not a wildcard
  });

  it('filters and sorts incidents', async () => {
    const open = await api().get('/api/incidents').query({ open: 'true', limit: 100 });
    expect(open.body.data.every((i: { status: string }) => ['Open', 'Investigating', 'Contained'].includes(i.status))).toBe(true);
    const crit = await api().get('/api/incidents').query({ severities: 'Critical', sort: 'severity', order: 'desc' });
    expect(crit.body.data.every((i: { severity: string }) => i.severity === 'Critical')).toBe(true);
    const newest = await api().get('/api/incidents').query({ limit: 100 });
    const times = newest.body.data.map((i: { reported_at: string }) => i.reported_at);
    expect(times).toEqual([...times].sort().reverse());
    const attention = await api().get('/api/incidents').query({ needs_attention: 'true', limit: 100 });
    expect(attention.body.data.every((i: { status: string; assigned_to: number | null; risk_id: number | null }) =>
      i.status !== 'Closed' && (i.assigned_to === null || i.risk_id === null))).toBe(true);
  });

  it('lists employees by role', async () => {
    const res = await api().get('/api/employees').query({ role: 'Auditor,Org Admin', limit: 100 });
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((e: { role: string }) => ['Auditor', 'Org Admin'].includes(e.role))).toBe(true);
  });
});

describe('dashboard and reports', () => {
  it('returns KPIs that agree with the lists', async () => {
    const { kpis, incidentsByStatus, topRisks, recentActivity } = (await api().get('/api/reports/overview')).body.data;
    const openIncidents = (await api().get('/api/incidents').query({ open: 'true', limit: 1 })).body.page.total;
    const openRisks = (await api().get('/api/risks').query({ open: 'true', limit: 1 })).body.page.total;
    expect(kpis.openIncidents).toBe(openIncidents);
    expect(kpis.openRisks).toBe(openRisks);
    expect(incidentsByStatus).toHaveLength(5);
    expect(topRisks.length).toBeLessThanOrEqual(5);
    expect(topRisks[0].risk_score).toBeGreaterThanOrEqual(topRisks.at(-1).risk_score);
    expect(recentActivity.length).toBeGreaterThan(0);
  });

  it('builds a 25-cell heat map with every open rated risk in exactly one cell', async () => {
    const cells = (await api().get('/api/reports/heatmap')).body.data;
    expect(cells).toHaveLength(25);
    const placed = cells.reduce((n: number, c: { risks: unknown[] }) => n + c.risks.length, 0);
    const rated = (await api().get('/api/risks').query({ open: 'true', limit: 100 })).body.data.filter((r: { risk_score: number | null }) => r.risk_score !== null);
    expect(placed).toBe(rated.length);
    expect((await api().get('/api/reports/heatmap').query({ mode: 'first' })).body.data).toHaveLength(25);
  });

  it('reports the risk profile and resolution times', async () => {
    const profile = (await api().get('/api/reports/risk-profile')).body.data;
    expect(profile.every((r: { Critical: number; High: number; Medium: number; Low: number; Total: number }) => r.Critical + r.High + r.Medium + r.Low <= r.Total)).toBe(true);
    const bySeverity = (await api().get('/api/reports/resolution').query({ group_by: 'severity' })).body.data;
    expect(bySeverity.map((r: { group: string }) => r.group)).toEqual(['Critical', 'High', 'Medium', 'Low']);
    const byDept = (await api().get('/api/reports/resolution').query({ group_by: 'department' })).body.data;
    expect(byDept.length).toBeGreaterThanOrEqual(8);
  });
});

describe('risks: the server is the source of truth', () => {
  it('registers a risk with a database-generated code, an assessment and an Assessed status', async () => {
    const res = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'Assessed', risk_score: 12, severity_band: 'High', assessment_count: 1 });
    expect(res.body.data.risk_code).toMatch(/^RSK-\d{4,}$/);
    const byCode = await api().get(`/api/risks/by-code/${res.body.data.risk_code}`);
    expect(byCode.body.data.risk_id).toBe(res.body.data.risk_id);
  });

  it('registers an unrated risk as Identified', async () => {
    const res = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ likelihood: null, impact: null }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'Identified', severity_band: 'Unrated', risk_score: null });
  });

  it('applies the shared validation rules', async () => {
    const future = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ identified_date: '2026-12-01' }));
    expect(future.status).toBe(400);
    expect(future.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'identified_date' })]));
    const halfRated = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ impact: null }));
    expect(halfRated.status).toBe(400);
    const shortTitle = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ title: 'abc' }));
    expect(shortTitle.status).toBe(400);
    const outOfRange = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ likelihood: 9 }));
    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'likelihood' })]));
  });

  it('enforces roles on the server: auditors and employees cannot register risks', async () => {
    const auditor = await api().post('/api/risks').set(as(t.people.auditor)).send(validRisk());
    expect(auditor.status).toBe(403);
    expect(auditor.body.error.message).toMatch(/read-only/i);
    const employee = await api().post('/api/risks').set(as(t.people.employee)).send(validRisk());
    expect(employee.status).toBe(403);
  });

  it('adds assessments, recomputes the current score and keeps history', async () => {
    const created = (await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ likelihood: 2, impact: 2 }))).body.data;
    const res = await api().post(`/api/risks/${created.risk_id}/assessments`).set(as(t.people.officer))
      .send({ likelihood: 5, impact: 5, assessment_date: '2026-10-20', mitigation_notes: 'Escalated.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ risk_score: 25, severity_band: 'Critical', assessment_count: 2 });
    const history = (await api().get(`/api/risks/${created.risk_id}/assessments`)).body.data;
    expect(history.map((a: { risk_score: number }) => a.risk_score)).toEqual([4, 25]);
    const early = await api().post(`/api/risks/${created.risk_id}/assessments`).set(as(t.people.officer))
      .send({ likelihood: 1, impact: 1, assessment_date: '2020-01-01', mitigation_notes: '' });
    expect(early.status).toBe(400);
  });

  it('follows the risk lifecycle and needs a note to close', async () => {
    const unrated = (await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ likelihood: null, impact: null }))).body.data;
    const id = unrated.risk_id;
    const status = (to: string, note = '') => api().post(`/api/risks/${id}/status`).set(as(t.people.officer)).send({ status: to, note });
    expect((await status('Assessed')).status).toBe(400); // no assessment yet
    expect((await status('Closed')).status).toBe(400); // closing needs a note
    expect((await status('Closed', 'Accepted by the board.')).body.data.status).toBe('Closed');
    expect((await status('Mitigating')).status).toBe(400); // Closed can only go back to Monitoring
    expect((await status('Monitoring')).body.data.status).toBe('Monitoring');
  });
});

describe('incidents: the server is the source of truth', () => {
  it('reports an incident as Open with a generated code and a first timeline entry', async () => {
    const res = await api().post('/api/incidents').set(as(t.people.employee)).send(validIncident({ assigned_to: t.people.officer }));
    expect(res.status).toBe(201);
    const inc = res.body.data;
    expect(inc).toMatchObject({ status: 'Open', reported_by: t.people.employee, resolved_at: null });
    expect(inc.incident_code).toMatch(/^INC-\d{4,}$/);
    expect(inc.updates.map((u: { update_text: string }) => u.update_text)).toEqual(expect.arrayContaining(['Incident reported']));
    expect(inc.updates).toHaveLength(2); // reported + assigned
  });

  it('rejects an occurrence time in the future (by the injected clock) and unknown references', async () => {
    const future = await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident({ occurred_at: '2026-10-21T09:00' }));
    expect(future.status).toBe(400);
    const badDept = await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident({ department_id: 9999 }));
    expect(badDept.status).toBe(400);
    const badRisk = await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident({ risk_id: 9999 }));
    expect(badRisk.status).toBe(400);
  });

  it('walks the lifecycle: resolve needs a note, resolved_at is set and cleared, Closed is final', async () => {
    const inc = (await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident())).body.data;
    const update = (text: string, to: string | null) => api().post(`/api/incidents/${inc.incident_id}/updates`).set(as(t.people.officer)).send({ update_text: text, status_to: to });

    expect((await update('Skipping ahead', 'Resolved')).status).toBe(400); // Open -> Resolved is not allowed
    expect((await update('Looking into it', 'Investigating')).body.data.status).toBe('Investigating');
    expect((await update('', 'Resolved')).status).toBe(400); // note required
    const resolved = (await update('Replaced the faulty unit.', 'Resolved')).body.data;
    expect(resolved).toMatchObject({ status: 'Resolved' });
    expect(resolved.resolved_at).toBe('2026-10-20T17:30:00'); // from the injected clock, not the wall clock
    const reopened = (await update('Fault returned.', 'Investigating')).body.data;
    expect(reopened).toMatchObject({ status: 'Investigating', resolved_at: null });
    await update('Fixed properly.', 'Resolved');
    expect((await update('Verified.', 'Closed')).body.data.status).toBe('Closed');
    const after = await update('One more thing', null);
    expect(after.status).toBe(409);
    expect(after.body.error.code).toBe('conflict');
    const timeline = (await api().get(`/api/incidents/${inc.incident_id}/updates`)).body.data;
    expect(timeline.length).toBe(6);
    expect(timeline[0].status_to).toBe('Closed'); // newest first
  });

  it('stops employees closing incidents or touching incidents that are not theirs', async () => {
    const inc = (await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident())).body.data;
    const res = await api().post(`/api/incidents/${inc.incident_id}/updates`).set(as(t.people.employee)).send({ update_text: 'hello', status_to: null });
    expect(res.status).toBe(403);
    const assign = await api().patch(`/api/incidents/${inc.incident_id}/assignment`).set(as(t.people.employee)).send({ employee_id: t.people.employee });
    expect(assign.status).toBe(403);
  });

  it('assigns and links, writing a timeline entry each time, and refuses no-ops', async () => {
    const inc = (await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident())).body.data;
    const assigned = await api().patch(`/api/incidents/${inc.incident_id}/assignment`).set(as(t.people.officer)).send({ employee_id: t.people.admin });
    expect(assigned.body.data.assigned_to).toBe(t.people.admin);
    expect((await api().patch(`/api/incidents/${inc.incident_id}/assignment`).set(as(t.people.officer)).send({ employee_id: t.people.admin })).status).toBe(400);
    const linked = await api().patch(`/api/incidents/${inc.incident_id}/risk-link`).set(as(t.people.officer)).send({ risk_id: 2 });
    expect(linked.body.data.risk_code).toBe('RSK-0002');
    const unlinked = await api().patch(`/api/incidents/${inc.incident_id}/risk-link`).set(as(t.people.officer)).send({ risk_id: null });
    expect(unlinked.body.data.risk_id).toBeNull();
    const texts = unlinked.body.data.updates.map((u: { update_text: string }) => u.update_text);
    expect(texts).toEqual(expect.arrayContaining(['Linked to risk RSK-0002', 'Risk link removed']));
  });
});

describe('tenant isolation', () => {
  it('never shows another organisation\'s rows in lists, details or reports', async () => {
    const risks = (await api().get('/api/risks').query({ limit: 100 })).body.data;
    expect(risks.some((r: { title: string }) => r.title === 'Their confidential risk')).toBe(false);
    const incidents = (await api().get('/api/incidents').query({ limit: 100 })).body.data;
    expect(incidents.some((i: { title: string }) => i.title === 'Their confidential incident')).toBe(false);
    expect((await api().get(`/api/risks/${t.other.riskId}`)).status).toBe(404);
    expect((await api().get(`/api/incidents/${t.other.incidentId}`)).status).toBe(404);
    expect((await api().get(`/api/employees/${t.other.employeeId}`)).status).toBe(404);
    expect((await api().get(`/api/departments/${t.other.departmentId}`)).status).toBe(404);
    expect((await api().get('/api/risks/by-code/RSK-0001')).body.data.title).not.toBe('Their confidential risk');

    // and the other side sees only its own
    const theirs = await api().get('/api/risks').set('X-Organisation-Id', String(t.other.organisationId));
    expect(theirs.body.data.map((r: { title: string }) => r.title)).toEqual(['Their confidential risk']);
  });

  it('cannot write across organisations by naming another organisation\'s ids', async () => {
    const risk = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ department_id: t.other.departmentId }));
    expect(risk.status).toBe(400);
    const owner = await api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ owner_employee_id: t.other.employeeId }));
    expect(owner.status).toBe(400);
    const incident = (await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident())).body.data;
    expect((await api().patch(`/api/incidents/${incident.incident_id}/risk-link`).set(as(t.people.officer)).send({ risk_id: t.other.riskId })).status).toBe(400);
    expect((await api().patch(`/api/incidents/${incident.incident_id}/assignment`).set(as(t.people.officer)).send({ employee_id: t.other.employeeId })).status).toBe(400);
    expect((await api().post(`/api/incidents/${t.other.incidentId}/updates`).set(as(t.people.officer)).send({ update_text: 'hijack', status_to: null })).status).toBe(404);
    expect((await api().post(`/api/risks/${t.other.riskId}/assessments`).set(as(t.people.officer))
      .send({ likelihood: 5, impact: 5, assessment_date: '2026-10-20', mitigation_notes: '' })).status).toBe(404);
  });

  it('numbers codes separately in each organisation', async () => {
    const theirs = await api().post('/api/risks').set(as(t.other.employeeId, t.other.organisationId))
      .send(validRisk({ department_id: t.other.departmentId, owner_employee_id: t.other.employeeId }));
    expect(theirs.status).toBe(201);
    expect(theirs.body.data.risk_code).toBe('RSK-0002'); // RSK-0001 exists in their organisation; ours are far beyond that
  });
});

describe('codes under concurrent requests', () => {
  const codeNumber = (code: string) => Number(code.split('-')[1]);

  it('gives 30 simultaneous risk registrations 30 different, consecutive codes', async () => {
    const before = (await api().get('/api/risks').query({ sort: 'code', order: 'desc', limit: 1 })).body.data[0].risk_code as string;
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => api().post('/api/risks').set(as(t.people.officer)).send(validRisk({ title: `Concurrent risk number ${i}` }))),
    );
    expect(results.map((r) => r.status)).toEqual(Array(30).fill(201));
    const numbers = results.map((r) => codeNumber(r.body.data.risk_code)).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(30);
    expect(numbers[0]).toBe(codeNumber(before) + 1);
    expect(numbers.at(-1)).toBe(codeNumber(before) + 30); // no gaps: nothing was skipped or retried
  });

  it('does the same for 30 simultaneous incident reports', async () => {
    const before = (await api().get('/api/incidents').query({ sort: 'code', order: 'desc', limit: 1 })).body.data[0].incident_code as string;
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => api().post('/api/incidents').set(as(t.people.officer)).send(validIncident({ title: `Concurrent incident number ${i}` }))),
    );
    expect(results.map((r) => r.status)).toEqual(Array(30).fill(201));
    const numbers = results.map((r) => codeNumber(r.body.data.incident_code)).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(30);
    expect(numbers[0]).toBe(codeNumber(before) + 1);
    expect(numbers.at(-1)).toBe(codeNumber(before) + 30);
  });

  it('lets two simultaneous updates to one incident take turns, never both winning a status change', async () => {
    const inc = (await api().post('/api/incidents').set(as(t.people.officer)).send(validIncident())).body.data;
    await api().post(`/api/incidents/${inc.incident_id}/updates`).set(as(t.people.officer)).send({ update_text: 'Looking', status_to: 'Investigating' });
    const [a, b] = await Promise.all([
      api().post(`/api/incidents/${inc.incident_id}/updates`).set(as(t.people.officer)).send({ update_text: 'Contain it', status_to: 'Contained' }),
      api().post(`/api/incidents/${inc.incident_id}/updates`).set(as(t.people.admin)).send({ update_text: 'Contain it too', status_to: 'Contained' }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]); // the second waits for the lock, then sees the incident already Contained and records a plain note
    const timeline = (await api().get(`/api/incidents/${inc.incident_id}/updates`)).body.data;
    expect(timeline.filter((u: { status_to: string | null }) => u.status_to === 'Contained')).toHaveLength(1); // exactly one entry carries the change
    expect(timeline.filter((u: { update_text: string }) => u.update_text.startsWith('Contain it'))).toHaveLength(2);
  });
});
