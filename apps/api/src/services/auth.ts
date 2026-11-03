// Accounts, sessions and user management. Rules worth knowing:
//  * Login errors never say which half was wrong, and an unknown email costs the same time as a wrong password.
//  * Refresh tokens rotate: each one can be used once. Presenting a used one means it was copied, so the whole login (the
//    "family" of tokens) is revoked and the real user has to sign in again.
//  * Nothing here sends email. An Org Admin adds people directly (with a first password) and can set a new password for them.
import {
  hasPermission, isEmail, ROLES, validatePassword, validateSignup,
  type Employee, type Permission, type Role, type SessionUser,
} from '@aravalli/shared';
import { hashPassword, hashToken, newFamilyId, newToken, signAccessToken, verifyPassword } from '../auth/crypto';
import type { RequestContext } from '../core/context';
import { iso, withTransaction, type PoolConnection } from '../core/db';
import { AppError, notFound, validationFailed } from '../core/errors';
import * as repo from '../repositories/auth';
import { sqlUtc } from '../repositories/auth';
import * as counters from '../repositories/counters';
import * as directory from '../repositories/directory';
import type { Deps } from './deps';

const DAY = 86_400_000;

export interface Tokens {
  accessToken: string;
  /** Seconds the access token stays valid. */
  expiresIn: number;
  /** Goes into the httpOnly cookie, never into a response body. */
  refreshToken: string;
  refreshMaxAgeMs: number;
}

const invalidLogin = () => new AppError('unauthorized', 'Invalid email or password.');
const normaliseEmail = (e: string) => e.trim().toLowerCase();

async function issueTokens(d: Deps, conn: PoolConnection, user: { user_id: number; organisation_id: number }, familyId: string, userAgent: string | null): Promise<Tokens> {
  const now = d.nowMs();
  const refreshToken = newToken();
  const maxAge = d.auth.refreshTtlDays * DAY;
  await repo.insertRefresh(conn, { userId: user.user_id, organisationId: user.organisation_id, familyId, hash: hashToken(refreshToken), expiresAt: sqlUtc(now + maxAge), now: sqlUtc(now), userAgent });
  return { accessToken: signAccessToken(user.user_id, d.auth.jwtSecret, d.auth.accessTtlSeconds), expiresIn: d.auth.accessTtlSeconds, refreshToken, refreshMaxAgeMs: maxAge };
}

const slugify = (s: string): string => {
  const base = s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '');
  return base || 'organisation';
};

// --------------------------------------------------------------------------------------------------------------- sign-up
export interface SignupBody { organisation_name: string; first_name: string; last_name: string; email: string; password: string }

export async function signup(d: Deps, body: SignupBody, userAgent: string | null): Promise<Tokens> {
  const email = normaliseEmail(body.email);
  const errors = validateSignup({ ...body, email });
  if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
  if (await repo.findUserByEmail(d.pool, email)) throw new AppError('conflict', 'An account with this email already exists. Sign in instead.', [{ field: 'email', message: 'Already registered.' }]);
  const passwordHash = await hashPassword(body.password);
  const now = sqlUtc(d.nowMs());

  return withTransaction(d.pool, async (conn) => {
    let slug = slugify(body.organisation_name);
    for (let n = 2; await repo.slugTaken(conn, slug); n++) slug = `${slugify(body.organisation_name).slice(0, 44)}-${n}`;
    const organisationId = await repo.insertOrganisation(conn, body.organisation_name.trim(), slug, now);
    const departmentId = await repo.insertDepartment(conn, organisationId, 'GEN', 'General', now);
    const employeeId = await repo.insertEmployee(conn, {
      organisationId, code: await counters.nextCode(conn, organisationId, 'employee'), departmentId,
      firstName: body.first_name.trim(), lastName: body.last_name.trim(), email, jobTitle: 'Organisation administrator', role: 'Org Admin', now,
    });
    const userId = await repo.insertUser(conn, { organisationId, employeeId, email, passwordHash, isDemo: false, now });
    await repo.touchLogin(conn, userId, now);
    return issueTokens(d, conn, { user_id: userId, organisation_id: organisationId }, newFamilyId(), userAgent);
  });
}

// ---------------------------------------------------------------------------------------------------------------- login
let dummyHash: Promise<string> | null = null;

export async function login(d: Deps, emailRaw: string, password: string, userAgent: string | null): Promise<Tokens> {
  const email = normaliseEmail(emailRaw);
  const user = await repo.findUserByEmail(d.pool, email);
  if (!user) {
    // spend the same time a real check would, so response time does not reveal whether the email exists
    await verifyPassword(await (dummyHash ??= hashPassword('not-a-real-password')), password);
    throw invalidLogin();
  }
  const good = await verifyPassword(user.password_hash, password);
  // demo accounts are entered only through the demo login, never with a password
  const session = good && user.is_active && !user.is_demo ? await repo.getSession(d.pool, user.user_id) : undefined;
  if (!good || !session || !session.employee_active) throw invalidLogin();
  return withTransaction(d.pool, async (conn) => {
    await repo.touchLogin(conn, user.user_id, sqlUtc(d.nowMs()));
    return issueTokens(d, conn, user, newFamilyId(), userAgent);
  });
}

// ------------------------------------------------------------------------------------------------------ refresh and logout
export async function refresh(d: Deps, token: string | undefined, userAgent: string | null): Promise<Tokens> {
  if (!token) throw new AppError('unauthorized', 'Sign in to continue.');
  const hash = hashToken(token);
  const now = sqlUtc(d.nowMs());
  // The outcome is decided inside the transaction but an error thrown there would roll back the revocation, so report it after commit.
  const outcome = await withTransaction(d.pool, async (conn): Promise<{ ok: true; tokens: Tokens } | { ok: false }> => {
    const row = await repo.lockRefreshByHash(conn, hash);
    if (!row) return { ok: false };
    if (row.used_at || row.revoked_at) {
      await repo.revokeFamily(conn, row.family_id, now); // reuse detected: this token was already exchanged, so someone has a copy
      return { ok: false };
    }
    if (row.expires_at <= now) return { ok: false };
    const session = await repo.getSession(conn, row.user_id);
    if (!session || !session.user_active || !session.employee_active) {
      await repo.revokeFamily(conn, row.family_id, now);
      return { ok: false };
    }
    await repo.markRefreshUsed(conn, row.token_id, now);
    return { ok: true, tokens: await issueTokens(d, conn, row, row.family_id, userAgent) };
  });
  if (!outcome.ok) throw new AppError('unauthorized', 'Your session has ended. Sign in again.');
  return outcome.tokens;
}

export async function logout(d: Deps, token: string | undefined): Promise<void> {
  if (!token) return;
  await withTransaction(d.pool, async (conn) => {
    const row = await repo.lockRefreshByHash(conn, hashToken(token));
    if (row) await repo.revokeFamily(conn, row.family_id, sqlUtc(d.nowMs()));
  });
}

// ------------------------------------------------------------------------------------------------------------ who am I
const ALL_PERMISSIONS: Permission[] = ['directory.read', 'risk.read', 'risk.write', 'incident.read', 'incident.report', 'incident.update', 'incident.assign', 'incident.link', 'report.read', 'user.manage'];

/** The signed-in person as the web app sees them (also returned by login, so the app needs no second call). */
export async function sessionUser(d: Deps, userId: number): Promise<SessionUser> {
  const s = (await repo.getSession(d.pool, userId))!;
  const employee: Employee = {
    employee_id: s.employee_id, organisation_id: s.organisation_id, employee_code: s.employee_code, department_id: s.department_id,
    first_name: s.first_name, last_name: s.last_name, email: s.email, job_title: s.job_title, role: s.role, is_active: true, created_at: iso(s.employee_created_at),
  };
  return {
    user_id: s.user_id, email: s.email, is_demo: Boolean(s.is_demo),
    organisation_id: s.organisation_id, organisation_name: s.organisation_name, organisation_data_note: s.data_note,
    employee, permissions: ALL_PERMISSIONS.filter((p) => hasPermission(s.role, p)),
  };
}

// ------------------------------------------------------------------------------------------------------- user management
export const listUsers = async (d: Deps, ctx: RequestContext) =>
  (await repo.listUsers(d.pool, ctx.organisationId)).map((u) => ({ ...u, is_active: Boolean(u.is_active), is_demo: Boolean(u.is_demo), last_login_at: u.last_login_at ? iso(u.last_login_at) : null }));

export interface NewUserBody { first_name: string; last_name: string; email: string; role: Role; department_id: number; job_title: string; password: string }

/** An Org Admin adds a person: their employee record and their login in one step, with the first password the admin chose. */
export async function createUser(d: Deps, ctx: RequestContext, body: NewUserBody) {
  const email = normaliseEmail(body.email);
  const errors: Record<string, string | undefined> = {};
  if (!body.first_name.trim() || body.first_name.trim().length > 60) errors.first_name = 'First name is required (up to 60 characters).';
  if (!body.last_name.trim() || body.last_name.trim().length > 60) errors.last_name = 'Last name is required (up to 60 characters).';
  if (!isEmail(email)) errors.email = 'Enter a valid email address.';
  if (!ROLES.includes(body.role)) errors.role = 'Choose a role.';
  if (body.job_title.length > 100) errors.job_title = 'Job title is too long.';
  const problem = validatePassword(body.password, email);
  if (problem) errors.password = problem;
  if (!(await directory.getDepartment(d.pool, ctx.organisationId, body.department_id))) errors.department_id = 'Choose a department from this organisation.';
  if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
  if (await repo.findUserByEmail(d.pool, email) || await repo.employeeEmailTaken(d.pool, ctx.organisationId, email)) {
    throw new AppError('conflict', 'That email already has an account.', [{ field: 'email', message: 'Already registered.' }]);
  }
  const passwordHash = await hashPassword(body.password);
  const now = sqlUtc(d.nowMs());
  const userId = await withTransaction(d.pool, async (conn) => {
    const employeeId = await repo.insertEmployee(conn, {
      organisationId: ctx.organisationId, code: await counters.nextCode(conn, ctx.organisationId, 'employee'), departmentId: body.department_id,
      firstName: body.first_name.trim(), lastName: body.last_name.trim(), email, jobTitle: body.job_title.trim() || body.role, role: body.role, now,
    });
    return repo.insertUser(conn, { organisationId: ctx.organisationId, employeeId, email, passwordHash, isDemo: false, now });
  });
  return (await listUsers(d, ctx)).find((u) => u.user_id === userId)!;
}

/** An Org Admin sets a new password for someone in their organisation. Every session of that person is signed out. */
export async function setUserPassword(d: Deps, ctx: RequestContext, userId: number, password: string): Promise<void> {
  await withTransaction(d.pool, async (conn) => {
    const u = await repo.getUserInOrg(conn, ctx.organisationId, userId); // another organisation's user is simply not found
    if (!u) throw notFound('User');
    if (u.is_demo) throw new AppError('conflict', 'Demo accounts have no password.');
    const problem = validatePassword(password, u.email);
    if (problem) throw validationFailed({ password: problem });
    await repo.setPassword(conn, userId, await hashPassword(password));
    await repo.revokeAllRefresh(conn, userId, sqlUtc(d.nowMs()));
  });
}

export interface UserPatch { role?: Role; department_id?: number; is_active?: boolean }

export async function updateUser(d: Deps, ctx: RequestContext, userId: number, patch: UserPatch) {
  await withTransaction(d.pool, async (conn) => {
    const u = await repo.getUserInOrg(conn, ctx.organisationId, userId); // another organisation's user is simply not found
    if (!u) throw notFound('User');
    const role = patch.role ?? u.role;
    const departmentId = patch.department_id ?? u.department_id;
    const active = patch.is_active ?? Boolean(u.is_active);
    if (patch.department_id !== undefined && !(await directory.getDepartment(conn, ctx.organisationId, departmentId))) throw validationFailed({ department_id: 'Choose a department from this organisation.' });
    if (userId === ctx.userId && !active) throw validationFailed({ is_active: 'You cannot deactivate your own account.' });
    const losesAdmin = u.role === 'Org Admin' && Boolean(u.is_active) && (role !== 'Org Admin' || !active);
    if (losesAdmin && (await repo.countActiveAdmins(conn, ctx.organisationId)) <= 1) throw new AppError('conflict', 'An organisation needs at least one active Org Admin.');
    await repo.updateEmployeeAccess(conn, ctx.organisationId, u.employee_id, role, departmentId, active);
    await repo.setUserActive(conn, ctx.organisationId, userId, active);
    if (!active) await repo.revokeAllRefresh(conn, userId, sqlUtc(d.nowMs()));
  });
  return (await listUsers(d, ctx)).find((x) => x.user_id === userId)!;
}

// ---------------------------------------------------------------------------------------------------------- demo accounts
export async function demoAccounts(d: Deps) {
  if (!d.auth.demoLogins) throw notFound('Demo login');
  return repo.listDemoUsers(d.pool);
}

export async function demoLogin(d: Deps, organisationSlug: string, role: Role, userAgent: string | null): Promise<Tokens> {
  if (!d.auth.demoLogins) throw notFound('Demo login');
  const user = (await repo.listDemoUsers(d.pool)).find((u) => u.organisation_slug === organisationSlug && u.role === role);
  if (!user) throw notFound('Demo account');
  const full = (await repo.findUserById(d.pool, user.user_id))!;
  return withTransaction(d.pool, async (conn) => {
    await repo.touchLogin(conn, full.user_id, sqlUtc(d.nowMs()));
    return issueTokens(d, conn, full, newFamilyId(), userAgent);
  });
}
