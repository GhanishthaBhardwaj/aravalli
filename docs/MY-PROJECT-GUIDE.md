# Aravalli: my project guide

This is for me, to understand and explain my own project. It is not shown in the app.

## What the app does

Aravalli helps a company keep track of two things.

1. **Risks.** Things that could go wrong. Each risk has an owner and a score. The score is likelihood times impact, each from 1 to 5, so it runs from 1 to 25. Old scores stay in a history, so you can see if a risk is getting better or worse.
2. **Incidents.** Things that did go wrong. Someone reports one. It gets an assignee. It moves through five stages: Open, Investigating, Contained, Resolved, Closed. Every step is written to a timeline that cannot be edited.

An incident can be linked to the risk behind it. The heat map shows where the risks sit. Reports show risk by department and how fast incidents are resolved.

## The five roles

| Role | Can do | Sees |
| --- | --- | --- |
| Org Admin | everything in the organisation, including adding people and setting passwords | everything |
| Risk Officer | all risks and incidents, but no user management | everything except users |
| Department Head | acts on risks and incidents of their own department | their department |
| Auditor | nothing, read-only | everything |
| Employee | reports incidents, updates the ones they reported or were given | only those incidents |

The rules live in one file, `packages/shared/src/permissions.ts`. The server checks them on every request. The browser reads the same file only to grey out buttons. A greyed-out button is a hint. The server is the real lock.

## Architecture

There are three parts.

- **Frontend.** A React app (Vite, Tailwind, Recharts). It lives in `apps/web`. It holds no business data. It asks the API for everything. The login token is kept in memory only.
- **Backend.** An Express API written in TypeScript, in `apps/api`. It is split in layers: routes, controllers, services, repositories. Routes check the role. Services hold the rules. Repositories hold the SQL. All SQL uses placeholders, never string joining.
- **Database.** MySQL 8 on my laptop. TiDB Cloud Starter online. TiDB is MySQL-compatible.

A fourth folder, `packages/shared`, holds the rules that both sides need: scoring, allowed status changes, validation, permissions. It has no React and no database code.

In production there is one web service. The API also serves the built React files, so the browser sees one address. That matters because the refresh cookie is `SameSite=Strict`, which only works when the page and the API share an address.

## How login works

A person logs in with email and password. Passwords are hashed with Argon2id. The server returns a short access token (15 minutes) and sets a refresh cookie (httpOnly, Secure, SameSite=Strict). The refresh token is stored hashed. Each use of it gives a new one. If an old one is used again, the whole login is revoked. Login and sign-up are rate limited.

## How multi-tenancy works

Each company is an **organisation**. Almost every table has an `organisation_id`. Three things keep companies apart.

1. **The session decides the organisation.** The browser never sends an organisation id. The server reads it from the logged-in user.
2. **Every query filters by it.** Records of another organisation answer "not found", not "forbidden", so nobody can even learn that they exist.
3. **The database refuses mixing.** Foreign keys include the organisation id. A risk of company A cannot point at an employee of company B, even by mistake. `db:verify` tries these and checks they fail.

Codes like RSK-0001 and INC-0001 are counted per organisation. The database hands them out, inside the same transaction that creates the record, so two people can never get the same code.

## The two datasets

The demo has two organisations. Their incidents are real public records. Everything around them was made by me.

**OSHA Severe Injury Reports** (US Department of Labor). Real workplace injury reports. I took manufacturing records from January 2024 to November 2025: 5,481 incidents.
- Employer names and addresses are not imported.
- The narrative becomes the description. Amputation or loss of an eye is Critical, a hospital stay is High, the rest Medium.
- Dates are shifted forward by 337 days so the newest record is near today. The original date is kept on every incident.
- Newer records are still open, older ones are closed.

**UCI ServiceNow Incident Log** (UCI Machine Learning Repository, licence CC BY 4.0). A real, anonymised IT service desk log. It is a log of events, many rows per ticket. I rebuilt each ticket as it stood on 10 January 2017, which gives 24,802 incidents. Dates are shifted forward by 3,583 days. The original timestamp is kept. The log has no free text, so titles come from the category codes.

**What I added.** The risk registers (8 and 9 risks) and the staff accounts. I wrote the risks by hand and linked them to incidents by a stated rule. The staff have role titles like "Production Supervisor 1", not personal names, because no real person should be pretended. Each organisation shows a short source note inside the app.

The importers are in `apps/api/scripts/import`. They write straight to the tables. They skip the normal status rules, because an imported incident arrives already in the state its source ended in. They can be run again safely.

## How append-only records work

Risk scores (`risk_assessment`) and incident timeline entries (`incident_update`) must never be changed or deleted.

- **On MySQL (my laptop):** triggers refuse any UPDATE or DELETE on those two tables.
- **On TiDB (online):** TiDB has no triggers. So the live app connects as a special database user that may only SELECT and INSERT on those two tables. The database itself refuses the rest. The script `npm run db:app-user:prod` creates that user and tries to break the rule to prove it works.
- **In the app:** there is no code that updates or deletes those tables. A test reads the source to check that.

The admin user (used only from my laptop for migrations and imports) is not the user the web service uses.

## How deployment works

- The code is on GitHub.
- Render builds and runs it (`render.yaml`). One free web service. It installs, builds the React app, then starts the API, which serves both.
- The data is in TiDB Cloud Starter. The service connects over TLS (`DB_SSL=true`).
- Secrets (database host, user, password) are typed into Render's Environment tab. They are not in the repository. `JWT_SECRET` is generated by Render.
- Tables are created and data is loaded from my laptop, once, with the `*:prod` commands. They read `.env.production`, which is never committed.
- The steps are in `docs/DEPLOY-RENDER.md`.

## Tests

- Unit tests for the shared rules.
- API tests against a real MySQL test database: every role against every action, tenant isolation, login, validation.
- Browser tests (Playwright): every page for every role at desktop, tablet and phone width, plus forms, filters, reports and the login flow.
- `npm run db:verify` builds a throwaway database and tries 52 things that must work or must fail.

## Honest limits

- **The free Render service sleeps** after 15 minutes without visitors. The first visit after that takes about a minute.
- **It is small.** One web service on a small shared CPU. Logging in is slower than other requests because the password hash is deliberately heavy work.
- **Reports are the slowest part.** The overview and resolution reports read a whole organisation's incidents. On the 25,000 ticket organisation they take noticeably longer than a list page. See `docs/CAPACITY.md` for measured numbers.
- **The database is far from the server.** Each query crosses the internet, so every request is slower than on my laptop.
- **No email.** Nobody gets a reset link. An Org Admin sets passwords. There is no two-factor login and no account lockout beyond the rate limit.
- **The rate limiter lives in memory.** It resets when the service restarts.
- **Demo logins are public on purpose.** Anyone can enter the two demo organisations. Anyone can also create an empty organisation of their own.
- **Not tested at scale.** The capacity test reached 100 organisations and 500 users. I do not know where it would break.
