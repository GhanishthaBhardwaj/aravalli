import { fixedClock } from '@aravalli/shared';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { loadEnvFile } from '../src/core/config';
import { createPool, rows, run, type Pool } from '../src/core/db';
import { readDbConfig } from '../src/db/config';

/** The sample organisation is dated around this moment. */
export const CLOCK = fixedClock('2026-10-20T17:30');

export interface TestContext {
  pool: Pool;
  app: Express;
  /** Ids of a second organisation, used to prove tenants cannot see each other. */
  other: { organisationId: number; departmentId: number; employeeId: number; riskId: number; incidentId: number };
  /** People in the sample organisation, by role. */
  people: { admin: number; officer: number; auditor: number; employee: number };
}

export async function startTestApp(): Promise<TestContext> {
  loadEnvFile();
  const config = readDbConfig({ ...process.env, DB_NAME: process.env.TEST_DB_NAME ?? 'aravalli_test' });
  if (!/test/i.test(config.database)) throw new Error(`Refusing to run API tests against "${config.database}".`);
  const pool = createPool(config, 20);
  const app = createApp({ pool, clock: CLOCK, defaultOrganisationId: 1 });

  const people = async (role: string) => {
    const res = await request(app).get('/api/employees').query({ role, limit: 1 });
    return res.body.data[0].employee_id as number;
  };

  // A second, tiny organisation with one of everything.
  const existing = await rows<{ organisation_id: number }>(pool, "SELECT organisation_id FROM organisation WHERE slug = 'other-org'");
  let orgId = existing[0]?.organisation_id;
  if (!orgId) {
    orgId = (await run(pool, "INSERT INTO organisation (name, slug, is_demo) VALUES ('Other Org', 'other-org', FALSE)")).insertId;
    const dept = (await run(pool, "INSERT INTO department (organisation_id, code, name) VALUES (?, 'OPS', 'Their Operations')", [orgId])).insertId;
    const emp = (await run(pool,
      "INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role) VALUES (?, 'EMP-9001', ?, 'Olga', 'Other', 'olga@other.example', 'Risk Officer', 'Risk Officer')",
      [orgId, dept])).insertId;
    await run(pool,
      "INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, status, identified_date) VALUES (?, 'RSK-0001', 'Their confidential risk', 'secret', 'Operational', ?, ?, 'Identified', '2026-01-01')",
      [orgId, dept, emp]);
    await run(pool,
      "INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, occurred_at, reported_at) VALUES (?, 'INC-0001', 'Their confidential incident', 'secret', 'High', 'Open', ?, ?, '2026-01-01 10:00:00', '2026-01-01 10:00:00')",
      [orgId, dept, emp]);
  }
  const one = async (sql: string) => (await rows<{ id: number }>(pool, sql, [orgId]))[0].id;
  return {
    pool,
    app,
    other: {
      organisationId: orgId,
      departmentId: await one('SELECT department_id AS id FROM department WHERE organisation_id = ?'),
      employeeId: await one('SELECT employee_id AS id FROM employee WHERE organisation_id = ?'),
      riskId: await one('SELECT risk_id AS id FROM risk WHERE organisation_id = ?'),
      incidentId: await one('SELECT incident_id AS id FROM incident WHERE organisation_id = ?'),
    },
    people: {
      admin: await people('Org Admin'),
      officer: await people('Risk Officer'),
      auditor: await people('Auditor'),
      employee: await people('Employee'),
    },
  };
}

export const as = (id: number, organisationId = 1) => ({ 'X-Actor-Id': String(id), 'X-Organisation-Id': String(organisationId) });

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
