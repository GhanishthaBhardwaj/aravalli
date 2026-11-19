# Putting Aravalli online: Render (free) + TiDB Cloud Starter (free)

You will end up with **one** web address that serves both the web app and the API, and a MySQL-compatible database that lives on
TiDB Cloud. Nothing here costs money, but both free plans have limits (listed at the end).

```
your laptop ──(migrations, imports, app user: once)──▶  TiDB Cloud Starter  ◀──(TLS)──  Render web service  ◀──  visitors
                                                         (the data)                       (API + web app, ONE address)
```

Why one address: the login cookie is `SameSite=Strict`, which only works when the web page and the API share an address. That is why the
API itself serves the built web app in production.

**Honest note:** this setup was prepared and checked on local MySQL 8 (all tests pass, the production build ran from one address), but it
could not be run against a real TiDB cluster while writing this guide. Part 4 therefore runs a verification (`db:verify:prod`) and Part 3
proves the permissions, so you will see straight away if anything differs. The troubleshooting table covers what is most likely.

Before you start you need: the project working on your laptop (`npm install` done, the MySQL **client** installed, `MYSQL_BIN` set in
`.env` if `mysql` is not on your PATH, and `data/raw/` holding the OSHA CSV and the UCI download, as for local development), a free
[TiDB Cloud](https://tidbcloud.com) account, a free [Render](https://render.com) account, and the project on GitHub.

---

## Part 1. Create the TiDB cluster

1. Sign in to TiDB Cloud and choose **Create Cluster**. Pick the **Starter** plan (the free one), a region close to you (and to Render's
   region if you can), and a name such as `aravalli`. Create it; it is ready in under a minute.
2. Open the cluster and click **Connect**. Choose **Connect with: General** (or "MySQL CLI"). Click **Generate Password** (or **Reset
   Password**) and copy it **now**: it is shown once. The dialog shows:

   | TiDB shows | You will need it as |
   | --- | --- |
   | Host (like `gateway01.eu-central-1.prod.aws.tidbcloud.com`) | `DB_HOST` |
   | Port, always `4000` | `DB_PORT` |
   | User (like `4ZpAbCd.root`: a prefix, a dot, `root`) | `DB_USER` for the admin user |
   | The password you generated | `DB_PASSWORD` for the admin user |

   The part before the dot (`4ZpAbCd`) is your cluster's **user prefix**. Every user you create must start with it.
3. The connection uses **TLS** and TiDB's certificate comes from a public authority, so **no certificate file is needed** (`DB_SSL=true`).
4. The database itself (`aravalli`) is created for you by the migration command in Part 2. If TiDB refuses that (the message says
   `CREATE command denied`), open **SQL Editor** in TiDB Cloud and run `CREATE DATABASE aravalli;` once.

## Part 2. Fill the database from your laptop

1. In the project folder:

   ```
   copy .env.production.example .env.production
   ```

   Open `.env.production` and fill in: `DB_HOST`, `DB_PORT=4000`, `DB_USER` (the admin, `xxxx.root`), `DB_PASSWORD`, `DB_NAME=aravalli`,
   `DB_SSL=true`. Also choose the app user: `APP_DB_USER` is your prefix + a dot + a new name (for example `4ZpAbCd.aravalli_app`) and
   `APP_DB_PASSWORD` is a new long random password (at least 12 characters; you will paste it into Render later). `.env.production` is
   git-ignored: it holds passwords and must never be committed. Your normal `.env` keeps pointing at your local database.

2. Create the tables:

   ```
   npm run db:migrate:prod
   ```

   The first line it prints must name the TiDB host (and say `(SSL)`). If it names `localhost`, `.env.production` was not read: it must be
   in the project's root folder, next to `package.json`. You will see the 11 migrations as `done`, and migration `0006_triggers` as
   `skipped`: **that is correct** (TiDB has no triggers; Part 3 explains what protects the history instead). If it warns that CHECK
   constraints cannot be turned on, see the table at the end.

3. Load the two demonstration organisations:

   ```
   npm run import:uci:prod
   npm run import:osha:prod
   ```

   On a laptop with a local database these take about 35 seconds and 8 seconds. Over the internet to TiDB expect **several minutes each**
   (the data goes in batches of 1,000 rows; I did not time it against TiDB). They print `24802 incidents inserted` and `5481 incidents
   inserted`, and `5 demo accounts created`. Running a command again is safe: nothing is added twice. If a command stops half way (the
   connection dropped), run it again.

## Part 3. Create the app user (append-only history)

The history of risk scores (`risk_assessment`) and of incident updates (`incident_update`) must never be edited or deleted. On local
MySQL, **triggers** refuse it. TiDB has **no triggers**, so there the protection is a **permission**: the live app connects as a
least-privilege user that may only `SELECT` and `INSERT` on those two tables, and has normal rights on everything else. Migrations and
imports keep using the admin user.

```
npm run db:app-user:prod
```

It creates the user from `APP_DB_USER` / `APP_DB_PASSWORD`, grants table by table, then **connects as that user and tries** to update and
delete history. A good run ends with seven `PASS` lines: three *allowed* (read, update an incident, add an incident update) and four
*refused* (update or delete on each of the two history tables).

If it says `FAIL` on a *refused* line, or TiDB Cloud Starter refuses table-level grants, the database cannot protect the history by
itself. The app still has **no code that updates or deletes those tables** (a test, `test/deploy.test.ts`, checks the source), but then the
protection is only in the app: say so honestly if you present it.

## Part 4. Check the schema on TiDB

```
npm run db:verify:prod
```

This builds a throwaway database `aravalli_verify`, applies the migrations and the sample data, then tries things that must work and
things that must be **rejected** (cross-organisation links, bad values, deleting rows that are referenced…), and deletes it again. On
MySQL every one of these is enforced; on TiDB:

| Rule | On local MySQL 8 | On TiDB |
| --- | --- | --- |
| Tables, foreign keys (including the composite ones that stop one organisation pointing at another's data) | enforced by the database | enforced by the database (TiDB 8.5 and newer enforce foreign keys) |
| CHECK constraints (allowed values, dates in order, status matches resolution time) | enforced | enforced only if TiDB's `tidb_enable_check_constraint` is ON. The migration tries to turn it on; if TiDB Cloud does not allow that, the database does not check them and the **API validates the same rules** (the checks then show as `FAIL` in the report: read the line) |
| `risk_score` as a generated column; the two views, one with a window function; the record-code counter (`LAST_INSERT_ID(expr)`); `SELECT … FOR UPDATE` | enforced / works | the verification below runs each of them |
| History tables are append-only | **triggers** refuse UPDATE and DELETE | no triggers: **permissions** of the app user (Part 3). The four trigger checks show as `SKIP` here |
| Unique codes per organisation, no delete of referenced rows | enforced | enforced |

Expect `SKIP` on the four trigger lines and a final line like `N of N checks passed on TiDB`. Anything that says `FAIL` is a real difference
on TiDB: the message is TiDB's own.

## Part 5. Create the web service on Render

1. Push the project to GitHub.
2. In Render choose **New +**, then **Blueprint**, connect GitHub and pick the repository. Render reads `render.yaml` and shows one
   service, `aravalli`, on the **Free** plan.
3. Render asks for the values `render.yaml` leaves empty (no secret is in the repository):

   | Variable | What to enter | Where to find it |
   | --- | --- | --- |
   | `DB_HOST` | the TiDB host | TiDB Cloud > your cluster > **Connect** |
   | `DB_NAME` | `aravalli` | the name from `.env.production` |
   | `DB_USER` | the **app** user, for example `4ZpAbCd.aravalli_app` | `APP_DB_USER` in your `.env.production`. **Not** the `xxxx.root` admin user |
   | `DB_PASSWORD` | the **app** user's password | `APP_DB_PASSWORD` in your `.env.production` |

4. Already set by `render.yaml`, nothing to type:

   | Variable | Value | Meaning |
   | --- | --- | --- |
   | `DB_PORT` | `4000` | TiDB's port (not 3306) |
   | `DB_SSL` | `true` | TLS, with the trusted authorities that come with Node |
   | `NODE_ENV` | `production` | the API also serves the web app |
   | `NODE_VERSION` | `24.14.0` | the Node version Render uses (if Render says it does not exist, change it to `24`) |
   | `JWT_SECRET` | generated by Render | signs the 15-minute login tokens. If you want your own: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`, at least 32 characters; without one the server refuses to start in production |
   | `DEMO_LOGINS` | `true` | shows the demo buttons. Keep it: the two demonstration organisations have accounts with no password, and the demo buttons are the only way in. They hold only public records. Anyone can also use "Create an organisation" to open an empty space of their own. Turn demo logins off before ever putting a real customer's data here |

5. Click **Apply**. Render installs, builds the web app and starts the server. The first build takes a few minutes. The log ends with
   `Aravalli API http://0.0.0.0:10000` and `Production mode: this server also serves the built web app`.
6. Your address is at the top of the service page: `https://aravalli-xxxx.onrender.com`.

## Part 6. Test the live site

1. `https://<your-address>/api/health` shows `{"status":"ok","database":"up", ...}`.
2. `https://<your-address>/` shows the landing page, and its headline types itself.
3. Under **Open a demo company**, click **Org Admin** for *OSHA Severe Injury Reports*. The Overview shows 5,481 incidents.
4. Reload the page (F5). You stay signed in and the page is not blank.
5. Open `https://<your-address>/incidents/INC-0001` directly: it opens the incident.
6. On an incident, post an update: it appears on the timeline (this proves the app user can write to history).
7. `https://<your-address>/api/docs` shows the API documentation.

## If something goes wrong

| What you see | Likely cause and fix |
| --- | --- |
| `npm run db:migrate:prod` says `node: ../../.env.production: not found` | The file is missing or has another name. It belongs in the project's root folder and is called exactly `.env.production`. |
| It names `localhost` instead of the TiDB host | The values in `.env.production` were not read (wrong folder or name), or `DB_HOST` is still the example text. |
| `Could not run "mysql"` | Install the MySQL client, or set `MYSQL_BIN` in your normal `.env` to the full path of `mysql.exe`. |
| TLS errors: `SSL connection error`, `certificate verify failed`, `unable to verify the first certificate`, or `self-signed certificate` | `DB_SSL=true` is missing (TiDB refuses plain connections), or something on your network is intercepting TLS (a company proxy, some antivirus). Try another network. Do not turn certificate checking off. |
| `Access denied for user` | Wrong user or password. The user must include the prefix (`4ZpAbCd.root`). In Render, `DB_USER` must be the **app** user and `DB_PASSWORD` its password. A password with a `#` or a space in `.env.production` should be put in double quotes. |
| `ETIMEDOUT`, `ECONNREFUSED`, `getaddrinfo ENOTFOUND` | Wrong host, or the port is not `4000`. Copy the host again from **Connect**. |
| `CREATE command denied` while migrating | Create the database in TiDB's SQL Editor (`CREATE DATABASE aravalli;`), then run the command again. |
| A migration fails with a TiDB syntax or "unsupported" message | Send me the message: it is a real difference between MySQL and TiDB that I could not test. Nothing after that migration was applied, and you can run the command again after a fix. |
| The migrate output warns that CHECK constraints are not enforced | TiDB Cloud did not allow `SET GLOBAL tidb_enable_check_constraint = ON`. The tables work; the API validates the same rules; the database no longer double-checks them. |
| `db:app-user:prod` ends with `FAIL` on a *refused* line | The database ignored the table-level permissions. The history is then protected only by the app (it has no code that changes those tables). Say so honestly. |
| The Render build fails with `vite: not found` | The build command lost `--include=dev`; it must be exactly the one in `render.yaml`. |
| The service starts and stops: `JWT_SECRET (at least 32 characters) is required` | `JWT_SECRET` is missing or short. Add one (see the table above). |
| `/api/health` says `"database":"down"` | `DB_HOST`, `DB_PORT` (4000), `DB_USER` / `DB_PASSWORD` (the app user) or `DB_SSL=true` is wrong in the Render **Environment** tab. The log tells which (see the rows above). |
| The site is slow, or the first page takes a minute | The free service was asleep (below). Wait; it wakes. |
| You sign in and are sent back to the login page | Open the site by its one `https://` address only (not an old preview link). `COOKIE_SECURE` must not be set to `false` on Render. |
| Login says "Too many attempts" | The login rate limit (10 tries per 15 minutes per address). Wait, or restart the service. |
| Demo buttons are missing on the login page | `DEMO_LOGINS` is not `true` in Render's Environment tab. |

## What the free plans mean

* **The Render free service sleeps after 15 minutes without visitors** and takes **about a minute to wake** on the next visit. After that it
  is fast again. The health check does not keep it awake. Because it restarts, the in-memory login rate limiter resets; people are not
  signed out (the login lives in a cookie and the database).
* **TiDB Cloud Starter** has a monthly free allowance of storage and request units, and idle clusters scale to zero and wake on the next
  query (the first request after a long pause can be slow). The two demonstration organisations are small compared with the allowance. If
  you ever exceed it, TiDB Cloud tells you in the console; check the current limits on their pricing page, which changes.
* TiDB hands out row ids in batches, so on a busy multi-node cluster `AUTO_INCREMENT` ids are unique but not strictly in time order. The one
  place the app relies on id order is breaking a tie between two assessments of the same risk on the same date; it does not affect the demo data.
* Nothing from your laptop is needed after Part 3. Later deploys happen automatically when you push to GitHub (`autoDeploy`).

## Trying the production build on your own laptop first

```
npm run build -w @aravalli/web
```

PowerShell:

```
$env:NODE_ENV="production"; $env:COOKIE_SECURE="false"; $env:JWT_SECRET="any-long-random-text-at-least-32-characters-long"; npm start
```

Then open `http://localhost:3001` (or your `API_PORT`). `COOKIE_SECURE=false` is only for this local test over plain `http`; never set it on Render.
