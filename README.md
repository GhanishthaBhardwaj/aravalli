# Aravalli

Enterprise risk and incident management for companies: register risks with an accountable owner, score them over time
(likelihood × impact, with full history), report incidents, follow them to resolution through an append-only log, and see where
the organisation stands.

Aravalli is a **multi-tenant SaaS product**: a company signs up, its admin adds its people, and keeps its own risks and incidents,
completely separate from every other company.

**Where it stands (end of Phase 3):** a React web app on an Express + TypeScript API on MySQL 8, with sign-up, login,
five server-enforced roles, per-role home screens, a plain public landing page, and two demonstration organisations filled with
**real public data** (see below). The server owns every rule (scores, lifecycles, validation, roles, record codes, tenancy); the
browser keeps no business data and no token in storage. API documentation is at `/api/docs`.

## Quick start

Requires Node 22.12 or newer and MySQL 8.0.16 or newer (installed locally, or `docker compose up -d db`).

```
npm install
copy .env.example .env      # then fill in your own database values; .env is never committed
npm run db:migrate          # create the tables
npm run db:seed             # the small fictional sample organisation (used by the tests)
npm run data:download       # the UCI dataset (OSHA is a manual download, see "Data sources")
npm run import:uci          # "UCI ServiceNow Incident Log": ~24,800 real tickets
npm run import:osha         # "OSHA Severe Injury Reports": ~5,500 real OSHA records
npm run dev                 # web http://localhost:5173, API http://localhost:3001, API docs http://localhost:3001/api/docs
```

With `DEMO_LOGINS=true` in `.env` (the default in `.env.example`) the log-in page shows a button per role for each
demonstration organisation. **Never turn that on for a real deployment.** An Org Admin adds people on the Users screen (name, email,
role, department, first password) and can set a new password for them.

## Roles and permissions

Enforced on the server for every endpoint (one permission map in `packages/shared/src/permissions.ts`, checked by middleware and
again inside each service). The browser reads the same map only to hide or explain. `apps/api/test/roles.test.ts` tests every
role against every action.

| Role | Can do | Sees |
| --- | --- | --- |
| **Org Admin** | Everything in their organisation, including adding people and setting passwords | Everything in their organisation |
| **Risk Officer** | All risks and incidents (register, assess, change status, assign, link, update). No user management | Everything except user management |
| **Department Head** | Act on risks and incidents of **their own department** only; report incidents; assign only within their department | Their own department |
| **Auditor** | Nothing: read-only | Everything in their organisation, including reports |
| **Employee** | Report incidents; update the incidents they reported or were assigned. Cannot assign, link, close, or touch risks | Only incidents they reported or were assigned |

Another organisation's records, and records outside your scope, answer **404** (the same as one that does not exist), never 403.

## Demo logins

On the sign-in page, under "Try a demonstration organisation", with `DEMO_LOGINS=true`:

| Organisation | Roles | Source |
| --- | --- | --- |
| **UCI ServiceNow Incident Log · anonymised IT company** (slug `uci-servicenow`, ~24,800 incidents) | Org Admin, Risk Officer, Department Head (Service Desk), Auditor, Employee | UCI ServiceNow incident log |
| **OSHA Severe Injury Reports · US manufacturing 2024–2025** (slug `osha-manufacturing`, ~5,500 incidents) | the same five roles (Department Head of Production) | OSHA Severe Injury Reports |

The two organisations are named after their real sources on purpose: they are not customers and not real companies. Their staff have
role-style names ("Plant Safety Officer", "Production Supervisor 1", "Service Desk Analyst 2"), never invented personal names.

Demo accounts have a random password nobody knows; they can only be entered through the demo login.

## Data sources and credits

Incidents in the two demonstration organisations are **real public records**. Everything around them was made for the demo: the staff accounts (role titles, not people) and the risk registers ("Sample risk register written for this demo, linked to real incidents"). Each organisation shows a short source note inside the app (its source with a link, what was changed, what was added); it is stored in `organisation.data_note` and written by the importers. Every imported incident keeps its original source ID and original date, shown on the incident page.

* **UCI Machine Learning Repository: "Incident management process enriched event log"** (an anonymised ServiceNow log), licence
  **CC BY 4.0**. Amaral, C. A. L., Fantinato, M., Peres, S. M. *Incident management process enriched event log.* UCI Machine Learning
  Repository. https://archive.ics.uci.edu/dataset/498 . Licence: https://creativecommons.org/licenses/by/4.0/ . Changes made: events
  collapsed into one incident per ticket as of a cut-off date, dates shifted, fields mapped (below).
* **OSHA Severe Injury Reports**, US Department of Labor, Occupational Safety and Health Administration:
  https://www.osha.gov/severe-injury-reports (federal OSHA jurisdiction only; January 2015 to November 2025). The page states no
  licence or copyright terms (checked on 3 November 2026); it says only that the data "will be updated periodically and represent
  incidents under federal OSHA jurisdiction only". OSHA's site refused scripted downloads, so the CSV is downloaded by hand from that
  page and saved as `data/raw/osha-severe-injury.csv` (git-ignored, never committed). **the OSHA organisation's incidents come from real OSHA
  records across many different US manufacturers**; no single company had them all, and employer names and addresses are not imported.

`data/sources.json` records the URL, licence, download date, size and SHA-256 of each file.

### How the data is mapped (decisions)

| | UCI ServiceNow log → "UCI ServiceNow Incident Log" | OSHA → "OSHA Severe Injury Reports" |
| --- | --- | --- |
| Rows | 141,712 events → 24,802 incidents | manufacturing (NAICS 31/32/33), 2024 to Nov 2025: **5,481** |
| State | Rebuilt **as of 10 Jan 2017** (a date inside the log): 51 tickets still Open/Investigating/Contained/Resolved, the rest Closed. Tickets opened after the cut-off are left out | Records from 1 Oct 2025 on are still open; 1 Aug to 30 Sep a mix of Resolved and Closed; older are Closed |
| Severity | priority: 1 Critical, 2 High, 3 Moderate→Medium, 4 Low | Amputation or Loss of Eye → Critical; Hospitalized → High; otherwise Medium |
| Department | assignment group → one of 8 IT departments (group 70, the big front-line queue, is Service Desk; others spread by number: the source is anonymised) | from Event/Source text: Production, Maintenance, Warehouse, Logistics, Quality |
| Title / description | no free text in the source: title from category codes, description lists the coded fields | description = OSHA's *Final Narrative*; title from Nature, Part of body and Event |
| Kept | `made_sla`, `reassignment_count`, ticket number as `source_id` | NAICS, State, report ID as `source_id` |
| Dropped (privacy) | caller and resolver identities are mapped to invented staff | Employer, Address1, Address2, City, Zip, Latitude, Longitude |
| Date shift | **+3,583 days**, so the newest ticket is 2 Nov 2026 | **+337 days**, so the newest record is 1 Nov 2026 |

**Dates are shifted forward by one fixed offset per dataset** so the newest record lands near today. The original timestamp is kept
on every incident (`source_occurred_at`) and the app states the shift in the footer of every screen (`organisation.data_note`).
OSHA narratives are published by OSHA after its own anonymisation; they are imported as given.

The importers are idempotent (re-running adds nothing; a duplicate would be a loud error) and write straight to the tables, on
purpose bypassing the incident state machine, because an imported record arrives already in the state its source ended in.
Each organisation also has a hand-written risk register (8 and 9 risks, with two assessments each) linked to imported incidents by a stated rule.

## Reloading the development database (after the honest-data rename)

The two demonstration organisations were renamed after their sources and their staff got role-style names, so an old development database
must be rebuilt (the importers are idempotent, but they key organisations by slug, and the slugs changed). Stop `npm run dev` first, then:

```
npm run db:reset -w @aravalli/api -- --yes
npm run db:migrate
npm run import:uci
npm run import:osha
npm run dev
```

(`db:reset` only drops databases whose name contains `dev` or `test`. The small sample organisation from `npm run db:seed` is for the tests
and is not needed for the demo.)

## Putting it online

One free Render web service runs the API and serves the built web app from the same address; the database is a free TiDB Cloud Starter
cluster (MySQL-compatible, reached over TLS). Local development stays on MySQL 8. Step by step, for a beginner:
[`docs/DEPLOY-RENDER.md`](docs/DEPLOY-RENDER.md). In production mode (`NODE_ENV=production`) the API serves `apps/web/dist`, answers every
non-`/api` address with `index.html`, trusts one proxy (`trust proxy`), and connects over TLS when `DB_SSL=true`.

TiDB has no triggers, so the append-only history tables (`risk_assessment`, `incident_update`) are protected there by a database permission
instead: the live app connects as a least-privilege user that may only SELECT and INSERT on them (`npm run db:app-user:prod` creates it
and proves it). On local MySQL the triggers do the same job. Migrations, imports and checks run from your laptop against TiDB with
`npm run db:migrate:prod`, `import:uci:prod`, `import:osha:prod`, `db:app-user:prod` and `db:verify:prod`, which read the git-ignored file
`.env.production` (see `.env.production.example`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API and the web app together. |
| `npm test` | Unit and API tests for every package. The API tests need MySQL and build a separate `aravalli_test` database. |
| `npm run e2e` | Browser tests (Playwright) against a real API and the test database. |
| `npm run typecheck`, `lint`, `build` | Checks. |
| `npm run db:migrate`, `db:status`, `db:seed`, `db:reset`, `db:verify` | Database commands. |
| `npm run data:download` | Fetch the UCI dataset into `data/raw/` and record its source and checksum. |
| `npm run import:uci`, `import:osha` | Load the real data (`-- --all-manufacturing --db aravalli_perf` loads all 34,472 OSHA manufacturing rows for performance tests). |
| `npm start` | Production mode: the API serving the built web app (`npm run build -w @aravalli/web` first; set `NODE_ENV=production`, `JWT_SECRET`). |
| `npm run db:migrate:prod`, `db:status:prod`, `import:uci:prod`, `import:osha:prod` | The same, against the database in `.env.production` (TiDB). Also `db:app-user:prod` and `db:verify:prod`. |
| `npm run perf` | Time the API endpoints (p50/p95). |

## Layout

```
apps/web          React app (Vite, Tailwind, Recharts, Motion, the landing page is plain HTML and CSS, including its 3D landscape), pages, Playwright tests.
apps/api          API (routes, controllers, services, repositories), migrations, importers, performance script, tests.
packages/shared   Pure domain logic (no React, no I/O): types, scoring, transitions, validation, the permission map, the clock.
scripts/          Development helpers.
data/             sources.json (committed). raw/ is git-ignored.
docs/             API, deployment, capacity test, project guide.
```

## Security notes

Argon2id passwords; 15-minute JWT access tokens held in memory only; rotating refresh tokens in an httpOnly, SameSite=Strict, Secure
cookie, stored hashed, with reuse detection (a replayed token revokes the whole login); passwords are set by the Org Admin; rate limits on login and sign-up; helmet headers; parameterised SQL only; the organisation always comes from
the session. Limits: access is checked per request in the database, so a deactivated user is out at once; there is no 2FA, no
account lockout beyond rate limiting, and the in-memory rate limiter resets when the server restarts.

## Design

Geist (UI) and Geist Mono (codes and numbers only), self-hosted. The "Ridge" colours (forest graphite and jade):
light is the app's default (page `#F4F6F5`, panels white, accent `#0F7A5A`), dark is for the landing page and the app's dark mode
(page `#0B1210`, accent `#3DB58B`). Jade is the brand and is never used for a warning: severity has its own colours (Low grey, Medium amber,
High orange, Critical red) and is always a dot plus the word. The tokens are in `apps/web/src/styles/tokens.css`. Motion is short CSS
and is switched off when the system asks for reduced motion.

## Documents

- [`docs/api.md`](docs/api.md): the API: layers, errors, paging, code generation, tests.
- [`docs/DEPLOY-RENDER.md`](docs/DEPLOY-RENDER.md): put it online on Render and TiDB Cloud, step by step.
- [`docs/MY-PROJECT-GUIDE.md`](docs/MY-PROJECT-GUIDE.md): the project explained in plain English.
- [`docs/CAPACITY.md`](docs/CAPACITY.md): what the capacity test measured.

Geist is licensed under the SIL Open Font License (copy in `apps/web/public/fonts`).
