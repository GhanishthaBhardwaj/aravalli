-- 0004_incident
-- assigned_to and risk_id are optional. With a composite foreign key, a NULL in any column means
-- "not checked" (MATCH SIMPLE), so an unassigned or unlinked incident is valid, while a non-NULL
-- value must belong to the same organisation.

CREATE TABLE incident (
  incident_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  incident_code   VARCHAR(10)  NOT NULL,                       -- e.g. INC-0001
  title           VARCHAR(150) NOT NULL,
  description     TEXT         NOT NULL,
  severity        VARCHAR(8)   NOT NULL,
  status          VARCHAR(12)  NOT NULL DEFAULT 'Open',
  department_id   INT UNSIGNED NOT NULL,                       -- affected department
  reported_by     INT UNSIGNED NOT NULL,
  assigned_to     INT UNSIGNED NULL,
  risk_id         INT UNSIGNED NULL,
  occurred_at     DATETIME     NOT NULL,
  reported_at     DATETIME     NOT NULL,
  resolved_at     DATETIME     NULL,
  PRIMARY KEY (incident_id),
  UNIQUE KEY uq_incident_id_org (incident_id, organisation_id),
  UNIQUE KEY uq_incident_org_code (organisation_id, incident_code),
  KEY ix_incident_department (department_id, organisation_id),
  KEY ix_incident_reporter (reported_by, organisation_id),
  KEY ix_incident_assignee (assigned_to, organisation_id),
  KEY ix_incident_risk (risk_id, organisation_id),
  KEY ix_incident_status (organisation_id, status),
  CONSTRAINT fk_incident_department FOREIGN KEY (department_id, organisation_id)
    REFERENCES department (department_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_reporter FOREIGN KEY (reported_by, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_assignee FOREIGN KEY (assigned_to, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_incident_risk FOREIGN KEY (risk_id, organisation_id)
    REFERENCES risk (risk_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_incident_severity CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT ck_incident_status   CHECK (status IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed')),
  CONSTRAINT ck_incident_reported_after_occurred CHECK (reported_at >= occurred_at),
  CONSTRAINT ck_incident_resolved_after_occurred CHECK (resolved_at IS NULL OR resolved_at >= occurred_at),
  -- a resolution time exists exactly when the incident has been resolved (reopening clears it)
  CONSTRAINT ck_incident_resolved_matches_status CHECK (
    (status IN ('Resolved', 'Closed') AND resolved_at IS NOT NULL)
    OR (status IN ('Open', 'Investigating', 'Contained') AND resolved_at IS NULL)
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Append-only log (enforced by triggers in 0006). status_from / status_to are NULL for entries
-- that do not change the status (assignment, risk link, progress notes).
CREATE TABLE incident_update (
  update_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  incident_id     INT UNSIGNED NOT NULL,
  updated_by      INT UNSIGNED NOT NULL,
  update_text     TEXT         NOT NULL,
  status_from     VARCHAR(12)  NULL,
  status_to       VARCHAR(12)  NULL,
  created_at      DATETIME     NOT NULL,
  PRIMARY KEY (update_id),
  KEY ix_update_incident_time (incident_id, created_at),
  KEY ix_update_org_incident (incident_id, organisation_id),
  KEY ix_update_author (updated_by, organisation_id),
  CONSTRAINT fk_update_incident FOREIGN KEY (incident_id, organisation_id)
    REFERENCES incident (incident_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_update_author FOREIGN KEY (updated_by, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_update_status_from CHECK
    (status_from IS NULL OR status_from IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed')),
  CONSTRAINT ck_update_status_to CHECK
    (status_to IS NULL OR status_to IN ('Open', 'Investigating', 'Contained', 'Resolved', 'Closed'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
