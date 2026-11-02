# Aravalli

Enterprise risk and incident management for a company: register risks with an accountable owner, score them over time
(likelihood × impact, with full history), report incidents, track them to resolution through an append-only log, and see where
the organisation stands.

Aravalli is being built as a **multi-tenant SaaS product**: any company will be able to sign up, invite its people and keep its
own risks and incidents, completely separate from every other company. The plan is in [`PLAN.md`](PLAN.md).

**Where it stands (end of Phase 1):** a polished web app running on sample data in the browser, a tenant-aware MySQL schema with
migrations that has been run and verified on MySQL 8, and a test suite. There is no backend and no login yet. The sample organisation, *Aravalli Industries Ltd.*, is
**fictional**, and its data lives in your browser (the app labels it as demo data).

## Quick start

Requires Node 20.12 or newer.

```
npm install
npm run dev          # http://localhost:5173
```

Use the "Acting as" menu in the top bar to see the app as different people and roles. "Reset sample data" in the left menu restores the original data.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app. |
| `npm test` | Unit tests for every package. |
| `npm run e2e` | Browser tests with Playwright (uses the Microsoft Edge that ships with Windows; the dev server starts itself). |
| `npm run typecheck` | TypeScript across all packages. |
| `npm run lint` | ESLint. |
| `npm run build` | Production build. |
| `npm run db:migrate`, `db:status`, `db:seed`, `db:reset`, `db:verify` | Database commands. See [`docs/schema.md`](docs/schema.md). |

## Layout

```
apps/web          The React app (Vite, Tailwind, Recharts, Motion). Demo data layer, pages, components, Playwright tests.
apps/api          Database: migrations, migration runner, sample seed, verification script (all TypeScript). The API itself arrives in Phase 2.
packages/shared   Pure domain logic with no React and no I/O: types, scoring, status transitions, validation,
                  permissions, the clock, and the single sample dataset. Both the web app and the future server use it.
docs/             schema, bug list, manual test checklist, interview guide, database verification
```

## Database (optional for now)

The web app does not need a database yet. To work on the schema you need MySQL 8.0.16 or newer, either installed locally or through
`docker compose up -d db`.

```
copy .env.example .env      # then fill in your own values; .env is never committed
npm run db:migrate          # create the tables
npm run db:seed             # load the sample organisation
npm run db:verify           # try to break every rule on a throwaway database
```

## Design

Geist (UI) and Geist Mono (IDs and numbers), self-hosted. Off-white and near-black with one accent, safety orange, used only for
primary actions and Critical risk. Risk bands run light grey, grey, dark, orange, and are always named, never colour alone. Light and dark
themes follow the system, with a switch. Motion is subtle and switched off when the system asks for reduced motion.

## Documents

- [`PLAN.md`](PLAN.md): what Aravalli must become, the phases, the design rules.
- [`docs/schema.md`](docs/schema.md): the database, tenancy, normalisation, lifecycles.
- [`docs/bugs-phase1.md`](docs/bugs-phase1.md): what was wrong and what was done.
- [`docs/manual-checklist.md`](docs/manual-checklist.md): test it yourself in the browser.
- [`docs/INTERVIEW-GUIDE.md`](docs/INTERVIEW-GUIDE.md): how to explain the project.
- [`docs/db-verification.md`](docs/db-verification.md): proof of the schema on MySQL.

Geist is licensed under the SIL Open Font License (copy in `apps/web/public/fonts`).
