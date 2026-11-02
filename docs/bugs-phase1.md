# Phase 1 bug list

How these were found: a Playwright suite that clicks through every screen, form, filter, dialog, toast, disabled button, CSV
export and print, at desktop and 360px width; screenshots of every screen in light and dark; and a read-through of the code.
Each entry says how it was found, what was wrong, and what was done. Every fix has a test that fails without it.

| # | Found by | What was wrong | Fix |
| --- | --- | --- | --- |
| 1 | Playwright | **Closed incidents were not final.** The screen said "Closed incidents are final", but the store still accepted new notes on them. | The rule now lives in the shared package (`isIncidentFinal`) and is enforced by the store and the screen. Unit and browser tests. |
| 2 | Playwright | Assigning and linking were also still possible on a closed incident: the "Unlink" and "Change link" buttons stayed active. | Same rule applied to assign and link, in the store and on the buttons. |
| 3 | Playwright | **Risk detail overflowed the page at 360px** (the page was 831px wide) because a wide table stopped its grid column from shrinking. | Grid columns may now shrink, and tables scroll inside their own container. A 360px overflow test covers every route. |
| 4 | Code review | **Stale saved data.** The demo keeps data in the browser, and nothing checked whether it came from the current sample dataset. After the sample data changed, a browser with old saved data kept showing the old data until reset. | Saved state is stored under a versioned key together with a fingerprint of the sample dataset; a mismatch, or unreadable data, falls back to the sample. Tested for both. |
| 5 | Code review | **The clock was a constant.** "Today" was a fixed date imported by the validators, the store, the selectors and four screens, so nothing could run on real time. | Time is injected through a `Clock`. The sample organisation runs on a fixed demo clock; any other organisation uses the system clock. Tests pass a clock explicitly. |
| 6 | Code review | **The sample company was hardcoded in the interface**: the product and company names in the sidebar, footer and page title, the default "Acting as" person, the email domain, the date in the Overview text, and the "(demo)" wording in six messages. | All of it now comes from the organisation data. The footer says "fictional" only for a demo organisation, and "(demo)" is added to messages only for one. |
| 7 | Review of the exceptions report | The report listed **closed incidents with no assignee or link**, which nobody can fix once #1 is enforced. | It lists open incidents only. |
| 8 | Review | Two different messages for the same rule ("cannot be reassigned" and "are final"). | One message. |
| 9 | Playwright (new test) | The heat-map reveal still faded cells in when the system asked for reduced motion. | The reveal is skipped under reduced motion. |
| 10 | Screenshots | Dates in the assessment table wrapped onto two lines. | Dates no longer wrap. |
| 11 | Intentional change | The role `Administrator` was renamed **Org Admin** everywhere (types, database, seed, tests). | Done; a test confirms the old name is gone. |

## Known and not fixed

- The production build is one JavaScript file of about 840 kB. Splitting it by route is straightforward but was not part of this phase.
- The API package's database scripts are plain JavaScript, because type checking Node code needs `@types/node`, a dependency that has not been approved yet.
- The department bars on the Overview are not clickable any more (they were, in the old charts). The Departments page has those links.
- Dates are shown in the style `20 Oct 2026`; the date inputs follow the browser's own locale.
