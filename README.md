# Aravalli

Enterprise risk and incident management for a company: register risks with an accountable owner, score them over time
(likelihood × impact, with full history), report incidents, track them to resolution through an append-only log, and see where
the organisation stands.

Aravalli is being built as a **multi-tenant SaaS product**: any company will be able to sign up, invite its people and keep its
own risks and incidents, completely separate from every other company. The plan is in [`PLAN.md`](PLAN.md).

**Where it stands (Phase 2, in progress):** a React web app talking to an Express + TypeScript API on MySQL 8. The server owns the
rules (scoring, lifecycles, validation, role checks, record codes); the browser keeps no business data. API documentation is served at
`/api/docs`. Still to come in Phase 2: importing the real public datasets (waiting on sign-off of the field mapping). Not yet built:
login and sign-up (Phase 3). Until then, the organisation and the acting person are chosen with the **"Acting as"** menu, which is
**development scaffolding, not security**; the API says so in its docs and in `src/core/context.ts`.

The sample organisation, *Aravalli Industries Ltd.*, is **fictional**, with hand-written sample data.

## Quick start

Requires Node 20.12 or newer and MySQL 8.0.16 or newer (installed locally, or `docker compose up -d db`).

```
npm install
copy .env.example .env      # then fill in your own database values; .env is never committed
npm run db:migrate          # create the tables
npm run db:seed             # load the sample organisation
npm run dev                 # web http://localhost:5173, API http://localhost:3001, API docs http://localhost:3001/api/docs
```

Use the "Acting as" menu in the top bar to see the app as different people and roles.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API and the web app together (`dev:api` and `dev:web` start one each). |
| `npm test` | Unit and API tests for every package. The API tests need MySQL: they build and use a separate `aravalli_test` database. |
| `npm run e2e` | Browser tests with Playwright against a real API and the test database (uses the Microsoft Edge that ships with Windows). |
| `npm run typecheck` | TypeScript across all packages. |
| `npm run lint` | ESLint. |
| `npm run build` | Production build. |
| `npm run db:migrate`, `db:status`, `db:seed`, `db:reset`, `db:verify` | Database commands. See [`docs/schema.md`](docs/schema.md). |
| `npm run data:download` | Fetch the public datasets into `data/raw/` (git-ignored) and record their source, date and checksum in `data/sources.json`. |

## Layout

```
apps/web          The React app (Vite, Tailwind, Recharts, Motion). One API client module, pages, components, Playwright tests.
apps/api          The API (routes, controllers, services, repositories), the migrations, the migration runner, the seed and the verification script.
packages/shared   Pure domain logic with no React and no I/O: types, scoring, status transitions, validation,
                  permissions, the clock, API response types, and the small sample dataset. The web app and the server both use it.
scripts/          Development helpers (starting everything, the browser-test API).
data/             sources.json (committed: where each dataset came from). raw/ is git-ignored.
docs/             API, schema, performance, bug list, manual test checklist, interview guide, database verification
```

## Design

Geist (UI) and Geist Mono (IDs and numbers), self-hosted. Off-white and near-black with one accent, safety orange, used only for
primary actions and Critical risk. Risk bands run light grey, grey, dark, orange, and are always named, never colour alone. Light and dark
themes follow the system, with a switch. Motion is subtle and switched off when the system asks for reduced motion.

## Documents

- [`PLAN.md`](PLAN.md): what Aravalli must become, the phases, the design rules.
- [`docs/api.md`](docs/api.md): the API: layers, errors, paging (and why offset), code generation, tests.
- [`docs/schema.md`](docs/schema.md): the database, tenancy, normalisation, lifecycles.
- [`docs/performance.md`](docs/performance.md): timings on the real data volume (not measured yet).
- [`docs/bugs-phase1.md`](docs/bugs-phase1.md): what was wrong and what was done.
- [`docs/manual-checklist.md`](docs/manual-checklist.md): test it yourself in the browser.
- [`docs/INTERVIEW-GUIDE.md`](docs/INTERVIEW-GUIDE.md): how to explain the project.
- [`docs/db-verification.md`](docs/db-verification.md): proof of the schema on MySQL.

Geist is licensed under the SIL Open Font License (copy in `apps/web/public/fonts`).
