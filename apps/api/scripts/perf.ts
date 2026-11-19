// Measures the API on a real data volume. Starts the app in this process and calls it over HTTP, one request at a time.
//
//   npm run perf -w @aravalli/api -- --org osha-manufacturing [--db aravalli_perf] [--label "OSHA 34,472"] [--runs 300]
//
// For each endpoint: 30 warm-up requests (not counted), then --runs timed requests; prints p50 and p95 in milliseconds as a
// markdown table row so the numbers can be reproduced.
import { performance } from 'node:perf_hooks';
import type { AddressInfo } from 'node:net';
import { systemClock } from '@aravalli/shared';
import { createApp } from '../src/app';
import { loadEnvFile, readAppConfig } from '../src/core/config';
import { createPool, one } from '../src/core/db';

loadEnvFile();
const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
if (opt('db')) process.env.DB_NAME = opt('db');
const slug = opt('org') ?? 'osha-manufacturing';
const runs = Number(opt('runs') ?? 300);
const config = readAppConfig(process.env);
const pool = createPool(config.db);

const org = await one<{ organisation_id: number }>(pool, 'SELECT organisation_id FROM organisation WHERE slug = ?', [slug]);
if (!org) throw new Error(`No organisation "${slug}" in ${config.db.database}. Run the importer first.`);
const total = (await one<{ n: number }>(pool, 'SELECT COUNT(*) AS n FROM incident WHERE organisation_id = ?', [org.organisation_id]))!.n;
const dept = (await one<{ department_id: number }>(pool, 'SELECT department_id FROM department WHERE organisation_id = ? ORDER BY department_id LIMIT 1', [org.organisation_id]))!.department_id;

const server = createApp({ pool, clock: systemClock, auth: { ...config.auth, demoLogins: true, rateLimit: { ...config.auth.rateLimit, loginMax: 100000 } } }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
// Sign in the way the demo buttons do, as the organisation's Risk Officer, and send the token with every request.
const login = await fetch(base + '/auth/demo-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organisation: slug, role: 'Risk Officer' }) });
if (!login.ok) throw new Error('Demo login failed (' + login.status + '): run the importer so the demo accounts exist.');
const headers = { authorization: 'Bearer ' + ((await login.json()) as { data: { access_token: string } }).data.access_token };

const q = (term: string) => encodeURIComponent(term);
const CASES: Array<[string, string]> = [
  ['GET /incidents (first page)', '/incidents?limit=25'],
  ['GET /incidents (filtered: High+Critical, one department)', `/incidents?severities=High,Critical&department_id=${dept}&limit=25`],
  ['GET /incidents (open only, newest first)', '/incidents?open=true&sort=reported_at&order=desc&limit=25'],
  ['GET /incidents (deep page, near the end)', `/incidents?limit=25&offset=${Math.max(0, total - 50)}`],
  ['GET /incidents (text search)', `/incidents?q=${q('Category 4')}&limit=25`],
  ['GET /incidents (sorted by title)', '/incidents?sort=title&limit=25'],
  ['GET /reports/overview', '/reports/overview'],
  ['GET /reports/risk-profile', '/reports/risk-profile'],
  ['GET /reports/resolution', '/reports/resolution'],
  ['GET /departments', '/departments'],
  ['GET /employees (first page)', '/employees?limit=25'],
  ['GET /risks (current assessment, first page)', '/risks?limit=25'],
];

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
console.log(`| Endpoint | p50 (ms) | p95 (ms) |\n| --- | ---: | ---: |`);
for (const [label, path] of CASES) {
  for (let i = 0; i < 30; i++) await (await fetch(base + path, { headers })).arrayBuffer();
  const times: number[] = [];
  let status = 0;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const res = await fetch(base + path, { headers });
    await res.arrayBuffer();
    times.push(performance.now() - t);
    status = res.status;
  }
  times.sort((a, b) => a - b);
  console.log(`| ${label}${status === 200 ? '' : ` (HTTP ${status}!)`} | ${pct(times, 50).toFixed(1)} | ${pct(times, 95).toFixed(1)} |`);
}
console.log(`\nDatabase ${config.db.database}, organisation ${slug}, ${total} incidents, ${runs} timed requests per endpoint.`);
server.close();
await pool.end();
