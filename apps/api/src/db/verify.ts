// Proves the schema on a real MySQL server.
//   npm run db:verify                       prints the results
//   npm run db:verify -- --report docs/db-verification.md   also saves them as a report
// Expected values are derived from the shared sample dataset, so they cannot drift from the seed.
//
// It builds a throwaway database called <DB_NAME>_verify (dropped and recreated each run), applies every
// migration and the sample seed, then tries things that must work and things that must be REJECTED.
// Each check runs as its own statement so MySQL's real error message is captured. Your DB_NAME database is
// never touched. The MySQL user needs permission to create databases.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from '@aravalli/shared';
import { readDbConfig } from './config';
import { listMigrations } from './migrations';
import { runMysql } from './mysql';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = join(apiRoot, '..', '..');
if (existsSync(join(repoRoot, '.env'))) process.loadEnvFile(join(repoRoot, '.env'));

const base = readDbConfig(process.env);
const verifyDb = `${base.database}_verify`;
const config = { ...base, database: verifyDb };
const reportFlag = process.argv.indexOf('--report');
const reportPath = reportFlag > -1 ? resolve(process.argv[reportFlag + 1]) : null;

const run = (sql: string, opts?: { database?: boolean; query?: boolean }) => runMysql(config, sql, opts);
const one = (sql: string) => run(sql, { query: true }).stdout.trim();

// ---------------------------------------------------------------- build the database
const setup = runMysql(config, `DROP DATABASE IF EXISTS \`${verifyDb}\`; CREATE DATABASE \`${verifyDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, { database: false });
if (!setup.ok) {
  console.error(`Could not create ${verifyDb}:\n${setup.stderr}`);
  process.exit(1);
}
for (const m of listMigrations(join(apiRoot, 'database', 'migrations'))) {
  const r = run(m.sql);
  if (!r.ok) {
    console.error(`Migration ${m.file} failed:\n${r.stderr}`);
    process.exit(1);
  }
}
const seedSql = readFileSync(join(apiRoot, 'database', 'seeds', 'demo-organisation.sql'), 'utf8');
const seeded = run(seedSql);
if (!seeded.ok) {
  console.error(`Seed failed:\n${seeded.stderr}`);
  process.exit(1);
}
const version = one('SELECT VERSION();');

// ---------------------------------------------------------------- the checks
const ORG1 = `(SELECT organisation_id FROM organisation WHERE slug = 'aravalli-industries')`;
const ORG2 = `(SELECT organisation_id FROM organisation WHERE slug = 'verify-co')`;
const dept = (org: string, code: string) => `(SELECT department_id FROM department WHERE organisation_id = ${org} AND code = '${code}')`;
const emp = (org: string, code: string) => `(SELECT employee_id FROM employee WHERE organisation_id = ${org} AND employee_code = '${code}')`;
const risk = (org: string, code: string) => `(SELECT risk_id FROM risk WHERE organisation_id = ${org} AND risk_code = '${code}')`;
const inc = (org: string, code: string) => `(SELECT incident_id FROM incident WHERE organisation_id = ${org} AND incident_code = '${code}')`;

type Expectation = { ok: true } | { reject: RegExp } | { value: { sql: string; expected: string } };
interface Check { group: string; name: string; sql: string; expect: Expectation }

const OK: Expectation = { ok: true };
const reject = (pattern: RegExp): Expectation => ({ reject: pattern });

/** group, name, sql, expectation. Positive controls come first so the later checks have rows to attack. */
const checks: Check[] = [];
const add = (group: string, name: string, sql: string, expect: Expectation) => { checks.push({ group, name, sql, expect }); };

// Setup of a second organisation, which also proves per-organisation uniqueness.
add('Tenancy: allowed', 'a second organisation can be created', `INSERT INTO organisation (name, slug) VALUES ('Verify Co', 'verify-co');`, OK);
add('Tenancy: allowed', 'the same department code can exist in two organisations', `INSERT INTO department (organisation_id, code, name) VALUES (${ORG2}, 'FIN', 'Finance');`, OK);
add('Tenancy: allowed', 'the same employee code and email can exist in two organisations', `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role)
  VALUES (${ORG2}, 'EMP-1001', ${dept(ORG2, 'FIN')}, 'Rajesh', 'Khanna', 'rajesh.khanna@aravalli-industries.example', 'Head of Finance', 'Department Head');`, OK);
add('Tenancy: allowed', 'the same risk code can exist in two organisations', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG2}, 'RSK-0001', 'Supplier concentration risk', 'Single supplier for a key input.', 'Operational', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-01-10');`, OK);
add('Tenancy: allowed', 'an incident may have no assignee and no linked risk', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, department_id, reported_by, occurred_at, reported_at)
  VALUES (${ORG2}, 'INC-0001', 'Late supplier delivery', 'Delivery was two days late.', 'Low', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 10:00:00');`, OK);

add('Tenancy: rejected', 'duplicate organisation slug', `INSERT INTO organisation (name, slug) VALUES ('Copycat', 'verify-co');`, reject(/ERROR 1062.*uq_organisation_slug/s));
add('Tenancy: rejected', 'slug that is not url-safe', `INSERT INTO organisation (name, slug) VALUES ('Bad', 'Bad Slug');`, reject(/ERROR 3819.*ck_organisation_slug/s));
add('Tenancy: rejected', 'duplicate department code inside one organisation', `INSERT INTO department (organisation_id, code, name) VALUES (${ORG2}, 'FIN', 'Finance again');`, reject(/ERROR 1062/s));
add('Tenancy: rejected', 'duplicate employee email inside one organisation', `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role)
  VALUES (${ORG2}, 'EMP-2000', ${dept(ORG2, 'FIN')}, 'Dup', 'Email', 'rajesh.khanna@aravalli-industries.example', 'Clerk', 'Employee');`, reject(/ERROR 1062.*uq_employee_org_email/s));
add('Tenancy: rejected', 'duplicate risk code inside one organisation', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG2}, 'RSK-0001', 'Another risk', 'Same code again.', 'Financial', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-01-11');`, reject(/ERROR 1062.*uq_risk_org_code/s));
add('Tenancy: rejected', 'employee in organisation 2 pointing at a department of organisation 1', `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role)
  VALUES (${ORG2}, 'EMP-3000', ${dept(ORG1, 'FIN')}, 'Cross', 'Tenant', 'cross@example.test', 'Clerk', 'Employee');`, reject(/ERROR 1452.*fk_employee_department/s));
add('Tenancy: rejected', 'risk in organisation 1 owned by an employee of organisation 2', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG1}, 'RSK-9001', 'Cross tenant owner', 'Owner belongs to another organisation.', 'Financial', ${dept(ORG1, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-01-12');`, reject(/ERROR 1452.*fk_risk_owner/s));
add('Tenancy: rejected', 'assessment by an assessor from another organisation', `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact)
  VALUES (${ORG1}, ${risk(ORG1, 'RSK-0001')}, ${emp(ORG2, 'EMP-1001')}, '2026-03-01', 2, 2);`, reject(/ERROR 1452.*fk_assessment_assessor/s));
add('Tenancy: rejected', 'incident assigned to an employee of another organisation', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, department_id, reported_by, assigned_to, occurred_at, reported_at)
  VALUES (${ORG1}, 'INC-9001', 'Cross tenant assignee', 'Assignee belongs to another organisation.', 'Low', ${dept(ORG1, 'FIN')}, ${emp(ORG1, 'EMP-1001')}, ${emp(ORG2, 'EMP-1001')}, '2026-03-01 09:00:00', '2026-03-01 10:00:00');`, reject(/ERROR 1452.*fk_incident_assignee/s));
add('Tenancy: rejected', 'incident linked to a risk of another organisation', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, department_id, reported_by, risk_id, occurred_at, reported_at)
  VALUES (${ORG1}, 'INC-9002', 'Cross tenant risk', 'Risk belongs to another organisation.', 'Low', ${dept(ORG1, 'FIN')}, ${emp(ORG1, 'EMP-1001')}, ${risk(ORG2, 'RSK-0001')}, '2026-03-01 09:00:00', '2026-03-01 10:00:00');`, reject(/ERROR 1452.*fk_incident_risk/s));
add('Tenancy: rejected', 'incident update by an author from another organisation', `INSERT INTO incident_update (organisation_id, incident_id, updated_by, update_text, created_at)
  VALUES (${ORG1}, ${inc(ORG1, 'INC-0001')}, ${emp(ORG2, 'EMP-1001')}, 'Sneaky update', '2026-03-01 09:00:00');`, reject(/ERROR 1452.*fk_update_author/s));

add('Constraints: rejected', 'role that is not in the list (the old name Administrator)', `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role)
  VALUES (${ORG2}, 'EMP-4000', ${dept(ORG2, 'FIN')}, 'Old', 'Role', 'old.role@example.test', 'Admin', 'Administrator');`, reject(/ERROR 3819.*ck_employee_role/s));
add('Constraints: rejected', 'risk category that is not in the list', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG2}, 'RSK-0002', 'Bad category risk', 'Category is invalid.', 'Cosmic', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-01-12');`, reject(/ERROR 3819.*ck_risk_category/s));
add('Constraints: rejected', 'risk status that is not in the list', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, status, identified_date)
  VALUES (${ORG2}, 'RSK-0003', 'Bad status risk', 'Status is invalid.', 'Financial', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, 'Maybe', '2026-01-12');`, reject(/ERROR 3819.*ck_risk_status/s));
add('Constraints: rejected', 'risk title shorter than 5 characters', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG2}, 'RSK-0004', 'abc', 'Title too short.', 'Financial', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-01-12');`, reject(/ERROR 3819.*ck_risk_title_len/s));
add('Constraints: allowed', 'a valid assessment is accepted', `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact)
  VALUES (${ORG2}, ${risk(ORG2, 'RSK-0001')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-10', 4, 5);`, OK);
add('Constraints: rejected', 'likelihood of 6', `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact)
  VALUES (${ORG2}, ${risk(ORG2, 'RSK-0001')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-11', 6, 3);`, reject(/ERROR 3819.*ck_assessment_likelihood/s));
add('Constraints: rejected', 'impact of 0', `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact)
  VALUES (${ORG2}, ${risk(ORG2, 'RSK-0001')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-11', 3, 0);`, reject(/ERROR 3819.*ck_assessment_impact/s));
add('Constraints: rejected', 'writing risk_score directly (it is a generated column)', `INSERT INTO risk_assessment (organisation_id, risk_id, assessed_by, assessment_date, likelihood, impact, risk_score)
  VALUES (${ORG2}, ${risk(ORG2, 'RSK-0001')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-11', 3, 3, 25);`, reject(/ERROR 3105/s));
add('Constraints: rejected', 'incident severity that is not in the list', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, department_id, reported_by, occurred_at, reported_at)
  VALUES (${ORG2}, 'INC-0002', 'Bad severity', 'Severity invalid.', 'Catastrophic', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 10:00:00');`, reject(/ERROR 3819.*ck_incident_severity/s));
add('Constraints: rejected', 'incident reported before it occurred', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, department_id, reported_by, occurred_at, reported_at)
  VALUES (${ORG2}, 'INC-0003', 'Time travel', 'Reported before it happened.', 'Low', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 08:00:00');`, reject(/ERROR 3819.*ck_incident_reported_after_occurred/s));
add('Constraints: rejected', 'incident resolved before it occurred', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, occurred_at, reported_at, resolved_at)
  VALUES (${ORG2}, 'INC-0004', 'Early fix', 'Resolved before it happened.', 'Low', 'Resolved', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 10:00:00', '2026-02-01 08:00:00');`, reject(/ERROR 3819/s));
add('Constraints: rejected', 'a Resolved incident with no resolution time', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, occurred_at, reported_at)
  VALUES (${ORG2}, 'INC-0005', 'Resolved but when', 'No resolved_at.', 'Low', 'Resolved', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 10:00:00');`, reject(/ERROR 3819.*ck_incident_resolved_matches_status/s));
add('Constraints: rejected', 'an Open incident that already has a resolution time', `INSERT INTO incident (organisation_id, incident_code, title, description, severity, status, department_id, reported_by, occurred_at, reported_at, resolved_at)
  VALUES (${ORG2}, 'INC-0006', 'Open but resolved', 'Has resolved_at.', 'Low', 'Open', ${dept(ORG2, 'FIN')}, ${emp(ORG2, 'EMP-1001')}, '2026-02-01 09:00:00', '2026-02-01 10:00:00', '2026-02-02 10:00:00');`, reject(/ERROR 3819.*ck_incident_resolved_matches_status/s));
add('Constraints: allowed', 'a valid incident update is accepted', `INSERT INTO incident_update (organisation_id, incident_id, updated_by, update_text, status_from, status_to, created_at)
  VALUES (${ORG2}, ${inc(ORG2, 'INC-0001')}, ${emp(ORG2, 'EMP-1001')}, 'Incident reported', NULL, 'Open', '2026-02-01 10:00:00');`, OK);
add('Constraints: rejected', 'an update to a status that is not in the list', `INSERT INTO incident_update (organisation_id, incident_id, updated_by, update_text, status_from, status_to, created_at)
  VALUES (${ORG2}, ${inc(ORG2, 'INC-0001')}, ${emp(ORG2, 'EMP-1001')}, 'Bad status', 'Open', 'Vanished', '2026-02-01 11:00:00');`, reject(/ERROR 3819.*ck_update_status_to/s));

add('Triggers: rejected', 'updating a risk assessment (history is append-only)', `UPDATE risk_assessment SET likelihood = 1 WHERE organisation_id = ${ORG1} LIMIT 1;`, reject(/ERROR 1644.*risk_assessment history is append-only/s));
add('Triggers: rejected', 'deleting a risk assessment', `DELETE FROM risk_assessment WHERE organisation_id = ${ORG1} LIMIT 1;`, reject(/ERROR 1644.*risk_assessment history is append-only/s));
add('Triggers: rejected', 'updating an incident update', `UPDATE incident_update SET update_text = 'Edited' WHERE organisation_id = ${ORG1} LIMIT 1;`, reject(/ERROR 1644.*incident_update is append-only/s));
add('Triggers: rejected', 'deleting an incident update', `DELETE FROM incident_update WHERE organisation_id = ${ORG1} LIMIT 1;`, reject(/ERROR 1644.*incident_update is append-only/s));
add('Constraints: allowed', 'a risk can be owned by someone from another department (a Risk Officer can own risks across departments)', `INSERT INTO risk (organisation_id, risk_code, title, description, category, department_id, owner_employee_id, identified_date)
  VALUES (${ORG1}, 'RSK-9002', 'Cross department owner', 'Owner is in Finance, risk is in IT.', 'Technology', ${dept(ORG1, 'IT')}, ${emp(ORG1, 'EMP-1001')}, '2026-01-12');`, OK);

add('Delete protection: rejected', 'deleting an employee who owns risks', `DELETE FROM employee WHERE organisation_id = ${ORG1} AND employee_code = 'EMP-1014';`, reject(/ERROR 1451/s));
add('Delete protection: rejected', 'deleting a department that has employees', `DELETE FROM department WHERE organisation_id = ${ORG1} AND code = 'FIN';`, reject(/ERROR 1451/s));
add('Delete protection: rejected', 'deleting a risk that has assessments', `DELETE FROM risk WHERE organisation_id = ${ORG1} AND risk_code = 'RSK-0001';`, reject(/ERROR 1451/s));
add('Delete protection: rejected', 'deleting an incident that has updates', `DELETE FROM incident WHERE organisation_id = ${ORG1} AND incident_code = 'INC-0001';`, reject(/ERROR 1451/s));
add('Delete protection: rejected', 'deleting an organisation that has data', `DELETE FROM organisation WHERE slug = 'aravalli-industries';`, reject(/ERROR 1451/s));

// Values, not just success: these compare what the database returns with what the app expects.
const VALUE = (sql: string, expected: string): Expectation => ({ value: { sql, expected } });

const latest = (riskId: number) => seed.risk_assessments
  .filter((a) => a.risk_id === riskId)
  .sort((a, b) => (a.assessment_date === b.assessment_date ? a.assessment_id - b.assessment_id : a.assessment_date < b.assessment_date ? -1 : 1))
  .at(-1)!;
const riskByCode = (code: string) => seed.risks.find((r) => r.risk_code === code)!;
const band = (s: number) => (s >= 20 ? 'Critical' : s >= 10 ? 'High' : s >= 5 ? 'Medium' : 'Low');
const rsk2 = latest(riskByCode('RSK-0002').risk_id).risk_score;
const rsk1 = latest(riskByCode('RSK-0001').risk_id).risk_score;
const unrated = seed.risks.filter((r) => !seed.risk_assessments.some((a) => a.risk_id === r.risk_id)).length;
const openStatuses: string[] = ['Open', 'Investigating', 'Contained'];
const unassignedOpen = seed.incidents.filter((i) => openStatuses.includes(i.status) && i.assigned_to === null).length;
add('Views and values', 'risk_score is generated as likelihood x impact', 'SELECT 1;', VALUE(`SELECT risk_score FROM risk_assessment WHERE organisation_id = ${ORG2} LIMIT 1;`, '20'));
add('Views and values', 'v_risk_current: every risk of the sample organisation is listed', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_risk_current WHERE organisation_id = ${ORG1};`, String(seed.risks.length)));
add('Views and values', 'v_risk_current: RSK-0002 shows its latest score and band', 'SELECT 1;', VALUE(`SELECT CONCAT(risk_score, ' ', severity_band) FROM v_risk_current WHERE organisation_id = ${ORG1} AND risk_code = 'RSK-0002';`, `${rsk2} ${band(rsk2)}`));
add('Views and values', 'v_risk_current: never-assessed risks are Unrated', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_risk_current WHERE organisation_id = ${ORG1} AND severity_band = 'Unrated';`, String(unrated)));
add('Views and values', 'v_risk_current uses the latest assessment, not the first (RSK-0001 has several)', 'SELECT 1;', VALUE(`SELECT risk_score FROM v_risk_current WHERE organisation_id = ${ORG1} AND risk_code = 'RSK-0001';`, String(rsk1)));
add('Views and values', 'v_incident_summary: every incident of the sample organisation is listed', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_incident_summary WHERE organisation_id = ${ORG1};`, String(seed.incidents.length)));
add('Views and values', 'v_incident_summary: open incidents with nobody assigned match the seed', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_incident_summary WHERE organisation_id = ${ORG1} AND assigned_to_name IS NULL AND status IN ('Open','Investigating','Contained');`, String(unassignedOpen)));
add('Views and values', 'views are tenant-scoped: organisation 2 sees only its own 1 risk', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_risk_current WHERE organisation_id = ${ORG2};`, '1'));
add('Views and values', 'views are tenant-scoped: organisation 2 sees only its own 1 incident', 'SELECT 1;', VALUE(`SELECT COUNT(*) FROM v_incident_summary WHERE organisation_id = ${ORG2};`, '1'));
add('Views and values', 'seed has the expected rows (risks, assessments, incidents, updates)', 'SELECT 1;',
  VALUE(`SELECT CONCAT((SELECT COUNT(*) FROM risk WHERE organisation_id = ${ORG1}), '/', (SELECT COUNT(*) FROM risk_assessment WHERE organisation_id = ${ORG1}), '/', (SELECT COUNT(*) FROM incident WHERE organisation_id = ${ORG1}), '/', (SELECT COUNT(*) FROM incident_update WHERE organisation_id = ${ORG1}));`, `${seed.risks.length}/${seed.risk_assessments.length}/${seed.incidents.length}/${seed.incident_updates.length}`));

// The reporting queries must all run.
const queriesFile = readFileSync(join(apiRoot, 'database', 'queries.sql'), 'utf8');
add('Reporting queries', 'every query in queries.sql runs without error', queriesFile, OK);

// ---------------------------------------------------------------- run and report
interface Result extends Check { pass: boolean; detail: string }
const results: Result[] = [];
for (const c of checks) {
  const r = run(c.sql);
  let pass: boolean;
  let detail: string;
  const expect = c.expect;
  if ('ok' in expect) {
    pass = r.ok;
    detail = r.ok ? 'accepted' : r.stderr;
  } else if ('reject' in expect) {
    pass = !r.ok && expect.reject.test(r.stderr);
    detail = r.ok ? 'ACCEPTED, but it should have been rejected' : r.stderr;
  } else {
    const got = one(expect.value.sql);
    pass = got === expect.value.expected;
    detail = `returned ${JSON.stringify(got)}, expected ${JSON.stringify(expect.value.expected)}`;
  }
  results.push({ ...c, pass, detail: detail.replace(/\s+/g, ' ').trim() });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.group}: ${c.name}${pass ? '' : `\n      ${detail}`}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed on MySQL ${version}.`);

if (reportPath) {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const lines = [
    '# Database verification',
    '',
    `Run on MySQL **${version}** at ${stamp} (UTC), against a throwaway database built from the migrations in \`apps/api/database/migrations\` and the sample seed.`,
    '',
    `**Result: ${results.length - failed.length} of ${results.length} checks passed.**`,
    '',
    'Each "rejected" check is a statement that must fail; the MySQL error text shown is what the server actually returned.',
    '',
  ];
  let group = '';
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      lines.push(`## ${group}`, '', '| Result | Check | What MySQL said |', '| --- | --- | --- |');
    }
    lines.push(`| ${r.pass ? 'PASS' : '**FAIL**'} | ${r.name} | ${r.detail.replace(/\|/g, '\\|').slice(0, 300)} |`);
    const next = results[results.indexOf(r) + 1];
    if (!next || next.group !== group) lines.push('');
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Report written to ${reportPath}`);
}
process.exit(failed.length ? 1 : 0);
