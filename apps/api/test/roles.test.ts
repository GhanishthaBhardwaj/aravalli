// Every role against every protected action. The expected status for each of the five roles is written out in full, so this
// file doubles as the permission table in the README. 401 (not signed in) is covered in api.test.ts.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS, type Permission } from '@aravalli/shared';
import { rows } from '../src/core/db';
import { as, bind, startTestApp, validIncident, validRisk, type TestContext, type Who } from './helpers';

let t: TestContext;
let deptIn: number; // the Department Head's own department
let deptOut: number; // another department
let riskIn: number;
let riskOut: number;

const WHO: Who[] = ['admin', 'officer', 'head', 'auditor', 'employee'];
type Expect = Record<Who, number>;
const E = (admin: number, officer: number, head: number, auditor: number, employee: number): Expect => ({ admin, officer, head, auditor, employee });

const send = (who: Who, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
  const r = request(t.app)[method](path).set(as(who));
  return method === 'get' ? r : r.send(body ?? {});
};

async function incident(dept: number, by: Who = 'officer', extra: Record<string, unknown> = {}): Promise<number> {
  const res = await send(by, 'post', '/api/incidents', validIncident({ department_id: dept, ...extra }));
  expect(res.status, 'fixture incident').toBe(201);
  return res.body.data.incident_id;
}
async function risk(dept: number, owner: number): Promise<number> {
  const res = await send('officer', 'post', '/api/risks', validRisk({ department_id: dept, owner_employee_id: owner }));
  expect(res.status, 'fixture risk').toBe(201);
  return res.body.data.risk_id;
}

beforeAll(async () => {
  t = await startTestApp();
  bind(t);
  deptIn = t.a.departmentId;
  deptOut = (await rows<{ department_id: number }>(t.pool, 'SELECT department_id FROM department WHERE organisation_id = 1 AND department_id <> ? ORDER BY department_id LIMIT 1', [deptIn]))[0]!.department_id;
  riskIn = await risk(deptIn, t.people.head);
  const outOwner = (await rows<{ employee_id: number }>(t.pool, 'SELECT employee_id FROM employee WHERE organisation_id = 1 AND department_id = ? LIMIT 1', [deptOut]))[0]!.employee_id;
  riskOut = await risk(deptOut, outOwner);
});
afterAll(async () => {
  await t.pool.end();
});

/** Runs one request as each role and checks the status each should get. */
async function matrix(label: string, expected: Expect, make: (who: Who) => Promise<{ status: number }>) {
  for (const who of WHO) {
    const res = await make(who);
    expect(res.status, `${label} as ${who}`).toBe(expected[who]);
  }
}

describe('the permission map', () => {
  it('matches the table in the README: Org Admin everything, Risk Officer all but user management, Auditor read-only', () => {
    const everything = Object.values(ROLE_PERMISSIONS).flat().filter((p, i, a) => a.indexOf(p) === i) as Permission[];
    expect([...ROLE_PERMISSIONS['Org Admin']].sort()).toEqual([...everything].sort());
    expect(ROLE_PERMISSIONS['Risk Officer']).not.toContain('user.manage');
    expect(everything.filter((p) => !hasPermission('Risk Officer', p))).toEqual(['user.manage']);
    expect(ROLE_PERMISSIONS.Auditor.filter((p) => /write|report$|update|assign|link/.test(p) && p !== 'report.read')).toEqual([]);
    expect(ROLE_PERMISSIONS.Employee).toEqual(['incident.read', 'incident.report', 'incident.update']);
  });
});

describe('risks', () => {
  it('list: everyone but Employees', async () => matrix('GET /risks', E(200, 200, 200, 200, 403), (w) => send(w, 'get', '/api/risks')));

  it('list: a Department Head sees only their department; the others see all', async () => {
    const head = (await send('head', 'get', '/api/risks?limit=100')).body.data as Array<{ department_id: number }>;
    expect(head.length).toBeGreaterThan(0);
    expect(head.every((r) => r.department_id === deptIn)).toBe(true);
    const all = (await send('auditor', 'get', '/api/risks?limit=100')).body.page.total;
    expect(all).toBeGreaterThan(head.length);
  });

  it('read one: inside and outside the Department Head\'s department', async () => {
    await matrix('GET risk in dept', E(200, 200, 200, 200, 403), (w) => send(w, 'get', `/api/risks/${riskIn}`));
    await matrix('GET risk elsewhere', E(200, 200, 404, 200, 403), (w) => send(w, 'get', `/api/risks/${riskOut}`));
    await matrix('GET assessments elsewhere', E(200, 200, 404, 200, 403), (w) => send(w, 'get', `/api/risks/${riskOut}/assessments`));
  });

  it('register', async () => {
    await matrix('POST risk in own dept', E(201, 201, 201, 403, 403), (w) => send(w, 'post', '/api/risks', validRisk({ department_id: deptIn, owner_employee_id: t.people.head })));
    await matrix('POST risk in another dept', E(201, 201, 403, 403, 403), (w) => send(w, 'post', '/api/risks', validRisk({ department_id: deptOut, owner_employee_id: t.people.head })));
  });

  it('assess', async () => {
    const body = { likelihood: 2, impact: 3, assessment_date: '2026-10-19', mitigation_notes: '' };
    await matrix('POST assessment in dept', E(201, 201, 201, 403, 403), (w) => send(w, 'post', `/api/risks/${riskIn}/assessments`, body));
    await matrix('POST assessment elsewhere', E(201, 201, 404, 403, 403), (w) => send(w, 'post', `/api/risks/${riskOut}/assessments`, body));
  });

  it('change status', async () => {
    await matrix('POST status in dept', E(200, 200, 200, 403, 403), async (w) => send(w, 'post', `/api/risks/${await risk(deptIn, t.people.head)}/status`, { status: 'Monitoring', note: '' }));
    await matrix('POST status elsewhere', E(200, 200, 404, 403, 403), async (w) => send(w, 'post', `/api/risks/${await risk(deptOut, t.people.head)}/status`, { status: 'Monitoring', note: '' }));
  });
});

describe('incidents', () => {
  it('list: everyone may ask, but each role gets only what it may see', async () => {
    await matrix('GET /incidents', E(200, 200, 200, 200, 200), (w) => send(w, 'get', '/api/incidents?limit=100'));
    const head = (await send('head', 'get', '/api/incidents?limit=100')).body.data as Array<{ department_id: number }>;
    expect(head.length).toBeGreaterThan(0);
    expect(head.every((i) => i.department_id === deptIn)).toBe(true);
    const employee = (await send('employee', 'get', '/api/incidents?limit=100')).body.data as Array<{ reported_by: number; assigned_to: number | null }>;
    expect(employee.length).toBeGreaterThan(0);
    expect(employee.every((i) => i.reported_by === t.people.employee || i.assigned_to === t.people.employee)).toBe(true);
    const total = (await send('officer', 'get', '/api/incidents?limit=1')).body.page.total;
    expect((await send('employee', 'get', '/api/incidents?limit=1')).body.page.total).toBeLessThan(total);
    // filters cannot be used to widen the scope
    expect((await send('employee', 'get', `/api/incidents?department_id=${deptIn}&limit=100`)).body.data.every((i: { reported_by: number; assigned_to: number | null }) => i.reported_by === t.people.employee || i.assigned_to === t.people.employee)).toBe(true);
    expect((await send('head', 'get', `/api/incidents?department_id=${deptOut}`)).body.page.total).toBe(0);
  });

  it('read one: department scope for Department Heads, own incidents for Employees', async () => {
    const notTheirs = await incident(deptIn, 'officer');
    const elsewhere = await incident(deptOut, 'officer');
    const theirs = await incident(deptOut, 'employee');
    await matrix('GET incident in dept, reported by someone else', E(200, 200, 200, 200, 404), (w) => send(w, 'get', `/api/incidents/${notTheirs}`));
    await matrix('GET incident elsewhere', E(200, 200, 404, 200, 404), (w) => send(w, 'get', `/api/incidents/${elsewhere}`));
    await matrix('GET incident the employee reported', E(200, 200, 404, 200, 200), (w) => send(w, 'get', `/api/incidents/${theirs}`));
    await matrix('GET timeline the employee reported', E(200, 200, 404, 200, 200), (w) => send(w, 'get', `/api/incidents/${theirs}/updates`));
  });

  it('an Employee also sees an incident assigned to them', async () => {
    const id = await incident(deptIn, 'officer', { assigned_to: t.people.employee });
    expect((await send('employee', 'get', `/api/incidents/${id}`)).status).toBe(200);
  });

  it('report', async () => {
    await matrix('POST incident in own dept', E(201, 201, 201, 403, 201), (w) => send(w, 'post', '/api/incidents', validIncident({ department_id: deptIn })));
    await matrix('POST incident in another dept', E(201, 201, 403, 403, 201), (w) => send(w, 'post', '/api/incidents', validIncident({ department_id: deptOut })));
  });

  it('add an update', async () => {
    await matrix('POST update in dept', E(201, 201, 201, 403, 404), async (w) => send(w, 'post', `/api/incidents/${await incident(deptIn)}/updates`, { update_text: 'Looking into it', status_to: null }));
    await matrix('POST update elsewhere', E(201, 201, 404, 403, 404), async (w) => send(w, 'post', `/api/incidents/${await incident(deptOut)}/updates`, { update_text: 'Looking into it', status_to: null }));
    const own = await incident(deptOut, 'employee');
    expect((await send('employee', 'post', `/api/incidents/${own}/updates`, { update_text: 'More detail', status_to: 'Investigating' })).status).toBe(201);
  });

  it('employees cannot close an incident, even their own', async () => {
    const own = await incident(deptOut, 'employee');
    await send('officer', 'post', `/api/incidents/${own}/updates`, { update_text: 'On it', status_to: 'Investigating' });
    await send('officer', 'post', `/api/incidents/${own}/updates`, { update_text: 'Fixed', status_to: 'Resolved' });
    const refused = await send('employee', 'post', `/api/incidents/${own}/updates`, { update_text: 'Closing', status_to: 'Closed' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.details[0].message).toMatch(/cannot close/i);
    expect((await send('officer', 'post', `/api/incidents/${own}/updates`, { update_text: 'Verified', status_to: 'Closed' })).status).toBe(201);
  });

  it('assign', async () => {
    await matrix('PATCH assignment in dept', E(200, 200, 200, 403, 403), async (w) => send(w, 'patch', `/api/incidents/${await incident(deptIn)}/assignment`, { employee_id: t.people.head }));
    await matrix('PATCH assignment elsewhere', E(200, 200, 404, 403, 403), async (w) => send(w, 'patch', `/api/incidents/${await incident(deptOut)}/assignment`, { employee_id: t.people.head }));
    const other = (await rows<{ employee_id: number }>(t.pool, 'SELECT employee_id FROM employee WHERE organisation_id = 1 AND department_id = ? LIMIT 1', [deptOut]))[0]!.employee_id;
    const refused = await send('head', 'patch', `/api/incidents/${await incident(deptIn)}/assignment`, { employee_id: other });
    expect(refused.status).toBe(400); // a Department Head can hand work only to their own department
  });

  it('link to a risk', async () => {
    await matrix('PATCH link in dept', E(200, 200, 200, 403, 403), async (w) => send(w, 'patch', `/api/incidents/${await incident(deptIn)}/risk-link`, { risk_id: riskIn }));
    await matrix('PATCH link elsewhere', E(200, 200, 404, 403, 403), async (w) => send(w, 'patch', `/api/incidents/${await incident(deptOut)}/risk-link`, { risk_id: riskOut }));
    expect((await send('head', 'patch', `/api/incidents/${await incident(deptIn)}/risk-link`, { risk_id: riskOut })).status).toBe(400); // their incident, someone else's risk
  });
});

describe('reports, people, departments and user management', () => {
  it('reports: Org Admin, Risk Officer and Auditor only', async () => {
    for (const path of ['overview', 'heatmap', 'risk-profile', 'resolution']) {
      await matrix(`GET /reports/${path}`, E(200, 200, 403, 200, 403), (w) => send(w, 'get', `/api/reports/${path}`));
    }
  });

  it('people: not for Employees; a Department Head sees only their department', async () => {
    await matrix('GET /employees', E(200, 200, 200, 200, 403), (w) => send(w, 'get', '/api/employees?limit=100'));
    const head = (await send('head', 'get', '/api/employees?limit=100')).body.data as Array<{ department_id: number }>;
    expect(head.length).toBeGreaterThan(0);
    expect(head.every((e) => e.department_id === deptIn)).toBe(true);
    const outsider = (await rows<{ employee_id: number }>(t.pool, 'SELECT employee_id FROM employee WHERE organisation_id = 1 AND department_id = ? LIMIT 1', [deptOut]))[0]!.employee_id;
    await matrix('GET one employee elsewhere', E(200, 200, 404, 200, 403), (w) => send(w, 'get', `/api/employees/${outsider}`));
  });

  it('departments: Department Heads see their own, Employees see names without any figures', async () => {
    await matrix('GET /departments', E(200, 200, 200, 200, 200), (w) => send(w, 'get', '/api/departments'));
    expect((await send('head', 'get', '/api/departments')).body.data.map((d: { department_id: number }) => d.department_id)).toEqual([deptIn]);
    await matrix('GET other department', E(200, 200, 404, 200, 200), (w) => send(w, 'get', `/api/departments/${deptOut}`));
    const mine = (await send('employee', 'get', '/api/departments')).body.data;
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.every((d: { open_risks: number; open_incidents: number; people: number }) => d.open_risks === 0 && d.open_incidents === 0 && d.people === 0)).toBe(true);
  });

  it('user management: Org Admin only', async () => {
    await matrix('GET /users', E(200, 403, 403, 403, 403), (w) => send(w, 'get', '/api/users'));
    await matrix('GET /invitations', E(200, 403, 403, 403, 403), (w) => send(w, 'get', '/api/invitations'));
    await matrix('POST /invitations', E(201, 403, 403, 403, 403), (w) => send(w, 'post', '/api/invitations', { email: `${w}-${Date.now()}@roles.example`, role: 'Employee', department_id: deptIn }));
    await matrix('PATCH /users/:id', E(200, 403, 403, 403, 403), (w) => send(w, 'patch', `/api/users/${t.a.users.employee}`, { role: 'Employee' }));
  });

  it('who am I: every role gets their own permissions', async () => {
    for (const who of WHO) {
      const me = (await send(who, 'get', '/api/auth/me')).body.data;
      expect(me.permissions.slice().sort(), who).toEqual([...ROLE_PERMISSIONS[me.employee.role as keyof typeof ROLE_PERMISSIONS]].sort());
    }
  });
});
