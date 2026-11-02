# Interview guide

How to explain Aravalli, in your own words. This file is updated at the end of every phase. It says what is done, what is only
planned, and what is not proven yet, because an interviewer will ask, and an honest answer is the strong one.

**Current phase: end of Phase 1 (stabilise and redesign).**

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
| Web app: 12 screens, light and dark themes, works down to 360px | Backend / API (Phase 2) |
| All business rules, in a shared package, with tests | Real login with email and password (Phase 3) |
| Tenant-aware MySQL schema as ordered migrations, a migration runner, a verification script | |
| 149 unit tests, 70 browser tests, and 52 checks run against a real MySQL 8 server | Server-side role enforcement (Phase 3) |
| Sample organisation (fictional) with realistic data | Organisation sign-up, invitations (Phase 3) |

Roles (`Org Admin`, `Risk Officer`, `Department Head`, `Auditor`, `Employee`) are checked **in the browser only** today. That is a
demo-grade control, not security, and the plan fixes it in Phase 3 with checks on the server.

## 3. Architecture in one picture

```
packages/shared   Pure domain logic: types, scoring, transitions, validation, permissions, clock, sample data. No React, no I/O.
apps/web          React app. A demo data layer (store + selectors) sits on top of the shared rules.
apps/api          Database now (migrations, runner, seed, verification); the API arrives in Phase 2.
```

**Why a monorepo with a shared package?** The same rule ("a Resolved incident needs a note", "a closed incident is final") must
hold in the browser and, later, on the server. If it is written once, in a package with no React in it, both use the same code and
the same tests. Writing it twice is how rules drift apart.

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
2. **A single write layer** (`store.ts`): every change (register a risk, assess, report an incident, add an update, assign, link) goes
   through one function that validates, checks permission and the lifecycle, and returns **new data** or **a list of errors**. It never
   mutates. Components cannot bypass it.
3. **Selectors** (`selectors.ts`): everything on screen that is *derived* (KPIs, heat-map counts, reports) is computed from the data
   when needed, never stored. It cannot go out of date.
4. **Provider:** holds the data, the "acting as" person and the clock; saves to the browser.
5. **Pages** are thin: collect input, call the store, show errors or a toast.

**The injectable clock.** Rules like "a date cannot be in the future" need to know "now". Instead of reading the system time inside
the rules, time is passed in. The sample organisation runs on a fixed demo moment (so ages and "last 30 days" are stable); any real
organisation uses the real clock. It also makes tests deterministic.

**Saved data.** The demo stores its data in the browser. It is saved under a versioned key with a *fingerprint* of the sample
dataset, so when the sample data changes, old saved data is ignored instead of silently shown. Corrupt data is ignored too.

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

## 9. How it is tested (149 unit tests, 70 browser tests, 52 database checks)

| Layer | What it catches | Examples |
| --- | --- | --- |
| Shared unit tests (77) | The rules | band boundaries 4/5, 9/10, 16/20; every allowed and refused transition; validators; the clock; sample-data integrity |
| Web unit tests (29) | The write layer and derived figures | register, assess, report, walk an incident to Closed, closed is final, KPIs |
| Database tooling (43) | The SQL and runner, without a server | composite foreign keys, append-only triggers present, enum lists match TypeScript, migration planning |
| Browser tests (70) | The real thing, clicked |
| Real MySQL (52 checks, `npm run db:verify`) | The database itself | every constraint rejects what it should, history cannot be edited, another organisation's rows cannot be referenced, views return the right numbers. Real error messages are in `docs/db-verification.md` | forms, dialogs, tabs, filters in the URL, CSV export, print, roles, light/dark, 360px, error state |

A good story: writing the browser tests *before* fixing anything found real bugs (see below), which unit tests had not.

## 10. What testing found in Phase 1 (full list in `docs/bugs-phase1.md`)

1. **Closed incidents were not final**: the screen said so, but notes, assignment and links were still accepted.
2. **A page overflowed at 360px** (831px wide) because a wide table stopped its grid from shrinking.
3. **Stale saved data** was never invalidated when the sample data changed.
4. **The clock and the sample company were hardcoded** across components, which would block any real organisation.
5. **On a phone, tables showed the wrong columns** and record codes wrapped. Found by screenshotting every screen at 360px, not by any automated check.
6. **A real database found what text-only tests could not:** the status column was one character too short for the word "Investigating", so MySQL would have rejected real incidents; and the migration runner misread its own checksums on Windows because of line endings. The lesson worth telling: tests that read SQL as text are useful but are not a substitute for running it.

## 11. Trade-offs and honest limitations

- Roles are enforced in the browser only. Fine for a demo, not for production. Phase 3 moves it to the server.
- Data is in browser storage. Phase 2 replaces it with the API and MySQL.
- One large JavaScript bundle (about 840 kB). Easy to split by route; not done.
- The database scripts are TypeScript, run with `tsx`, and use the `mysql` command-line client instead of a database driver, so they add no runtime dependency.

## 12. Questions you may get, with honest answers

**"Is it secure?"** Not yet, and I say so. Roles are only checked in the browser. The plan is real login, then permission checks on the
server for every request, scoped to the user's organisation. The database already stops cross-organisation references.

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

**"What would you do next?"** Phase 2: an Express and TypeScript API on MySQL, with the web app calling it instead of browser storage.
Phase 3: login, organisation sign-up, invitations, server-side role checks, role-specific dashboards.

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
