# The API

Express + TypeScript on MySQL (`apps/api`). Interactive documentation, generated from the same Zod schemas the server validates
with, is at **http://127.0.0.1:3001/api/docs** while `npm run dev` is running (raw document: `/api/openapi.json`).
Health check: `GET /api/health` (checks the database).

## Layers

```
routes/        one file: every endpoint, with the Zod schema its query or body must satisfy
controllers/   turn a validated request into a service call and a response. No SQL, no business rules.
services/      the business rules: permissions, lifecycles, validation, transactions. Reuse packages/shared.
repositories/  SQL only. Every statement takes organisation_id and uses ? placeholders.
core/          config, connection pool, error format, request context, route registry (feeds the OpenAPI document)
```

A request that fails validation never reaches a service. A service never builds SQL. A repository never decides anything.

## Who is asking, and for which organisation

Every repository query takes `organisationId` from one object, `req.ctx` (`core/context.ts`), and that object is built from the
**verified session** only: the `Authorization: Bearer <access token>` header names the user, and the organisation, role and
department are read from the database on every request (so a deactivation or a role change takes effect on the very next request).
The body, the URL and every other header are never consulted for the organisation. The old `X-Organisation-Id` / `X-Actor-Id`
headers, the organisation switcher and `GET /organisations` are gone; a test sends them and checks they are ignored.

Every route declares its `access` (`'public'`, `'session'`, or a permission from the shared map) and cannot be registered without
one. The permission middleware refuses with 403; services then apply scope (Department Heads: their department; Employees: incidents they
reported or hold) and answer **404** for anything outside it, exactly as for another organisation's records.

**Sessions.** Access token: 15-minute JWT (HS256), kept in memory by the web app. Refresh token: random, stored hashed, delivered only
as an httpOnly, SameSite=Strict, Secure cookie scoped to `/api/auth`, rotated on every use. Using an already-used refresh token
revokes the whole login (all tokens with that `family_id`). Reset, verification and invitation links are random, hashed, single-use and expire.

## Auth and user-management endpoints

| | |
| --- | --- |
| Public | `POST /auth/signup`, `/auth/login` (rate limited), `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/invitations/lookup`, `/auth/invitations/accept`, `GET /auth/demo-accounts`, `POST /auth/demo-login` (the last two exist only when `DEMO_LOGINS=true`) |
| Signed in | `GET /auth/me`, `POST /auth/resend-verification` |
| Org Admin (`user.manage`) | `GET /users`, `PATCH /users/:id` (role, department, deactivate; an organisation keeps at least one active Org Admin), `GET`/`POST /invitations`, `DELETE /invitations/:id` |

## Endpoints

| | |
| --- | --- |
| Organisations | `GET /organisations/current`, `/organisations/:id` (only your own) |
| Departments | `GET /departments` (with open risk, open incident and headcount figures), `/departments/:id` |
| Employees | `GET /employees` (search, department, role, active, sort, page), `/employees/:id` |
| Risks | `GET /risks`, `POST /risks`, `GET /risks/:id`, `GET /risks/by-code/:code`, `GET` and `POST /risks/:id/assessments`, `POST /risks/:id/status` |
| Incidents | `GET /incidents`, `POST /incidents`, `GET /incidents/:id`, `GET /incidents/by-code/:code`, `GET` and `POST /incidents/:id/updates`, `PATCH /incidents/:id/assignment`, `PATCH /incidents/:id/risk-link` |
| Reports | `GET /reports/overview`, `/reports/heatmap?mode=current\|first`, `/reports/risk-profile`, `/reports/resolution?group_by=severity\|department` |

There are no `PUT` or `DELETE` endpoints: assessments and timeline entries are append-only by design (the database enforces it with
triggers), and nothing is hard-deleted.

## One error format

```json
{ "error": { "code": "validation_error", "message": "The request is not valid.", "details": [ { "field": "title", "message": "Title is required." } ] } }
```

| Code | Status | When |
| --- | --- | --- |
| `validation_error` | 400 | Bad shape (Zod), or a rule from `packages/shared` (a field per message), or an invalid transition |
| `actor_required` | 401 | A write without an acting employee, or one who is not in this organisation |
| `forbidden` | 403 | The role may not do this (the same `permit()` rules the web app uses to disable buttons) |
| `not_found`, `organisation_not_found` | 404 | No such record **in this organisation** (another organisation's id looks exactly like a missing one) |
| `conflict` | 409 | The record is Closed, which is final |
| `internal_error` | 500 | Anything unexpected. The details stay in the server log, never in the response. |

## Lists: filtering, sorting, paging

`GET /risks`, `/incidents` and `/employees` take filters (see `/api/docs`), `sort` (a whitelisted name, never a column from the
client), `order`, `limit` (1 to 100, default 25) and `offset`. They answer `{ "data": [...], "page": { "limit", "offset", "total" } }`.
Sorting always ends with the record id, so the order is deterministic and a page boundary never splits ties.

**Why limit/offset and not cursors.** The registers are tables people page through, jump around in and re-sort by any column, and
they show "21 to 40 of 1,240". Keyset (cursor) paging cannot jump to page *n*, cannot give a total without a second query, and needs a
unique, indexed sort key for each column a user can sort by. Offset paging pays by reading and discarding `offset` rows, so deep pages
are slower, but here that cost is bounded: one organisation holds tens of thousands of rows, `limit` is capped at 100, and `offset` at
1,000,000. The measured cost of a deep page on the real volume is in [`performance.md`](performance.md). Where a cursor *is* the right
tool is an unbounded, newest-first stream (an audit log or notification feed, both later phases); those will use one.

## Record codes are generated by the database

`RSK-0001` and `INC-0001` come from the `organisation_counter` table (migration 0007). Inside the creating transaction the server runs
`UPDATE organisation_counter SET current_value = LAST_INSERT_ID(current_value + 1) WHERE organisation_id = ? AND counter_name = ?`. That
statement takes a row lock held until commit, so concurrent requests take turns and can never receive the same number, and a failed
creation rolls the number back, so there are no gaps. Counters are per organisation. If an organisation has none yet (data loaded by a
seed or an import), the counter starts after the highest code already present. Tested with 30 simultaneous creations of each kind.

## Time

Services receive an injected `Clock` (`systemClock` in production). It supplies "now" for timestamps, the 30-day KPI window and
"cannot be in the future" checks. The demo date is gone; the browser tests and API tests use a fixed clock where they need to.
DATE and DATETIME columns are returned as plain strings (`dateStrings`), with no time-zone conversion.

## Tests

`npm test -w @aravalli/api` builds a separate database (`aravalli_test`, from `TEST_DB_NAME`) with the migrations and the small sample
seed, adds a second organisation, and drives the real Express app with Supertest. It covers validation, roles, the lifecycles,
filtering, paging, the dashboard figures, tenant isolation (lists, details, cross-organisation writes) and concurrent code generation.
The reset refuses any database name that does not look disposable.
