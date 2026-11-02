// Migration runner. Usage (from the repo root):
//   npm run db:migrate            apply every pending migration
//   npm run db:status             show which migrations have run
//   npm run db:seed               load the sample organisation
//   npm run db:reset -- --yes     drop the database (dev/test databases only)
// Connection details come from .env (see .env.example); real environment variables win over the file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDisposableDatabase, readDbConfig, type DbConfig } from './config';
import { listMigrations, parseAppliedRows, planMigrations, type AppliedMigration } from './migrations';
import { runMysql, type MysqlResult } from './mysql';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const repoRoot = join(apiRoot, '..', '..');
const migrationsDir = join(apiRoot, 'database', 'migrations');
const seedFile = join(apiRoot, 'database', 'seeds', 'demo-organisation.sql');

const envFile = join(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [command = 'up', ...flags] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function must(result: MysqlResult, what: string): MysqlResult {
  if (!result.ok) fail(`${what} failed:\n${result.stderr}`);
  return result;
}

let config: DbConfig;
try {
  config = readDbConfig(process.env);
} catch (e) {
  fail((e as Error).message);
}

const q = (sql: string, opts: { database?: boolean; query?: boolean } = {}) => runMysql(config, sql, opts);

function ensureDatabase() {
  must(q(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, { database: false }), `Creating database ${config.database}`);
  must(q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE = InnoDB;`), 'Creating schema_migrations');
}

function appliedRows(): AppliedMigration[] {
  const r = must(q('SELECT version, name, checksum FROM schema_migrations ORDER BY version;', { query: true }), 'Reading schema_migrations');
  return parseAppliedRows(r.stdout);
}

if (command === 'up') {
  ensureDatabase();
  const all = listMigrations(migrationsDir);
  const { pending, problems } = planMigrations(all, appliedRows());
  if (problems.length) fail(problems.join('\n'));
  if (!pending.length) console.log(`Database ${config.database} is up to date (${all.length} migrations).`);
  for (const m of pending) {
    process.stdout.write(`Applying ${m.file} ... `);
    const r = q(m.sql);
    if (!r.ok) fail(`FAILED\n${r.stderr}\nNothing after ${m.file} was applied. Fix the problem, then run the command again.`);
    must(q(`INSERT INTO schema_migrations (version, name, checksum) VALUES (${m.version}, '${m.name}', '${m.checksum}');`), `Recording ${m.file}`);
    console.log('done');
  }
} else if (command === 'status') {
  ensureDatabase();
  const all = listMigrations(migrationsDir);
  const applied = appliedRows();
  const done = new Set(applied.map((a) => a.version));
  for (const m of all) console.log(`${done.has(m.version) ? 'applied ' : 'pending '} ${m.file}`);
  const { problems } = planMigrations(all, applied);
  if (problems.length) fail(problems.join('\n'));
} else if (command === 'seed') {
  if (!existsSync(seedFile)) fail(`Seed file not found: ${seedFile}\nGenerate it with: npm run db:seed-sql`);
  must(q(readFileSync(seedFile, 'utf8')), 'Loading the sample organisation');
  console.log('Sample organisation loaded.');
} else if (command === 'reset') {
  if (!flags.includes('--yes')) fail(`This drops database "${config.database}" and everything in it.\nRun again with --yes to confirm.`);
  if (!isDisposableDatabase(config.database) && !flags.includes('--force')) {
    fail(`"${config.database}" does not look like a dev or test database, so it will not be dropped.\nRename it (for example aravalli_dev) or pass --force if you are sure.`);
  }
  must(q(`DROP DATABASE IF EXISTS \`${config.database}\`;`, { database: false }), 'Dropping the database');
  console.log(`Dropped ${config.database}. Run npm run db:migrate to recreate it.`);
} else {
  fail(`Unknown command "${command}". Use: up, status, seed, reset.`);
}
