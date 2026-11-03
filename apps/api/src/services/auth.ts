// Accounts, sessions, invitations and user management. Rules worth knowing:
//  * Login errors never say which half was wrong, and an unknown email costs the same time as a wrong password.
//  * Refresh tokens rotate: each one can be used once. Presenting a used one means it was copied, so the whole login (the
//    "family" of tokens) is revoked and the real user has to sign in again.
//  * Reset and verification links are single-use, expire, and are stored hashed.
//  * Sign-up and invitation acceptance create the person's employee row and account in one transaction.
import {
  isEmail, validatePassword, validateSignup, hasPermission,
  type Employee, type Permission, type Role, type SessionUser, ROLES,
} from '@aravalli/shared';
import { hashPassword, hashToken, newFamilyId, newToken, signAccessToken, unusablePassword, verifyPassword } from '../auth/crypto';
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
const link = (d: Deps, path: string, token: string) => `${d.auth.appUrl}${path}?token=${encodeURIComponent(token)}`;

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

async function sendVerification(d: Deps, conn: PoolConnection, user: { user_id: number; organisation_id: number; email: string }) {
  const token = newToken();
  const now = d.nowMs();
  await repo.insertUserToken(conn, { userId: user.user_id, organisationId: user.organisation_id, purpose: 'verify', hash: hashToken(token), expiresAt: sqlUtc(now + 2 * DAY), now: sqlUtc(now) });
  await d.mailer.send({
    to: user.email,
    subject: 'Confirm your email for Aravalli',
    text: `Welcome to Aravalli.\n\nConfirm your email address by opening this link (valid for 2 days):\n${link(d, '/verify-email', token)}\n\nIf you did not create an account, you can ignore this message.`,
  });
}

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
    const userId = await repo.insertUser(conn, { organisationId, employeeId, email, passwordHash, verifiedAt: null, isDemo: false, now });
    await sendVerification(d, conn, { user_id: userId, organisation_id: organisationId, email });
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
  const nowMs = d.nowMs();
  const now = sqlUtc(nowMs);
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

// ------------------------------------------------------------------------------------------------- password reset / verify
export async function forgotPassword(d: Deps, emailRaw: string): Promise<void> {
  const user = await repo.findUserByEmail(d.pool, normaliseEmail(emailRaw));
  // The caller always gets the same answer, whether or not the address has an account.
  if (!user || !user.is_active || user.is_demo) return;
  const token = newToken();
  const now = d.nowMs();
  await repo.insertUserToken(d.pool, { userId: user.user_id, organisationId: user.organisation_id, purpose: 'reset', hash: hashToken(token), expiresAt: sqlUtc(now + 3_600_000), now: sqlUtc(now) });
  await d.mailer.send({
    to: user.email,
    subject: 'Reset your Aravalli password',
    text: `Someone asked to reset the password for this account.\n\nChoose a new password by opening this link (valid for 1 hour, works once):\n${link(d, '/reset-password', token)}\n\nIf this was not you, ignore this message: your password has not changed.`,
  });
}

export async function resetPassword(d: Deps, token: string, password: string): Promise<void> {
  const now = sqlUtc(d.nowMs());
  const bad = () => new AppError('validation_error', 'This reset link is invalid or has expired. Ask for a new one.', [{ field: 'token', message: 'Invalid or expired link.' }]);
  await withTransaction(d.pool, async (conn) => {
    const t = await repo.lockUserToken(conn, hashToken(token), 'reset');
    if (!t || t.used_at || t.expires_at <= now) throw bad();
    const user = await repo.findUserById(conn, t.user_id);
    if (!user) throw bad();
    const problem = validatePassword(password, user.email);
    if (problem) throw validationFailed({ password: problem });
    await repo.setPassword(conn, user.user_id, await hashPassword(password));
    await repo.markUserTokenUsed(conn, t.token_id, now);
    await repo.revokeAllRefresh(conn, user.user_id, now); // every device is signed out
    await repo.setVerified(conn, user.user_id, now); // they received the email, so the address is proven
  });
}

export async function verifyEmail(d: Deps, token: string): Promise<void> {
  const now = sqlUtc(d.nowMs());
  await withTransaction(d.pool, async (conn) => {
    const t = await repo.lockUserToken(conn, hashToken(token), 'verify');
    if (!t || t.used_at || t.expires_at <= now) throw new AppError('validation_error', 'This verification link is invalid or has expired.', [{ field: 'token', message: 'Invalid or expired link.' }]);
    await repo.setVerified(conn, t.user_id, now);
    await repo.markUserTokenUsed(conn, t.token_id, now);
  });
}

export async function resendVerification(d: Deps, ctx: RequestContext): Promise<void> {
  const user = await repo.findUserById(d.pool, ctx.userId);
  if (!user || user.email_verified_at) return;
  await withTransaction(d.pool, (conn) => sendVerification(d, conn, user));
}

// ------------------------------------------------------------------------------------------------------ who am I
/** The signed-in person as the web app sees them (also returned by login, so the app needs no second call). */
export async function sessionUser(d: Deps, userId: number): Promise<SessionUser> {
  const s = (await repo.getSession(d.pool, userId))!;
  const employee: Employee = {
    employee_id: s.employee_id, organisation_id: s.organisation_id, employee_code: s.employee_code, department_id: s.department_id,
    first_name: s.first_name, last_name: s.last_name, email: s.email, job_title: s.job_title, role: s.role, is_active: true, created_at: iso(s.employee_created_at),
  };
  return {
    user_id: s.user_id, email: s.email, email_verified: Boolean(s.email_verified_at), is_demo: Boolean(s.is_demo),
    organisation_id: s.organisation_id, organisation_name: s.organisation_name, organisation_data_note: s.data_note,
    employee, permissions: ALL_PERMISSIONS.filter((p) => hasPermission(s.role, p)),
  };
}

const ALL_PERMISSIONS: Permission[] = ['directory.read', 'risk.read', 'risk.write', 'incident.read', 'incident.report', 'incident.update', 'incident.assign', 'incident.link', 'report.read', 'user.manage'];

// ------------------------------------------------------------------------------------------------------------- invitations
export interface InviteBody { email: string; role: Role; department_id: number }

export async function invite(d: Deps, ctx: RequestContext, body: InviteBody) {
  const email = normaliseEmail(body.email);
  const errors: Record<string, string | undefined> = {};
  if (!isEmail(email)) errors.email = 'Enter a valid email address.';
  if (!ROLES.includes(body.role)) errors.role = 'Choose a role.';
  const dept = await directory.getDepartment(d.pool, ctx.organisationId, body.department_id);
  if (!dept) errors.department_id = 'Choose a department from this organisation.';
  if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
  if (await repo.findUserByEmail(d.pool, email)) throw new AppError('conflict', 'That email already has an account.', [{ field: 'email', message: 'Already registered.' }]);
  const nowMs = d.nowMs();
  if (await repo.pendingInvitationFor(d.pool, ctx.organisationId, email, sqlUtc(nowMs))) throw new AppError('conflict', 'There is already a pending invitation for that email. Revoke it first to send a new one.', [{ field: 'email', message: 'Already invited.' }]);

  const token = newToken();
  const id = await repo.insertInvitation(d.pool, {
    organisationId: ctx.organisationId, email, role: body.role, departmentId: body.department_id, invitedBy: ctx.actorId,
    hash: hashToken(token), expiresAt: sqlUtc(nowMs + d.auth.invitationTtlDays * DAY), now: sqlUtc(nowMs),
  });
  const row = (await repo.getInvitation(d.pool, ctx.organisationId, id))!;
  await d.mailer.send({
    to: email,
    subject: `${row.invited_by_name} invited you to ${row.organisation_name} on Aravalli`,
    text: `${row.invited_by_name} invited you to join ${row.organisation_name} as ${row.role} in ${row.department_name}.\n\nAccept the invitation (valid for ${d.auth.invitationTtlDays} days):\n${link(d, '/accept-invite', token)}`,
  });
  return presentInvitation(row, nowMs);
}

function presentInvitation(r: repo.InvitationRow, nowMs: number) {
  const status = r.accepted_at ? 'Accepted' : r.revoked_at ? 'Revoked' : r.expires_at <= sqlUtc(nowMs) ? 'Expired' : 'Pending';
  return {
    invitation_id: r.invitation_id, email: r.email, role: r.role, department_id: r.department_id, department_name: r.department_name,
    invited_by_name: r.invited_by_name, created_at: iso(r.created_at), expires_at: iso(r.expires_at), status,
  };
}

export async function listInvitations(d: Deps, ctx: RequestContext) {
  return (await repo.listInvitations(d.pool, ctx.organisationId)).map((r) => presentInvitation(r, d.nowMs()));
}

export async function revokeInvitation(d: Deps, ctx: RequestContext, id: number): Promise<void> {
  const row = await repo.getInvitation(d.pool, ctx.organisationId, id);
  if (!row) throw notFound('Invitation');
  const r = await repo.revokeInvitation(d.pool, ctx.organisationId, id, sqlUtc(d.nowMs()));
  if (r.affectedRows === 0) throw new AppError('conflict', 'That invitation was already accepted or revoked.');
}

/** What the accept-invitation screen shows. Every kind of invalid token gets the same answer. */
export async function lookupInvitation(d: Deps, token: string) {
  const row = await repo.lockInvitationByHash(d.pool, hashToken(token));
  if (!row || row.accepted_at || row.revoked_at || row.expires_at <= sqlUtc(d.nowMs())) throw new AppError('not_found', 'This invitation is invalid, expired or already used.');
  return { email: row.email, role: row.role, organisation_name: row.organisation_name, department_name: row.department_name, invited_by_name: row.invited_by_name, expires_at: iso(row.expires_at) };
}

export interface AcceptBody { token: string; first_name: string; last_name: string; password: string }

export async function acceptInvitation(d: Deps, body: AcceptBody, userAgent: string | null): Promise<Tokens> {
  const errors: Record<string, string | undefined> = {};
  if (!body.first_name.trim() || body.first_name.trim().length > 60) errors.first_name = 'First name is required (up to 60 characters).';
  if (!body.last_name.trim() || body.last_name.trim().length > 60) errors.last_name = 'Last name is required (up to 60 characters).';
  const nowMs = d.nowMs();
  const now = sqlUtc(nowMs);
  const hash = hashToken(body.token);
  const passwordHash = await hashPassword(body.password.length > 0 ? body.password : 'x');

  return withTransaction(d.pool, async (conn) => {
    const inv = await repo.lockInvitationByHash(conn, hash);
    if (!inv || inv.accepted_at || inv.revoked_at || inv.expires_at <= now) throw new AppError('not_found', 'This invitation is invalid, expired or already used.');
    const problem = validatePassword(body.password, inv.email);
    if (problem) errors.password = problem;
    if (Object.keys(errors).some((k) => errors[k])) throw validationFailed(errors);
    if (await repo.findUserByEmail(conn, inv.email) || await repo.employeeEmailTaken(conn, inv.organisation_id, inv.email)) throw new AppError('conflict', 'That email already has an account.');
    const employeeId = await repo.insertEmployee(conn, {
      organisationId: inv.organisation_id, code: await counters.nextCode(conn, inv.organisation_id, 'employee'), departmentId: inv.department_id,
      firstName: body.first_name.trim(), lastName: body.last_name.trim(), email: inv.email, jobTitle: inv.role, role: inv.role, now,
    });
    // opening the emailed link proves the address
    const userId = await repo.insertUser(conn, { organisationId: inv.organisation_id, employeeId, email: inv.email, passwordHash, verifiedAt: now, isDemo: false, now });
    await repo.markInvitationAccepted(conn, inv.invitation_id, now);
    await repo.touchLogin(conn, userId, now);
    return issueTokens(d, conn, { user_id: userId, organisation_id: inv.organisation_id }, newFamilyId(), userAgent);
  });
}

// ------------------------------------------------------------------------------------------------------- user management
export const listUsers = async (d: Deps, ctx: RequestContext) =>
  (await repo.listUsers(d.pool, ctx.organisationId)).map((u) => ({ ...u, is_active: Boolean(u.is_active), is_demo: Boolean(u.is_demo), email_verified: Boolean(u.email_verified_at), last_login_at: u.last_login_at ? iso(u.last_login_at) : null }));

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
  const u = (await listUsers(d, ctx)).find((x) => x.user_id === userId)!;
  return u;
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

export { unusablePassword };
export type { Employee };
