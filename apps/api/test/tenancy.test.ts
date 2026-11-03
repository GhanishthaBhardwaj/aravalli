// Cross-tenant tests: a user of one organisation tries to read, update, delete and link the other organisation's records
// through every endpoint that takes an id or names a record. Every attempt must fail, and the victim's data must not change.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { one, rows } from '../src/core/db';
import { as, bind, startTestApp, validIncident, validRisk, type TestContext, type Who } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await startTestApp();
  bind(t);
});
afterAll(async () => {
  await t.pool.end();
});

interface Org { key: 'a' | 'b'; organisationId: number; riskId: number; riskCode: string; riskTitle: string; incidentId: number; incidentCode: string; incidentTitle: string; employeeId: number; departmentId: number; userId: number; invitationId: number }

/** The ids of one organisation's records, found by the test with SQL (the attacker is told them, as a determined one could guess). */
async function describeOrg(key: 'a' | 'b'): Promise<Org> {
  const o = t[key];
  const q = async <T>(sql: string) => (await one<T>(t.pool, sql, [o.organisationId]))!;
  const risk = await q<{ risk_id: number; risk_code: string; title: string }>('SELECT risk_id, risk_code, title FROM risk WHERE organisation_id = ? ORDER BY risk_id LIMIT 1');
  const inc = await q<{ incident_id: number; incident_code: string; title: string }>('SELECT incident_id, incident_code, title FROM incident WHERE organisation_id = ? ORDER BY incident_id LIMIT 1');
  const sent = await request(t.app).post('/api/invitations').set(as('admin', key)).send({ email: `invitee-${key}-${Date.now()}@tenancy.example`, role: 'Employee', department_id: o.departmentId });
  expect(sent.status).toBe(201);
  return {
    key, organisationId: o.organisationId, riskId: risk.risk_id, riskCode: risk.risk_code, riskTitle: risk.title,
    incidentId: inc.incident_id, incidentCode: inc.incident_code, incidentTitle: inc.title,
    employeeId: o.ids.officer, departmentId: o.departmentId, userId: o.users.employee, invitationId: sent.body.data.invitation_id,
  };
}

async function snapshot(org: Org) {
  const count = async (sql: string, ...p: unknown[]) => (await one<{ n: number }>(t.pool, sql, p))!.n;
  return {
    updates: await count('SELECT COUNT(*) AS n FROM incident_update WHERE organisation_id = ?', org.organisationId),
    assessments: await count('SELECT COUNT(*) AS n FROM risk_assessment WHERE organisation_id = ?', org.organisationId),
    risks: await count('SELECT COUNT(*) AS n FROM risk WHERE organisation_id = ?', org.organisationId),
    incidents: await count('SELECT COUNT(*) AS n FROM incident WHERE organisation_id = ?', org.organisationId),
    employees: await count('SELECT COUNT(*) AS n FROM employee WHERE organisation_id = ?', org.organisationId),
    incidentRow: JSON.stringify(await rows(t.pool, 'SELECT status, assigned_to, risk_id, resolved_at FROM incident WHERE incident_id = ?', [org.incidentId])),
    riskRow: JSON.stringify(await rows(t.pool, 'SELECT status, updated_at FROM risk WHERE risk_id = ?', [org.riskId])),
    userRow: JSON.stringify(await rows(t.pool, 'SELECT is_active FROM user_account WHERE user_id = ?', [org.userId])),
    employeeRow: JSON.stringify(await rows(t.pool, 'SELECT role, department_id, is_active FROM employee WHERE organisation_id = ? ORDER BY employee_id', [org.organisationId])),
    invitation: JSON.stringify(await rows(t.pool, 'SELECT revoked_at, accepted_at FROM invitation WHERE invitation_id = ?', [org.invitationId])),
  };
}

const direction: Array<['a' | 'b', 'a' | 'b']> = [['a', 'b'], ['b', 'a']];

describe.each(direction)('a user of organisation %s attacks organisation %s', (attackerKey, victimKey) => {
  let victim: Org;
  let mine: Org;
  let before: Awaited<ReturnType<typeof snapshot>>;
  const call = (who: Who) => ({
    get: (path: string) => request(t.app).get(path).set(as(who, attackerKey)),
    post: (path: string, body: object = {}) => request(t.app).post(path).set(as(who, attackerKey)).send(body),
    patch: (path: string, body: object = {}) => request(t.app).patch(path).set(as(who, attackerKey)).send(body),
    del: (path: string) => request(t.app).delete(path).set(as(who, attackerKey)),
  });

  beforeAll(async () => {
    victim = await describeOrg(victimKey);
    mine = await describeOrg(attackerKey);
    before = await snapshot(victim);
  });

  it('reads: every single-record endpoint answers 404 for every role', async () => {
    for (const who of ['admin', 'officer', 'head', 'auditor', 'employee'] as const) {
      const c = call(who);
      for (const path of [
        `/api/risks/${victim.riskId}`, `/api/risks/by-code/${victim.riskCode}`, `/api/risks/${victim.riskId}/assessments`,
        `/api/incidents/${victim.incidentId}`, `/api/incidents/by-code/${victim.incidentCode}`, `/api/incidents/${victim.incidentId}/updates`,
        `/api/employees/${victim.employeeId}`, `/api/departments/${victim.departmentId}`, `/api/organisations/${victim.organisationId}`,
      ]) {
        const res = await c.get(path);
        // roles without the permission are stopped earlier (403); nobody ever gets the record (200)
        // (a code like RSK-0001 exists in every organisation, so a by-code lookup may legitimately return MY OWN record)
        const allowed = path.includes('by-code') ? [200, 403, 404] : [403, 404];
        expect(allowed, `${who} GET ${path} -> ${res.status}`).toContain(res.status);
        expect(JSON.stringify(res.body)).not.toContain(victim.riskTitle);
        expect(JSON.stringify(res.body)).not.toContain(victim.incidentTitle);
      }
    }
  });

  it('reads: lists, searches and reports never contain the other organisation\'s rows', async () => {
    const c = call('admin');
    for (const path of ['/api/risks?limit=100', '/api/incidents?limit=100', '/api/employees?limit=100', '/api/departments', '/api/reports/overview', '/api/reports/heatmap', '/api/reports/risk-profile', '/api/reports/resolution', '/api/users', '/api/invitations']) {
      const body = JSON.stringify((await c.get(path)).body);
      expect(body, path).not.toContain(victim.riskTitle);
      expect(body, path).not.toContain(victim.incidentTitle);
      expect(body, path).not.toContain(`"organisation_id":${victim.organisationId}`);
    }
    expect((await c.get(`/api/risks?q=${encodeURIComponent(victim.riskTitle)}`)).body.page.total).toBe(0);
    expect((await c.get(`/api/incidents?q=${encodeURIComponent(victim.incidentTitle)}`)).body.page.total).toBe(0);
    expect((await c.get(`/api/incidents?risk_id=${victim.riskId}`)).body.page.total).toBe(0);
    expect((await c.get(`/api/incidents?department_id=${victim.departmentId}`)).body.page.total).toBe(0);
    expect((await c.get(`/api/incidents?assignee_id=${victim.employeeId}`)).body.page.total).toBe(0);
    expect((await c.get(`/api/risks?owner_id=${victim.employeeId}`)).body.page.total).toBe(0);
    const overview = (await c.get('/api/reports/overview')).body.data;
    expect(overview.kpis.totalRisks).toBe((await c.get('/api/risks?limit=1')).body.page.total);
  });

  it('updates: assessing, changing status, adding updates, assigning and linking the other organisation\'s records all fail with 404', async () => {
    const c = call('admin');
    const results = [
      await c.post(`/api/risks/${victim.riskId}/assessments`, { likelihood: 5, impact: 5, assessment_date: '2026-10-20', mitigation_notes: 'hijack' }),
      await c.post(`/api/risks/${victim.riskId}/status`, { status: 'Closed', note: 'hijack' }),
      await c.post(`/api/incidents/${victim.incidentId}/updates`, { update_text: 'hijack', status_to: 'Investigating' }),
      await c.patch(`/api/incidents/${victim.incidentId}/assignment`, { employee_id: mine.employeeId }),
      await c.patch(`/api/incidents/${victim.incidentId}/assignment`, { employee_id: null }),
      await c.patch(`/api/incidents/${victim.incidentId}/risk-link`, { risk_id: mine.riskId }),
      await c.patch(`/api/incidents/${victim.incidentId}/risk-link`, { risk_id: null }),
      await c.patch(`/api/users/${victim.userId}`, { role: 'Org Admin', is_active: false }),
      await c.del(`/api/invitations/${victim.invitationId}`),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(results.length).fill(404));
  });

  it('links: my records cannot be tied to theirs, in either direction', async () => {
    const c = call('admin');
    const ownRisk = { department_id: mine.departmentId, owner_employee_id: mine.employeeId };
    const ownIncident = { department_id: mine.departmentId };
    // control: with only my own ids the same requests succeed, so the failures below are caused by the foreign id alone
    expect((await c.post('/api/risks', validRisk({ ...ownRisk, title: 'Control risk with my own ids' }))).status).toBe(201);
    const control = await c.post('/api/incidents', validIncident({ ...ownIncident, title: 'Control incident with my own ids' }));
    expect(control.status).toBe(201);
    const openId = control.body.data.incident_id as number;
    expect((await c.patch(`/api/incidents/${openId}/risk-link`, { risk_id: victim.riskId })).status).toBe(400);
    expect((await c.patch(`/api/incidents/${openId}/assignment`, { employee_id: victim.employeeId })).status).toBe(400);
    expect((await c.post('/api/risks', validRisk({ ...ownRisk, department_id: victim.departmentId }))).status).toBe(400);
    expect((await c.post('/api/risks', validRisk({ ...ownRisk, owner_employee_id: victim.employeeId }))).status).toBe(400);
    expect((await c.post('/api/incidents', validIncident({ department_id: victim.departmentId }))).status).toBe(400);
    expect((await c.post('/api/incidents', validIncident({ ...ownIncident, assigned_to: victim.employeeId }))).status).toBe(400);
    expect((await c.post('/api/incidents', validIncident({ ...ownIncident, risk_id: victim.riskId }))).status).toBe(400);
    expect((await c.post('/api/invitations', { email: `x-${Date.now()}@tenancy.example`, role: 'Employee', department_id: victim.departmentId })).status).toBe(400);
  });

  it('cannot smuggle an organisation in through the body, the query or a header', async () => {
    const dept = mine.departmentId;
    const created = await request(t.app).post('/api/risks').set(as('admin', attackerKey)).set('X-Organisation-Id', String(victim.organisationId))
      .send({ ...validRisk({ department_id: dept, owner_employee_id: mine.employeeId, title: `Smuggled risk ${attackerKey}` }), organisation_id: victim.organisationId });
    expect(created.status).toBe(201);
    expect(created.body.data.organisation_id ?? mine.organisationId).toBe(mine.organisationId);
    const landed = await one<{ organisation_id: number }>(t.pool, 'SELECT organisation_id FROM risk WHERE risk_id = ?', [created.body.data.risk_id]);
    expect(landed!.organisation_id).toBe(mine.organisationId);
    const listed = await request(t.app).get(`/api/risks?limit=100&organisation_id=${victim.organisationId}`).set(as('admin', attackerKey)).set('X-Organisation-Id', String(victim.organisationId));
    expect(listed.body.data.every((r: { risk_title?: string; title: string }) => r.title !== victim.riskTitle)).toBe(true);
  });

  it('leaves the other organisation\'s data exactly as it was', async () => {
    const after = await snapshot(victim);
    expect(after).toEqual(before);
  });
});
