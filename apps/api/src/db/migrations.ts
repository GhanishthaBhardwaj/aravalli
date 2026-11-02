import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const pad = (n: number) => String(n).padStart(4, '0');

export interface Migration {
  version: number;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

/** A row of the schema_migrations table. */
export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
}

/**
 * Reads NNNN_name.sql files in order. Numbers must start at 0001 and have no gaps,
 * so "what has run" is always a simple prefix of the list.
 */
export function listMigrations(dir: string): Migration[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let expected = 1;
  return files.map((file) => {
    const m = FILE.exec(file);
    if (!m) throw new Error(`Migration file names must look like 0001_name.sql: ${file}`);
    const version = Number(m[1]);
    if (version !== expected) throw new Error(`Migration numbers must be consecutive: expected ${pad(expected)} but found ${file}`);
    expected += 1;
    const sql = readFileSync(join(dir, file), 'utf8');
    // line endings must not change the checksum (Windows vs Linux checkouts)
    const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
    return { version, name: m[2], file, sql, checksum };
  });
}

/** Parses the tab-separated output of: SELECT version, name, checksum FROM schema_migrations. Accepts \n and \r\n line ends. */
export function parseAppliedRows(stdout: string): AppliedMigration[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [version, name, checksum] = line.split('\t');
      return { version: Number(version), name, checksum: checksum.trim() };
    });
}

export function planMigrations(all: Migration[], applied: AppliedMigration[]): { pending: Migration[]; problems: string[] } {
  const byVersion = new Map(all.map((m) => [m.version, m]));
  const problems: string[] = [];
  for (const a of applied) {
    const m = byVersion.get(a.version);
    if (!m) problems.push(`Migration ${pad(a.version)}_${a.name} was applied but its file is missing.`);
    else if (m.checksum !== a.checksum) problems.push(`${m.file} was edited after it was applied. Add a new migration instead of changing an applied one.`);
  }
  const done = new Set(applied.map((a) => a.version));
  const pending = all.filter((m) => !done.has(m.version));
  if (pending.length && applied.some((a) => a.version > pending[0].version)) {
    problems.push('Migrations were applied out of order.');
  }
  return { pending, problems };
}
