// Sign-up, sign-in, sessions and user management. Login and sign-up are rate limited.
import { ROLES } from '@aravalli/shared';
import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { makeAuthController } from '../controllers/auth';
import type { AuthConfig } from '../core/config';
import { AppError } from '../core/errors';
import type { Registry } from '../core/registry';
import type { Deps } from '../services/deps';

export interface Limiters { login: RequestHandler; loginByEmail: RequestHandler; signup: RequestHandler }

/** One set of limiters per app instance (their counters live in memory, so a restart clears them). */
export function createLimiters(c: AuthConfig['rateLimit']): Limiters {
  const make = (limit: number, key?: (req: Request) => string) =>
    rateLimit({
      windowMs: c.windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
      ...(key ? { keyGenerator: key, validate: { keyGeneratorIpFallback: false } } : {}),
      handler: (_req, _res, next) => next(new AppError('rate_limited', 'Too many attempts. Wait a few minutes and try again.')),
    });
  const emailOf = (req: Request) => `email:${String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase().slice(0, 120)}`;
  return {
    login: make(c.loginMax * 3), // per address: stops one machine hammering many accounts
    loginByEmail: make(c.loginMax, emailOf), // per account: stops many machines hammering one account
    signup: make(c.signupMax),
  };
}

const email = z.string().trim().max(120);
const password = z.string().max(200);
const role = z.enum(ROLES);

export function registerAuthRoutes(r: Registry, d: Deps, limiters: Limiters): void {
  const a = makeAuthController(d);
  const { login, loginByEmail, signup } = limiters;
  const chain = (...m: RequestHandler[]): RequestHandler => (req, res, next) => {
    let i = 0;
    const step = (err?: unknown) => (err || i >= m.length ? next(err) : m[i++]!(req, res, step));
    step();
  };

  r.add({ method: 'post', path: '/auth/signup', access: 'public', tag: 'Auth', status: 201, summary: 'Create an organisation and its first Org Admin',
    description: 'Signs the new admin in: the response carries the access token and sets the httpOnly refresh cookie.',
    limit: signup,
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
  r.add({ method: 'get', path: '/auth/demo-accounts', access: 'public', tag: 'Auth', summary: 'Demo accounts for the demo login buttons',
    description: 'Only exists when the server runs with DEMO_LOGINS=true; otherwise 404.', handler: ({ req, res }) => a.demoAccounts(req, res) });
  r.add({ method: 'post', path: '/auth/demo-login', access: 'public', tag: 'Auth', summary: 'Sign in as a demo user',
    description: 'Only when the server runs with DEMO_LOGINS=true; otherwise 404. Demo accounts have no usable password.', limit: login,
    body: z.object({ organisation: z.string().max(60), role }), handler: ({ req, res, body }) => a.demoLogin(req, res, body) });

  // Org Admin only (the 'user.manage' permission)
  r.add({ method: 'get', path: '/users', access: 'user.manage', tag: 'Users', summary: 'People with a login in your organisation',
    handler: ({ req, res }) => a.users(req, res) });
  r.add({ method: 'post', path: '/users', access: 'user.manage', tag: 'Users', status: 201, summary: 'Add a person: name, email, role, department and a first password',
    description: 'Creates the employee record and the login together. The person can sign in straight away. Nothing is emailed.',
    body: z.object({ first_name: z.string().max(60), last_name: z.string().max(60), email, role, department_id: z.number().int().positive(), job_title: z.string().max(100).default(''), password }),
    handler: ({ req, res, body }) => a.createUser(req, res, body) });
  r.add({ method: 'patch', path: '/users/:id', access: 'user.manage', tag: 'Users', summary: 'Change a person\'s role or department, or deactivate them',
    description: 'An organisation always keeps at least one active Org Admin. Deactivating signs the person out everywhere.',
    body: z.object({ role: role.optional(), department_id: z.number().int().positive().optional(), is_active: z.boolean().optional() }),
    handler: ({ req, res, body }) => a.updateUser(req, res, body) });
  r.add({ method: 'post', path: '/users/:id/password', access: 'user.manage', tag: 'Users', summary: 'Set a new password for a person',
    description: 'Signs that person out everywhere.', body: z.object({ password }),
    handler: ({ req, res, body }) => a.setPassword(req, res, body) });
}
