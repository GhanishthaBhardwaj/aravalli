-- =============================================================================
-- Reporting queries backing each dashboard KPI and report (MySQL 8).
-- "Today" in the demo is fixed at 2026-10-20 17:30; replace @today with NOW() in production.
-- Open risk      = status <> 'Closed'
-- Open incident  = status IN ('Open','Investigating','Contained')
-- Time to resolve = reported_at -> resolved_at (hours); reopened incidents use the latest resolution.
-- =============================================================================

SET @today = '2026-10-20 17:30:00';

-- Q1  KPI: open risks
SELECT COUNT(*) AS open_risks FROM risk WHERE status <> 'Closed';

-- Q2  KPI: Critical + High open risks   |  Report 1 (risk profile by severity band)
SELECT severity_band, COUNT(*) AS risks
FROM v_risk_current
WHERE status <> 'Closed'
GROUP BY severity_band
ORDER BY FIELD(severity_band, 'Critical', 'High', 'Medium', 'Low', 'Unrated');

-- Q3  KPI: open incidents
SELECT COUNT(*) AS open_incidents
FROM incident WHERE status IN ('Open', 'Investigating', 'Contained');

-- Q4  Chart: incidents by status, stacked by severity
SELECT status, severity, COUNT(*) AS incidents
FROM incident
GROUP BY status, severity
ORDER BY FIELD(status, 'Open', 'Investigating', 'Contained', 'Resolved', 'Closed'),
         FIELD(severity, 'Critical', 'High', 'Medium', 'Low');

-- Q5  KPI: incidents resolved in the last 30 days
SELECT COUNT(*) AS resolved_last_30_days
FROM incident
WHERE resolved_at IS NOT NULL AND resolved_at >= DATE_SUB(@today, INTERVAL 30 DAY);

-- Q6  KPI: mean time to resolve (hours), overall
SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, reported_at, resolved_at)) / 60, 1) AS mean_hours_to_resolve
FROM incident WHERE resolved_at IS NOT NULL;

-- Q7  Report 2: mean time to resolve by department and by severity
SELECT d.name AS department, COUNT(*) AS resolved,
       ROUND(AVG(TIMESTAMPDIFF(MINUTE, i.reported_at, i.resolved_at)) / 60, 1) AS mean_hours
FROM incident i JOIN department d ON d.department_id = i.department_id
WHERE i.resolved_at IS NOT NULL
GROUP BY d.department_id, d.name
ORDER BY mean_hours DESC;

SELECT severity, COUNT(*) AS resolved,
       ROUND(AVG(TIMESTAMPDIFF(MINUTE, reported_at, resolved_at)) / 60, 1) AS mean_hours
FROM incident WHERE resolved_at IS NOT NULL
GROUP BY severity
ORDER BY FIELD(severity, 'Critical', 'High', 'Medium', 'Low');

-- Q8  Dashboard: top 10 open risks by current score
SELECT risk_code, title, department_name, owner_name, risk_score, severity_band, last_assessed
FROM v_risk_current
WHERE status <> 'Closed' AND risk_score IS NOT NULL
ORDER BY risk_score DESC, risk_code
LIMIT 10;

-- Q9  Heat map: open risks per likelihood x impact cell (current position)
SELECT likelihood, impact, COUNT(*) AS risks
FROM v_risk_current
WHERE status <> 'Closed' AND likelihood IS NOT NULL
GROUP BY likelihood, impact
ORDER BY likelihood DESC, impact;

-- Q10 Data quality: open risks with no assessment in the last 90 days (or never assessed)
SELECT risk_code, title, status, last_assessed,
       DATEDIFF(@today, COALESCE(last_assessed, identified_date)) AS days_since_assessed
FROM v_risk_current
WHERE status <> 'Closed'
  AND (last_assessed IS NULL OR last_assessed < DATE_SUB(DATE(@today), INTERVAL 90 DAY))
ORDER BY days_since_assessed DESC;

-- Q11 Report 3: incidents not linked to any risk
SELECT incident_code, title, severity, status, department_name, assigned_to_name
FROM v_incident_summary
WHERE risk_code IS NULL
ORDER BY occurred_at DESC;

-- Q12 Report 3: unassigned incidents
SELECT incident_code, title, severity, status, department_name, risk_code
FROM v_incident_summary
WHERE assigned_to_name IS NULL
ORDER BY occurred_at DESC;

-- Q13 Departments page: open risks and open incidents per department
SELECT d.name AS department,
       (SELECT COUNT(*) FROM risk r WHERE r.department_id = d.department_id AND r.status <> 'Closed') AS open_risks,
       (SELECT COUNT(*) FROM incident i WHERE i.department_id = d.department_id
         AND i.status IN ('Open', 'Investigating', 'Contained')) AS open_incidents
FROM department d
ORDER BY d.name;

-- Q14 Report 1: open risk profile by department and severity band
SELECT department_name,
       SUM(severity_band = 'Critical') AS critical,
       SUM(severity_band = 'High')     AS high,
       SUM(severity_band = 'Medium')   AS medium,
       SUM(severity_band = 'Low')      AS low,
       SUM(severity_band = 'Unrated')  AS unrated,
       COUNT(*)                        AS total
FROM v_risk_current
WHERE status <> 'Closed'
GROUP BY department_name
ORDER BY department_name;

-- Q15 Risk detail: assessment history (replace RSK-0001)
SELECT a.assessment_date, a.likelihood, a.impact, a.risk_score,
       CONCAT(e.first_name, ' ', e.last_name) AS assessed_by, a.mitigation_notes
FROM risk_assessment a
JOIN risk r ON r.risk_id = a.risk_id
JOIN employee e ON e.employee_id = a.assessed_by
WHERE r.risk_code = 'RSK-0001'
ORDER BY a.assessment_date, a.assessment_id;

-- Q16 Incident detail: update timeline, newest first (replace INC-0001)
SELECT u.created_at, CONCAT(e.first_name, ' ', e.last_name) AS author, u.status_from, u.status_to, u.update_text
FROM incident_update u
JOIN incident i ON i.incident_id = u.incident_id
JOIN employee e ON e.employee_id = u.updated_by
WHERE i.incident_code = 'INC-0001'
ORDER BY u.created_at DESC, u.update_id DESC;
