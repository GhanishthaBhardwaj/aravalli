-- 0002_department_employee
-- Tenant rule used by every table from here on:
--   * the table carries organisation_id
--   * codes and emails are unique PER organisation (composite unique keys)
--   * each table also has UNIQUE (<pk>, organisation_id), so other tables can point at it with a
--     COMPOSITE foreign key (<pk>, organisation_id). A row therefore cannot reference a row that
--     belongs to a different organisation.
-- ON DELETE RESTRICT everywhere: history is never cascaded away. Employees are deactivated, not deleted.

CREATE TABLE department (
  department_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  code            VARCHAR(10)  NOT NULL,                       -- e.g. FIN, IT
  name            VARCHAR(100) NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (department_id),
  UNIQUE KEY uq_department_id_org (department_id, organisation_id),
  UNIQUE KEY uq_department_org_code (organisation_id, code),
  UNIQUE KEY uq_department_org_name (organisation_id, name),
  CONSTRAINT fk_department_org FOREIGN KEY (organisation_id)
    REFERENCES organisation (organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE employee (
  employee_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organisation_id INT UNSIGNED NOT NULL,
  employee_code   VARCHAR(12)  NOT NULL,                       -- e.g. EMP-1042
  department_id   INT UNSIGNED NOT NULL,
  first_name      VARCHAR(60)  NOT NULL,
  last_name       VARCHAR(60)  NOT NULL,
  email           VARCHAR(120) NOT NULL,
  job_title       VARCHAR(100) NOT NULL,
  role            VARCHAR(20)  NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (employee_id),
  UNIQUE KEY uq_employee_id_org (employee_id, organisation_id),
  UNIQUE KEY uq_employee_org_code (organisation_id, employee_code),
  UNIQUE KEY uq_employee_org_email (organisation_id, email),
  KEY ix_employee_department (department_id, organisation_id),
  CONSTRAINT fk_employee_department FOREIGN KEY (department_id, organisation_id)
    REFERENCES department (department_id, organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_employee_role CHECK
    (role IN ('Org Admin', 'Risk Officer', 'Department Head', 'Auditor', 'Employee'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
