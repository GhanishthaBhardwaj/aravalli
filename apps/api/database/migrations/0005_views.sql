-- 0005_views
-- Both views expose organisation_id, so every query on them can (and must) be tenant-scoped.

-- Each risk with its latest assessment. Ties on date are broken by the highest assessment_id.
-- Severity bands: Low 1-4, Medium 5-9, High 10-16, Critical 20-25.
-- (17-19 cannot occur as a product of two integers in 1..5.)
CREATE VIEW v_risk_current AS
SELECT r.organisation_id,
       r.risk_id,
       r.risk_code,
       r.title,
       r.category,
       r.status,
       r.department_id,
       d.name            AS department_name,
       r.owner_employee_id,
       CONCAT(o.first_name, ' ', o.last_name) AS owner_name,
       r.identified_date,
       a.assessment_id   AS current_assessment_id,
       a.assessment_date AS last_assessed,
       a.likelihood,
       a.impact,
       a.risk_score,
       CASE
         WHEN a.risk_score IS NULL THEN 'Unrated'
         WHEN a.risk_score >= 20   THEN 'Critical'
         WHEN a.risk_score >= 10   THEN 'High'
         WHEN a.risk_score >= 5    THEN 'Medium'
         ELSE 'Low'
       END AS severity_band
FROM risk r
JOIN department d ON d.department_id = r.department_id AND d.organisation_id = r.organisation_id
JOIN employee   o ON o.employee_id   = r.owner_employee_id AND o.organisation_id = r.organisation_id
LEFT JOIN (
  SELECT ra.*,
         ROW_NUMBER() OVER (PARTITION BY ra.risk_id
                            ORDER BY ra.assessment_date DESC, ra.assessment_id DESC) AS rn
  FROM risk_assessment ra
) a ON a.risk_id = r.risk_id AND a.organisation_id = r.organisation_id AND a.rn = 1;

CREATE VIEW v_incident_summary AS
SELECT i.organisation_id,
       i.incident_id,
       i.incident_code,
       i.title,
       i.severity,
       i.status,
       d.name AS department_name,
       CONCAT(rp.first_name, ' ', rp.last_name) AS reported_by_name,
       CONCAT(ag.first_name, ' ', ag.last_name) AS assigned_to_name,   -- NULL when unassigned
       rk.risk_code,                                                    -- NULL when not linked
       i.occurred_at,
       i.reported_at,
       i.resolved_at,
       TIMESTAMPDIFF(HOUR, i.reported_at, i.resolved_at) AS hours_to_resolve
FROM incident i
JOIN department d  ON d.department_id = i.department_id AND d.organisation_id = i.organisation_id
JOIN employee   rp ON rp.employee_id   = i.reported_by   AND rp.organisation_id = i.organisation_id
LEFT JOIN employee ag ON ag.employee_id = i.assigned_to  AND ag.organisation_id = i.organisation_id
LEFT JOIN risk     rk ON rk.risk_id     = i.risk_id      AND rk.organisation_id = i.organisation_id;
