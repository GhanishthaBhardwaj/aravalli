// Builds a fresh, separate test database once per test run: drop, migrate, load the small sample organisation.
// It is never the development database: the name comes from TEST_DB_NAME (default aravalli_test) and the reset command
// itself refuses names that do not look disposable.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../src/core/config';

export default function setup(): void {
  loadEnvFile();
  const testDb = process.env.TEST_DB_NAME ?? 'aravalli_test';
  process.env.TEST_DB_NAME = testDb; // test workers started after this inherit it
  const migrate = fileURLToPath(new URL('../src/db/migrate.ts', import.meta.url));
  for (const args of [['reset', '--yes'], ['up'], ['seed']]) {
    const r = spawnSync(process.execPath, ['--import', 'tsx', migrate, ...args], {
      env: { ...process.env, DB_NAME: testDb },
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      throw new Error(`Preparing the test database failed at "${args.join(' ')}":\n${r.stdout}\n${r.stderr}\nIs MySQL running, and is .env filled in?`);
    }
  }
}
