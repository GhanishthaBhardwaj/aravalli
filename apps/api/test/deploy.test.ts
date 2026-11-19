// Production-readiness checks that need no database: serving the built web app, the SSL settings, the port and the address.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAppConfig } from '../src/core/config';
import { defaultsFileText, readDbConfig, readSslCa } from '../src/db/config';
import { inlineScriptHashes, securityHeaders, serveWebApp } from '../src/webapp';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
const db = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'defaultdb' };

describe('the web app is served by the API in production', () => {
  let dist: string;
  const INLINE = "document.documentElement.dataset.theme = 'light';";

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'aravalli-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), `<!doctype html><html><head><script>${INLINE}</script><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>`);
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("app");');
  });
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  const makeApp = () => {
    const app = express();
    app.use(securityHeaders(dist));
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    serveWebApp(app, dist);
    app.use((_req, res) => res.status(404).json({ error: { code: 'not_found' } }));
    return app;
  };

  it('answers an app address such as /incidents/INC-0001 with index.html, so the React router can take over', async () => {
    const res = await request(makeApp()).get('/incidents/INC-0001');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves built files, with a long cache for the hashed ones', async () => {
    const res = await request(makeApp()).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps /api as the API: a real endpoint works and an unknown one is a JSON 404, never index.html', async () => {
    const app = makeApp();
    expect((await request(app).get('/api/health')).body.status).toBe('ok');
    const missing = await request(app).get('/api/nothing-here');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('not_found');
  });

  it('hashes the script the way a browser reads it: a file with Windows line breaks gives the same hash', () => {
    const lf = inlineScriptHashes('<script>\nlet a = 1;\nlet b = 2;\n</script>');
    const crlf = inlineScriptHashes('<script>\r\nlet a = 1;\r\nlet b = 2;\r\n</script>');
    expect(crlf).toHaveLength(1);
    expect(crlf).toEqual(lf);
  });

  it('allows only the one inline theme script, by its hash', async () => {
    const hashes = inlineScriptHashes(`<script>${INLINE}</script><script type="module" src="/x.js"></script>`);
    expect(hashes).toHaveLength(1);
    const res = await request(makeApp()).get('/');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain(hashes[0]);
    expect(csp).toContain("script-src 'self'");
  });
});

describe('database SSL', () => {
  it('is off unless a certificate is given', () => {
    expect(readDbConfig(db).sslCa).toBeUndefined();
    expect(readDbConfig({ ...db, DB_SSL_CA: '   ' }).sslCa).toBeUndefined();
  });

  it('reads the certificate text, and turns a one-line value with \\n back into a real certificate', () => {
    expect(readDbConfig({ ...db, DB_SSL_CA: PEM }).sslCa).toBe(PEM);
    expect(readSslCa({ DB_SSL_CA: PEM.replace(/\n/g, '\\n') })).toBe(PEM);
  });

  it('rejects a value that is not a certificate, with a message that says what to do', () => {
    expect(() => readDbConfig({ ...db, DB_SSL_CA: 'hello' })).toThrow(/BEGIN CERTIFICATE/);
  });

  it('adds the CA file to the mysql client options only when there is one', () => {
    expect(defaultsFileText({ host: 'h', port: 1, user: 'u', password: 'p' })).not.toContain('ssl');
    const text = defaultsFileText({ host: 'h', port: 1, user: 'u', password: 'p' }, { caPath: 'C:\\tmp\\ca.pem', mode: 'VERIFY_CA' });
    expect(text).toContain('ssl-mode=VERIFY_CA');
    expect(text).toContain('ssl-ca="C:/tmp/ca.pem"');
    expect(defaultsFileText({ host: 'h', port: 1, user: 'u', password: 'p' }, { caPath: '/x', mode: 'VERIFY_IDENTITY' })).toContain('ssl-mode=VERIFY_IDENTITY');
  });

  it('DB_SSL=true means TLS with the system trusted authorities, no certificate file needed (TiDB Cloud)', () => {
    expect(readDbConfig(db).ssl).toBe(false);
    const c = readDbConfig({ ...db, DB_SSL: 'true' });
    expect(c.ssl).toBe(true);
    expect(c.sslCa).toBeUndefined();
  });
});

describe('where the server listens', () => {
  it('uses API_PORT, then the PORT a hosting service provides, then 3001', () => {
    expect(readAppConfig({ ...db, API_PORT: '4000', PORT: '10000' }).port).toBe(4000);
    expect(readAppConfig({ ...db, PORT: '10000' }).port).toBe(10000);
    expect(readAppConfig(db).port).toBe(3001);
    expect(() => readAppConfig({ ...db, PORT: 'abc' })).toThrow(/port/);
  });

  it('listens on this computer only while developing, and on every address in production', () => {
    expect(readAppConfig(db).host).toBe('127.0.0.1');
    expect(readAppConfig({ ...db, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }).host).toBe('0.0.0.0');
  });
});

describe('append-only history without triggers (TiDB)', () => {
  it('the app (not the db tools, which prove the opposite) has no SQL that updates or deletes risk_assessment or incident_update', () => {
    const dir = fileURLToPath(new URL('../src', import.meta.url));
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !/^db[\\/]/.test(f)).map((f) => join(dir, f));
    expect(files.length).toBeGreaterThan(10);
    const offending = files.filter((f) => /\b(UPDATE|DELETE\s+FROM)\s+`?(risk_assessment|incident_update)\b/i.test(readFileSync(f, 'utf8')));
    expect(offending).toEqual([]);
  });
});
