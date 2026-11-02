import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultsFileText, type DbConfig } from './config';

export interface MysqlResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface Options {
  /** Connect to the configured database (default), or to the server only. */
  database?: boolean;
  /** Tab-separated rows without headers. */
  query?: boolean;
}

/**
 * Runs SQL through the `mysql` command-line client (no database driver dependency).
 * The password is passed in a temporary option file that is deleted afterwards, never on the command line.
 */
export function runMysql(config: DbConfig, sql: string, { database = true, query = false }: Options = {}): MysqlResult {
  const dir = mkdtempSync(join(tmpdir(), 'aravalli-mysql-'));
  try {
    const defaults = join(dir, 'client.cnf');
    writeFileSync(defaults, defaultsFileText(config), { mode: 0o600 });
    const args = [`--defaults-extra-file=${defaults}`, '--default-character-set=utf8mb4'];
    if (query) args.push('--batch', '--skip-column-names');
    if (database) args.push('--database', config.database);
    const r = spawnSync(config.mysqlBin, args, { input: sql, encoding: 'utf8' });
    if (r.error) {
      const hint = (r.error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `Could not run "${config.mysqlBin}". Install the MySQL client, or set MYSQL_BIN in .env to its full path.`
        : r.error.message;
      throw new Error(hint);
    }
    return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: (r.stderr ?? '').trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
