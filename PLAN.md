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
