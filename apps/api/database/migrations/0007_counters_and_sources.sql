-- 0007_counters_and_sources
-- 1. Per-organisation counters, so the DATABASE hands out RSK-0001 / INC-0001 style codes. A browser (or an API process)
--    can never pick a code itself, and two concurrent requests can never be given the same one: the counter row is
--    locked by the statement that increments it, and the lock is held until the creating transaction ends.
-- 2. Source columns, so an incident that came from a public dataset can always be traced back to its original record,
--    and so re-running an import can recognise what it has already loaded.

CREATE TABLE organisation_counter (
  organisation_id INT UNSIGNED NOT NULL,
  counter_name    VARCHAR(20)  NOT NULL,                       -- 'risk' or 'incident'
  current_value      INT UNSIGNED NOT NULL,
  PRIMARY KEY (organisation_id, counter_name),
  CONSTRAINT fk_counter_org FOREIGN KEY (organisation_id)
    REFERENCES organisation (organisation_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- NULL for incidents created in the product. Several NULLs are allowed in a unique key, so only imported rows are constrained.
-- One change per ALTER statement: TiDB (production) does not allow every mix of changes in a single statement.
ALTER TABLE incident ADD COLUMN source_system VARCHAR(30) NULL AFTER resolved_at;
ALTER TABLE incident ADD COLUMN source_id     VARCHAR(40) NULL AFTER source_system;
ALTER TABLE incident ADD UNIQUE KEY uq_incident_source (organisation_id, source_system, source_id);
ALTER TABLE incident ADD CONSTRAINT ck_incident_source_pair CHECK ((source_system IS NULL) = (source_id IS NULL));
