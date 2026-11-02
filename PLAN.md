Before we change anything, I need you to fully understand where this project
is and where it must go. Do NOT write or change any code in this session.

## What you built so far
You built Aravalli, an Enterprise Risk & Incident Management app, in this
folder. It works as a demo, but it does not feel like a professional product:
- It is frontend-only. Data lives in browser localStorage.
- There is no real login. The login/"Acting as" screen shows a list of
  pre-made users and you just pick one. Anyone can be anyone.
- Lots of hardcoded names and fixed demo data everywhere. A new user from a
  different company could never actually use it.
- Roles are only enforced in the UI, so they aren't real security.
- The MySQL schema exists but has never been executed.
- The UI looks like a student project, not like a product companies would pay for.

## What Aravalli must become
A multi-tenant, SaaS-style platform. Any company can sign up, create its
organisation, invite its own employees, and manage its own risks and incidents.
Each company's data is completely separate from every other company's. Every
person logs in with their own email and password, and what they see and can
do depends on their role:
- Org Admin – manages the whole organisation, users and settings.
- Risk Officer – all risks and incidents in the organisation.
- Department Head – only their own department.
- Auditor – read-only access to everything in the organisation.
- Employee – reports incidents and works on incidents assigned to them.
"Aravalli Industries" is only a demo organisation, not the product itself.

## The plan (we will do one phase per session, I will tell you when)
- Phase 1 – Stabilise and redesign: fix all bugs, restructure into a
  client/server monorepo, apply the new design system to every screen, run
  the SQL on real MySQL and prove it works.
- Phase 2 – Backend + database: Node.js + Express + TypeScript API on MySQL,
  React talks to the API, no more localStorage.
- Phase 3 – Real authentication, organisation signup, invitations,
  multi-tenancy, backend role-based access, role-specific dashboards, and a
  public landing page.
Later phases (NOT now): mitigation tasks, audit log, notifications, ML,
billing.

## Design system (applies to everything from Phase 1 on)
- Clean and premium, like Linear, Vercel or Stripe. Calm enterprise feel.
- Must NOT look AI-generated: no purple/blue gradients, no emojis, no glowing
  buttons, no identical rounded cards with an icon on top, no gradient
  washes, no ALL-CAPS labels above headings, no "→" on every button.
- Off-white background, near-black text, neutral greys, ONE accent colour:
  safety orange (around #F25C05), used only for primary actions and Critical
  risk. Risk bands use greys → dark → orange, not a rainbow.
- Fonts: Geist for UI, Geist Mono only for IDs and numbers (e.g. RSK-0012).
  Big bold headlines, lots of white space.
- Light and dark mode, following system preference by default, with a toggle.
- Heroicons for icons. Motion for subtle animation only. Respect
  prefers-reduced-motion. Responsive down to 360px. Visible keyboard focus.

## Working rules (for every phase)
- Extend this project; don't rebuild from scratch. Reuse the existing
  business logic (risk scoring, state transitions, validation).
- Keep the existing tests passing. Change a test only when behaviour
  intentionally changes, and tell me why.
- Ask me before adding any dependency. Everything must be free/open source.
- No secrets in code: use .env plus a committed .env.example.
- At the end of a phase: run tests, typecheck, lint and build, commit, give
  me a short summary and how to test it, then STOP.

## Your task now
1. Read the entire codebase.
2. Save everything above into `PLAN.md` in the project root, exactly, so
   future sessions can follow it.
3. Reply with: (a) a summary of what currently exists (screens, data model,
   logic, tests), (b) every place where data, names or users are hardcoded,
   (c) the problems you see, (d) your proposed step-by-step approach for
   Phase 1. Then wait. Don't change code.

---

## Repository layout (approved after the Phase 0 analysis)

```
apps/web          React + Vite app (pages, components, demo data layer, e2e tests)
apps/api          Node + TypeScript API (Phase 2). For now it owns the database:
                  migrations, the migration runner and the seed generator.
packages/shared   Pure domain logic (types, scoring, transitions, validation,
                  permissions, clock) plus the single demo seed. No React, no I/O.
docker-compose.yml  Optional MySQL 8 for people without a local install
.env.example      Every environment variable, with placeholder values
docs/             schema, interview guide, test checklist
```

Root scripts: `dev`, `test`, `build`, `typecheck`, `lint`, `e2e`, `db:migrate`.

## Decisions (answers to the Phase 0 questions)

1. Git: initialised; baseline committed. `dist/`, `node_modules/` and `.env` are ignored.
2. MySQL: the owner installs MySQL 8 Community Server and says when it is ready.
   Connection details come from `.env`; never hardcode them. Do not download a
   portable copy. A `docker-compose.yml` is provided for others.
3. Dependencies approved: Geist (self-hosted font files are fine), `@heroicons/react`,
   `motion`, Playwright. Remove `lucide-react`. Keep Recharts, restyled to the design system.
   Anything else must be asked about first.
4. Tenancy goes into the schema now (schema only): an `organisation` table and
   `organisation_id` on every tenant-owned table; codes, department codes and emails
   unique per organisation (composite unique keys); composite foreign keys so a row
   cannot reference another organisation's data. The seed has one demo organisation.
   No login or server-side checks yet (Phase 3).
5. `Administrator` is renamed to `Org Admin` everywhere.
6. Layout above is approved.
7. `docs/INTERVIEW-GUIDE.md` is created in Phase 1 and updated at the end of every phase.
8. Department Head permission rules stay as they are until Phase 3.

## Phase 1 brief: Stabilise and redesign (approved)

1. Run the app and test every screen, form, filter, search, navigation path and status
   change, using Playwright to click through forms, drawers, toasts, disabled buttons,
   CSV export and print. Write down every bug, then fix them all, including the stale
   localStorage data, the closed-incident contradiction, and an injectable clock.
2. Restructure into an npm-workspaces monorepo using git moves (apps/web, apps/api,
   packages/shared, docker-compose.yml, root scripts).
3. Remove hardcoded demo names and company identity from components. All demo data must
   come from one seed source, so the UI works for any organisation's data.
4. Build a shared component set following the design system: Button, Input, Select,
   Textarea, Table, Badge, Modal, Tabs, EmptyState, PageHeader, Sidebar, Topbar,
   ThemeToggle. Redesign EVERY screen with it: Overview, Risk register, Register risk,
   Risk detail, Heat map, Incident register, Report incident, Incident detail,
   Departments, People, Reports, 404. Add light/dark mode.
5. Every list needs proper loading, empty and error states.
6. Run the schema and seed on MySQL. Prove every constraint, view and trigger works:
   show bad inserts being rejected, and history rows that cannot be updated or deleted.
   Fix anything broken. Save the real output as proof. (Waits for the owner's message
   that MySQL is installed.)
7. Convert the SQL into ordered migration files with a simple migration runner.

The "Acting as" picker stays as it is; it is replaced in Phase 3.

Done when: every screen works in the browser and at 360px width, the new design is on
every screen, the schema runs cleanly on MySQL, and all tests pass. Then commit,
summarise what changed (including the bug list), give a manual checklist, update
docs/INTERVIEW-GUIDE.md, and STOP.


---

## Decision: the demo uses two organisations filled with real public data (Phases 2 and 3)

The demo will have **two organisations populated with real public incident records**. They are demonstration tenants, not
customers.

| | Org 1: an IT services company | Org 2: a manufacturing company |
| --- | --- | --- |
| Source | UCI Machine Learning Repository, "Incident management process enriched event log" (real ServiceNow data, about 24,900 incidents) | OSHA Severe Injury Reports (real workplace injury narratives, US public data) |
| Licence / terms | CC BY 4.0 (as stated by UCI): attribution required | US public data: confirm the exact terms and wording on OSHA's data page when the importer is built |

### Phase 2 (backend and database)

1. **Import scripts**, one per source, mapping each source record to an Aravalli incident: title, description, severity,
   department, dates and status. The source ID is **kept on every imported row** (a source-ID column) so any incident can be
   traced back to its original record. Imports are repeatable and idempotent.
2. **A realistic, hand-made risk register per organisation**, linked to the imported incidents (hand-made, not generated from the sources).
3. **The small sample seed stays for unit tests only.** The demo is the two real-data organisations.
4. **Measure on the real volume.** Check the indexes against about 25,000 incidents, and record the timings of the main queries and API calls.

Points to settle before importing (written down now so they are not forgotten; none changes the decision):

- **Field fit.** Neither source was designed for Aravalli. Expect to derive some fields: the UCI log is a stream of state changes and,
  as far as I know, carries anonymised category codes rather than free-text titles, so titles and descriptions will be built from the
  category fields. The OSHA records have narratives but no assignee and no workflow. Check both files before fixing the mapping.
- **Lifecycle.** Imported state histories will not always follow Aravalli's allowed status transitions. The importer should write
  directly, keep the original state in the update text, and make sure the final status and `resolved_at` satisfy the database rules.
- **Departments.** Source groupings (assignment groups, industry sectors) must be reduced to a sensible set of departments.
- **Employer names (OSHA).** The records name real employers. Do not attach real employer names or addresses to one fictional
  manufacturer's incident log: keep the incident facts, industry and state, and keep the source ID for traceability.
- **People.** Anonymised or invented names only; no real individual is identified.

### Phase 3 (authentication and multi-tenancy)

- The two organisations are what **proves tenant isolation**: one person from each, and tests showing neither can see, change or
  reference the other's data through the API.
- **Demo logins for each organisation**, with the role set from the plan (Org Admin, Risk Officer, Department Head, Auditor, Employee).
- Isolation tests run on the real volume, and the README reports **query and API performance on that volume**.

### README requirements (when the data is imported)

- Say, in these words, that the demo organisations are **"populated with real public incident records"**.
- **Credit both sources with their licences** (UCI: CC BY 4.0; OSHA: its published terms).
- **Never claim the organisations are real customers.** They are demonstration organisations built from public data.
- Report query and API performance on the real volume.

(The README does not make any of these claims yet, because no real data has been imported.)
