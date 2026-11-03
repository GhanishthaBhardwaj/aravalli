import { fixedClock, ROLES, type Role } from '@aravalli/shared';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { hashPassword, signAccessToken } from '../src/auth/crypto';
import { createMailer, type Mailer } from '../src/auth/mailer';
import { loadEnvFile, readAuthConfig, type AuthConfig } from '../src/core/config';
import { createPool, rows, run, one, type Pool } from '../src/core/db';
import { readDbConfig } from '../src/db/config';

/** The sample organisation is dated around this moment. */
export const CLOCK = fixedClock('2026-10-20T17:30');

export const TEST_PASSWORD = 'Correct-horse-42';

export const testAuthConfig = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  ...readAuthConfig({ JWT_SECRET: 'test-secret-test-secret-test-secret-123', DEMO_LOGINS: 'true', COOKIE_SECURE: 'false', RATE_LIMIT_LOGIN: '1000', RATE_LIMIT_RESET: '1000', MAIL_MODE: 'console', NODE_ENV: 'test' }),
  ...over,
});

export type Who = 'admin' | 'officer' | 'head' | 'auditor' | 'employee';
const ROLE_OF: Record<Who, Role> = { admin: 'Org Admin', officer: 'Risk Officer', head: 'Department Head', auditor: 'Auditor', employee: 'Employee' };

export interface OrgPeople { organisationId: number; departmentId: number; ids: Record<Who, number>; users: Record<Who, number>; tokens: Record<Who, string> }

export interface TestContext {
  pool: Pool;
  app: Express;
  auth: AuthConfig;
  mailer: Mailer;
  /** Move the server's clock forward (to test expiry). */
  advance(ms: number): void;
  /** The sample organisation (Aravalli Industries), one signed-in user per role. */
  a: OrgPeople;
  /** A second, separate organisation with its own users and one of everything, used to prove tenants cannot see each other. */
  b: OrgPeople & { riskId: number; incidentId: number; riskCode: string };
  /** Convenience: the sample organisation's employee ids by role. */
  people: Record<Who, number>;
}

let passwordHash: Promise<string> | null = null;

/** An account for an employee. The password is TEST_PASSWORD, so login tests can use it. */
export async function ensureUser(pool: Pool, organisationId: number, employeeId: number, opts: { demo?: boolean } = {}): Promise<number> {
  const found = await one<{ user_id: number }>(pool, 'SELECT user_id FROM user_account WHERE employee_id = ?', [employeeId]);
  if (found) return found.user_id;
  const e = (await one<{ email: string }>(pool, 'SELECT email FROM employee WHERE employee_id = ?', [employeeId]))!;
  const r = await run(pool, 'INSERT INTO user_account (organisation_id, employee_id, email, password_hash, email_verified_at, is_demo) VALUES (?, ?, ?, ?, NOW(), ?)',
    [organisationId, employeeId, e.email, await (passwordHash ??= hashPassword(TEST_PASSWORD)), opts.demo ? 1 : 0]);
  return r.insertId;
}

async function employeeWithRole(pool: Pool, organisationId: number, role: Role, departmentId?: number): Promise<{ employee_id: number; department_id: number }> {
  const sql = `SELECT employee_id, department_id FROM employee WHERE organisation_id = ? AND role = ? AND is_active ${departmentId ? 'AND department_id = ?' : ''} ORDER BY employee_id LIMIT 1`;
  const found = (await rows<{ employee_id: number; department_id: number }>(pool, sql, departmentId ? [organisationId, role, departmentId] : [organisationId, role]))[0];
  if (!found) throw new Error(`No ${role} in organisation ${organisationId}`);
  return found;
}

async function sessionsFor(pool: Pool, auth: AuthConfig, organisationId: number, demo: boolean): Promise<OrgPeople> {
  const ids = {} as Record<Who, number>;
  const users = {} as Record<Who, number>;
  const tokens = {} as Record<Who, string>;
  let departmentId = 0;
  for (const who of Object.keys(ROLE_OF) as Who[]) {
    const e = await employeeWithRole(pool, organisationId, ROLE_OF[who]);
    if (who === 'head') departmentId = e.department_id;
    ids[who] = e.employee_id;
    users[who] = await ensureUser(pool, organisationId, e.employee_id, { demo });
    tokens[who] = signAccessToken(users[who], auth.jwtSecret, 3600);
  }
  return { organisationId, departmentId, ids, users, tokens };
}

export async function startTestApp(): Promise<TestContext> {
  loadEnvFile();
  const config = readDbConfig({ ...process.env, DB_NAME: process.env.TEST_DB_NAME ?? 'aravalli_test' });
  if (!/test/i.test(config.database)) throw new Error(`Refusing to run API tests against "${config.database}".`);
  const pool = createPool(config, 20);
  const auth = testAuthConfig();
  const mailer = createMailer(auth.mail);
  let skew = 0;
  const app = createApp({ pool, clock: CLOCK, auth, mailer, nowMs: () => Date.now() + skew });

  // A second, small organisation with one person in every role and one of everything.
  const existing = await rows<{ organisation_id: number }>(pool, "SELECT organisation_id FROM organisation WHERE slug = 'other-org'");
  let orgId = existing[0]?.organisation_id;
  if (!orgId) {
    orgId = (await run(pool, "INSERT INTO organisation (name, slug, is_demo) VALUES ('Other Org', 'other-org', FALSE)")).insertId;
    const dept = (await run(pool, "INSERT INTO department (organisation_id, code, name) VALUES (?, 'OPS', 'Their Operations')", [orgId])).insertId;
    let n = 9000;
    const mk = async (role: Role, first: string) =>
      (await run(pool, 'INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [orgId, `EMP-${++n}`, dept, first, 'Other', `${first.toLowerCase()}@other.example`, role, role])).insertId;
    const officer = await mk('Risk Officer', 'Olga');
    for (const [role, first] of [['Org Admin', 'Omar'], ['Department Head', 'Hana'], ['Auditor', 'Alma'], ['Employee', 'Emil']] as const) await mk(role, first);
    await run(pool,
      "INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, status, identified_date) VALUES (?, 'RSK-0001', 'Their confidential risk', 'secret', 'Operational', ?, ?, 'Identified', '2026-01-01')",
      [orgId, dept, officer]);
    await run(pool,
      "INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, occurred_at, reported_at) VALUES (?, 'INC-0001', 'Their confidential incident', 'secret', 'High', 'Open', ?, ?, '2026-01-01 10:00:00', '2026-01-01 10:00:00')",
      [orgId, dept, officer]);
  }
  const a = await sessionsFor(pool, auth, 1, true);
  const b = await sessionsFor(pool, auth, orgId, true);
  const first = async (sql: string) => (await rows<{ id: number; code: string }>(pool, sql, [orgId]))[0]!;
  const risk = await first('SELECT risk_id AS id, risk_code AS code FROM risk WHERE organisation_id = ? ORDER BY risk_id LIMIT 1');
  const incident = await first('SELECT incident_id AS id, incident_code AS code FROM incident WHERE organisation_id = ? ORDER BY incident_id LIMIT 1');

  return {
    pool, app, auth, mailer, advance: (ms) => { skew += ms; },
    a, b: { ...b, riskId: risk.id, riskCode: risk.code, incidentId: incident.id },
    people: a.ids,
  };
}

/** The Authorization header for one of the signed-in test users of the sample organisation (or of org B with `of`). */
let current: TestContext | null = null;
export const bind = (t: TestContext) => { current = t; };
export const as = (who: Who, of: 'a' | 'b' = 'a') => {
  if (!current) throw new Error('call bind(t) after startTestApp()');
  return { Authorization: `Bearer ${current[of].tokens[who]}` };
};
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A supertest agent that is already signed in as someone. */
export const agent = (t: TestContext, who: Who = 'officer', of: 'a' | 'b' = 'a') => request.agent(t.app).set(as(who, of));

export const ROLE_NAMES = ROLES;

export const validRisk = (over: Record<string, unknown> = {}) => ({
  title: 'A risk created by the API tests',
  description: 'Created while testing.',
  category: 'Operational',
  department_id: 1,
  owner_employee_id: 1,
  identified_date: '2026-10-15',
  likelihood: 3,
  impact: 4,
  mitigation_notes: '',
  ...over,
});

export const validIncident = (over: Record<string, unknown> = {}) => ({
  title: 'An incident created by the API tests',
  description: 'Created while testing.',
  severity: 'Medium',
  department_id: 1,
  occurred_at: '2026-10-20T09:00',
  ...over,
});
