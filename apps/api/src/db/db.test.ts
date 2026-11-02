import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bandFor, INCIDENT_STATUSES, RISK_CATEGORIES, RISK_STATUSES, ROLES, seed, SEVERITIES,
} from '@aravalli/shared';
import { defaultsFileText, isDisposableDatabase, readDbConfig } from './config';
import { listMigrations, planMigrations } from './migrations';

const dbDir = fileURLToPath(new URL('../../database/', import.meta.url));
const migrations = listMigrations(join(dbDir, 'migrations'));
// comments are removed so that the checks measure real statements, not explanations of them
const sql = migrations.map((m) => m.sql.replace(/--.*$/gm, '')).join('\n');

const tmpDirs: string[] = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), 'aravalli-test-'));
  tmpDirs.push(d);
  return d;
};
afterEach(() => { while (tmpDirs.length) rmSync(tmpDirs.pop() as string, { recursive: true, force: true }); });

describe('database settings', () => {
  const ok = { DB_HOST: '127.0.0.1', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'aravalli_dev' };

  it('reads settings from the environment and defaults the port', () => {
    expect(readDbConfig(ok)).toMatchObject({ host: '127.0.0.1', port: 3306, user: 'u', password: 'p', database: 'aravalli_dev', mysqlBin: 'mysql' });
  });
  it('lists every missing setting and tells the reader what to do', () => {
    expect(() => readDbConfig({})).toThrow(/DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.*\.env\.example/);
  });
  it('allows an empty password but not an empty user', () => {
    expect(readDbConfig({ ...ok, DB_PASSWORD: '' }).password).toBe('');
    expect(() => readDbConfig({ ...ok, DB_USER: '' })).toThrow(/DB_USER/);
  });
  it('rejects a bad port and a database name that could break out of a statement', () => {
    expect(() => readDbConfig({ ...ok, DB_PORT: 'abc' })).toThrow(/DB_PORT/);
    expect(() => readDbConfig({ ...ok, DB_NAME: 'x`; DROP DATABASE y; --' })).toThrow(/DB_NAME/);
  });
  it('keeps the password out of the command line by writing an escaped option file', () => {
    const text = defaultsFileText({ host: 'h', port: 3307, user: 'u', password: 'p"a\\ss' });
    expect(text).toContain('password="p\\"a\\\\ss"');
    expect(text.startsWith('[client]')).toBe(true);
  });
  it('only treats dev/test-looking databases as safe to drop', () => {
    for (const n of ['aravalli_dev', 'dev', 'app_test', 'local_x', 'aravalli_dev_verify']) expect(isDisposableDatabase(n)).toBe(true);
    for (const n of ['aravalli', 'production', 'devices', 'protest']) expect(isDisposableDatabase(n)).toBe(false);
  });
});

describe('migration planner', () => {
  const write = (dir: string, name: string, body = 'SELECT 1;') => writeFileSync(join(dir, name), body);

  it('lists files in numeric order with a stable checksum that ignores line endings', () => {
    const dir = scratch();
    write(dir, '0002_b.sql', 'B\r\nline');
    write(dir, '0001_a.sql', 'A');
    const a = listMigrations(dir);
    expect(a.map((m) => m.file)).toEqual(['0001_a.sql', '0002_b.sql']);
    const dir2 = scratch();
    write(dir2, '0001_a.sql', 'A');
    write(dir2, '0002_b.sql', 'B\nline');
    expect(listMigrations(dir2)[1].checksum).toBe(a[1].checksum);
  });
  it('rejects a gap, a duplicate and a badly named file', () => {
    const gap = scratch(); write(gap, '0001_a.sql'); write(gap, '0003_c.sql');
    expect(() => listMigrations(gap)).toThrow(/consecutive/);
    const dup = scratch(); write(dup, '0001_a.sql'); write(dup, '0001_b.sql');
    expect(() => listMigrations(dup)).toThrow(/consecutive/);
    const bad = scratch(); write(bad, 'add_tables.sql');
    expect(() => listMigrations(bad)).toThrow(/0001_name\.sql/);
  });
  it('plans only what has not run, in order', () => {
    const dir = scratch();
    for (const n of ['0001_a.sql', '0002_b.sql', '0003_c.sql']) write(dir, n, n);
    const all = listMigrations(dir);
    const applied = [all[0]].map(({ version, name, checksum }) => ({ version, name, checksum }));
    const { pending, problems } = planMigrations(all, applied);
    expect(problems).toEqual([]);
    expect(pending.map((m) => m.version)).toEqual([2, 3]);
    expect(planMigrations(all, all.map(({ version, name, checksum }) => ({ version, name, checksum }))).pending).toEqual([]);
  });
  it('refuses to continue when an applied migration was edited or its file is gone', () => {
    const dir = scratch();
    write(dir, '0001_a.sql', 'original');
    const [m] = listMigrations(dir);
    write(dir, '0001_a.sql', 'edited');
    const edited = planMigrations(listMigrations(dir), [{ version: 1, name: 'a', checksum: m.checksum }]);
    expect(edited.problems[0]).toMatch(/0001_a\.sql was edited after it was applied/);
    const missing = planMigrations([], [{ version: 1, name: 'a', checksum: m.checksum }]);
    expect(missing.problems[0]).toMatch(/file is missing/);
  });
  it('flags migrations applied out of order', () => {
    const dir = scratch();
    for (const n of ['0001_a.sql', '0002_b.sql', '0003_c.sql']) write(dir, n, n);
    const all = listMigrations(dir);
    const { problems } = planMigrations(all, [all[0], all[2]].map(({ version, name, checksum }) => ({ version, name, checksum })));
    expect(problems.join()).toMatch(/out of order/);
  });
});

describe('the schema, read as text (guarantees that hold before any server is involved)', () => {
  const tenantTables = ['department', 'employee', 'risk', 'risk_assessment', 'incident', 'incident_update'];

  it('has consecutive migrations from 0001', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(6);
    expect(migrations[0].file).toBe('0001_organisation.sql');
  });
  it('gives every tenant-owned table a NOT NULL organisation_id', () => {
    for (const t of tenantTables) {
      const body = new RegExp(`CREATE TABLE ${t} \\(([\\s\\S]*?)\\) ENGINE`).exec(sql)?.[1] ?? '';
      expect(body, t).toMatch(/organisation_id\s+INT UNSIGNED NOT NULL/);
    }
  });
  it('makes every foreign key to a tenant table composite, so a row cannot point into another organisation', () => {
    const fks = [...sql.matchAll(/FOREIGN KEY \(([^)]*)\)\s+REFERENCES (\w+) \(([^)]*)\)/g)];
    expect(fks.length).toBeGreaterThanOrEqual(12);
    for (const [, from, target, to] of fks) {
      if (target === 'organisation') continue;
      expect(from, `${target} reference columns`).toMatch(/organisation_id/);
      expect(to, `${target} referenced columns`).toMatch(/organisation_id/);
    }
  });
  it('uses ON DELETE RESTRICT everywhere, so history is never cascaded away', () => {
    const fkCount = (sql.match(/FOREIGN KEY/g) ?? []).length;
    expect((sql.match(/ON DELETE RESTRICT/g) ?? []).length).toBe(fkCount);
    expect(sql).not.toMatch(/ON DELETE (CASCADE|SET NULL|SET DEFAULT)/);
  });
  it('scopes every code, name and email uniqueness to the organisation', () => {
    const uniques = [...sql.matchAll(/UNIQUE KEY (uq_\w+) \(([^)]*)\)/g)].filter(([, name]) => /_(code|name|email)$/.test(name));
    expect(uniques.length).toBeGreaterThanOrEqual(5);
    for (const [, name, cols] of uniques) expect(cols, name).toMatch(/organisation_id/);
  });
  it('never drops anything', () => {
    expect(sql).not.toMatch(/DROP\s+(DATABASE|TABLE|SCHEMA)/i);
  });
  it('protects both history tables from updates and deletes', () => {
    for (const t of ['risk_assessment', 'incident_update']) {
      expect(sql).toMatch(new RegExp(`BEFORE UPDATE ON ${t}`));
      expect(sql).toMatch(new RegExp(`BEFORE DELETE ON ${t}`));
    }
  });
  it('does not tie a risk owner to the risk department (a Risk Officer can own risks across departments)', () => {
    expect(sql).not.toMatch(/trg_risk_owner/);
    expect(sql).not.toMatch(/owner must belong/);
  });
  it('keeps the resolved_at rule', () => {
    expect(sql).toMatch(/ck_incident_resolved_matches_status/);
  });
  it('keeps the risk score a generated column, never stored by hand', () => {
    expect(sql).toMatch(/risk_score\s+TINYINT UNSIGNED GENERATED ALWAYS AS \(likelihood \* impact\) STORED/);
  });
  it('both views expose organisation_id so queries can be tenant-scoped', () => {
    for (const v of ['v_risk_current', 'v_incident_summary']) {
      const body = new RegExp(`CREATE VIEW ${v} AS\\s+SELECT ([\\s\\S]*?)\\sFROM\\s`).exec(sql)?.[1] ?? '';
      expect(body, v).toMatch(/organisation_id/);
    }
  });
  it('writes the severity bands the same way the app scores them', () => {
    expect(sql).toMatch(/risk_score >= 20\s+THEN 'Critical'/);
    expect(sql).toMatch(/risk_score >= 10\s+THEN 'High'/);
    expect(sql).toMatch(/risk_score >= 5\s+THEN 'Medium'/);
    expect([bandFor(20), bandFor(19), bandFor(10), bandFor(9), bandFor(5), bandFor(4)]).toEqual(['Critical', 'High', 'High', 'Medium', 'Medium', 'Low']);
  });
});

describe('the SQL value lists match the TypeScript ones (they are written twice, so this guards against drift)', () => {
  const listFor = (constraint: string) => {
    const m = new RegExp(`${constraint}\\s+CHECK\\s*\\([\\s\\S]*?IN\\s*\\(([^)]*)\\)`).exec(sql);
    expect(m, `constraint ${constraint}`).not.toBeNull();
    return [...(m as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  it.each([
    ['ck_employee_role', ROLES],
    ['ck_risk_category', RISK_CATEGORIES],
    ['ck_risk_status', RISK_STATUSES],
    ['ck_incident_severity', SEVERITIES],
    ['ck_incident_status', INCIDENT_STATUSES],
    ['ck_update_status_from', INCIDENT_STATUSES],
    ['ck_update_status_to', INCIDENT_STATUSES],
  ] as [string, readonly string[]][])('%s', (name, expected) => {
    expect(listFor(name)).toEqual([...expected]);
  });
});

describe('the generated seed', () => {
  const file = join(dbDir, 'seeds', 'demo-organisation.sql');
  const text = readFileSync(file, 'utf8');
  const rows = (table: string) => {
    const block = new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES\\n([\\s\\S]*?);\\n`).exec(text)?.[1] ?? '';
    return block.split('\n').filter((l) => l.startsWith('  (')).length;
  };
  it('loads the organisation first, then everything that belongs to it, in foreign-key order', () => {
    const order = ['organisation', 'department', 'employee', 'risk', 'risk_assessment', 'incident', 'incident_update'].map((t) => text.indexOf(`INSERT INTO ${t} `));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('holds exactly the rows of the shared sample dataset', () => {
    expect(rows('organisation')).toBe(1);
    expect(rows('department')).toBe(seed.departments.length);
    expect(rows('employee')).toBe(seed.employees.length);
    expect(rows('risk')).toBe(seed.risks.length);
    expect(rows('risk_assessment')).toBe(seed.risk_assessments.length);
    expect(rows('incident')).toBe(seed.incidents.length);
    expect(rows('incident_update')).toBe(seed.incident_updates.length);
  });
  it('does not try to insert the generated risk_score column', () => {
    expect(/INSERT INTO risk_assessment \(([^)]*)\)/.exec(text)?.[1]).not.toMatch(/risk_score/);
  });
  it('escapes quotes in text', () => {
    expect(text).not.toMatch(/[^'\\]'[A-Za-z]+'s /); // an unescaped apostrophe would break a statement
  });
});
