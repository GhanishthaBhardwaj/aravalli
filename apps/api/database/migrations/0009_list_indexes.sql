-- 0009_list_indexes
-- Added after measuring the incident list on 25,000 rows (docs/performance.md). The default list is "this organisation's
-- incidents, newest first": without an index that ends in reported_at, MySQL read every row of the organisation and sorted
-- them on each request. Each index below starts with organisation_id (every query is scoped to one organisation) and
-- ends with the column the list sorts by, so the first page is read straight off the index.

ALTER TABLE incident
  ADD KEY ix_incident_org_reported   (organisation_id, reported_at, incident_id),
  ADD KEY ix_incident_org_status_rep (organisation_id, status, reported_at),
  ADD KEY ix_incident_org_dept_rep   (organisation_id, department_id, reported_at),
  ADD KEY ix_incident_org_title      (organisation_id, title);
