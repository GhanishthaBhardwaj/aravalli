// One connection pool for the whole process. Every query uses `?` placeholders: values are never joined into SQL text.
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { DbConfig } from '../db/config';

export type { Pool, PoolConnection };
/** Anything that can run a query: the pool itself, or one connection inside a transaction. */
export type Executor = Pool | PoolConnection;

export function createPool(config: DbConfig, connectionLimit = 10): Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit,
    // a hosted database (TiDB Cloud) is reached over SSL and its certificate is checked; a local one is not (sslCa is unset)
    ssl: config.sslCa ? { ca: config.sslCa, rejectUnauthorized: true } : config.ssl ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined,
    charset: 'UTF8MB4_0900_AI_CI', // the same collation the database uses, so string comparisons never mix collations
    dateStrings: true, // DATE / DATETIME stay plain strings: no time-zone surprises between the database and the API
    decimalNumbers: true, // AVG() and friends come back as numbers, not strings
  });
}

export async function rows<T>(db: Executor, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await db.query<RowDataPacket[]>(sql, params);
  return result as unknown as T[];
}

export async function one<T>(db: Executor, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}

export async function run(db: Executor, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params);
  return result;
}

/** Runs `work` in a transaction: committed if it returns, rolled back if it throws. */
export async function withTransaction<T>(pool: Pool, work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const value = await work(conn);
    await conn.commit();
    return value;
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    throw error;
  } finally {
    conn.release();
  }
}

/** 'YYYY-MM-DD HH:MM:SS' from the database -> 'YYYY-MM-DDTHH:MM:SS', the format the shared types use. */
export const iso = (s: string): string => s.replace(' ', 'T');
export const isoOrNull = (s: string | null): string | null => (s === null ? null : iso(s));
