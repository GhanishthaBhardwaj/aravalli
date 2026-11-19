// A simple capacity test. It makes test organisations (each with an Org Admin and four more people), then runs a mix of
// reads and writes against the API and prints how long each kind of request took.
//
//   node scripts/capacity.mjs --base http://127.0.0.1:3301 --levels 5,25,100 --requests 300 --concurrency 8
//
// Run it against a server that uses a THROWAWAY database (never the live one): it creates real organisations. The server must be started
// with high RATE_LIMIT_SIGNUP and RATE_LIMIT_LOGIN values, because creating 100 organisations from one address trips the normal limits.
// Output: a JSON line per level, then a table. Nothing is invented: every number is measured here.
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const base = arg('base', 'http://127.0.0.1:3301').replace(/\/$/, '');
const levels = arg('levels', '5,25,100').split(',').map(Number);
const requestsPerLevel = Number(arg('requests', '300'));
const concurrency = Number(arg('concurrency', '8'));
const PEOPLE_PER_ORG = 5;

async function call(method, path, token, body) {
  const started = performance.now();
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = performance.now() - started;
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, ms, json };
}

const stamp = Date.now().toString(36);
const orgs = []; // { token, admin employee id, department id, incident codes[] }

/** Creates one organisation with its admin and four more people (the people are written through the API, like the Users screen does). */
async function createOrganisation(n) {
  const email = `admin${n}.${stamp}@capacity.example`;
  const r = await call('POST', '/auth/signup', null, { organisation_name: `Capacity Test ${stamp} ${n}`, first_name: 'Test', last_name: `Admin ${n}`, email, password: 'Capacity-test-1234' });
  if (!r.ok) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.json)}`);
  const token = r.json.data.access_token;
  const employeeId = r.json.data.user.employee.employee_id;
  const departmentId = r.json.data.user.employee.department_id;
  const roles = ['Risk Officer', 'Department Head', 'Auditor', 'Employee'];
  for (const [i, role] of roles.entries()) {
    const u = await call('POST', '/users', token, {
      first_name: 'Test', last_name: `${role} ${n}`, email: `p${i}.${n}.${stamp}@capacity.example`, role, department_id: departmentId, job_title: role, password: 'Capacity-test-1234',
    });
    if (!u.ok) throw new Error(`create user failed: ${u.status} ${JSON.stringify(u.json)}`);
  }
  orgs.push({ token, employeeId, departmentId, email, codes: [] });
}

const today = () => new Date().toISOString().slice(0, 10);
const twoDaysAgo = () => `${new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)}T09:00`;

/** One request of the mix. Returns { name, result }. */
async function oneRequest(i) {
  const o = orgs[Math.floor(Math.random() * orgs.length)];
  const dice = i % 10;
  if (dice === 0) {
    const r = await call('POST', '/incidents', o.token, { title: `Capacity incident ${i}`, description: 'Made by the capacity test.', severity: 'Medium', department_id: o.departmentId, occurred_at: twoDaysAgo(), assigned_to: null, risk_id: null });
    if (r.ok) o.codes.push(r.json.data.incident_id);
    return { name: 'write: report incident', r };
  }
  if (dice === 1) {
    const r = await call('POST', '/risks', o.token, { title: `Capacity risk ${i}`, description: 'Made by the capacity test.', category: 'Operational', department_id: o.departmentId, owner_employee_id: o.employeeId, identified_date: today(), likelihood: 3, impact: 4, mitigation_notes: '' });
    return { name: 'write: register risk with a score', r };
  }
  if (dice === 2 && o.codes.length) {
    const id = o.codes[Math.floor(Math.random() * o.codes.length)];
    const r = await call('POST', `/incidents/${id}/updates`, o.token, { update_text: `Update ${i}`, status_to: null });
    return { name: 'write: add incident update', r };
  }
  const reads = [
    ['read: incident list (20 rows)', '/incidents?limit=20&sort=reported_at&order=desc'],
    ['read: risk list (20 rows)', '/risks?limit=20'],
    ['read: overview report', '/reports/overview'],
    ['read: heat map', '/reports/heatmap?mode=current'],
    ['read: departments', '/departments'],
  ];
  const [name, path] = reads[i % reads.length];
  return { name, r: await call('GET', path, o.token) };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function runLevel(totalOrgs) {
  // access tokens last 15 minutes and creating many organisations can take longer: log every admin in again first
  for (const o of orgs) {
    const r = await call('POST', '/auth/login', null, { email: o.email, password: 'Capacity-test-1234' });
    if (r.ok) o.token = r.json.data.access_token;
  }
  const timings = new Map();
  const errors = new Map();
  let next = 0;
  const started = performance.now();
  async function worker() {
    while (next < requestsPerLevel) {
      const i = next++;
      const { name, r } = await oneRequest(i);
      if (!r.ok) errors.set(`${name} -> ${r.status}`, (errors.get(`${name} -> ${r.status}`) ?? 0) + 1);
      else (timings.get(name) ?? timings.set(name, []).get(name)).push(r.ms);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = (performance.now() - started) / 1000;
  const rows = [...timings.entries()].sort().map(([name, list]) => {
    const s = [...list].sort((a, b) => a - b);
    return { name, count: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s[s.length - 1] };
  });
  return { orgs: totalOrgs, users: totalOrgs * PEOPLE_PER_ORG, requests: requestsPerLevel, concurrency, seconds, perSecond: requestsPerLevel / seconds, rows, errors: Object.fromEntries(errors) };
}

const results = [];
const health = await fetch(`${base}/api/health`).then((r) => r.json());
console.log(`Target ${base}: ${JSON.stringify(health)}`);
for (const level of levels) {
  const t = performance.now();
  while (orgs.length < level) await createOrganisation(orgs.length + 1);
  const setupSeconds = (performance.now() - t) / 1000;
  const result = await runLevel(level);
  result.setupSeconds = setupSeconds;
  results.push(result);
  console.log(JSON.stringify(result));
}

// Logging in checks a password hash, which is deliberately slow work for the CPU: measure it on its own, one at a time.
const loginTimes = [];
for (let i = 1; i <= 20; i++) {
  const r = await call('POST', '/auth/login', null, { email: `admin${i}.${stamp}@capacity.example`, password: 'Capacity-test-1234' });
  if (r.ok) loginTimes.push(r.ms);
}
loginTimes.sort((x, y) => x - y);
console.log(`\nLogin (one at a time, ${loginTimes.length} logins): p50 ${pct(loginTimes, 50).toFixed(0)} ms, p95 ${pct(loginTimes, 95).toFixed(0)} ms, max ${loginTimes.at(-1).toFixed(0)} ms`);

console.log('\n| Organisations | Users | Request | Count | p50 ms | p95 ms | max ms |\n| ---: | ---: | --- | ---: | ---: | ---: | ---: |');
for (const r of results) {
  for (const row of r.rows) console.log(`| ${r.orgs} | ${r.users} | ${row.name} | ${row.count} | ${row.p50.toFixed(0)} | ${row.p95.toFixed(0)} | ${row.max.toFixed(0)} |`);
}
console.log('\n| Organisations | Users | Created in (s) | Requests/s at concurrency ' + concurrency + ' | Failed requests |\n| ---: | ---: | ---: | ---: | ---: |');
for (const r of results) console.log(`| ${r.orgs} | ${r.users} | ${r.setupSeconds.toFixed(0)} | ${r.perSecond.toFixed(1)} | ${Object.values(r.errors).reduce((a, b) => a + b, 0)} ${Object.keys(r.errors).length ? JSON.stringify(r.errors) : ''} |`);
