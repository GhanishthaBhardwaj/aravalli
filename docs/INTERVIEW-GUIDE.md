# Interview guide

How to explain Aravalli, in your own words. This file is updated at the end of every phase. It says what is done, what is only
planned, and what is not proven yet, because an interviewer will ask, and an honest answer is the strong one.

**Current phase: end of Phase 3 (login, tenancy, roles, landing page, real data in two demonstration organisations).**

---

## 1. The 30-second pitch

"Aravalli is an enterprise risk and incident management system. A company registers its risks, each with an accountable owner,
and scores them over time by likelihood times impact, keeping the full history. People report incidents, which are assigned,
optionally linked to a risk, and tracked to resolution through an append-only log. Management sees a live picture: a heat map of
where the risks sit, what is open, what is overdue for review, how fast incidents get resolved. I built it so the business rules are
pure, tested functions, and I am turning it into a multi-tenant SaaS where every company's data is completely separate."

## 2. What exists today, and what does not

| Done | Not done yet |
| --- | --- |
| Express + TypeScript API on MySQL: about 40 endpoints, Zod on every request, one error format, OpenAPI at `/api/docs` | Billing and pricing (not in the product) |
| Sign-up (creates an organisation and its Org Admin), login, logout, rotating refresh tokens with reuse detection, and an Org Admin who adds people (with a first password) and can set a new one | Two-factor authentication, single sign-on |
| Five roles enforced by one permission map on the server, scoped to department / own incidents, tested role by role | Reports for Department Heads (they get a department home instead) |
| Multi-tenancy: the organisation comes only from the session; another organisation's records answer 404 (tested in both directions through every endpoint) | A summary table for the two heaviest reports (about 150 to 240 ms at 25,000 incidents) |
| Two demonstration organisations filled with **real public data** (24,802 ServiceNow tickets, 5,481 OSHA severe-injury records), importers that are idempotent | Email of any kind: verification, forgot-password and invitations were removed on purpose |
| Web app: login and sign-up screens, a Users screen where the Org Admin adds people, a different home per role, an account menu, a plain landing page with one React Three Fiber object | |

Roles are enforced on the server; the browser only hides or explains. Identity comes from a verified session, not from anything the
client can choose. Say both exactly like that.

## 3. Architecture in one picture

```
packages/shared   Pure domain logic: types, scoring, transitions, validation, permissions, clock, API response types. No React, no I/O.
apps/api          Express API: routes -> controllers -> services -> repositories (SQL). Also the migrations, runner, seed, verification.
apps/web          React app. One API client module; pages load data, show loading / empty / error states, and call the API to change it.
```

**Why a monorepo with a shared package?** The same rule ("a Resolved incident needs a note", "a closed incident is final") must
hold in the browser and on the server. It is written once, in a package with no React in it, and both use the same code and the same
tests. The browser uses it to *explain* (disable a button and say why); the server uses it to *decide*.

**Why four layers on the server?** A route says what is accepted (and feeds the API docs). A controller turns a request into a call.
A service holds the rules and the transaction. A repository holds the SQL. Each can be read, tested and changed without the others, and
the one rule that matters for tenancy (every repository query takes `organisation_id` from the request context) lives in one place.

## 4. The business rules (the part worth knowing cold)

- **Score** = likelihood × impact, each 1–5. **Bands:** Low 1–4, Medium 5–9, High 10–16, Critical 20–25. (17–19 cannot occur: no
  two numbers from 1–5 multiply to them. That is a good detail to mention.)
- **Current score is not stored on the risk.** It is the latest assessment. Storing it would duplicate a fact that can go stale;
  deriving it keeps the data model in 3NF and makes history free.
- **Incident lifecycle:** Open → Investigating → Contained or Resolved; Contained → Resolved; Resolved → Closed, or back to
  Investigating (reopen). Resolving needs a note and sets `resolved_at`; reopening clears it. **Closed is final.**
- **Risk lifecycle:** Identified → Assessed (needs an assessment) → Mitigating/Monitoring; any → Closed (needs a note); Closed → Monitoring.
- **History is append-only:** assessments and incident updates are never edited or deleted. Corrections are new rows. The database
  enforces this with triggers.

## 5. How the web app is built

1. **Domain functions** (`packages/shared`): pure, no side effects: `bandFor`, `canIncidentTransition`, `validateRisk`, `permit`.
2. **The server decides.** Every change is one API call. The service validates, checks the role and the lifecycle inside a transaction,
   and answers with the updated record or a list of field errors in one fixed format. The browser cannot skip a rule because the rule is
   not there.
3. **One API client** (`api/client.ts`) is the only code that calls `fetch`. It adds the two development headers, turns failures into
   one `ApiError`, and maps field errors onto the form.
4. **`useApi`** loads data when a page opens or its filters change, cancels outdated requests so a slow answer can never overwrite a
   newer one, and gives every page the same loading, empty and error states with a retry.
5. **Lists are paged, sorted and filtered by the server** (a register can hold tens of thousands of rows); the table only draws one page.
6. **Nothing the app needs is stored in the browser** except the theme and the "acting as" choice. The old "Reset sample data" button is gone.

**The injectable clock.** Rules like "a date cannot be in the future" need to know "now". Instead of reading the system time inside
the rules, time is passed in (the real clock in production, a fixed one in tests). The demo date is gone from the product.

## 6. Multi-tenancy: the idea to be able to draw on a whiteboard

Every company is an `organisation`; every other table has `organisation_id`. The interesting part is *how isolation is enforced*:

- Codes, names and emails are unique **per organisation** (`UNIQUE (organisation_id, risk_code)`), so two companies can both have `RSK-0001`.
- Every table has `UNIQUE (id, organisation_id)`, and other tables reference it with a **composite foreign key** `(id, organisation_id)`.
- So a risk in company 1 **cannot** name an owner from company 2: that pair does not exist and MySQL rejects it. Isolation is a property of
  the data, not only of careful queries.
- Optional links (assignee, linked risk) may be NULL; if present, they must be in the same organisation.

What it does **not** do: it does not stop a *logged-in user* from asking for another company's data through the application. That is
what login and server-side checks (Phase 3) are for. Data-level isolation is the foundation; access control is the next layer.

## 7. Database design points

- 3NF. A risk's department and its owner's department are independent facts (a Risk Officer can own risks across departments), so nothing is duplicated. The one derived value, the current score, is not stored.
- A **generated column** for the score (likelihood × impact), so it cannot be written wrongly.
- **Views** for the "current" picture; **triggers** for append-only history; **CHECK constraints** for value lists and timing rules (including that `resolved_at` exists exactly when an incident is Resolved or Closed).
- `ON DELETE RESTRICT` everywhere: history is never cascaded away. People are deactivated, not deleted.
- **Migrations** are ordered files with checksums. The runner refuses to continue if an already-applied file was edited: schema changes are always new migrations.
- **Tests that read the SQL as text** guarantee, without a server, that every foreign key is composite and tenant-scoped and that the SQL value lists match the TypeScript ones.

## 8. Design system, and why

- Geist for the interface, Geist Mono **only** for IDs and numbers, so a code like `RSK-0012` is instantly recognisable.
- One accent, safety orange, used only for the primary action and Critical risk. When orange appears, it means "act" or "danger".
- Risk bands run **light grey → grey → dark → orange**, and always show their name. Colour is never the only signal (accessibility).
- Light and dark themes follow the system and can be overridden; the choice is applied before first paint, so there is no flash.
- Motion is subtle and is switched off when the user's system asks for reduced motion.
- Charts are Recharts, restyled to the same tones, and each has a hidden data table for screen readers.

## 9. How it is tested (77 shared, 132 API and database-text, 9 web unit, 76 browser, 52 database checks)

| Layer | What it catches | Examples |
| --- | --- | --- |
| Shared unit tests (77) | The rules | band boundaries 4/5, 9/10, 16/20; every allowed and refused transition; validators; the clock; sample-data integrity |
| Auth tests (API) | Sign-up, login, wrong password vs unknown email, rate limit, rotation, **reuse detection**, expiry (by moving the injected clock), logout, reset, verification, invitations (accept, expire, revoke), user management, demo login, security headers | the refresh token is only ever stored hashed; a replayed token kills the newest one too |
| Cross-tenant tests (API) | A user of one organisation attacks the other, both ways, through every endpoint that takes or names an id | reads, updates, assignment, links, user changes, invitations; 404 or 400 every time, and the victim's rows are byte-for-byte unchanged afterwards |
| Role tests (API) | Every role against every protected action, with the expected status written out | Department Head only in own department; Employee only own incidents; Auditor read-only |
| Web unit tests (9) | The API client and presentation helpers | query strings, mapping API errors to form fields, incident age |
| API tests (33) | The whole server against a real MySQL test database | validation, roles, lifecycles, filtering and paging, dashboard figures agreeing with the lists, tenant isolation, 30 simultaneous creations getting 30 consecutive codes |
| Database tooling (43) | The SQL and runner, without a server | composite foreign keys, append-only triggers present, enum lists match TypeScript, migration planning |
| Real MySQL (52 checks, `npm run db:verify`) | The database itself | every constraint rejects what it should, history cannot be edited, another organisation's rows cannot be referenced, views return the right numbers. Real error messages are in `docs/db-verification.md` |
| Browser tests (71) | The real thing, clicked, against a real API and database | forms, dialogs, tabs, filters in the URL, CSV export, print, roles, light/dark, 360px, error and retry, data surviving a reload because the server holds it |

A good story: writing the browser tests *before* fixing anything found real bugs (see below), which unit tests had not.

## 10. What testing found in Phase 1 (full list in `docs/bugs-phase1.md`)

1. **Closed incidents were not final**: the screen said so, but notes, assignment and links were still accepted.
2. **A page overflowed at 360px** (831px wide) because a wide table stopped its grid from shrinking.
3. **Stale saved data** was never invalidated when the sample data changed.
4. **The clock and the sample company were hardcoded** across components, which would block any real organisation.
5. **On a phone, tables showed the wrong columns** and record codes wrapped. Found by screenshotting every screen at 360px, not by any automated check.
6. **A real database found what text-only tests could not:** the status column was one character too short for the word "Investigating", so MySQL would have rejected real incidents; and the migration runner misread its own checksums on Windows because of line endings. The lesson worth telling: tests that read SQL as text are useful but are not a substitute for running it.

## 11. Trade-offs and honest limitations

- Login has no two-factor and no lockout beyond rate limiting; the rate limiter is in memory, so a restart clears it.
- Department Heads have no reports page (the report queries are organisation-wide); their home screen is built from the scoped lists.
- Paging uses limit/offset: deep pages cost more. That is bounded here (capped limit and offset, tens of thousands of rows per organisation) and the reasoning, with measured numbers once the data is imported, is in `docs/api.md` and `docs/performance.md`.
- The view `v_risk_current` computes every risk's latest assessment with a window function. Fine for a risk register of hundreds; it is the first thing to revisit if registers grow far larger.
- One large JavaScript bundle (about 840 kB). Easy to split by route; not done.
- The database scripts are TypeScript, run with `tsx`, and use the `mysql` command-line client instead of a database driver, so they add no runtime dependency.

## 12. Questions you may get, with honest answers

**"Is it secure?"** It is designed to be, and tested for the things I can test. Passwords are Argon2id. The access token is 15 minutes and
lives in memory; the refresh token is an httpOnly, SameSite=Strict cookie stored hashed, rotated on use, with reuse detection. The
organisation is never taken from the request: it is read from the session user's row on every request, so deactivating someone works
at once. Another organisation's records answer 404, and a test attacks every endpoint in both directions. What it lacks: 2FA, an audit
log of logins, and a distributed rate limiter. I would not call it penetration-tested.

**"How does one company not see another's data?"** Two layers. Done: every row carries its organisation, and composite foreign keys make
cross-organisation references impossible in the database. Planned: every query on the server filters by the logged-in user's organisation,
and that is tested with a second organisation.

**"Why store history instead of just the current value?"** Risk management is about movement: a score that fell from 20 to 9 is a story
an auditor wants. History also makes the current value derivable, so there is no second copy to keep in sync.

**"Why a shared package?"** One set of rules, tested once, used by the browser now and the server later.

**"Why are the rules not in the components?"** So they can be tested without a browser, reused on the server, and so no screen can
accidentally skip one.

**"Why can a Risk Officer own a risk in another department?"** Because that is how risk management actually works: a central risk function owns risks that sit in many departments. I first tied the owner to the department, then removed the rule everywhere (form, validation, database) when it was clear it was wrong. The risk's department says where it belongs; the owner says who is accountable. They are different facts.

**"What was hardest?"** Making the sample organisation stop being special: its name, its date, its default user and its email domain
were all woven through the interface. Moving them into data, and injecting time, is what makes the app usable for any organisation.

**"What would you do next?"** Pre-aggregate the two heavy reports, add a FULLTEXT index for search, add two-factor, and a real email provider.
Then the product work: risk appetite and thresholds, treatment plans with due dates, and attachments.

**"How do you generate record codes safely?"** In the database, not the browser or the API process. A per-organisation counter row is
incremented with a statement that locks the row until the transaction commits, so two simultaneous requests wait for each other and can
never get the same number; if the creation fails the number is rolled back. A test fires 30 at once and checks 30 consecutive codes.

**"Why limit/offset rather than cursors?"** A register is a table people jump around in and sort by any column, with a total. Cursors
cannot jump to page *n* or give a total cheaply. The cost of offset is bounded here, and I will measure it. A cursor is the right answer
for an unbounded newest-first feed, which is a later feature.

**"What happens if two people update the same incident?"** The service runs in a transaction and locks the incident row first
(`SELECT ... FOR UPDATE`), so the second request sees the result of the first and is judged against the new state. A test does exactly this.

**"How do you know the tests are worth anything?"** Several were written first and failed on real bugs, and each fix has a test that fails
without it. I also test the rules at their edges (the 4/5, 9/10, 16/20 band boundaries) rather than only the middle.

---

## Phase log

### Phase 1: stabilise and redesign
- Restructured into a monorepo (`apps/web`, `apps/api`, `packages/shared`).
- Found and fixed bugs with a browser test suite (list above).
- Removed the sample company, its dates and its default user from the interface; time is injected; saved data is versioned.
- Added organisations to the data model and the database (composite keys), and renamed `Administrator` to `Org Admin`.
- New design system and every screen redone; light and dark themes; checked at desktop, dark and 360px (screenshots of every screen).
- Database as ordered migrations with a runner and a verification script, now in TypeScript.
- Owner-in-department rule removed (form, validation, database); empty states for Departments and People.
- Ran the migrations, the sample seed and the 52-check verification on MySQL 8.0.46. That found two real bugs (above), now fixed and covered by tests. Output saved in `docs/db-verification.md`.

### Phase 2: backend and database
- Express + TypeScript API: routes, controllers, services, repositories; `mysql2` with a connection pool and `?` placeholders only; graceful shutdown; Zod on every request; one error format; OpenAPI at `/api/docs`; health check.
- Server is the source of truth: reuses scoring, lifecycles, validation and permissions from `packages/shared`. Added a likelihood/impact range check to the shared validator after an API test found that out-of-range values only failed at the database.
- Request context object (organisation and actor), development headers for now, one place to change in Phase 3.
- Migration 0007: per-organisation counters for record codes and source-ID columns for imported records.
- Web app now uses one API client; localStorage data, the demo date and "Reset sample data" are gone. Loading, empty and error states with retry on every page. Search is server-side.
- Tests: 33 API tests on a separate database; browser tests rewritten to run against the real API (71); web unit tests replaced (9).
- Bugs the new tests found: `last_value` is a reserved word in MySQL 8; the connection collation did not match the database; a stale saved organisation id in the browser could stop the app starting.
- Datasets: download script with a source manifest; the UCI log is downloaded and profiled, OSHA needs a manual download. **Importers are not written yet: waiting for sign-off on the field mapping.**
- Datasets: download script with a source manifest; the UCI log is downloaded and profiled; OSHA is a manual download (the site refused scripted access, which I did not circumvent).
- Importers (`apps/api/scripts/import`): idempotent, direct writes that deliberately bypass the incident state machine. UCI is rebuilt as of a cut-off date (so some tickets stay open) and OSHA is limited to manufacturing 2024–2025. Dates are shifted by one fixed offset per dataset and the originals are kept. Migration 0008 adds the fields kept from the sources.
- Performance (`docs/performance.md`): the default list went from about 200 ms to about 19 ms and a deep page from 420 ms to 17 ms, by removing an `IS NULL` sort term, adding migration 0009's indexes and a deferred join. The two heavy reports are still 150 to 240 ms and are documented as such.

### Phase 3: login, tenancy, roles, landing page
- Migration 0010: `user_account` and `refresh_token`. (Email verification, password reset and invitations were built first and then removed: nothing sends email, so the Org Admin adds people and sets passwords instead.)
- `access` is a required field on every route, so none can be added without saying who may call it. The request context is built from the verified session only; the dev headers, the "Acting as" picker and the organisation switcher are deleted.
- The permission map lives in `packages/shared` and is used by the server to decide and by the browser to explain. Scope (department / own) is applied in the SQL of the lists and re-checked on single records; out-of-scope answers 404.
- Web: one API client holds the access token in memory and does a single shared refresh on a 401; sign-in and sign-up screens; Users screen (add a person, set a password, change a role, deactivate); role-specific homes; account menu; demo login buttons behind `DEMO_LOGINS`.
- Landing page, deliberately plain: navbar, hero with one React Three Fiber object (a 5x5 heat map whose tile height is the score; still with reduced motion; HTML fallback without WebGL), a real dashboard screenshot that tilts and straightens on scroll, a four-line description, the role table, and the data credits. Pricing, testimonial, FAQ and a feature grid were removed because they were decoration, not information.
- Bugs found while building: a hash-based "random" choice used a signed shift and produced a negative interval (a CHECK constraint caught it); a by-code lookup in a tenancy test legitimately returned the attacker's own record because codes repeat per organisation; the first version of the importer used `INSERT IGNORE`, which silently dropped half the rows, so it now inserts plainly and fails loudly.
