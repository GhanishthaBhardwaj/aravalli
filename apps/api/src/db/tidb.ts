// TiDB (the MySQL-compatible database used in production) differs from MySQL 8 in a few ways that matter here.
// Local development stays on MySQL 8; these helpers let the same migrations and checks run on both.

/** True when `SELECT VERSION()` names TiDB, e.g. "8.0.11-TiDB-v8.5.0". */
export const isTidb = (version: string): boolean => /tidb/i.test(version);

/** TiDB has no triggers, so a migration made of CREATE TRIGGER statements cannot run there. */
export const needsTriggers = (sql: string): boolean => /^\s*CREATE\s+TRIGGER/im.test(sql);

/**
 * Tables that are append-only. On MySQL, triggers refuse UPDATE and DELETE on them (migration 0006). TiDB has no triggers, so
 * there the same protection is a database permission: the app's database user may SELECT and INSERT on these tables and
 * nothing else (see `npm run db:app-user:prod`).
 */
export const APPEND_ONLY_TABLES = ['risk_assessment', 'incident_update'] as const;
