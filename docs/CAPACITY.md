# Capacity test

What I measured, how, and what I did not measure. All numbers below come from real runs on 20 November 2026. I did not round them up or fill gaps.

## How the test works

The script is `scripts/capacity.mjs`. It talks to the API like a browser does.

1. It creates test organisations through the sign-up endpoint. Each organisation gets an Org Admin and four more people (Risk Officer, Department Head, Auditor, Employee), made through the Users endpoint. So each organisation has 5 users.
2. At each level (5, 25 and 100 organisations) it sends a mix of requests from 8 clients at the same time: about 30% writes and 70% reads. Writes: report an incident, register a risk with a first score, add an incident update. Reads: incident list, risk list, overview report, heat map, departments.
3. It measures every request. p50 is the middle time, p95 means 95 out of 100 requests were faster than that. "max" is the slowest one.
4. Logging in is measured separately, 20 logins one after another, because a password check is slow on purpose.

The test never used the live database. I ran my own copy of the API on my laptop, pointed at a throwaway database, and deleted that database afterwards.

## Test A: local MySQL on my laptop

API and database on the same computer, so there is almost no network time. This shows the cost of the app itself.

| Organisations | Users | Request | Count | p50 ms | p95 ms | max ms |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 5 | 25 | read: departments | 80 | 12 | 45 | 111 |
| 5 | 25 | read: heat map | 80 | 12 | 52 | 131 |
| 5 | 25 | read: incident list (20 rows) | 40 | 15 | 51 | 142 |
| 5 | 25 | read: overview report | 46 | 18 | 88 | 175 |
| 5 | 25 | read: risk list (20 rows) | 40 | 15 | 58 | 160 |
| 5 | 25 | write: add incident update | 34 | 27 | 63 | 66 |
| 5 | 25 | write: register risk with a score | 40 | 47 | 233 | 364 |
| 5 | 25 | write: report incident | 40 | 39 | 197 | 215 |
| 25 | 125 | read: departments | 80 | 19 | 32 | 41 |
| 25 | 125 | read: heat map | 80 | 21 | 33 | 40 |
| 25 | 125 | read: incident list (20 rows) | 40 | 25 | 42 | 50 |
| 25 | 125 | read: overview report | 58 | 32 | 48 | 57 |
| 25 | 125 | read: risk list (20 rows) | 40 | 28 | 44 | 50 |
| 25 | 125 | write: add incident update | 22 | 50 | 81 | 87 |
| 25 | 125 | write: register risk with a score | 40 | 89 | 129 | 129 |
| 25 | 125 | write: report incident | 40 | 74 | 106 | 115 |
| 100 | 500 | read: departments | 80 | 13 | 21 | 45 |
| 100 | 500 | read: heat map | 80 | 13 | 22 | 47 |
| 100 | 500 | read: incident list (20 rows) | 40 | 16 | 27 | 49 |
| 100 | 500 | read: overview report | 64 | 18 | 33 | 50 |
| 100 | 500 | read: risk list (20 rows) | 40 | 17 | 30 | 31 |
| 100 | 500 | write: add incident update | 16 | 39 | 52 | 52 |
| 100 | 500 | write: register risk with a score | 40 | 54 | 100 | 102 |
| 100 | 500 | write: report incident | 40 | 50 | 81 | 86 |

| Organisations | Users | Time to create them (s) | Requests per second (8 at once) | Failed requests |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 25 | 3 | 253 | 0 |
| 25 | 125 | 12 | 210 | 0 |
| 100 | 500 | 43 | 325 | 0 |

Login, one at a time: p50 76 ms, p95 153 ms.

What this says: on a local database nothing got slower as organisations were added, up to 100 organisations and 500 users. These organisations were nearly empty (a few dozen records each), so this does not show how a big organisation behaves. A first run of the same test gave faster totals (385, 473 and 478 requests per second), so expect about 20 to 40 percent variation between runs on a laptop.

## Test B: my laptop talking to TiDB Cloud Starter

The same API ran on my laptop, but the database was a throwaway database in the real TiDB Cloud cluster (region ap-southeast-1). Every query crossed the internet. So these numbers include network time and show what a remote database costs. They are not the numbers of the live site (see Test C).

| Organisations | Users | Request | Count | p50 ms | p95 ms | max ms |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 5 | 25 | read: departments | 60 | 238 | 305 | 982 |
| 5 | 25 | read: heat map | 60 | 244 | 476 | 785 |
| 5 | 25 | read: incident list (20 rows) | 30 | 341 | 665 | 1075 |
| 5 | 25 | read: overview report | 35 | 458 | 1162 | 1372 |
| 5 | 25 | read: risk list (20 rows) | 30 | 344 | 814 | 978 |
| 5 | 25 | write: add incident update | 25 | 758 | 1031 | 1502 |
| 5 | 25 | write: register risk with a score | 30 | 1371 | 1765 | 3259 |
| 5 | 25 | write: report incident | 30 | 1107 | 1558 | 1646 |
| 25 | 125 | read: departments | 60 | 219 | 351 | 523 |
| 25 | 125 | read: heat map | 60 | 235 | 533 | 801 |
| 25 | 125 | read: incident list (20 rows) | 30 | 372 | 593 | 619 |
| 25 | 125 | read: overview report | 48 | 422 | 653 | 754 |
| 25 | 125 | read: risk list (20 rows) | 30 | 326 | 467 | 1314 |
| 25 | 125 | write: add incident update | 12 | 723 | 855 | 855 |
| 25 | 125 | write: register risk with a score | 30 | 1442 | 2459 | 3044 |
| 25 | 125 | write: report incident | 30 | 1214 | 1746 | 1782 |
| 100 | 500 | read: departments | 60 | 252 | 821 | 981 |
| 100 | 500 | read: heat map | 60 | 246 | 727 | 1023 |
| 100 | 500 | read: incident list (20 rows) | 30 | 385 | 1057 | 1127 |
| 100 | 500 | read: overview report | 58 | 472 | 1250 | 1553 |
| 100 | 500 | read: risk list (20 rows) | 30 | 363 | 1113 | 1124 |
| 100 | 500 | write: add incident update | 2 | 819 | 819 | 819 |
| 100 | 500 | write: register risk with a score | 30 | 1632 | 3863 | 4047 |
| 100 | 500 | write: report incident | 30 | 1397 | 2712 | 3634 |

| Organisations | Users | Time to create them (s) | Requests per second (8 at once) | Failed requests |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 25 | 40 | 13.7 | 0 |
| 25 | 125 | 130 | 13.6 | 0 |
| 100 | 500 | 679 | 11.9 | 0 |

Login, one at a time: p50 948 ms, p95 1244 ms.

What this says:
- Response time stayed about the same from 5 to 100 organisations. Throughput stayed at about 12 to 14 requests per second. That is the limit of this test setup (one client machine, long round trips), not a measured limit of TiDB.
- A read costs 0.2 to 0.5 seconds. A write costs 0.7 to 1.6 seconds. A write is several queries inside one transaction, and each query is a round trip to the other side of the internet.
- The 100-organisation level was run a second time with the fixed script (it logs the admins in again before the level starts). This time there were 0 failed requests. The 5 and 25 organisation levels are from the first run; only the 100 level was repeated.
- In the repeated 100-organisation run only 2 "add incident update" requests happened (the random mix had few incidents to update yet), so that row is not a reliable number.

## Test C: the live site (read-only)

From my laptop to https://aravalli-qdrr.onrender.com. Only reads and the demo login, 15 requests each, one after another. This is the whole path: my laptop, Render, TiDB, and back. It uses the two real demonstration organisations.

| Request | OSHA org (5,481 incidents) p50 / p95 ms | ServiceNow org (24,802 incidents) p50 / p95 ms |
| --- | ---: | ---: |
| incident list (20 rows) | 912 / 1755 | 888 / 921 |
| incident search | 939 / 982 | 850 / 939 |
| risk list | 778 / 829 | 790 / 857 |
| heat map | 677 / 795 | 626 / 762 |
| risk profile report | 624 / 824 | 643 / 740 |
| overview report | 821 / 1533 | 877 / 956 |
| resolution report | 805 / 842 | 891 / 973 |

- Demo login took 1.5 to 1.6 seconds.
- The health check (one trivial database query) took 444 ms at p50. So about 0.4 to 0.5 seconds of every request is network and the database being far away. The reports are not much slower than the lists in this test, so the distance matters more than the query work.
- The first request, after the service had been idle, took **34.8 seconds** (the free Render service was asleep and had to start).

I did not run write tests on the live site, because that would put test organisations into the real database.

## Limits of the free plans

I did not reach any plan limit in these tests, and I did not measure the plan quotas, so I give none here. See the provider's current free plan page for Render and for TiDB Cloud Starter.

What I did measure about the free plans:
- The Render free service was asleep when I started Test C, and the first request took 34.8 seconds.
- On the live site, logging in took about 1.5 seconds, mostly distance to the database.

What I do not know: where the app breaks. The tests stopped at 100 organisations and 500 users because the test, not the app, was the limit. I do not know how it behaves with many people at the same time on the free CPU, because 8 clients at once was the most I tried.

## How to repeat it

1. Start the API against a throwaway database, with high limits for sign-up and login:
   `RATE_LIMIT_SIGNUP=100000 RATE_LIMIT_LOGIN=100000 API_PORT=3301 COOKIE_SECURE=false npm start`
2. Run `node scripts/capacity.mjs --base http://127.0.0.1:3301 --levels 5,25,100 --requests 400 --concurrency 8`.
3. Delete the throwaway database afterwards.
