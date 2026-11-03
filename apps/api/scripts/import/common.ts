// Shared by the two dataset importers. THE IMPORT PATH: it writes rows straight into the tables, on purpose bypassing the
// incident state machine (a real incident walks Open -> Investigating -> ... one step at a time; an imported one arrives
// already in the state the source record ended up in). Everything here is idempotent: re-running changes nothing.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbConfig } from '../../src/db/config';
import { unusablePassword } from '../../src/auth/crypto';
import { createPool, one, rows, run, type Pool } from '../../src/core/db';

export const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
export const rawDir = join(repoRoot, 'data', 'raw');

export function openPool(): Pool {
  const envFile = join(repoRoot, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (arg('db')) process.env.DB_NAME = arg('db');
  return createPool(readDbConfig(process.env), 4);
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** CSV with quoted fields and embedded newlines. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); out.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

/** Small stable hash, so "random-looking" choices (who reported it, what time of day) are the same on every run. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const DAY = 86_400_000;
/** Whole days from one calendar day to another (both 'YYYY-MM-DD'). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** A UTC millisecond timestamp as 'YYYY-MM-DD HH:MM:SS'. */
export const sqlTime = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Priya', 'Ethan', 'Chloe', 'Rohan', 'Grace', 'Marcus', 'Isha', 'Owen', 'Leila', 'Diego', 'Hana', 'Felix', 'Nadia', 'Caleb', 'Tara', 'Jonas', 'Amara', 'Victor', 'Zoe', 'Samir', 'Elena', 'Theo', 'Ruth', 'Kofi', 'Mina'];
const LAST = ['Sharma', 'Okafor', 'Brennan', 'Castillo', 'Novak', 'Iyer', 'Hartley', 'Nguyen', 'Bergstrom', 'Mehta', 'Kowalski', 'Adeyemi', 'Fischer', 'Ramos', 'Tanaka', 'Whitfield', 'Dube', 'Larsen', 'Costa', 'Banerjee', 'Moreau', 'Haddad', 'Pillai', 'Sutton', 'Volkov', 'Osei', 'Reyes', 'Lindqvist', 'Kapoor', 'Walsh'];
/** The n-th made-up person. */
export const personName = (n: number): [string, string] => [FIRST[n % FIRST.length]!, LAST[(Math.floor(n / FIRST.length) * 7 + n) % LAST.length]!];

export interface DeptSpec { code: string; name: string; headTitle: string; staffTitle: string }
export interface StaffMember { employee_id: number; department_id: number; role: string }
export interface OrgSetup {
  organisationId: number;
  departments: Map<string, number>;
  /** by department code */
  staff: Map<string, StaffMember[]>;
  head: Map<string, StaffMember>;
  byRole: Map<string, StaffMember[]>;
}

export interface OrgSpec {
  name: string;
  slug: string;
  domain: string;
  dataNote: string;
  createdAt: string;
  departments: DeptSpec[];
  staffPerDept: number;
  /** [role, department code, job title] for the organisation-wide people */
  central: Array<[string, string, string]>;
}

/** Creates (or finds) the organisation, its departments and its people. Safe to run again. */
export async function ensureOrganisation(pool: Pool, spec: OrgSpec): Promise<OrgSetup> {
  await run(pool, `INSERT INTO organisation (name, slug, is_demo, data_note, created_at) VALUES (?, ?, 0, ?, ?)
                   ON DUPLICATE KEY UPDATE name = VALUES(name), data_note = VALUES(data_note)`, [spec.name, spec.slug, spec.dataNote, spec.createdAt]);
  const org = (await one<{ organisation_id: number }>(pool, 'SELECT organisation_id FROM organisation WHERE slug = ?', [spec.slug]))!;
  const organisationId = org.organisation_id;

  for (const d of spec.departments) {
    await run(pool, 'INSERT INTO department (organisation_id, code, name, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [organisationId, d.code, d.name, spec.createdAt]);
  }
  const deptRows = await rows<{ department_id: number; code: string }>(pool, 'SELECT department_id, code FROM department WHERE organisation_id = ?', [organisationId]);
  const departments = new Map(deptRows.map((r) => [r.code, r.department_id]));

  const people: Array<{ code: string; dept: string; role: string; title: string }> = [];
  let n = 0;
  for (const d of spec.departments) {
    people.push({ code: `EMP-${1001 + n++}`, dept: d.code, role: 'Department Head', title: d.headTitle });
    for (let i = 0; i < spec.staffPerDept; i++) people.push({ code: `EMP-${1001 + n++}`, dept: d.code, role: 'Employee', title: d.staffTitle });
  }
  for (const [role, dept, title] of spec.central) people.push({ code: `EMP-${1001 + n++}`, dept, role, title });

  let k = 0;
  const seen = new Set<string>();
  const values: unknown[][] = [];
  const slugify = (a: string, b: string) => `${a}.${b}`.toLowerCase().replace(/[^a-z.]/g, '');
  for (const p of people) {
    let [first, last] = personName(k++);
    while (seen.has(slugify(first, last))) [first, last] = personName(k++);
    seen.add(slugify(first, last));
    values.push([organisationId, p.code, departments.get(p.dept), first, last, `${slugify(first, last)}@${spec.domain}`, p.title, p.role, spec.createdAt]);
  }
  await run(pool, `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role, created_at) VALUES ?
                   ON DUPLICATE KEY UPDATE job_title = VALUES(job_title)`, [values]);

  const emp = await rows<{ employee_id: number; department_id: number; role: string; code: string }>(
    pool, `SELECT e.employee_id, e.department_id, e.role, d.code FROM employee e JOIN department d ON d.department_id = e.department_id AND d.organisation_id = e.organisation_id
           WHERE e.organisation_id = ? ORDER BY e.employee_id`, [organisationId]);
  const staff = new Map<string, StaffMember[]>();
  const head = new Map<string, StaffMember>();
  const byRole = new Map<string, StaffMember[]>();
  for (const e of emp) {
    const m: StaffMember = { employee_id: e.employee_id, department_id: e.department_id, role: e.role };
    if (e.role === 'Department Head') head.set(e.code, m);
    if (e.role === 'Employee') (staff.get(e.code) ?? staff.set(e.code, []).get(e.code)!).push(m);
    (byRole.get(e.role) ?? byRole.set(e.role, []).get(e.role)!).push(m);
  }
  return { organisationId, departments, staff, head, byRole };
}

/** Inserts in batches and returns the number of rows inserted. Callers skip rows that already exist, so a duplicate is a loud error, not a silent skip. */
export async function bulkInsert(pool: Pool, table: string, columns: string[], data: unknown[][], batch = 1000): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < data.length; i += batch) {
    const r = await run(pool, `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`, [data.slice(i, i + batch)]);
    inserted += r.affectedRows;
  }
  return inserted;
}

/** Sets the record-code counter to the highest code in use, so the product carries on from there. */
export async function syncCounter(pool: Pool, organisationId: number, name: 'risk' | 'incident', table: string, column: string, prefix: string): Promise<void> {
  await run(pool, `INSERT INTO organisation_counter (organisation_id, counter_name, current_value)
                   SELECT ?, ?, COALESCE(MAX(CAST(SUBSTRING(${column}, ?) AS UNSIGNED)), 0) FROM ${table} WHERE organisation_id = ?
                   ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value))`, [organisationId, name, prefix.length + 1, organisationId]);
}

/** Existing incident codes/sources for an organisation, so a re-run skips what is already there and new codes carry on. */
export async function existingSources(pool: Pool, organisationId: number, system: string): Promise<{ ids: Set<string>; maxCode: number }> {
  const r = await rows<{ source_id: string }>(pool, 'SELECT source_id FROM incident WHERE organisation_id = ? AND source_system = ?', [organisationId, system]);
  const m = await one<{ n: number }>(pool, "SELECT COALESCE(MAX(CAST(SUBSTRING(incident_code, 5) AS UNSIGNED)), 0) AS n FROM incident WHERE organisation_id = ?", [organisationId]);
  return { ids: new Set(r.map((x) => x.source_id)), maxCode: m!.n };
}

export const incidentCode = (n: number): string => `INC-${String(n).padStart(4, '0')}`;

export const INCIDENT_COLUMNS = ['organisation_id', 'incident_code', 'title', 'description', 'severity', 'status', 'department_id', 'reported_by', 'assigned_to', 'occurred_at', 'reported_at', 'resolved_at', 'source_system', 'source_id', 'source_occurred_at', 'made_sla', 'reassignment_count', 'region', 'industry_code'];

export interface RiskSpec {
  title: string;
  description: string;
  category: string;
  dept: string;
  likelihood: number;
  impact: number;
  status: string;
  notes: string;
  /** SQL condition over `incident` (alias i) that decides which imported incidents this risk is linked to. */
  linkWhere: string;
  earlier: [number, number];
}

const daysAgo = (today: string, n: number): string => new Date(Date.parse(`${today}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

/** Hand-written risk register, linked to imported incidents by a stated rule. Idempotent by risk title. */
export async function ensureRisks(pool: Pool, setup: OrgSetup, specs: RiskSpec[], today: string): Promise<{ risks: number; linked: number }> {
  const org = setup.organisationId;
  const officer = setup.byRole.get('Risk Officer')![0]!;
  let linked = 0;
  let created = 0;
  for (const [i, s] of specs.entries()) {
    const existing = await one<{ risk_id: number }>(pool, 'SELECT risk_id FROM risk WHERE organisation_id = ? AND title = ?', [org, s.title]);
    let riskId = existing?.risk_id;
    if (!riskId) {
      const owner = setup.head.get(s.dept)!;
      const code = `RSK-${String(i + 1).padStart(4, '0')}`;
      const r = await run(pool, `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, status, identified_date)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [org, code, s.title, s.description, s.category, setup.departments.get(s.dept), owner.employee_id, s.status, daysAgo(today, 200 - i * 9)]);
      riskId = r.insertId;
      await run(pool, `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact, mitigation_notes) VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)`,
        [org, riskId, officer.employee_id, daysAgo(today, 190 - i * 9), s.earlier[0], s.earlier[1], 'Initial assessment.',
          org, riskId, officer.employee_id, daysAgo(today, 40 - i), s.likelihood, s.impact, s.notes]);
      created++;
    }
    const r = await run(pool, `UPDATE incident i SET i.risk_id = ? WHERE i.organisation_id = ? AND i.risk_id IS NULL AND (${s.linkWhere})`, [riskId, org]);
    linked += r.affectedRows;
  }
  await syncCounter(pool, org, 'risk', 'risk', 'risk_code', 'RSK-');
  return { risks: created, linked };
}

/**
 * One demo account per role, on existing employees. They have a random password nobody knows, so the only way in is the
 * demo login endpoint, which exists only when the server runs with DEMO_LOGINS=true. Idempotent.
 */
export async function ensureDemoUsers(pool: Pool, setup: OrgSetup, mainDepartment: string, now: string): Promise<number> {
  const pick: Array<[string, StaffMember | undefined]> = [
    ['Org Admin', setup.byRole.get('Org Admin')?.[0]],
    ['Risk Officer', setup.byRole.get('Risk Officer')?.[0]],
    ['Department Head', setup.head.get(mainDepartment)],
    ['Auditor', setup.byRole.get('Auditor')?.[0]],
    ['Employee', setup.staff.get(mainDepartment)?.[0]],
  ];
  let created = 0;
  for (const [, m] of pick) {
    if (!m) continue;
    const e = (await one<{ email: string }>(pool, 'SELECT email FROM employee WHERE employee_id = ?', [m.employee_id]))!;
    const exists = await one(pool, 'SELECT 1 AS x FROM user_account WHERE employee_id = ?', [m.employee_id]);
    if (exists) continue;
    await run(pool, `INSERT INTO user_account (organisation_id, employee_id, email, password_hash, is_demo, created_at) VALUES (?, ?, ?, ?, 1, ?)`,
      [setup.organisationId, m.employee_id, e.email, await unusablePassword(), now]);
    created++;
  }
  return created;
}
