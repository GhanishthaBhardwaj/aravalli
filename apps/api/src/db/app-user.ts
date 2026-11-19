// Creates the database user the live app connects as, with the fewest permissions that let it work.
//
//   npm run db:app-user:prod       (reads .env.production: the ADMIN user in DB_USER / DB_PASSWORD, the new user in APP_DB_USER / APP_DB_PASSWORD)
//
// Why: the history tables (risk_assessment and incident_update) must be append-only. On MySQL, triggers refuse UPDATE and DELETE.
// TiDB has no triggers, so there the protection is a permission: this user may only SELECT and INSERT on those two tables.
// It has ordinary rights (SELECT, INSERT, UPDATE, DELETE) on every other table, and nothing on schema_migrations.
// Migrations and imports keep running as the admin user. Safe to run again: it also resets the user's password.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, rows } from '../core/db';
import { readDbConfig } from './config';
import { APPEND_ONLY_TABLES } from './tidb';

const repoRoot = join(fileURLToPath(new URL('../../', import.meta.url)), '..', '..');
if (existsSync(join(repoRoot, '.env'))) process.loadEnvFile(join(repoRoot, '.env'));

const admin = readDbConfig(process.env);
const appUser = process.env.APP_DB_USER;
const appPassword = process.env.APP_DB_PASSWORD;
if (!appUser || !appPassword) {
  console.error('Set APP_DB_USER and APP_DB_PASSWORD in .env.production (the user to create, and its password).');
  process.exit(1);
}
if (appUser === admin.user) {
  console.error('APP_DB_USER must be a different user from the admin user (DB_USER).');
  process.exit(1);
}
if (appPassword.length < 12) {
  console.error('APP_DB_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

const q = (name: string) => `\`${name}\``; // names come from SHOW TABLES, and the database name is checked by readDbConfig
const pool = createPool(admin, 2);
console.log(`Database: ${admin.database} on ${admin.host}, admin user ${admin.user}`);

try {
  const tables = await rows<Record<string, string>>(pool, 'SHOW FULL TABLES');
  const kind = (r: Record<string, string>) => r.Table_type ?? Object.values(r)[1];
  const name = (r: Record<string, string>) => Object.values(r)[0]!;
  const base = tables.filter((t) => kind(t) === 'BASE TABLE').map(name).filter((n) => n !== 'schema_migrations');
  const views = tables.filter((t) => kind(t) === 'VIEW').map(name);
  if (!base.length) throw new Error('The database has no tables yet. Run npm run db:migrate:prod first.');

  await pool.query("CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?", [appUser, appPassword]);
  await pool.query("ALTER USER ?@'%' IDENTIFIED BY ?", [appUser, appPassword]);
  const appendOnly = new Set<string>(APPEND_ONLY_TABLES);
  for (const t of base) {
    const rights = appendOnly.has(t) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE';
    await pool.query(`GRANT ${rights} ON ${q(admin.database)}.${q(t)} TO ?@'%'`, [appUser]);
  }
  for (const v of views) await pool.query(`GRANT SELECT ON ${q(admin.database)}.${q(v)} TO ?@'%'`, [appUser]);
  console.log(`User ${appUser} created. Full rights on ${base.length - appendOnly.size} tables, SELECT and INSERT only on ${[...appendOnly].join(' and ')}, SELECT on ${views.length} views.`);

  // Prove it: connect as the new user. WHERE 1 = 0 changes nothing, but MySQL and TiDB check the permission first.
  const app = createPool({ ...admin, user: appUser, password: appPassword }, 1);
  const attempts: Array<[string, string, boolean]> = [
    ['read incidents', 'SELECT COUNT(*) FROM incident', true],
    ['update an incident', 'UPDATE incident SET title = title WHERE 1 = 0', true],
    ['insert an incident update (history grows)', 'INSERT INTO incident_update (organisation_id) SELECT 0 WHERE 1 = 0', true],
    ...APPEND_ONLY_TABLES.flatMap((t): Array<[string, string, boolean]> => [
      [`update ${t}`, `UPDATE ${t} SET organisation_id = organisation_id WHERE 1 = 0`, false],
      [`delete from ${t}`, `DELETE FROM ${t} WHERE 1 = 0`, false],
    ]),
  ];
  let bad = 0;
  for (const [what, sql, allowed] of attempts) {
    let ok = true;
    let why = '';
    try {
      await app.query(sql);
    } catch (e) {
      ok = false;
      why = (e as Error).message;
    }
    const pass = ok === allowed;
    if (!pass) bad++;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${allowed ? 'allowed' : 'refused'}: ${what}${ok ? '' : ` (${why.slice(0, 90)})`}`);
  }
  await app.end();
  if (bad) {
    console.error('\nSome permission checks failed. If the refusals are missing, this database does not support table-level grants: see docs/DEPLOY-RENDER.md ("append-only history").');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Could not create the app user: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
