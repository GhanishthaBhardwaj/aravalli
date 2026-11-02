# Manual test checklist

Run the app with `npm run dev` and open http://localhost:5173. The automated suite already covers these flows; this is for
you to see them with your own eyes. "Reset sample data" (bottom of the left menu, click twice) returns to the starting point.

## 1. First look
- [ ] The Overview opens with a large headline, four figures, a heat map and two charts. No console errors.
- [ ] The footer says the company is fictional (this is the sample organisation).
- [ ] Open the menu entries one by one: every screen loads, shows a brief loading state, then its content.
- [ ] Type a code (`RSK-0002`) and a word (`phishing`) in the top search. Arrow keys and Enter open a result.
- [ ] Visit `/nope` and `/risks/RSK-9999`: a 404 page with a way back.

## 2. Colour theme
- [ ] The theme follows your system (switch your OS between light and dark and watch it follow).
- [ ] The three-way switch in the top bar (System / Light / Dark) overrides it, and the choice survives a reload.
- [ ] Both themes: text is readable, risk bands are distinct (light grey, grey, dark, orange), and every band shows its name.

## 3. Risks
- [ ] **Register a risk**: submit empty and read the errors; pick a department and see the owner list change to that department's people;
  set likelihood 4 and impact 5 and see "20 Critical"; save and land on `RSK-0041`, status Assessed.
- [ ] Register another with no score: its status is Identified.
- [ ] On an Identified risk, open **Change status**: "Assessed" is not offered until it has an assessment.
- [ ] **Assess a risk twice** (New assessment, two different scores): the history grows, the chart shows the movement, the heat map moves.
- [ ] Try a future date, and a date before the risk was identified, in the assessment: both are refused with a message.
- [ ] **Close a risk**: the closure note is required. Afterwards the only option is to reopen it to Monitoring.
- [ ] **Risk Register**: filter by department/status/severity (the web address changes), sort a column, go to page 2, reload (filters stay),
  search for nonsense (empty state with "Clear filters").

## 4. Incidents
- [ ] **Report an incident** with no assignee and no risk. It starts Open with one timeline entry, "Incident reported". A future time is refused.
- [ ] Assign it: the timeline gains "Assigned to ...".
- [ ] Walk it Open → Investigating → Resolved (a resolution note is required) → Closed. Only valid next steps are offered.
- [ ] Reopen a Resolved incident to Investigating; resolve it again.
- [ ] Link and unlink a risk (the box searches by code or title). Each writes a timeline entry.
- [ ] Open a **Closed** incident: the note box, status change, reassign and link buttons are all disabled, with the reason "Closed incidents are final".
- [ ] **Incident Register**: filter by severity, status and assignee (including Unassigned).

## 5. Roles (use "Acting as" in the top bar)
- [ ] **Sandeep Joshi (Auditor)**: every action button is disabled; hover or tab to one and read why.
- [ ] **Pooja Nair (Employee)**: can report an incident, can update only incidents she reported or is assigned to, cannot register or assess risks, cannot assign or close.
- [ ] **Neha Kapoor (Risk Officer), Rajesh Khanna (Department Head), Arjun Menon (Org Admin)**: all actions available.
- Note: roles are checked in the browser only. Real enforcement arrives with the backend (Phase 3).

## 6. Reports, heat map, lists
- [ ] **Reports**: three tabs. On each, Export CSV downloads a file that opens in a spreadsheet; Print shows only that report.
- [ ] **Heat Map**: click a cell to list its risks; switch to "As of first assessment" and see which risks moved (shown as `16 → 9`).
- [ ] **Departments** and **People**: the counts are links that open the register already filtered.

## 7. Small screens (resize the window to 360px wide, or use the browser's device mode)
- [ ] No sideways scrolling on any screen. Tables scroll inside their own box.
- [ ] The menu button opens a slide-out menu (it also has the theme switch) and closes after choosing a page.
- [ ] Dialogs ("New assessment", "Change status") fit the screen.

## 8. Keyboard and motion
- [ ] Tab through a page: a clear focus ring is always visible. Escape closes dialogs and returns focus to the button you used.
- [ ] Left/Right arrows move between tabs (Heat Map, Reports).
- [ ] With "reduce motion" switched on in your OS, the heat map and charts appear without animation.

## 9. Saved data
- [ ] Make a change, reload: it is still there. Click "Reset sample data" twice: back to the original.
