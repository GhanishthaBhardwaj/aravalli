# Aravalli: code walkthrough (read this to know what your own code does)

Read it in order once, then use the headings to look things up. Every file path is real. Open the file while you read.

---

## 0. The big idea in plain words

A company signs up. It gets a private space (an **organisation**). Inside it, people with different **roles** record **risks** (things that could go wrong) and **incidents** (things that did go wrong). Nobody can see another company's data, and nobody can do more than their role allows.

Three rules shape all of the code:

1. **The server decides. The browser only displays.** The browser never holds the truth: not the data, not the permissions, not the organisation. If the browser lies, the server doesn't care.
2. **The organisation comes from the login session only.** Never from the URL, the form or a header. This is what makes tenants separate.
3. **The database is the last line of defence.** Even if the application code had a bug, MySQL itself refuses cross-organisation links and edits to history.

---

## 1. The folders

```
apps/api/            the server
  database/migrations/   0001..0010: the database, built step by step
  database/seeds/        a small fictional company used by tests
  src/
    app.ts               builds the Express app (security headers, cookies, routes)
    index.ts             starts it (port 3001), shuts down cleanly
    core/                shared plumbing: config, db, errors, http helpers, context, registry
    routes/              WHICH endpoints exist and WHO may call them
    controllers/         turn a request into a service call
    services/            the business rules and transactions
    repositories/        the SQL
    auth/                crypto (passwords, tokens) and mailer
    db/                  migration runner and the database checks
  scripts/import/        the two real-data importers
  scripts/perf.ts        the speed-measuring script
  test/                  API tests (auth, tenancy, roles, general)
apps/web/            the website
  src/api/client.ts      the ONLY place that talks to the server
  src/app/               App routes, providers (session), layout
  src/pages/             one file per screen; pages/auth, pages/landing
  src/components/        buttons, tables, forms, charts, shell
  e2e/                   browser tests (Playwright)
packages/shared/     rules used by BOTH sides (no React, no database)
  permissions.ts  scoring.ts  transitions.ts  validation.ts  auth.ts  clock.ts  types.ts
docs/                documentation (this file, API, schema, performance, checklist)
data/                sources.json (where the real data came from); raw/ is git-ignored
```

---

## 2. What happens when you click something (one request, start to finish)

Example: a Risk Officer opens the incident list.

1. **Browser** (`apps/web/src/pages/IncidentRegister.tsx`) calls `api.incidents({...})` from `apps/web/src/api/client.ts`.
2. `client.ts` adds `Authorization: Bearer <access token>` (the token sits in a JavaScript variable in memory) and calls `GET /api/incidents?...`.
3. **Express** (`apps/api/src/app.ts`) passes it through `helmet` (security headers), `express.json` (reads bodies), `cookieParser`, then the router.
4. **Registry** (`core/registry.ts`) is what registered the route. For this route it inserted, in order:
   - the rate limiter if there is one,
   - `authenticate` (is the token valid? who is this?),
   - `requirePermission('incident.read')` (does this role hold it?),
   - then your handler.
   Before the handler runs, the **query string is validated by the route's Zod schema**. A bad value never reaches a service.
5. `authenticate` (`core/context.ts`) verifies the JWT, reads the user's **row from the database** (user + employee + organisation), and builds `req.ctx`:
   `{ userId, organisationId, actorId, role, departmentId, actor, scope }`.
6. **Controller** (`controllers/incidents.ts`) calls `service.listIncidents(d, req.ctx, filters, ...)`.
7. **Service** (`services/incidents.ts`) adds `scope: ctx.scope` to the filters and calls the repository.
8. **Repository** (`repositories/incidents.ts`) builds the SQL. It always starts `WHERE i.organisation_id = ?`, using `ctx.organisationId`, then adds the filters and the scope condition.
9. MySQL answers; the repository maps rows; the controller sends `{ data: [...], page: { limit, offset, total } }`.
10. The page renders the table.

If anything fails, **one error format** comes back: `{ "error": { "code", "message", "details" } }` (`core/errors.ts`). The browser's `ApiError` class and `fieldErrors()` turn it into messages next to form fields.

**Why four layers?** Each can be read, tested and changed alone. The one thing that matters for tenancy (every query is scoped to one organisation) lives in one place per query.

---

## 3. The permission system (the heart of the "roles" feature)

File: `packages/shared/src/permissions.ts`. Read it. It is short.

**3.1 `ROLE_PERMISSIONS`** maps each role to a list of permissions:

| Permission | meaning |
| --- | --- |
| `directory.read` | see departments and people |
| `risk.read` / `risk.write` | see / register, assess, change status of risks |
| `incident.read` | see incidents (within scope) |
| `incident.report` | create an incident |
| `incident.update` | add a note / change status |
| `incident.assign`, `incident.link` | assign, link to a risk |
| `report.read` | reports and heat map |
| `user.manage` | add people, set passwords, roles, deactivate |

- Org Admin: all.
- Risk Officer: all except `user.manage`.
- Department Head: directory, risk read/write, incident read/report/update/assign/link. No reports, no users.
- Auditor: directory, `risk.read`, `incident.read`, `report.read`. No write of any kind.
- Employee: `incident.read`, `incident.report`, `incident.update`. Nothing else.

**3.2 Scope** answers a different question: *which rows?* `scopeFor(actor)` returns:
- Org Admin, Risk Officer, Auditor: `{ kind: 'org' }`, everything in the organisation.
- Department Head: `{ kind: 'department', departmentId }`.
- Employee: `{ kind: 'own', employeeId }`.

`inScope(scope, target)` is the single yes/no function:
- org: always yes.
- department: `target.department_id === scope.departmentId`.
- own: the target's `reported_by` or `assigned_to` equals the employee.

**3.3 Permission versus scope (the key idea):**
- Missing **permission** (e.g. an Auditor trying to register a risk) → **403 Forbidden**. Stopped by middleware before any code runs.
- **Out of scope** (e.g. a Department Head opening another department's risk, or anyone opening another organisation's record) → **404 Not Found**. The server pretends it doesn't exist, so nothing leaks.

**3.4 Where scope is applied, twice:**
- **Lists:** in the SQL (`repositories/incidents.ts`, `risks.ts`, `directory.ts`). For a Department Head it adds `AND i.department_id = ?`; for an Employee, `AND (i.reported_by = ? OR i.assigned_to = ?)`. Even if someone adds `?department_id=...` to the URL, the scope condition is still in the SQL, so they can't widen what they see.
- **Single records and writes:** in the service. Example (`services/incidents.ts → addUpdate`): lock the incident row → `if (!inScope(ctx.scope, inc)) throw notFound(...)` → then `permit(actor, 'incident.update', inc)`.

**3.5 `permit(actor, action, target?)`** is the per-action check with a human reason. It is also used by the browser to disable buttons and show tooltips like "Auditors have read-only access." The browser's version is for explaining only. The server runs the same function and refuses for real.

**3.6 Special rules** in services:
- Employees can't close incidents (`canClose`).
- A Department Head can only assign to people in their own department, and link only to risks in their own department.
- Closed incidents are final: no updates, assignments or link changes.
- An organisation must keep at least one active Org Admin; you can't deactivate yourself.

---

## 4. Login and sessions, step by step

Files: `services/auth.ts`, `controllers/auth.ts`, `routes/auth.ts`, `auth/crypto.ts`, `repositories/auth.ts`, and on the web `api/client.ts` + `app/providers.tsx`.

**4.1 Sign-up** (`signup` in services/auth.ts). In ONE transaction it creates: the organisation (with a unique slug), a department "General", the employee (role Org Admin, code from the counter), the `user_account`, a verification email, and the first session. If any step fails, none of it is saved.

**4.2 Login.**
1. Find the user by email (lower-cased).
2. If there is no such user, it still runs a password check against a dummy hash, so the response takes the same time. The caller can't discover which emails exist.
3. Verify the password (Argon2id). Demo accounts and deactivated users are refused with the *same* message, "Invalid email or password."
4. Issue tokens (below).

**4.3 The two tokens.**
- **Access token:** a JWT signed with `JWT_SECRET`, valid 15 minutes, containing only the user id. The browser keeps it in memory.
- **Refresh token:** 32 random bytes. The browser never sees it in JavaScript: the server sets it as a cookie that is `httpOnly` (scripts can't read it), `SameSite=Strict` (not sent from other sites), `Secure`, and limited to the path `/api/auth`. In the database only its **SHA-256 hash** is stored, so a database leak gives attackers nothing usable.

**4.4 Refresh and rotation** (`refresh` in services/auth.ts).
- Look up the hash. Lock the row.
- Not found / expired → refuse.
- **Already used or revoked → reuse detected → revoke the entire "family"** (every token from that login), then refuse. This is the anti-theft feature: if an attacker copies your cookie and uses it, one of you will present an already-used token, and both sessions die.
- Otherwise mark it used, issue a new refresh token in the same family and a new access token.
- The revocation must be saved even though we then refuse. That's why the function *returns* a failure flag from inside the transaction and throws after commit (throwing inside would roll the revocation back).

**4.5 How the web app uses it** (`client.ts`).
- On page load, `refreshSession()` asks the server to exchange the cookie for a token. If it works you're signed in; if 401 you're signed out; if the server is unreachable you see "Aravalli can't load".
- Every call attaches the access token. If a call gets a 401 (token expired) it triggers **one** shared refresh (`refreshing` promise), then retries once. If that fails it signs you out.

**4.6 Other flows.**
- **No email at all.** Verification links, forgot-password and invitations were removed. The Org Admin adds a person on the Users screen (`createUser` in `services/auth.ts`): the employee row and the login are created in one transaction with a first password the admin chose. The admin can later set a new password (`setUserPassword`), which revokes every refresh token of that person. A person who forgets their password asks their Org Admin.
- **Demo login** (`demoLogin`): exists only if `DEMO_LOGINS=true`, otherwise 404. Demo users have a random password nobody knows and can't use password login.
- **User management:** the Org Admin changes role/department/active flag. Deactivating revokes all refresh tokens. A deactivated user's access token also stops working at once, because every request re-reads the user.

**4.7 Rate limiting** (`routes/auth.ts`, `express-rate-limit`): login is limited per IP and per email; sign-up is limited too. They're in memory, so a server restart clears them.

---

## 5. Multi-tenancy: three layers

1. **Session decides the organisation.** `req.ctx.organisationId` comes from the user's database row. No route accepts an organisation id from the request. (A test sends `X-Organisation-Id` and `organisation_id` in the body and proves they're ignored.)
2. **Every query is scoped.** Look at any function in `repositories/`: they all take `organisationId` as an argument and put it in `WHERE`.
3. **The database forbids cross-links.** Tables reference each other with **composite foreign keys**, e.g. in `incident`:
   `FOREIGN KEY (department_id, organisation_id) REFERENCES department (department_id, organisation_id)`.
   An incident of organisation 2 therefore **cannot** reference a department, employee or risk of organisation 4. MySQL rejects it.

Plus: codes like RSK-0001 repeat in every organisation, so lookups always include `organisation_id`.

**Proof:** `apps/api/test/tenancy.test.ts`. Organisation A attacks B through every endpoint (reads, writes, assignment, linking, user changes, invitations), then B attacks A. All fail, and the victim's rows are unchanged afterward.

---

## 6. The database in detail

Migrations (`apps/api/database/migrations`), applied in order by `src/db/migrate.ts`. The runner records each one in `schema_migrations` with a checksum, so you can't silently edit an applied migration.

| # | What it adds |
| --- | --- |
| 0001 | `organisation` |
| 0002 | `department`, `employee` |
| 0003 | `risk`, `risk_assessment` |
| 0004 | `incident`, `incident_update` |
| 0005 | view `v_risk_current` (risk + latest assessment, via a window function) |
| 0006 | triggers: assessments and updates are append-only |
| 0007 | `organisation_counter`; `source_system`/`source_id` on incident |
| 0008 | import fields: `source_occurred_at`, `made_sla`, `reassignment_count`, `region`, `industry_code`; `organisation.data_note` |
| 0009 | list indexes for speed |
| 0010 | `user_account`, `refresh_token` |

**Rules the database enforces by itself (CHECK, keys, triggers):**
- role must be one of the five; status/severity/category must be from the allowed lists;
- `risk_score` is `likelihood × impact`, a **generated column** (can't be set wrong, can't drift);
- likelihood and impact are 1–5;
- `reported_at ≥ occurred_at`;
- a Resolved/Closed incident **must** have `resolved_at`; an open one must **not**;
- codes, names and emails are unique **per organisation** (but `user_account.email` is unique globally, because it's the login);
- `ON DELETE RESTRICT` everywhere: you can't delete something that is referenced;
- triggers refuse UPDATE/DELETE on `risk_assessment` and `incident_update`.

**Record codes** (`repositories/counters.ts`): `UPDATE organisation_counter SET current_value = LAST_INSERT_ID(current_value + 1) ...` locks that organisation's counter row until the transaction commits. Two simultaneous creations take turns. If creation fails, the number rolls back. A test creates 30 at once and checks 30 consecutive codes.

**Locking updates:** `SELECT ... FOR UPDATE` on the incident/risk row inside a transaction (`withTransaction` in `core/db.ts`). Two people changing one incident can't interleave.

**`db:verify`** (`src/db/verify.ts`) builds a throwaway database, tries things that must work and things that must be *rejected*, and writes the real results to `docs/db-verification.md`. 52 checks.

---

## 7. Business rules (`packages/shared`)

- `scoring.ts`: `computeScore = likelihood × impact`. Bands: Low 1–4, Medium 5–9, High 10–16, Critical 20–25.
- `transitions.ts`:
  - Incident: Open → Investigating → (Contained) → Resolved → Closed. Resolved can go back to Investigating. Closed is final. Resolving needs a note.
  - Risk: Identified → Assessed (needs an assessment) → Mitigating/Monitoring → Closed (needs a note). Closed can only go back to Monitoring.
- `validation.ts`: every form rule (required fields, lengths, dates not in the future, 1–5 range). The browser shows errors from it; the server **re-runs it** and refuses bad data.
- `clock.ts`: time is passed in (a real clock in production, a fixed one in tests), so "not in the future" is testable.
- `auth.ts`: password rule (10+ chars, letter and number) and sign-up validation, used by form and server.

---

## 8. The web app

- **Routing** (`app/App.tsx`): public routes (`/login`, `/signup`) and a `Gate` for everything else:
  - loading → skeleton; server unreachable → error with Try again;
  - signed in → the app inside `Layout`; at `/` it shows `Home`;
  - signed out → the landing page at `/`, otherwise redirect to `/login?next=...` (`safeNext` only allows paths inside the app, so nobody can craft a link that sends you to another site).
- **Providers** (`app/providers.tsx`): auth status and user, a toast system, page-title meta. `useSession()` gives screens `actor` (the person's employee record), `organisation`, `can(permission)`, `signOut`. When the user changes, the whole tree remounts, so one person's data never lingers for the next.
- **Home** (`pages/Home.tsx`): switches on role. Admin / Officer / Auditor see `Overview` (with different next-step text); Department Head sees `DepartmentHome`; Employee sees `EmployeeHome`.
- **Menu** (`components/shell/Sidebar.tsx`): each item has a `needs` permission; items you can't use are removed. `App.tsx` also wraps routes in `Allowed`, so typing the URL gives "Not available for your role". The server would refuse anyway.
- **`useApi`** (`api/useApi.ts`): loads data when a page opens or filters change, cancels outdated requests (so a slow answer never overwrites a newer one), and supports loading, empty and error states with retry.
- **Tables and filters:** the server sorts, filters and pages; the browser draws one page. Filters live in the URL so reload and sharing work.
- **Landing page** (`pages/landing/`): `Landing.tsx` (all sections), `HeatTiles3D.tsx` (the one 3D object). The 3D library is **lazy-loaded** so signed-in users don't download it. 25 tiles; tile height = score; critical tiles orange; floats gently and leans toward the mouse; static with reduced motion; plain-HTML fallback if WebGL is missing. The screenshot tilts using scroll position (`useScroll`/`useTransform`) and is flat with reduced motion.
- **Design system:** `styles/tokens.css` (colours as CSS variables for light/dark; one orange accent used only for primary actions and Critical risk), Geist fonts, risk bands always named (never colour alone).

---

## 9. The real data and the importers

Files: `apps/api/scripts/import/common.ts`, `import-uci.ts`, `import-osha.ts`.

- `common.ts`: CSV parser, stable hash (so "random" choices repeat identically on every run), organisation/department/employee creation (idempotent), bulk insert, risk-register creator that **links imported incidents to hand-written risks by a rule** (e.g. incidents with "during maintenance" → "Hazardous energy during maintenance").
- **UCI** (`import-uci.ts`): groups 141,712 event rows by ticket; for each ticket takes events up to the **cut-off 2017-01-10**; maps ServiceNow states to ours (New→Open, Active→Investigating, Awaiting*→Contained, Resolved, Closed); tickets opened after the cut-off are skipped; builds the timeline from the state changes; severity from priority.
- **OSHA** (`import-osha.ts`): keeps only manufacturing (NAICS 31/32/33) 2024+; severity: Amputation or Loss of Eye → Critical, Hospitalized → High, else Medium; department from the event/source text; the narrative becomes the description; drops employer and address columns; recent records open, older closed.
- **Date shift:** a fixed number of days per dataset (computed from constants), so reruns give the same dates and the newest record is near today.
- **Idempotent:** it loads the existing `source_id`s first and skips them. It uses plain `INSERT` (an early version used `INSERT IGNORE`, which silently dropped rows; now a duplicate is a loud error).
- **Bypasses the state machine on purpose:** writes straight to tables.
- The invented staff come from a name list; demo users (one per role) are created on existing employees with unusable passwords.

---

## 10. Testing, and what each kind proves

| Kind | Where | Proves |
| --- | --- | --- |
| Shared unit tests (77) | `packages/shared` | the rules themselves |
| API tests (`api.test.ts`) | `apps/api/test` | validation, lifecycles, filtering/paging, KPIs agree with lists, 30-concurrent codes, locking |
| Auth tests (`auth.test.ts`) | same | sign-up, login, rate limit, refresh rotation, **reuse detection**, expiry (by moving the injected clock), reset, verify, invites, user management, demo login, security headers |
| Tenancy tests | `tenancy.test.ts` | cross-organisation attacks fail both ways, victim data unchanged |
| Role tests | `roles.test.ts` | every role × every action with the exact expected status |
| DB text checks | `src/db/db.test.ts` | the SQL files contain the guarantees |
| `db:verify` | real MySQL | the guarantees actually hold (52 checks) |
| Browser tests | `apps/web/e2e` | real clicking through the real API and a test database |

Tests run on a **separate** database (`aravalli_test`), rebuilt each run. The code refuses to run against a name that doesn't contain "test".

---

## 11. Speed work (be able to tell this story)

Measured with `npm run perf`: 30 warm-up requests, then 60 timed, p50/p95.

- Found: default list 200 ms on 25,000 rows.
- Causes: (1) `ORDER BY reported_at IS NULL, reported_at` — the `IS NULL` expression stopped MySQL using an index order; (2) no index ending in the sort column; (3) deep pages joined thousands of discarded rows.
- Fixed: remove the `IS NULL` where the column can't be null; migration 0009 indexes starting with `organisation_id`; **deferred join** (pick the 25 ids from the narrow table first, then join).
- Result: 200 → 19 ms; deep page 420 → 17 ms.
- Not fixed (honest): the overview and resolution reports (aggregate everything on every call) and substring text search.

---

## 12. Security checklist (what's done, what isn't)

Done: Argon2id, short-lived memory-only access token, httpOnly+SameSite+Secure refresh cookie, hashed tokens, rotation + reuse detection, single-use expiring links, rate limits, identical failure answers, helmet headers, Zod validation of every input, parameterised SQL only, server-side roles, 404 on out-of-scope, DB constraints.

Not done: two-factor, lockout beyond rate limits, distributed rate limiting, login audit log, penetration test.

---

## 13. How to run and reset things

- `npm run dev` starts API (3001) + web (5173). If the sign-in page says the server can't be reached, the API isn't running.
- `npm run db:migrate`, `db:seed` (tiny sample company), `import:uci`, `import:osha`.
- Reset the dev database: `cd apps/api && npx tsx src/db/migrate.ts reset --yes`, then migrate, then the importers.
- `.env` holds your database login and `DEMO_LOGINS=true`. It is never committed.
- Tests: `npm test`, `npm run e2e`, `npm run db:verify`.

---

## 14. Questions to rehearse (with the file to point at)

1. **Walk me through login.** `services/auth.ts → login`, then `issueTokens`, cookie in `controllers/auth.ts`, then `core/context.ts → authenticate` on each request.
2. **What if an attacker steals the refresh cookie?** Rotation + reuse detection: `services/auth.ts → refresh`.
3. **How is tenancy enforced?** Section 5; show a composite foreign key in `0004_incident.sql` and `tenancy.test.ts`.
4. **Why 404 not 403?** Section 3.3.
5. **How do you stop an Employee seeing others' incidents even with a crafted URL?** Scope is in the SQL (`repositories/incidents.ts → where`) and re-checked on single records (`services/incidents.ts → getIncident`).
6. **Where is "Auditors are read-only" enforced?** `ROLE_PERMISSIONS.Auditor` has no write permission; `requirePermission` in `core/context.ts`, applied by `core/registry.ts`; tested in `roles.test.ts`.
7. **How do you stop two people corrupting an incident?** `FOR UPDATE` in `lockIncident`, transactional `addUpdate`.
8. **Why can't history be edited?** Triggers in `0006_triggers.sql`.
9. **Why generated column for the score?** It can't be wrong or stale.
10. **Why a shared package?** Same rule on both sides, written once.
11. **How did you make it faster?** Section 11.
12. **Is the data real?** Incidents yes (OSHA, UCI), companies and people invented, dates shifted and disclosed (README + footer).
13. **What are the weak points?** Section 12 "Not done", plus slow reports.
14. **How would it scale?** Summary tables for reports, FULLTEXT search, a shared rate-limit store (Redis), read replicas, and moving the refresh-token table to a cache if volume grows.

---

## 15. Things you should be careful about

- **Never say it is "fully secure".** Say what it does and what it doesn't.
- The 3D library makes the landing chunk large (about 850 kB, 232 kB compressed). It is lazy-loaded; say so before being asked.
- One browser test is timing-sensitive and retries once.
- Never commit `.env` or `data/raw`. They are git-ignored on purpose.
- `DEMO_LOGINS=true` is for demos only. Never on a real deployment.
