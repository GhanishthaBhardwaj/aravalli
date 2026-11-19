# Performance on the real data volumes

Measured on 3 November 2026 on a Windows development laptop, MySQL 8.0 and the API on the same machine, one request at a time
(no concurrency), signed in through the demo login as a Risk Officer. Method: **30 warm-up requests, then 60 timed requests per
endpoint**; p50 and p95 of the response time in milliseconds (HTTP included, client in the same process). Reproduce with
`npm run perf -- --org <slug> [--db <database>] [--runs N]` ([`apps/api/scripts/perf.ts`](../apps/api/scripts/perf.ts)); the raw
outputs are in [`docs/perf-raw/`](perf-raw/). 60 samples make p95 a rough figure (the 3rd-highest sample), so read it as "about".

Volumes:

| Name | Database | Incidents in the organisation |
| --- | --- | --- |
| **UCI** (UCI ServiceNow Incident Log) | `aravalli_dev` | **24,802** |
| **OSHA, 2024–2025** (OSHA Severe Injury Reports, the shipped dataset) | `aravalli_dev` | **5,481** |
| **OSHA, all manufacturing** (performance test only) | `aravalli_perf` (a separate database, not `aravalli_test`, because the test database is rebuilt on every test run) | **34,472** |

## What changed, and why

Before any change, the default incident list took **200 ms** on 25,000 rows. Two causes were found by reading the query:

1. The sort was `ORDER BY reported_at IS NULL, reported_at DESC, ...`. `reported_at` can never be NULL, but the `IS NULL` expression stopped
   MySQL reading an index in order, so every request sorted every row of the organisation. The `IS NULL` term is now added only for
   columns that can be empty (`resolved_at`, assignee).
2. There was no index that ends in the sort column. Migration [`0009_list_indexes.sql`](../apps/api/database/migrations/0009_list_indexes.sql)
   adds `(organisation_id, reported_at, incident_id)`, `(organisation_id, status, reported_at)`, `(organisation_id, department_id, reported_at)`
   and `(organisation_id, title)`: every list query starts with the organisation, and ends with what it sorts by.
3. A deep page (`OFFSET` near the end) joined four tables for every skipped row. The list now finds the page's ids in the narrow table first
   and joins the other tables only for those 25 rows (a "deferred join").

## Results, UCI (24,802 incidents): before and after

| Endpoint | Before p50 | Before p95 | After p50 | After p95 |
| --- | ---: | ---: | ---: | ---: |
| `GET /incidents` first page | 199.5 | 224.8 | **19.0** | **25.5** |
| `GET /incidents` High+Critical, one department | 228.1 | 273.7 | 54.2 | 117.5 |
| `GET /incidents` open only, newest first | 4.0 | 6.0 | 4.2 | 5.2 |
| `GET /incidents` **deep page** (offset 24,750) | 419.2 | 482.9 | **16.9** | **18.2** |
| `GET /incidents` text search (`q=Category 4`) | 305.5 | 364.5 | 50.6 | 108.2 |
| `GET /incidents` sorted by title | 230.2 | 287.5 | 18.3 | 24.2 |
| `GET /reports/overview` | 367.2 | 409.5 | 161.1 | 372.6 |
| `GET /reports/risk-profile` | 3.5 | 5.7 | 3.3 | 4.2 |
| `GET /reports/resolution` | 520.2 | 592.3 | 225.0 | 500.4 |
| `GET /departments` | 86.6 | 124.7 | 45.9 | 113.8 |
| `GET /employees` first page | 38.0 | 64.7 | 20.7 | 45.0 |
| `GET /risks` first page | 5.4 | 6.4 | 4.6 | 6.1 |

("Before" is the Phase 2 code and schema. "After" has the sort fix, migration 0009 and the deferred join. The big list endpoints improved
10 to 25 times. The reports barely moved, see below.)

## Results, OSHA (after the changes)

| Endpoint | 5,481 rows p50 | p95 | 34,472 rows p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| `GET /incidents` first page | 10.0 | 12.4 | 11.7 | 22.2 |
| `GET /incidents` High+Critical, one department | 10.1 | 12.1 | 68.1 | 155.8 |
| `GET /incidents` open only, newest first | 5.5 | 10.0 | 5.2 | 7.5 |
| `GET /incidents` deep page | 6.7 | 8.1 | 24.2 | 80.0 |
| `GET /incidents` text search | 38.6 | 90.4 | 196.8 | 417.9 |
| `GET /incidents` sorted by title | 5.6 | 10.7 | 23.3 | 25.6 |
| `GET /reports/overview` | 102.1 | 226.0 | 227.9 | 468.0 |
| `GET /reports/risk-profile` | 3.5 | 4.6 | 6.1 | 8.0 |
| `GET /reports/resolution` | 49.4 | 104.6 | 239.8 | 537.7 |
| `GET /departments` | 12.4 | 15.8 | 58.8 | 121.3 |
| `GET /employees` first page | 8.1 | 9.8 | 7.4 | 9.7 |
| `GET /risks` first page | 9.6 | 10.7 | 3.9 | 5.5 |

There is no "before" for OSHA: the first OSHA import happened after the diagnosis on the UCI data, and I did not drop the indexes again to
re-measure. The shipped OSHA dataset (5,481 rows) answers every list in about 10 ms (text search 39 ms, the overview 102 ms). The
34,472-row test copy is the worst case measured.

## What is still slow, honestly

* **`/reports/overview` and `/reports/resolution`** (about 160 to 240 ms p50 at 25,000 to 34,000 rows, p95 up to 540 ms). They aggregate
  every incident of the organisation on each request: the resolution report computes a median with window functions over all resolved
  incidents. Adding the list indexes helped a little. The real fix is a summary table or cache refreshed when incidents change; I did not do
  that, because these figures are acceptable for a dashboard opened a few times a day and the work would add write-path complexity.
* **Text search** (`LIKE '%term%'`) cannot use a normal index: about 50 ms at 25,000 rows, about 200 ms (p95 420 ms) at 34,000. A `FULLTEXT`
  index would fix it, at the price of different matching rules (word-based, no substring); not done.
* **`/departments`** runs three correlated counts per department (46 to 59 ms). Fine at 8 departments; it would need pre-aggregation with hundreds.
* The 60-sample p95 values are noisy: another process (the machine was also running other work between the two UCI runs) can move a p95
  by a hundred milliseconds. The p50 values are the dependable ones.
* One user at a time. Nothing here says how it behaves under concurrent load.

## The slowest query, explained

`GET /incidents` filtered by severity and department at 34,472 rows (68 ms p50) filters with `severity IN (...)` and a department, then
sorts by `reported_at`. `ix_incident_org_dept_rep` narrows by department and delivers rows in date order, but severity is checked row by
row, so MySQL reads rows until it has 25 matches. A composite index on `(organisation_id, department_id, severity, reported_at)` would let
it read exactly 25 index entries, at the cost of one more index to maintain on every write. I left it out because the list is already
fast for the shipped dataset and I would rather not add an index for every filter combination.
