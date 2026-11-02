import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultsFileText } from './config.mjs';

/**
 * Runs SQL through the `mysql` command-line client (no database driver dependency).
 * The password is passed in a temporary option file that is deleted afterwards.
 * @param {ReturnType<typeof import('./config.mjs').readDbConfig>} config
 * @param {string} sql
 * @param {{ database?: boolean, query?: boolean }} [options]  query: tab-separated rows without headers
 */
export function runMysql(config, sql, { database = true, query = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aravalli-mysql-'));
  try {
    const defaults = join(dir, 'client.cnf');
    writeFileSync(defaults, defaultsFileText(config), { mode: 0o600 });
    const args = [`--defaults-extra-file=${defaults}`, '--default-character-set=utf8mb4'];
    if (query) args.push('--batch', '--skip-column-names');
    if (database) args.push('--database', config.database);
    const r = spawnSync(config.mysqlBin, args, { input: sql, encoding: 'utf8' });
    if (r.error) {
      const hint = /** @type {NodeJS.ErrnoException} */ (r.error).code === 'ENOENT'
        ? `Could not run "${config.mysqlBin}". Install the MySQL client, or set MYSQL_BIN in .env to its full path.`
        : r.error.message;
      throw new Error(hint);
    }
    return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: (r.stderr ?? '').trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
