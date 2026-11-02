-- 0003_risk
-- A risk's current score is NOT stored here. It is derived from the latest assessment
-- (see view v_risk_current), which keeps the model in third normal form.

CREATE TABLE risk (
  risk_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id   INT UNSIGNED NOT NULL,
  risk_code         VARCHAR(10)  NOT NULL,                     -- e.g. RSK-0001
  title             VARCHAR(150) NOT NULL,
  description       TEXT         NOT NULL,
  category          VARCHAR(20)  NOT NULL,
  department_id     INT UNSIGNED NOT NULL,
  owner_employee_id INT UNSIGNED NOT NULL,                     -- accountable owner
  status            VARCHAR(12)  NOT NULL DEFAULT 'Identified',
  identified_date   DATE         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (risk_id),
  UNIQUE KEY uq_risk_id_org (risk_id, organisation_id),
  UNIQUE KEY uq_risk_org_code (organisation_id, risk_code),
  KEY ix_risk_department (department_id, organisation_id),
  KEY ix_risk_owner (owner_employee_id, organisation_id),
  KEY ix_risk_status (organisation_id, status),
  CONSTRAINT fk_risk_department FOREIGN KEY (department_id, organisation_id)
    REFERENCES department (department_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_risk_owner FOREIGN KEY (owner_employee_id, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_risk_category CHECK
    (category IN ('Operational', 'Financial', 'Compliance', 'Technology', 'Strategic', 'Reputational')),
  CONSTRAINT ck_risk_status CHECK
    (status IN ('Identified', 'Assessed', 'Mitigating', 'Monitoring', 'Closed')),
  CONSTRAINT ck_risk_title_len CHECK (CHAR_LENGTH(title) >= 5)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Append-only history: one row per assessment, never overwritten (enforced by triggers in 0006).
CREATE TABLE risk_assessment (
  assessment_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id  INT UNSIGNED NOT NULL,
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
  KEY ix_assessment_org_risk (risk_id, organisation_id),
  KEY ix_assessment_assessor (assessed_by, organisation_id),
  CONSTRAINT fk_assessment_risk FOREIGN KEY (risk_id, organisation_id)
    REFERENCES risk (risk_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assessment_assessor FOREIGN KEY (assessed_by, organisation_id)
    REFERENCES employee (employee_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_assessment_likelihood CHECK (likelihood BETWEEN 1 AND 5),
  CONSTRAINT ck_assessment_impact     CHECK (impact BETWEEN 1 AND 5)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
