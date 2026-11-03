import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashToken } from '../src/auth/crypto';
import { rows } from '../src/core/db';
import { agent, as, bearer, bind, CLOCK, startTestApp, TEST_PASSWORD, testAuthConfig, type TestContext } from './helpers';

let t: TestContext;
const api = () => request(t.app);

beforeAll(async () => {
  t = await startTestApp();
  bind(t);
});
afterAll(async () => {
  await t.pool.end();
});

let counter = 0;
const unique = (label: string) => `${label}${Date.now().toString(36)}${counter++}`;
const refreshCookie = (res: request.Response): string | undefined => {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('aravalli_refresh='));
  return raw?.split(';')[0];
};

async function signup(over: Record<string, unknown> = {}) {
  const email = `${unique('admin')}@signup.example`;
  const res = await api().post('/api/auth/signup').send({ organisation_name: `Signup Co ${unique('')}`, first_name: 'Ada', last_name: 'Founder', email, password: TEST_PASSWORD, ...over });
  return { res, email, cookie: refreshCookie(res), token: res.body?.data?.access_token as string };
}

/** An Org Admin adds a person. */
async function addPerson(adminToken: string, over: Record<string, unknown> = {}) {
  const dept = (await api().get('/api/departments').set(bearer(adminToken))).body.data[0].department_id;
  const email = `${unique('staff')}@signup.example`;
  const res = await api().post('/api/users').set(bearer(adminToken)).send({ first_name: 'Sam', last_name: 'Staff', email, role: 'Employee', department_id: dept, job_title: '', password: TEST_PASSWORD, ...over });
  return { res, email, dept };
}

describe('sign-up', () => {
  it('creates the organisation and its first Org Admin and signs them in', async () => {
    const { res, email, cookie, token } = await signup();
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email, employee: { role: 'Org Admin' } });
    expect(res.body.data.user.permissions).toContain('user.manage');
    expect(JSON.stringify(res.body)).not.toContain('refresh'); // the refresh token never appears in a body
    expect(cookie).toBeTruthy();
    expect((await api().get('/api/auth/me').set(bearer(token))).body.data.organisation_name).toMatch(/^Signup Co/);
  });

  it('sets the refresh cookie httpOnly, SameSite=Strict and Secure, scoped to the auth path', async () => {
    const secure = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ cookieSecure: true }) });
    const res = await request(secure).post('/api/auth/signup').send({ organisation_name: `Cookie Co ${unique('')}`, first_name: 'Cy', last_name: 'Cookie', email: `${unique('c')}@signup.example`, password: TEST_PASSWORD });
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('aravalli_refresh='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api\/auth/i);
  });

  it('refuses weak passwords, bad emails, missing names and an email that already has an account', async () => {
    const weak = await signup({ password: 'short1' });
    expect(weak.res.status).toBe(400);
    expect(weak.res.body.error.details.map((d: { field: string }) => d.field)).toContain('password');
    expect((await signup({ password: 'onlylettersnonumber' })).res.status).toBe(400);
    expect((await signup({ email: 'not-an-email' })).res.status).toBe(400);
    expect((await signup({ first_name: '' })).res.status).toBe(400);
    const first = await signup();
    expect((await signup({ email: first.email.toUpperCase() })).res.status).toBe(409);
  });

  it('gives two organisations with the same name different slugs', async () => {
    const name = `Twin Co ${unique('')}`;
    await signup({ organisation_name: name });
    expect((await signup({ organisation_name: name })).res.status).toBe(201);
    const slugs = await rows<{ slug: string }>(t.pool, 'SELECT slug FROM organisation WHERE name = ?', [name]);
    expect(new Set(slugs.map((s) => s.slug)).size).toBe(2);
  });
});

describe('login and logout', () => {
  it('signs in with the right password and answers a wrong password and an unknown email identically', async () => {
    const { email } = await signup();
    const ok = await api().post('/api/auth/login').send({ email: email.toUpperCase(), password: TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token_type).toBe('Bearer');
    const wrong = await api().post('/api/auth/login').send({ email, password: 'Wrong-password-1' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@signup.example', password: 'Wrong-password-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('rate limits login attempts per account', async () => {
    const limited = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ rateLimit: { windowMs: 60_000, loginMax: 3, signupMax: 2 } }) });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(limited).post('/api/auth/login').send({ email: 'victim@signup.example', password: `Guess-number-${i}` })).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('logout revokes the session: the refresh cookie stops working and is cleared', async () => {
    const { cookie } = await signup();
    const out = await api().post('/api/auth/logout').set('Cookie', cookie!);
    expect(out.status).toBe(200);
    expect((out.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/aravalli_refresh=;/);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie!)).status).toBe(401);
  });

  it('demo accounts cannot be entered with a password', async () => {
    const demoEmail = (await rows<{ email: string }>(t.pool, 'SELECT email FROM user_account WHERE user_id = ?', [t.a.users.admin]))[0]!.email;
    expect((await api().post('/api/auth/login').send({ email: demoEmail, password: TEST_PASSWORD })).status).toBe(401);
  });
});

describe('refresh tokens: rotation and reuse detection', () => {
  it('stores only a hash of each refresh token', async () => {
    const { cookie } = await signup();
    const token = cookie!.split('=')[1]!;
    const stored = await rows<{ token_hash: string }>(t.pool, 'SELECT token_hash FROM refresh_token WHERE token_hash IN (?, ?)', [token, hashToken(token)]);
    expect(stored.map((s) => s.token_hash)).toEqual([hashToken(token)]);
  });

  it('rotates on every use and gives a working access token each time', async () => {
    const { cookie: c1 } = await signup();
    const r1 = await api().post('/api/auth/refresh').set('Cookie', c1!);
    expect(r1.status).toBe(200);
    const c2 = refreshCookie(r1)!;
    expect(c2).not.toBe(c1);
    expect((await api().get('/api/auth/me').set(bearer(r1.body.data.access_token))).status).toBe(200);
    const r2 = await api().post('/api/auth/refresh').set('Cookie', c2);
    expect(r2.status).toBe(200);
    expect(refreshCookie(r2)).not.toBe(c2);
  });

  it('treats a used token as stolen: it fails, and the whole login is revoked, including the newest token', async () => {
    const { cookie: c1 } = await signup();
    const r1 = await api().post('/api/auth/refresh').set('Cookie', c1!);
    const c2 = refreshCookie(r1)!;
    expect((await api().post('/api/auth/refresh').set('Cookie', c1!)).status).toBe(401); // the attacker replays the old token
    expect((await api().post('/api/auth/refresh').set('Cookie', c2)).status).toBe(401); // the real user's newer token is now dead too
    const dead = await rows<{ n: number }>(t.pool, 'SELECT COUNT(*) AS n FROM refresh_token WHERE token_hash = ? AND revoked_at IS NOT NULL', [hashToken(c2.split('=')[1]!)]);
    expect(dead[0]!.n).toBe(1);
  });

  it('does not accept a refresh token after it expired, a missing cookie or a made-up one', async () => {
    const { cookie } = await signup();
    expect((await api().post('/api/auth/refresh')).status).toBe(401);
    expect((await api().post('/api/auth/refresh').set('Cookie', 'aravalli_refresh=made-up-value')).status).toBe(401);
    t.advance(31 * 24 * 3_600_000);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie!)).status).toBe(401);
    t.advance(-31 * 24 * 3_600_000);
  });

  it('rejects expired, tampered and wrongly signed access tokens', async () => {
    const { token } = await signup();
    const sub = String((jwt.decode(token) as { sub: string }).sub);
    const expired = jwt.sign({}, t.auth.jwtSecret, { subject: sub, expiresIn: -10, issuer: 'aravalli' });
    const forged = jwt.sign({}, 'some-other-secret-some-other-secret-1', { subject: sub, expiresIn: 600, issuer: 'aravalli' });
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, iss: 'aravalli' })).toString('base64url')}.`;
    for (const bad of [expired, forged, none, `${token}x`]) expect((await api().get('/api/auth/me').set(bearer(bad))).status).toBe(401);
  });
});

describe('an Org Admin adds people', () => {
  it('creates a person with a name, role, department and first password, who can sign in straight away', async () => {
    const admin = await signup();
    const { res, email, dept } = await addPerson(admin.token, { first_name: 'Nia', last_name: 'Newcomer', role: 'Auditor', job_title: 'Internal auditor' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email, first_name: 'Nia', role: 'Auditor', department_id: dept, is_active: true });
    const login = await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ organisation_id: admin.res.body.data.user.organisation_id, employee: { role: 'Auditor', department_id: dept, job_title: 'Internal auditor' } });
  });

  it('refuses weak passwords, bad emails, duplicate emails and a department from another organisation', async () => {
    const admin = await signup();
    const other = await signup();
    expect((await addPerson(admin.token, { password: 'short' })).res.status).toBe(400);
    expect((await addPerson(admin.token, { email: 'nope' })).res.status).toBe(400);
    expect((await addPerson(admin.token, { first_name: '' })).res.status).toBe(400);
    expect((await addPerson(admin.token, { email: other.email })).res.status).toBe(409);
    const foreignDept = (await api().get('/api/departments').set(bearer(other.token))).body.data[0].department_id;
    expect((await addPerson(admin.token, { department_id: foreignDept })).res.status).toBe(400);
  });

  it('lets the admin set a new password, which signs that person out everywhere', async () => {
    const admin = await signup();
    const { res, email } = await addPerson(admin.token);
    const userId = res.body.data.user_id as number;
    const session = await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const cookie = refreshCookie(session)!;
    expect((await api().post(`/api/users/${userId}/password`).set(bearer(admin.token)).send({ password: 'short' })).status).toBe(400);
    expect((await api().post(`/api/users/${userId}/password`).set(bearer(admin.token)).send({ password: 'A-fresh-password-9' })).status).toBe(200);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email, password: 'A-fresh-password-9' })).status).toBe(200);
  });

  it('changes roles and departments, and deactivating signs the person out at once', async () => {
    const admin = await signup();
    const { res, email } = await addPerson(admin.token);
    const userId = res.body.data.user_id as number;
    const session = await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    const cookie = refreshCookie(session)!;
    const promoted = await api().patch(`/api/users/${userId}`).set(bearer(admin.token)).send({ role: 'Risk Officer' });
    expect(promoted.body.data.role).toBe('Risk Officer');
    expect((await api().get('/api/auth/me').set(bearer(session.body.data.access_token))).body.data.employee.role).toBe('Risk Officer'); // at once, no re-login
    expect((await api().patch(`/api/users/${userId}`).set(bearer(admin.token)).send({ is_active: false })).body.data.is_active).toBe(false);
    expect((await api().get('/api/auth/me').set(bearer(session.body.data.access_token))).status).toBe(401);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
  });

  it('always keeps one active Org Admin and will not let you deactivate yourself', async () => {
    const admin = await signup();
    const myId = admin.res.body.data.user.user_id as number;
    expect((await api().patch(`/api/users/${myId}`).set(bearer(admin.token)).send({ role: 'Employee' })).status).toBe(409);
    expect((await api().patch(`/api/users/${myId}`).set(bearer(admin.token)).send({ is_active: false })).status).toBe(400);
    expect((await api().get('/api/users').set(bearer(admin.token))).body.data).toHaveLength(1);
  });

  it('is for Org Admins only', async () => {
    for (const who of ['officer', 'head', 'auditor', 'employee'] as const) {
      expect((await agent(t, who).get('/api/users')).status, who).toBe(403);
      expect((await agent(t, who).post('/api/users').send({ first_name: 'A', last_name: 'B', email: 'x@y.example', role: 'Employee', department_id: 1, password: TEST_PASSWORD })).status, who).toBe(403);
    }
    expect((await agent(t, 'admin').get('/api/users')).status).toBe(200);
  });

  it('has no email endpoints any more', async () => {
    for (const path of ['/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-email', '/api/invitations']) {
      expect((await api().post(path).send({})).status, path).toBe(404);
    }
  });
});

describe('demo login', () => {
  it('lists the demo accounts and signs in as one, only when the flag is on', async () => {
    const accounts = await api().get('/api/auth/demo-accounts');
    expect(accounts.status).toBe(200);
    expect(accounts.body.data.length).toBeGreaterThan(0);
    const login = await api().post('/api/auth/demo-login').send({ organisation: 'aravalli-industries', role: 'Auditor' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.employee.role).toBe('Auditor');
    expect(refreshCookie(login)).toBeTruthy();

    const off = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ demoLogins: false }) });
    expect((await request(off).get('/api/auth/demo-accounts')).status).toBe(404);
    expect((await request(off).post('/api/auth/demo-login').send({ organisation: 'aravalli-industries', role: 'Auditor' })).status).toBe(404);
    expect((await api().post('/api/auth/demo-login').send({ organisation: 'no-such-org', role: 'Auditor' })).status).toBe(404);
  });
});

describe('security headers', () => {
  it('sends helmet\'s headers and does not advertise Express', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect((await api().get('/api/risks').set(as('officer'))).headers['strict-transport-security']).toBeTruthy();
  });
});
