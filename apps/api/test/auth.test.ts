import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashToken } from '../src/auth/crypto';
import { createMailer } from '../src/auth/mailer';
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
const lastLink = (to: string, path: string): string => {
  const mail = [...t.mailer.outbox].reverse().find((m) => m.to === to && m.text.includes(path));
  expect(mail, `an email to ${to} containing ${path}`).toBeTruthy();
  return decodeURIComponent(/token=([^\s&]+)/.exec(mail!.text.slice(mail!.text.indexOf(path)))![1]!);
};

async function signup(over: Record<string, unknown> = {}) {
  const email = `${unique('admin')}@signup.example`;
  const res = await api().post('/api/auth/signup').send({ organisation_name: `Signup Co ${unique('')}`, first_name: 'Ada', last_name: 'Founder', email, password: TEST_PASSWORD, ...over });
  return { res, email, cookie: refreshCookie(res), token: res.body?.data?.access_token as string };
}

describe('sign-up', () => {
  it('creates the organisation and its first Org Admin, signs them in, and emails a verification link', async () => {
    const { res, email, cookie, token } = await signup();
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email, email_verified: false, employee: { role: 'Org Admin' } });
    expect(res.body.data.user.permissions).toContain('user.manage');
    expect(res.body.data.access_token).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('refresh'); // the refresh token never appears in a body
    expect(cookie).toBeTruthy();
    const me = await api().get('/api/auth/me').set(bearer(token));
    expect(me.body.data.organisation_name).toMatch(/^Signup Co/);
    // the verification link works once
    const verify = lastLink(email, '/verify-email');
    expect((await api().post('/api/auth/verify-email').send({ token: verify })).status).toBe(200);
    expect((await api().get('/api/auth/me').set(bearer(token))).body.data.email_verified).toBe(true);
    expect((await api().post('/api/auth/verify-email').send({ token: verify })).status).toBe(400);
  });

  it('sets the refresh cookie httpOnly, SameSite=Strict and Secure, scoped to the auth path', async () => {
    const secure = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ cookieSecure: true }), mailer: createMailer(t.auth.mail) });
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
    const dup = await signup({ email: first.email.toUpperCase() });
    expect(dup.res.status).toBe(409);
  });

  it('gives two organisations with the same name different slugs', async () => {
    const name = `Twin Co ${unique('')}`;
    await signup({ organisation_name: name });
    const second = await signup({ organisation_name: name });
    expect(second.res.status).toBe(201);
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
    const limited = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ rateLimit: { windowMs: 60_000, loginMax: 3, resetMax: 2 } }), mailer: createMailer(t.auth.mail) });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(limited).post('/api/auth/login').send({ email: 'victim@signup.example', password: `Guess-number-${i}` })).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const forgot: number[] = [];
    for (let i = 0; i < 3; i++) forgot.push((await request(limited).post('/api/auth/forgot-password').send({ email: 'victim@signup.example' })).status);
    expect(forgot).toEqual([200, 200, 429]);
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
    const replay = await api().post('/api/auth/refresh').set('Cookie', c1!); // the attacker replays the old token
    expect(replay.status).toBe(401);
    const legit = await api().post('/api/auth/refresh').set('Cookie', c2); // the real user's newer token is now dead too
    expect(legit.status).toBe(401);
    const live = await rows<{ n: number }>(t.pool, 'SELECT COUNT(*) AS n FROM refresh_token WHERE token_hash = ? AND revoked_at IS NOT NULL', [hashToken(c2.split('=')[1]!)]);
    expect(live[0]!.n).toBe(1);
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
    const sub = String(jwt.decode(token) && (jwt.decode(token) as { sub: string }).sub);
    const expired = jwt.sign({}, t.auth.jwtSecret, { subject: sub, expiresIn: -10, issuer: 'aravalli' });
    const forged = jwt.sign({}, 'some-other-secret-some-other-secret-1', { subject: sub, expiresIn: 600, issuer: 'aravalli' });
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, iss: 'aravalli' })).toString('base64url')}.`;
    for (const bad of [expired, forged, none, `${token}x`]) expect((await api().get('/api/auth/me').set(bearer(bad))).status).toBe(401);
  });
});

describe('forgot and reset password', () => {
  it('emails a one-time link, accepts it once, signs everything out and lets the new password in', async () => {
    const { email, cookie } = await signup();
    const sentBefore = t.mailer.outbox.length;
    expect((await api().post('/api/auth/forgot-password').send({ email })).status).toBe(200);
    expect(t.mailer.outbox.length).toBe(sentBefore + 1);
    const token = lastLink(email, '/reset-password');
    const weak = await api().post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(weak.status).toBe(400);
    const newPassword = 'Brand-new-pass-7';
    expect((await api().post('/api/auth/reset-password').send({ token, password: newPassword })).status).toBe(200);
    expect((await api().post('/api/auth/reset-password').send({ token, password: 'Another-pass-88' })).status).toBe(400); // single use
    expect((await api().post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email, password: newPassword })).status).toBe(200);
    expect((await api().post('/api/auth/refresh').set('Cookie', cookie!)).status).toBe(401); // the session from before the reset is gone
  });

  it('gives the same answer for an unknown address and sends nothing', async () => {
    const before = t.mailer.outbox.length;
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nobody-here@signup.example' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
    expect(t.mailer.outbox.length).toBe(before);
  });

  it('lets a reset link expire after an hour, and a newer link replaces an older one', async () => {
    const { email } = await signup();
    await api().post('/api/auth/forgot-password').send({ email });
    const old = lastLink(email, '/reset-password');
    await api().post('/api/auth/forgot-password').send({ email });
    const fresh = lastLink(email, '/reset-password');
    expect((await api().post('/api/auth/reset-password').send({ token: old, password: 'Brand-new-pass-7' })).status).toBe(400);
    t.advance(2 * 3_600_000);
    expect((await api().post('/api/auth/reset-password').send({ token: fresh, password: 'Brand-new-pass-7' })).status).toBe(400);
    t.advance(-2 * 3_600_000);
  });
});

describe('invitations', () => {
  it('lets an Org Admin invite someone with a role and department preassigned, who then accepts and signs in', async () => {
    const admin = await signup();
    const depts = (await api().get('/api/departments').set(bearer(admin.token))).body.data;
    const invitee = `${unique('new')}@signup.example`;
    const sent = await api().post('/api/invitations').set(bearer(admin.token)).send({ email: invitee, role: 'Auditor', department_id: depts[0].department_id });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ email: invitee, role: 'Auditor', status: 'Pending' });
    const token = lastLink(invitee, '/accept-invite');
    const look = await api().post('/api/auth/invitations/lookup').send({ token });
    expect(look.body.data).toMatchObject({ email: invitee, role: 'Auditor' });
    expect((await api().post('/api/auth/invitations/accept').send({ token, first_name: 'Nia', last_name: 'Newcomer', password: 'short' })).status).toBe(400);
    const accepted = await api().post('/api/auth/invitations/accept').send({ token, first_name: 'Nia', last_name: 'Newcomer', password: TEST_PASSWORD });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.user).toMatchObject({ email: invitee, email_verified: true, employee: { role: 'Auditor', department_id: depts[0].department_id, first_name: 'Nia' } });
    expect(accepted.body.data.user.organisation_id).toBe(admin.res.body.data.user.organisation_id);
    expect(refreshCookie(accepted)).toBeTruthy();
    expect((await api().post('/api/auth/login').send({ email: invitee, password: TEST_PASSWORD })).status).toBe(200);
    // single use
    expect((await api().post('/api/auth/invitations/accept').send({ token, first_name: 'Nia', last_name: 'Again', password: TEST_PASSWORD })).status).toBe(404);
    expect((await api().post('/api/auth/invitations/lookup').send({ token })).status).toBe(404);
    const list = (await api().get('/api/invitations').set(bearer(admin.token))).body.data;
    expect(list.find((i: { email: string }) => i.email === invitee).status).toBe('Accepted');
  });

  it('expires invitations, and lets an Org Admin revoke one', async () => {
    const admin = await signup();
    const dept = (await api().get('/api/departments').set(bearer(admin.token))).body.data[0].department_id;
    const a = `${unique('late')}@signup.example`;
    const b = `${unique('revoked')}@signup.example`;
    const sentA = await api().post('/api/invitations').set(bearer(admin.token)).send({ email: a, role: 'Employee', department_id: dept });
    const sentB = await api().post('/api/invitations').set(bearer(admin.token)).send({ email: b, role: 'Employee', department_id: dept });
    expect((await api().post('/api/invitations').set(bearer(admin.token)).send({ email: a, role: 'Employee', department_id: dept })).status).toBe(409); // already pending
    expect((await api().delete(`/api/invitations/${sentB.body.data.invitation_id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await api().post('/api/auth/invitations/lookup').send({ token: lastLink(b, '/accept-invite') })).status).toBe(404);
    t.advance(8 * 24 * 3_600_000);
    expect((await api().post('/api/auth/invitations/accept').send({ token: lastLink(a, '/accept-invite'), first_name: 'Late', last_name: 'Comer', password: TEST_PASSWORD })).status).toBe(404);
    const listed = (await api().get('/api/invitations').set(bearer(admin.token))).body.data;
    expect(listed.find((i: { invitation_id: number }) => i.invitation_id === sentA.body.data.invitation_id).status).toBe('Expired');
    t.advance(-8 * 24 * 3_600_000);
  });

  it('refuses to invite someone who already has an account, or into another organisation\'s department', async () => {
    const admin = await signup();
    const other = await signup();
    const dept = (await api().get('/api/departments').set(bearer(admin.token))).body.data[0].department_id;
    expect((await api().post('/api/invitations').set(bearer(admin.token)).send({ email: other.email, role: 'Employee', department_id: dept })).status).toBe(409);
    const foreignDept = (await api().get('/api/departments').set(bearer(other.token))).body.data[0].department_id;
    expect((await api().post('/api/invitations').set(bearer(admin.token)).send({ email: `${unique('x')}@signup.example`, role: 'Employee', department_id: foreignDept })).status).toBe(400);
  });
});

describe('user management', () => {
  it('lets an Org Admin change roles and departments, and deactivating signs the person out at once', async () => {
    const admin = await signup();
    const dept = (await api().get('/api/departments').set(bearer(admin.token))).body.data[0].department_id;
    const email = `${unique('staff')}@signup.example`;
    await api().post('/api/invitations').set(bearer(admin.token)).send({ email, role: 'Employee', department_id: dept });
    const joined = await api().post('/api/auth/invitations/accept').send({ token: lastLink(email, '/accept-invite'), first_name: 'Sam', last_name: 'Staff', password: TEST_PASSWORD });
    const userId = joined.body.data.user.user_id as number;
    const cookie = refreshCookie(joined)!;

    const promoted = await api().patch(`/api/users/${userId}`).set(bearer(admin.token)).send({ role: 'Risk Officer' });
    expect(promoted.body.data.role).toBe('Risk Officer');
    expect((await api().get('/api/auth/me').set(bearer(joined.body.data.access_token))).body.data.employee.role).toBe('Risk Officer'); // at once, no re-login

    const off = await api().patch(`/api/users/${userId}`).set(bearer(admin.token)).send({ is_active: false });
    expect(off.body.data.is_active).toBe(false);
    expect((await api().get('/api/auth/me').set(bearer(joined.body.data.access_token))).status).toBe(401);
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
      expect((await agent(t, who).post('/api/invitations').send({ email: 'x@y.example', role: 'Employee', department_id: 1 })).status, who).toBe(403);
    }
    expect((await agent(t, 'admin').get('/api/users')).status).toBe(200);
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

    const off = createApp({ pool: t.pool, clock: CLOCK, auth: testAuthConfig({ demoLogins: false }), mailer: createMailer(t.auth.mail) });
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
