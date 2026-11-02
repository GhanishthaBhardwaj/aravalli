-- =============================================================================
-- Enterprise Risk and Incident Management System — Phase 1 schema
-- Target: MySQL 8.0.16+ (CHECK constraints are enforced; generated columns used)
-- Demo organisation: Aravalli Industries Ltd. (fictional)
--
-- Conventions
--   * snake_case names, InnoDB, utf8mb4
--   * INT UNSIGNED AUTO_INCREMENT surrogate keys + human-readable unique codes
--   * ON DELETE RESTRICT everywhere: history is never cascaded away.
--     Employees are deactivated (is_active = 0), never deleted.
--   * The current risk score is NOT stored on `risk`; it is derived from the
--     latest risk_assessment (see view v_risk_current). This keeps the model in 3NF.
-- =============================================================================

SET NAMES utf8mb4;

DROP VIEW  IF EXISTS v_incident_summary;
DROP VIEW  IF EXISTS v_risk_current;
DROP TABLE IF EXISTS incident_update;
DROP TABLE IF EXISTS incident;
DROP TABLE IF EXISTS risk_assessment;
DROP TABLE IF EXISTS risk;
DROP TABLE IF EXISTS employee;
DROP TABLE IF EXISTS department;

-- ---------------------------------------------------------------- department
CREATE TABLE department (
  department_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(10)  NOT NULL,                       -- e.g. FIN, IT
  name          VARCHAR(100) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (department_id),
  UNIQUE KEY uq_department_code (code),
  UNIQUE KEY uq_department_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ------------------------------------------------------------------ employee
CREATE TABLE employee (
  employee_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_code VARCHAR(12)  NOT NULL,                       -- e.g. EMP-1042
  department_id INT UNSIGNED NOT NULL,
  first_name    VARCHAR(60)  NOT NULL,
  last_name     VARCHAR(60)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  job_title     VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  UNIQUE KEY uq_employee_code  (employee_code),
  UNIQUE KEY uq_employee_email (email),
  KEY ix_employee_department (department_id),
  CONSTRAINT fk_employee_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_employee_role CHECK
    (role IN ('Administrator', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------- risk
CREATE TABLE risk (
  risk_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  risk_code         VARCHAR(10)  NOT NULL,                   -- e.g. RSK-0001
  title             VARCHAR(150) NOT NULL,
  description       TEXT         NOT NULL,
  category          VARCHAR(20)  NOT NULL,
  department_id     INT UNSIGNED NOT NULL,
  owner_employee_id INT UNSIGNED NOT NULL,                   -- accountable owner
  status            VARCHAR(12)  NOT NULL DEFAULT 'Identified',
  identified_date   DATE         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (risk_id),
  UNIQUE KEY uq_risk_code (risk_code),
  KEY ix_risk_department (department_id),
  KEY ix_risk_owner (owner_employee_id),
  KEY ix_risk_status (status),
  CONSTRAINT fk_risk_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_risk_owner FOREIGN KEY (owner_employee_id)
    REFERENCES employee (employee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_risk_category CHECK
    (category IN ('Operational', 'Financial', 'Compliance', 'Technology', 'Strategic', 'Reputational')),
  CONSTRAINT ck_risk_status CHECK
    (status IN ('Identified', 'Assessed', 'Mitigating', 'Monitoring', 'Closed')),
  CONSTRAINT ck_risk_title_len CHECK (CHAR_LENGTH(title) >= 5)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------- risk_assessment
-- Append-only history: one row per assessment, never overwritten.
CREATE TABLE risk_assessment (
  assessment_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  risk_id          INT UNSIGNED NOT NULL,
  assessed_by      INT UNSIGNED NOT NULL,
  assessment_date  DATE         NOT NULL,
  likelihood       TINYINT UNSIGNED NOT NULL,
  impact           TINYINT UNSIGNED NOT NULL,
  risk_score       TINYINT UNSIGNED GENERATED ALWAYS AS (likelihood * impact) STORED,
  mitigation_notes TEXT         NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id),
  KEY ix_assessment_risk_date (risk_id, assessment_date),
  KEY ix_assessment_assessor (assessed_by),
  CONSTRAINT fk_assessment_risk FOREIGN KEY (risk_id)
    REFERENCES risk (risk_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assessment_assessor FOREIGN KEY (assessed_by)
    REFERENCES employee (employee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_assessment_likelihood CHECK (likelihood BETWEEN 1 AND 5),
  CONSTRAINT ck_assessment_impact     CHECK (impact BETWEEN 1 AND 5)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ------------------------------------------------------------------ incident
CREATE TABLE incident (
  incident_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  incident_code VARCHAR(10)  NOT NULL,                       -- e.g. INC-0001
  title         VARCHAR(150) NOT NULL,
  description   TEXT         NOT NULL,
  severity      VARCHAR(8)   NOT NULL,
  status        VARCHAR(12)  NOT NULL DEFAULT 'Open',
  department_id INT UNSIGNED NOT NULL,                       -- affected department
  reported_by   INT UNSIGNED NOT NULL,
  assigned_to   INT UNSIGNED NULL,                           -- optional
  risk_id       INT UNSIGNED NULL,                           -- optional link to a risk
  occurred_at   DATETIME     NOT NULL,
  reported_at   DATETIME     NOT NULL,
  resolved_at   DATETIME     NULL,
  PRIMARY KEY (incident_id),
  UNIQUE KEY uq_incident_code (incident_code),
  KEY ix_incident_department (department_id),
  KEY ix_incident_reporter (reported_by),
  KEY ix_incident_assignee (assigned_to),
  KEY ix_incident_risk (risk_id),
  KEY ix_incident_status (status),
  CONSTRAINT fk_incident_department FOREIGN KEY (department_id)
    REFERENCES department (department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_reporter FOREIGN KEY (reported_by)
    REFERENCES employee (employee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_assignee FOREIGN KEY (assigned_to)
    REFERENCES employee (employee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_risk FOREIGN KEY (risk_id)
    REFERENCES risk (risk_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_incident_severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT ck_incident_status   CHECK (status IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed')),
  CONSTRAINT ck_incident_reported_after_occurred CHECK (reported_at >= occurred_at),
  CONSTRAINT ck_incident_resolved_after_occurred CHECK (resolved_at IS NULL OR resolved_at >= occurred_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------- incident_update
-- Append-only log. Updates and deletes are not part of the workflow
-- (enforced below by triggers). status_from/status_to are NULL for notes that
-- do not change the status (assignment, risk link, progress comments).
CREATE TABLE incident_update (
  update_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  incident_id INT UNSIGNED NOT NULL,
  updated_by  INT UNSIGNED NOT NULL,
  update_text TEXT         NOT NULL,
  status_from VARCHAR(12)  NULL,
  status_to   VARCHAR(12)  NULL,
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (update_id),
  KEY ix_update_incident_time (incident_id, created_at),
  KEY ix_update_author (updated_by),
  CONSTRAINT fk_update_incident FOREIGN KEY (incident_id)
    REFERENCES incident (incident_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_update_author FOREIGN KEY (updated_by)
    REFERENCES employee (employee_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_update_status_from CHECK
    (status_from IS NULL OR status_from IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed')),
  CONSTRAINT ck_update_status_to CHECK
    (status_to IS NULL OR status_to IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ------------------------------------------------------ append-only triggers
DELIMITER $$
CREATE TRIGGER trg_incident_update_no_update BEFORE UPDATE ON incident_update
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'incident_update is append-only';
END$$
CREATE TRIGGER trg_incident_update_no_delete BEFORE DELETE ON incident_update
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'incident_update is append-only';
END$$
CREATE TRIGGER trg_risk_assessment_no_update BEFORE UPDATE ON risk_assessment
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk_assessment history is append-only';
END$$
CREATE TRIGGER trg_risk_assessment_no_delete BEFORE DELETE ON risk_assessment
FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'risk_assessment history is append-only';
END$$
DELIMITER ;

-- --------------------------------------------------------------------- views
-- Each risk with its latest assessment (ties on date broken by highest assessment_id).
-- Severity bands: Low 1-4, Medium 5-9, High 10-16, Critical 20-25.
-- (17-19 cannot occur as a product of two integers in 1..5.)
CREATE VIEW v_risk_current AS
SELECT r.risk_id,
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
JOIN department d ON d.department_id = r.department_id
JOIN employee   o ON o.employee_id   = r.owner_employee_id
LEFT JOIN (
  SELECT ra.*,
         ROW_NUMBER() OVER (PARTITION BY ra.risk_id
                            ORDER BY ra.assessment_date DESC, ra.assessment_id DESC) AS rn
  FROM risk_assessment ra
) a ON a.risk_id = r.risk_id AND a.rn = 1;

CREATE VIEW v_incident_summary AS
SELECT i.incident_id,
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
JOIN department d  ON d.department_id = i.department_id
JOIN employee   rp ON rp.employee_id  = i.reported_by
LEFT JOIN employee ag ON ag.employee_id = i.assigned_to
LEFT JOIN risk     rk ON rk.risk_id     = i.risk_id;
