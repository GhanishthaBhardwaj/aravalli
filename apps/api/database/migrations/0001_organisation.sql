-- 0001_organisation
-- The tenant. Every other table belongs to exactly one organisation.
-- MySQL 8.0.16+ (CHECK constraints are enforced from that version).

CREATE TABLE organisation (
  organisation_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  slug            VARCHAR(60)  NOT NULL,                       -- url-safe handle, unique across customers
  is_demo         BOOLEAN      NOT NULL DEFAULT FALSE,         -- the sample organisation: fixed clock, sample data
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id),
  UNIQUE KEY uq_organisation_slug (slug),
  CONSTRAINT ck_organisation_slug CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
