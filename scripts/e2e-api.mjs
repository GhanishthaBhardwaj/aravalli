// Starts the API for the browser tests: builds a fresh, separate test database, then serves on port 3101.
// Never touches the development database (the name comes from TEST_DB_NAME, default aravalli_test).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const testDb = process.env.TEST_DB_NAME ?? 'aravalli_test';
const env = { ...process.env, DB_NAME: testDb, API_PORT: process.env.E2E_API_PORT ?? '3101', DEV_ORGANISATION_ID: '' };
delete env.DEV_ORGANISATION_ID;

const migrate = join(root, 'apps', 'api', 'src', 'db', 'migrate.ts');
for (const args of [['reset', '--yes'], ['up'], ['seed']]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', migrate, ...args], { env, cwd: join(root, 'apps', 'api'), encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`Preparing ${testDb} failed at "${args.join(' ')}":\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}
console.log(`test database ${testDb} is ready`);

const api = spawn(process.execPath, ['--import', 'tsx', join(root, 'apps', 'api', 'src', 'index.ts')], { env, cwd: join(root, 'apps', 'api'), stdio: 'inherit' });
const stop = () => api.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', (code) => process.exit(code ?? 0));
