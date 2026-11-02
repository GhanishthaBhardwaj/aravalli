# Performance on the real data volume

**Status: not measured yet.** The two demonstration organisations are filled with real public records by the importers, which wait for
sign-off on the field mapping (see PLAN.md). Until then the database holds only the small sample organisation (36 incidents, 40 risks),
and timings on that say nothing about 25,000 incidents. No numbers are shown here rather than misleading ones.

## What will be measured

For each of the main endpoints, on the imported volume, with the API and MySQL on the same machine and a warm pool:

| Endpoint | Why it matters |
| --- | --- |
| `GET /api/incidents` (default sort, first page; a filtered page; a deep page near the end; text search) | The largest register |
| `GET /api/reports/overview` | The home screen: KPIs, status counts, top risks, recent activity |
| `GET /api/reports/risk-profile`, `/reports/resolution` | The heaviest aggregates (median is computed with window functions) |
| `GET /api/departments` | Correlated counts per department |
| `GET /api/employees` (first page; search) | Per-person counts |

Method: 300 sequential requests per endpoint after a 30-request warm-up, p50 and p95 of the response time, recorded **before** and
**after** any index is added, together with the `EXPLAIN` of the slowest query. The script will live in `apps/api/scripts/` so the numbers
can be reproduced.
