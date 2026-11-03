// SQL for accounts, sessions and user management. Times are passed in as UTC 'YYYY-MM-DD HH:MM:SS' strings.
import type { Role } from '@aravalli/shared';
import type { Executor } from '../core/db';
import { one, rows, run } from '../core/db';

export const sqlUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

export interface UserRow {
  user_id: number;
  organisation_id: number;
  employee_id: number;
  email: string;
  password_hash: string;
  is_active: number;
  is_demo: number;
}

const USER_COLUMNS = 'user_id, organisation_id, employee_id, email, password_hash, is_active, is_demo';

export const findUserByEmail = (db: Executor, email: string) =>
  one<UserRow>(db, `SELECT ${USER_COLUMNS} FROM user_account WHERE email = ?`, [email]);

export const findUserById = (db: Executor, userId: number) =>
  one<UserRow>(db, `SELECT ${USER_COLUMNS} FROM user_account WHERE user_id = ?`, [userId]);

export interface SessionRow {
  user_id: number;
  email: string;
  user_active: number;
  is_demo: number;
  organisation_id: number;
  organisation_name: string;
  data_note: string | null;
  employee_id: number;
  employee_code: string;
  department_id: number;
  first_name: string;
  last_name: string;
  job_title: string;
  role: Role;
  employee_active: number;
  employee_created_at: string;
}

/** Everything a request needs to know about who is calling. Read on every request, so a deactivation takes effect at once. */
export const getSession = (db: Executor, userId: number) =>
  one<SessionRow>(db, `SELECT u.user_id, u.email, u.is_active AS user_active, u.is_demo,
       o.organisation_id, o.name AS organisation_name, o.data_note,
       e.employee_id, e.employee_code, e.department_id, e.first_name, e.last_name, e.job_title, e.role, e.is_active AS employee_active, e.created_at AS employee_created_at
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN organisation o ON o.organisation_id = u.organisation_id
     WHERE u.user_id = ?`, [userId]);

export async function insertUser(db: Executor, u: { organisationId: number; employeeId: number; email: string; passwordHash: string; isDemo: boolean; now: string }): Promise<number> {
  const r = await run(db, `INSERT INTO user_account (organisation_id, employee_id, email, password_hash, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [u.organisationId, u.employeeId, u.email, u.passwordHash, u.isDemo ? 1 : 0, u.now]);
  return r.insertId;
}

export const touchLogin = (db: Executor, userId: number, now: string) => run(db, 'UPDATE user_account SET last_login_at = ? WHERE user_id = ?', [now, userId]);
export const setPassword = (db: Executor, userId: number, hash: string) => run(db, 'UPDATE user_account SET password_hash = ? WHERE user_id = ?', [hash, userId]);

// ------------------------------------------------------------------ organisation and people created by sign-up / the admin
export const slugTaken = async (db: Executor, slug: string) => Boolean(await one(db, 'SELECT 1 AS x FROM organisation WHERE slug = ?', [slug]));

export async function insertOrganisation(db: Executor, name: string, slug: string, now: string): Promise<number> {
  return (await run(db, 'INSERT INTO organisation (name, slug, is_demo, created_at) VALUES (?, ?, 0, ?)', [name, slug, now])).insertId;
}

export async function insertDepartment(db: Executor, organisationId: number, code: string, name: string, now: string): Promise<number> {
  return (await run(db, 'INSERT INTO department (organisation_id, code, name, created_at) VALUES (?, ?, ?, ?)', [organisationId, code, name, now])).insertId;
}

export async function insertEmployee(db: Executor, e: { organisationId: number; code: string; departmentId: number; firstName: string; lastName: string; email: string; jobTitle: string; role: Role; now: string }): Promise<number> {
  const r = await run(db, `INSERT INTO employee (organisation_id, employee_code, department_id, first_name, last_name, email, job_title, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.organisationId, e.code, e.departmentId, e.firstName, e.lastName, e.email, e.jobTitle, e.role, e.now]);
  return r.insertId;
}

export const employeeEmailTaken = async (db: Executor, organisationId: number, email: string) =>
  Boolean(await one(db, 'SELECT 1 AS x FROM employee WHERE organisation_id = ? AND email = ?', [organisationId, email]));

// ----------------------------------------------------------------------------------------------------- refresh tokens
export interface RefreshRow {
  token_id: number;
  user_id: number;
  organisation_id: number;
  family_id: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export async function insertRefresh(db: Executor, t: { userId: number; organisationId: number; familyId: string; hash: string; expiresAt: string; now: string; userAgent: string | null }) {
  await run(db, 'INSERT INTO refresh_token (user_id, organisation_id, family_id, token_hash, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [t.userId, t.organisationId, t.familyId, t.hash, t.now, t.expiresAt, t.userAgent?.slice(0, 200) ?? null]);
}

/** Locks the row, so two requests presenting the same token at once are handled one after the other. */
export const lockRefreshByHash = (db: Executor, hash: string) =>
  one<RefreshRow>(db, 'SELECT token_id, user_id, organisation_id, family_id, expires_at, used_at, revoked_at FROM refresh_token WHERE token_hash = ? FOR UPDATE', [hash]);

export const markRefreshUsed = (db: Executor, tokenId: number, now: string) => run(db, 'UPDATE refresh_token SET used_at = ? WHERE token_id = ?', [now, tokenId]);
export const revokeFamily = (db: Executor, familyId: string, now: string) => run(db, 'UPDATE refresh_token SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ?', [now, familyId]);
export const revokeAllRefresh = (db: Executor, userId: number, now: string) => run(db, 'UPDATE refresh_token SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?', [now, userId]);

// ------------------------------------------------------------------------------------------------------- user management
export interface UserListRow {
  user_id: number;
  employee_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  department_id: number;
  department_name: string;
  is_active: number;
  last_login_at: string | null;
  is_demo: number;
}

const USER_LIST = `SELECT u.user_id, u.employee_id, u.email, e.first_name, e.last_name, e.role, e.department_id, d.name AS department_name,
       (u.is_active AND e.is_active) AS is_active, u.last_login_at, u.is_demo
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN department d ON d.department_id = e.department_id AND d.organisation_id = e.organisation_id`;

export const listUsers = (db: Executor, organisationId: number) =>
  rows<UserListRow>(db, `${USER_LIST} WHERE u.organisation_id = ? ORDER BY e.last_name, e.first_name LIMIT 500`, [organisationId]);

/** Locks the row; another organisation's user is simply not found. */
export const getUserInOrg = (db: Executor, organisationId: number, userId: number) =>
  one<UserListRow>(db, `${USER_LIST} WHERE u.organisation_id = ? AND u.user_id = ? FOR UPDATE`, [organisationId, userId]);

export const countActiveAdmins = async (db: Executor, organisationId: number) =>
  (await one<{ n: number }>(db, `SELECT COUNT(*) AS n FROM user_account u JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     WHERE u.organisation_id = ? AND e.role = 'Org Admin' AND u.is_active AND e.is_active`, [organisationId]))!.n;

export const updateEmployeeAccess = (db: Executor, organisationId: number, employeeId: number, role: Role, departmentId: number, active: boolean) =>
  run(db, 'UPDATE employee SET role = ?, department_id = ?, is_active = ? WHERE organisation_id = ? AND employee_id = ?', [role, departmentId, active ? 1 : 0, organisationId, employeeId]);

export const setUserActive = (db: Executor, organisationId: number, userId: number, active: boolean) =>
  run(db, 'UPDATE user_account SET is_active = ? WHERE organisation_id = ? AND user_id = ?', [active ? 1 : 0, organisationId, userId]);

// ---------------------------------------------------------------------------------------------------------- demo accounts
export const listDemoUsers = (db: Executor) =>
  rows<{ user_id: number; role: Role; organisation_slug: string; organisation_name: string; first_name: string; last_name: string; job_title: string }>(
    db, `SELECT u.user_id, e.role, o.slug AS organisation_slug, o.name AS organisation_name, e.first_name, e.last_name, e.job_title
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN organisation o ON o.organisation_id = u.organisation_id
     WHERE u.is_demo AND u.is_active AND e.is_active ORDER BY o.organisation_id, FIELD(e.role, 'Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee')`);
