// Sign-up, sign-in, sessions, invitations and user management. Login and password-reset endpoints are rate limited.
import { ROLES } from '@aravalli/shared';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { makeAuthController } from '../controllers/auth';
import type { AuthConfig } from '../core/config';
import { AppError } from '../core/errors';
import type { Registry } from '../core/registry';
import type { Deps } from '../services/deps';

export interface Limiters { login: RequestHandler; loginByEmail: RequestHandler; reset: RequestHandler }

/** One set of limiters per app instance (their counters live in memory, so a restart clears them). */
export function createLimiters(c: AuthConfig['rateLimit']): Limiters {
  const make = (limit: number, key?: (req: import('express').Request) => string) =>
    rateLimit({
      windowMs: c.windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
      ...(key ? { keyGenerator: key, validate: { keyGeneratorIpFallback: false } } : {}),
      handler: (_req, _res, next) => next(new AppError('rate_limited', 'Too many attempts. Wait a few minutes and try again.')),
    });
  const emailOf = (req: import('express').Request) => `email:${String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase().slice(0, 120)}`;
  return {
    login: make(c.loginMax * 3), // per address: stops one machine hammering many accounts
    loginByEmail: make(c.loginMax, emailOf), // per account: stops many machines hammering one account
    reset: make(c.resetMax),
  };
}

const email = z.string().trim().max(120);
const password = z.string().max(200);
const token = z.string().min(10).max(200);
const role = z.enum(ROLES);

export function registerAuthRoutes(r: Registry, d: Deps, limiters: Limiters): void {
  const a = makeAuthController(d);
  const { login, loginByEmail, reset } = limiters;
  const chain = (...m: RequestHandler[]): RequestHandler => (req, res, next) => {
    let i = 0;
    const step = (err?: unknown) => (err || i >= m.length ? next(err) : m[i++]!(req, res, step));
    step();
  };

  r.add({ method: 'post', path: '/auth/signup', access: 'public', tag: 'Auth', status: 201, summary: 'Create an organisation and its first Org Admin',
    description: 'Signs the new admin in: the response carries the access token and sets the httpOnly refresh cookie. A verification email is sent.',
    limit: reset,
    body: z.object({ organisation_name: z.string().max(150), first_name: z.string().max(60), last_name: z.string().max(60), email, password }),
    handler: ({ req, res, body }) => a.signup(req, res, body) });
  r.add({ method: 'post', path: '/auth/login', access: 'public', tag: 'Auth', summary: 'Sign in with email and password',
    description: 'Rate limited. A wrong email and a wrong password get the same answer.',
    limit: chain(login, loginByEmail),
    body: z.object({ email, password }),
    handler: ({ req, res, body }) => a.login(req, res, body) });
  r.add({ method: 'post', path: '/auth/refresh', access: 'public', tag: 'Auth', summary: 'Exchange the refresh cookie for a new access token',
    description: 'Rotates the refresh token: the old one stops working. Presenting an old one again revokes the whole session (reuse detection).',
    handler: ({ req, res }) => a.refresh(req, res) });
  r.add({ method: 'post', path: '/auth/logout', access: 'public', tag: 'Auth', summary: 'Sign out: revoke this session and clear the cookie',
    handler: ({ req, res }) => a.logout(req, res) });
  r.add({ method: 'get', path: '/auth/me', access: 'session', tag: 'Auth', summary: 'The signed-in user, organisation and permissions',
    handler: ({ req, res }) => a.me(req, res) });
  r.add({ method: 'post', path: '/auth/forgot-password', access: 'public', tag: 'Auth', summary: 'Email a password-reset link',
    description: 'Always answers ok, whether or not the address has an account. Rate limited.', limit: reset,
    body: z.object({ email }), handler: ({ req, res, body }) => a.forgot(req, res, body) });
  r.add({ method: 'post', path: '/auth/reset-password', access: 'public', tag: 'Auth', summary: 'Set a new password with a reset link',
    description: 'The link works once and expires after an hour. All sessions are signed out. Rate limited.', limit: reset,
    body: z.object({ token, password }), handler: ({ req, res, body }) => a.reset(req, res, body) });
  r.add({ method: 'post', path: '/auth/verify-email', access: 'public', tag: 'Auth', summary: 'Confirm an email address with the emailed link',
    limit: reset, body: z.object({ token }), handler: ({ req, res, body }) => a.verify(req, res, body) });
  r.add({ method: 'post', path: '/auth/resend-verification', access: 'session', tag: 'Auth', summary: 'Send the verification email again',
    handler: ({ req, res }) => a.resend(req, res) });
  r.add({ method: 'post', path: '/auth/invitations/lookup', access: 'public', tag: 'Auth', summary: 'What an invitation link is for (to fill the accept screen)',
    limit: reset, body: z.object({ token }), handler: ({ req, res, body }) => a.lookupInvite(req, res, body) });
  r.add({ method: 'post', path: '/auth/invitations/accept', access: 'public', tag: 'Auth', status: 201, summary: 'Accept an invitation: creates the account and signs in',
    limit: reset, body: z.object({ token, first_name: z.string().max(60), last_name: z.string().max(60), password }),
    handler: ({ req, res, body }) => a.acceptInvite(req, res, body) });
  r.add({ method: 'get', path: '/auth/demo-accounts', access: 'public', tag: 'Auth', summary: 'Demo accounts for the demo login buttons',
    description: 'Only exists when the server runs with DEMO_LOGINS=true; otherwise 404.', handler: ({ req, res }) => a.demoAccounts(req, res) });
  r.add({ method: 'post', path: '/auth/demo-login', access: 'public', tag: 'Auth', summary: 'Sign in as a demo user',
    description: 'Only when the server runs with DEMO_LOGINS=true; otherwise 404. Demo accounts have no usable password.', limit: login,
    body: z.object({ organisation: z.string().max(60), role }), handler: ({ req, res, body }) => a.demoLogin(req, res, body) });

  // Org Admin only (the 'user.manage' permission)
  r.add({ method: 'get', path: '/users', access: 'user.manage', tag: 'Users', summary: 'People with a login in your organisation',
    handler: ({ req, res }) => a.users(req, res) });
  r.add({ method: 'patch', path: '/users/:id', access: 'user.manage', tag: 'Users', summary: 'Change a person\'s role or department, or deactivate them',
    description: 'An organisation always keeps at least one active Org Admin. Deactivating signs the person out everywhere.',
    body: z.object({ role: role.optional(), department_id: z.number().int().positive().optional(), is_active: z.boolean().optional() }),
    handler: ({ req, res, body }) => a.updateUser(req, res, body) });
  r.add({ method: 'get', path: '/invitations', access: 'user.manage', tag: 'Users', summary: 'Invitations sent by your organisation',
    handler: ({ req, res }) => a.invitations(req, res) });
  r.add({ method: 'post', path: '/invitations', access: 'user.manage', tag: 'Users', status: 201, summary: 'Invite someone by email, with role and department',
    description: 'The invitation expires. The email carries a single-use link.',
    body: z.object({ email, role, department_id: z.number().int().positive() }),
    handler: ({ req, res, body }) => a.invite(req, res, body) });
  r.add({ method: 'delete', path: '/invitations/:id', access: 'user.manage', tag: 'Users', summary: 'Revoke a pending invitation',
    handler: ({ req, res }) => a.revokeInvitation(req, res) });
}
