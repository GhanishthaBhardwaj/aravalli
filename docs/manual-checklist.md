# Manual test checklist (about 15 minutes)

Start everything with `npm run dev`, then open **http://localhost:5173**. The API runs beside it on port 3001; its documentation is at
http://localhost:3001/api/docs. Data now lives in MySQL, so changes you make stay until you reset the database (`npm run db:reset -- --yes`,
then `npm run db:migrate` and `npm run db:seed`).

## 1. First look (2 min)
- [ ] The Overview shows a headline, four figures, a heat map, a list of top risks and two charts. No red errors.
- [ ] Click through every menu entry: Risk Register, Heat Map, Incident Register, Report Incident, Departments, People, Reports. Each loads real rows.
- [ ] In the top search type `phishing`, then `INC-00`: results appear; Enter opens one.
- [ ] Open `/nope` and `/risks/RSK-9999`: a "doesn't exist" page with a way back.

## 2. Risks (4 min)
- [ ] **Register risk**: press the button empty and read the errors. Fill it in, choose an owner by typing part of a name, give likelihood 4 and impact 5 (it shows "20 Critical"), save. You land on a new record with a code you did not type.
- [ ] On that risk, **New assessment** with a different score: the history gets a second row and a chart appears.
- [ ] **Change status** to Closed: a note is required. After closing, the only way back is Monitoring.
- [ ] Risk Register: filter by Department and Severity (the address bar changes), sort the Score column, go to page 2, reload (filters stay), search for nonsense (empty state with "Clear filters").
- [ ] Heat Map: click a cell, see its risks; switch to "As of first assessment" and see them move.

## 3. Incidents (4 min)
- [ ] **Report incident**: a time in the future is refused; a valid one creates an Open incident with a generated code and one timeline entry.
- [ ] On it: assign someone (type to search), link a risk, then post updates moving it Investigating, Resolved (the note is required), Closed. Try to reopen a Resolved one.
- [ ] Open an incident that is already Closed: every control is disabled and says "Closed incidents are final".
- [ ] Incident Register: filter by Severity, Status and Assignee, sort, page.
- [ ] Reports: all three tabs load; **Export CSV** downloads a file; **Print** opens the print preview with only that report.

## 4. Roles (2 min)
- [ ] "Acting as" in the top bar: choose an **Auditor**. Every button that would change something is disabled, with a reason on hover.
- [ ] Choose an **Employee**. They can report an incident but cannot register a risk, assign, link or close.
- [ ] Reload the page: the person you chose is still selected.
- [ ] Try it for real: as an Auditor, send a write straight to the API with Swagger (`/api/docs`, header `X-Actor-Id` set to an Auditor's id): the server answers 403.

## 5. Light and dark (1 min)
- [ ] The three-way switch in the top bar (System / Light / Dark) changes the whole app and survives a reload.
- [ ] In both: text is readable, and the risk bands (light grey, grey, dark, orange) are told apart by their names, not just colour.

## 6. Phone width (2 min)
- [ ] Narrow the browser to about 360 pixels wide (or use the device toolbar).
- [ ] The menu becomes a button; open it, move around, and it closes after you pick a page.
- [ ] Tables show only their key columns (code, title, score or severity) and do not scroll sideways. Forms are one column.
- [ ] Nothing is cut off on Overview, a risk record, an incident record and the heat map.

## If something is wrong
Note the page address, what you clicked, and what you expected. If the page shows "could not be loaded", check that the terminal running
`npm run dev` shows both `[api]` and `[web]` lines and no errors.
