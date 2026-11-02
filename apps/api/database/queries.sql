-- =============================================================================
-- Reporting queries behind each dashboard figure and report (MySQL 8).
-- EVERY query is scoped to one organisation through @org. There is no query that reads across tenants.
--
--   Open risk        = status <> 'Closed'
--   Open incident    = status IN ('Open','Investigating','Contained')
--   Time to resolve  = reported_at -> resolved_at, in hours (a reopened incident uses its latest resolution)
-- =============================================================================

-- Choose the organisation. The sample organisation runs on a fixed clock; real ones use NOW().
SET @org   = (SELECT organisation_id FROM organisation WHERE slug = 'aravalli-industries');
SET @today = (SELECT IF(is_demo, '2026-10-20 17:30:00', NOW()) FROM organisation WHERE organisation_id = @org);

-- Q1  Overview: open risks
SELECT COUNT(*) AS open_risks FROM risk WHERE organisation_id = @org AND status <> 'Closed';

-- Q2  Overview: open risks by severity band  (Critical + High is the "needs attention" figure)  | Report 1
SELECT severity_band, COUNT(*) AS risks
FROM v_risk_current
WHERE organisation_id = @org AND status <> 'Closed'
GROUP BY severity_band
ORDER BY FIELD(severity_band, 'Critical', 'High', 'Medium', 'Low', 'Unrated');

-- Q3  Overview: open incidents
SELECT COUNT(*) AS open_incidents
FROM incident
WHERE organisation_id = @org AND status IN ('Open', 'Investigating', 'Contained');

-- Q4  Overview chart: incidents by status, split by severity
SELECT status, severity, COUNT(*) AS incidents
FROM incident
WHERE organisation_id = @org
GROUP BY status, severity
ORDER BY FIELD(status, 'Open', 'Investigating', 'Contained', 'Resolved', 'Closed'),
         FIELD(severity, 'Low', 'Medium', 'High', 'Critical');

-- Q5  Overview: incidents resolved in the last 30 days
SELECT COUNT(*) AS resolved_last_30_days
FROM incident
WHERE organisation_id = @org AND resolved_at IS NOT NULL AND resolved_at >= DATE_SUB(@today, INTERVAL 30 DAY);

-- Q6  Overview: average time to resolve, in hours
SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, reported_at, resolved_at)) / 60, 1) AS mean_hours_to_resolve
FROM incident
WHERE organisation_id = @org AND resolved_at IS NOT NULL;

-- Q7  Overview: open incidents with nobody assigned
SELECT COUNT(*) AS unassigned_open_incidents
FROM incident
WHERE organisation_id = @org AND assigned_to IS NULL AND status IN ('Open', 'Investigating', 'Contained');

-- Q8  Report 2: time to resolve by department, then by severity
SELECT d.name AS department, COUNT(*) AS resolved,
       ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.reported_at, i.resolved_at)) / 60, 1) AS mean_hours
FROM incident i
JOIN department d ON d.department_id = i.department_id AND d.organisation_id = i.organisation_id
WHERE i.organisation_id = @org AND i.resolved_at IS NOT NULL
GROUP BY d.department_id, d.name
ORDER BY mean_hours DESC;

SELECT severity, COUNT(*) AS resolved,
       ROUND(AVG(TIMESTAMPDIFF(MINUTE, reported_at, resolved_at)) / 60, 1) AS mean_hours
FROM incident
WHERE organisation_id = @org AND resolved_at IS NOT NULL
GROUP BY severity
ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low');

-- Q9  Overview: highest-scoring open risks
SELECT risk_code, title, department_name, owner_name, risk_score, severity_band, last_assessed
FROM v_risk_current
WHERE organisation_id = @org AND status <> 'Closed' AND risk_score IS NOT NULL
ORDER BY risk_score DESC, risk_code
LIMIT 10;

-- Q10 Heat map: open risks per likelihood x impact cell (current position)
SELECT likelihood, impact, COUNT(*) AS risks
FROM v_risk_current
WHERE organisation_id = @org AND status <> 'Closed' AND likelihood IS NOT NULL
GROUP BY likelihood, impact
ORDER BY likelihood DESC, impact;

-- Q11 Data quality: open risks not assessed in the last 90 days (or never)
SELECT risk_code, title, status, last_assessed,
       DATEDIFF(@today, COALESCE(last_assessed, identified_date)) AS days_since_assessed
FROM v_risk_current
WHERE organisation_id = @org AND status <> 'Closed'
  AND (last_assessed IS NULL OR last_assessed < DATE_SUB(DATE(@today), INTERVAL 90 DAY))
ORDER BY days_since_assessed DESC;

-- Q12 Report 3: open incidents with no assignee or no linked risk
SELECT incident_code, title, severity, status, department_name, assigned_to_name, risk_code
FROM v_incident_summary
WHERE organisation_id = @org
  AND status IN ('Open', 'Investigating', 'Contained')
  AND (assigned_to_name IS NULL OR risk_code IS NULL)
ORDER BY occurred_at DESC;

-- Q13 Departments page: open risks, open incidents and people per department
SELECT d.name AS department,
       (SELECT COUNT(*) FROM risk r WHERE r.organisation_id = d.organisation_id AND r.department_id = d.department_id AND r.status <> 'Closed') AS open_risks,
       (SELECT COUNT(*) FROM incident i WHERE i.organisation_id = d.organisation_id AND i.department_id = d.department_id
         AND i.status IN ('Open', 'Investigating', 'Contained')) AS open_incidents,
       (SELECT COUNT(*) FROM employee e WHERE e.organisation_id = d.organisation_id AND e.department_id = d.department_id) AS people
FROM department d
WHERE d.organisation_id = @org
ORDER BY d.name;

-- Q14 Report 1: open risk profile by department and band
SELECT department_name,
       SUM(severity_band = 'Critical') AS critical,
       SUM(severity_band = 'High')     AS high,
       SUM(severity_band = 'Medium')   AS medium,
       SUM(severity_band = 'Low')      AS low,
       SUM(severity_band = 'Unrated')  AS unrated,
       COUNT(*)                        AS total
FROM v_risk_current
WHERE organisation_id = @org AND status <> 'Closed'
GROUP BY department_name
ORDER BY department_name;

-- Q15 Risk detail: assessment history of one risk
SELECT a.assessment_date, a.likelihood, a.impact, a.risk_score,
       CONCAT(e.first_name, ' ', e.last_name) AS assessed_by, a.mitigation_notes
FROM risk_assessment a
JOIN risk r     ON r.risk_id = a.risk_id AND r.organisation_id = a.organisation_id
JOIN employee e ON e.employee_id = a.assessed_by AND e.organisation_id = a.organisation_id
WHERE r.organisation_id = @org AND r.risk_code = 'RSK-0001'
ORDER BY a.assessment_date, a.assessment_id;

-- Q16 Incident detail: update timeline of one incident, newest first
SELECT u.created_at, CONCAT(e.first_name, ' ', e.last_name) AS author, u.status_from, u.status_to, u.update_text
FROM incident_update u
JOIN incident i ON i.incident_id = u.incident_id AND i.organisation_id = u.organisation_id
JOIN employee e ON e.employee_id = u.updated_by AND e.organisation_id = u.organisation_id
WHERE i.organisation_id = @org AND i.incident_code = 'INC-0001'
ORDER BY u.created_at DESC, u.update_id DESC;
