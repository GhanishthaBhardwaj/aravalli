import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { defaultsFileText, type CliTls, type DbConfig } from './config';

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
    let tls: CliTls | undefined;
    if (config.sslCa || config.ssl) {
      // a given CA is checked against; otherwise the publicly trusted authorities that ship with Node are written to a file
      // (the mysql client on Windows has no certificate store of its own) and the host name is checked too
      const caPath = join(dir, 'ca.pem');
      writeFileSync(caPath, config.sslCa ?? rootCertificates.join('\n'), { mode: 0o600 });
      tls = { caPath, mode: config.sslCa ? 'VERIFY_CA' : 'VERIFY_IDENTITY' };
    }
    writeFileSync(defaults, defaultsFileText(config, tls), { mode: 0o600 });
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
