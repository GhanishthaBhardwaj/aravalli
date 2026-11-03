// SQL for accounts, sessions, one-time tokens and invitations. Times are passed in as UTC 'YYYY-MM-DD HH:MM:SS' strings.
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
  email_verified_at: string | null;
  is_active: number;
  is_demo: number;
}

const USER_COLUMNS = 'user_id, organisation_id, employee_id, email, password_hash, email_verified_at, is_active, is_demo';

export const findUserByEmail = (db: Executor, email: string) =>
  one<UserRow>(db, `SELECT ${USER_COLUMNS} FROM user_account WHERE email = ?`, [email]);

export const findUserById = (db: Executor, userId: number) =>
  one<UserRow>(db, `SELECT ${USER_COLUMNS} FROM user_account WHERE user_id = ?`, [userId]);

export interface SessionRow {
  user_id: number;
  email: string;
  email_verified_at: string | null;
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
  one<SessionRow>(db, `SELECT u.user_id, u.email, u.email_verified_at, u.is_active AS user_active, u.is_demo,
       o.organisation_id, o.name AS organisation_name, o.data_note,
       e.employee_id, e.employee_code, e.department_id, e.first_name, e.last_name, e.job_title, e.role, e.is_active AS employee_active, e.created_at AS employee_created_at
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN organisation o ON o.organisation_id = u.organisation_id
     WHERE u.user_id = ?`, [userId]);

export async function insertUser(db: Executor, u: { organisationId: number; employeeId: number; email: string; passwordHash: string; verifiedAt: string | null; isDemo: boolean; now: string }): Promise<number> {
  const r = await run(db, `INSERT INTO user_account (organisation_id, employee_id, email, password_hash, email_verified_at, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [u.organisationId, u.employeeId, u.email, u.passwordHash, u.verifiedAt, u.isDemo ? 1 : 0, u.now]);
  return r.insertId;
}

export const touchLogin = (db: Executor, userId: number, now: string) => run(db, 'UPDATE user_account SET last_login_at = ? WHERE user_id = ?', [now, userId]);
export const setPassword = (db: Executor, userId: number, hash: string) => run(db, 'UPDATE user_account SET password_hash = ? WHERE user_id = ?', [hash, userId]);
export const setVerified = (db: Executor, userId: number, now: string) => run(db, 'UPDATE user_account SET email_verified_at = COALESCE(email_verified_at, ?) WHERE user_id = ?', [now, userId]);

// ------------------------------------------------------------------ organisation and people created by sign-up / invitations
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

export const countLiveRefresh = async (db: Executor, userId: number, now: string) =>
  (await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM refresh_token WHERE user_id = ? AND revoked_at IS NULL AND used_at IS NULL AND expires_at > ?', [userId, now]))!.n;

// ------------------------------------------------------------------------------------- one-time links (verify / reset)
export type TokenPurpose = 'verify' | 'reset';

export async function insertUserToken(db: Executor, t: { userId: number; organisationId: number; purpose: TokenPurpose; hash: string; expiresAt: string; now: string }) {
  // an older unused link of the same kind stops working when a new one is issued
  await run(db, 'UPDATE user_token SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [t.now, t.userId, t.purpose]);
  await run(db, 'INSERT INTO user_token (user_id, organisation_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)', [t.userId, t.organisationId, t.purpose, t.hash, t.now, t.expiresAt]);
}

export const lockUserToken = (db: Executor, hash: string, purpose: TokenPurpose) =>
  one<{ token_id: number; user_id: number; expires_at: string; used_at: string | null }>(
    db, 'SELECT token_id, user_id, expires_at, used_at FROM user_token WHERE token_hash = ? AND purpose = ? FOR UPDATE', [hash, purpose]);

export const markUserTokenUsed = (db: Executor, tokenId: number, now: string) => run(db, 'UPDATE user_token SET used_at = ? WHERE token_id = ?', [now, tokenId]);

// ---------------------------------------------------------------------------------------------------------- invitations
export interface InvitationRow {
  invitation_id: number;
  organisation_id: number;
  email: string;
  role: Role;
  department_id: number;
  department_name: string;
  organisation_name: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const INVITE_SELECT = `SELECT i.invitation_id, i.organisation_id, i.email, i.role, i.department_id, d.name AS department_name, o.name AS organisation_name,
       CONCAT(e.first_name, ' ', e.last_name) AS invited_by_name, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
FROM invitation i
JOIN department d ON d.department_id = i.department_id AND d.organisation_id = i.organisation_id
JOIN organisation o ON o.organisation_id = i.organisation_id
JOIN employee e ON e.employee_id = i.invited_by AND e.organisation_id = i.organisation_id`;

export async function insertInvitation(db: Executor, i: { organisationId: number; email: string; role: Role; departmentId: number; invitedBy: number; hash: string; expiresAt: string; now: string }): Promise<number> {
  return (await run(db, 'INSERT INTO invitation (organisation_id, email, role, department_id, invited_by, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [i.organisationId, i.email, i.role, i.departmentId, i.invitedBy, i.hash, i.now, i.expiresAt])).insertId;
}

export const listInvitations = (db: Executor, organisationId: number) =>
  rows<InvitationRow>(db, `${INVITE_SELECT} WHERE i.organisation_id = ? ORDER BY i.created_at DESC, i.invitation_id DESC LIMIT 200`, [organisationId]);

export const getInvitation = (db: Executor, organisationId: number, id: number) =>
  one<InvitationRow>(db, `${INVITE_SELECT} WHERE i.organisation_id = ? AND i.invitation_id = ?`, [organisationId, id]);

/** Finds an invitation by its token and locks the row, so it cannot be accepted twice at once. */
export async function lockInvitationByHash(db: Executor, hash: string): Promise<InvitationRow | undefined> {
  const found = await one<InvitationRow>(db, `${INVITE_SELECT} WHERE i.token_hash = ?`, [hash]);
  if (found) await one(db, 'SELECT invitation_id FROM invitation WHERE invitation_id = ? FOR UPDATE', [found.invitation_id]);
  return found;
}

export const revokeInvitation = (db: Executor, organisationId: number, id: number, now: string) =>
  run(db, 'UPDATE invitation SET revoked_at = ? WHERE organisation_id = ? AND invitation_id = ? AND accepted_at IS NULL AND revoked_at IS NULL', [now, organisationId, id]);

export const markInvitationAccepted = (db: Executor, id: number, now: string) => run(db, 'UPDATE invitation SET accepted_at = ? WHERE invitation_id = ?', [now, id]);

export const pendingInvitationFor = (db: Executor, organisationId: number, email: string, now: string) =>
  one(db, 'SELECT invitation_id FROM invitation WHERE organisation_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', [organisationId, email, now]);

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
  email_verified_at: string | null;
  last_login_at: string | null;
  is_demo: number;
}

export const listUsers = (db: Executor, organisationId: number) =>
  rows<UserListRow>(db, `SELECT u.user_id, u.employee_id, u.email, e.first_name, e.last_name, e.role, e.department_id, d.name AS department_name,
       (u.is_active AND e.is_active) AS is_active, u.email_verified_at, u.last_login_at, u.is_demo
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN department d ON d.department_id = e.department_id AND d.organisation_id = e.organisation_id
     WHERE u.organisation_id = ? ORDER BY e.last_name, e.first_name LIMIT 500`, [organisationId]);

export const getUserInOrg = (db: Executor, organisationId: number, userId: number) =>
  one<UserListRow>(db, `SELECT u.user_id, u.employee_id, u.email, e.first_name, e.last_name, e.role, e.department_id, d.name AS department_name,
       (u.is_active AND e.is_active) AS is_active, u.email_verified_at, u.last_login_at, u.is_demo
     FROM user_account u
     JOIN employee e ON e.employee_id = u.employee_id AND e.organisation_id = u.organisation_id
     JOIN department d ON d.department_id = e.department_id AND d.organisation_id = e.organisation_id
     WHERE u.organisation_id = ? AND u.user_id = ? FOR UPDATE`, [organisationId, userId]);

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
