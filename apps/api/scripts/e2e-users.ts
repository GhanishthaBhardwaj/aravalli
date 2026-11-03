// Browser tests only: demo accounts for the five people the tests sign in as, in the small sample organisation.
// Run by scripts/e2e-api.mjs against the freshly built test database (never against development data).
import { readDbConfig } from '../src/db/config';
import { unusablePassword } from '../src/auth/crypto';
import { createPool, one, run } from '../src/core/db';

const config = readDbConfig(process.env);
if (!/test/i.test(config.database)) throw new Error(`Refusing to create test accounts in "${config.database}".`);
const pool = createPool(config, 2);
for (const email of ['neha.kapoor', 'rajesh.khanna', 'arjun.menon', 'sandeep.joshi', 'pooja.nair']) {
  const e = await one<{ employee_id: number; organisation_id: number; email: string }>(pool, 'SELECT employee_id, organisation_id, email FROM employee WHERE email LIKE ?', [`${email}@%`]);
  if (!e) throw new Error(`No sample employee ${email}`);
  await run(pool, 'INSERT INTO user_account (organisation_id, employee_id, email, password_hash, is_demo) VALUES (?, ?, ?, ?, 1)',
    [e.organisation_id, e.employee_id, e.email, await unusablePassword()]);
}
await pool.end();
console.log('browser-test accounts ready');
