-- 0008_import_fields
-- Fields kept from the public datasets, so an imported incident can be traced and filtered without parsing its description:
--   source_occurred_at   the ORIGINAL timestamp, before the dataset's dates were shifted forward to land near today
--   made_sla             ServiceNow "made_sla" flag (UCI log); NULL for incidents that did not come from it
--   reassignment_count   how many times the ticket changed hands (UCI log)
--   region               US state of the plant (OSHA records)
--   industry_code        NAICS code of the plant (OSHA records)
-- organisation.data_note is shown in the app so nobody mistakes shifted dates for the real ones.

ALTER TABLE organisation
  ADD COLUMN data_note VARCHAR(600) NULL AFTER is_demo;

ALTER TABLE incident
  ADD COLUMN source_occurred_at VARCHAR(19)       NULL AFTER source_id,
  ADD COLUMN made_sla           BOOLEAN           NULL AFTER source_occurred_at,
  ADD COLUMN reassignment_count SMALLINT UNSIGNED NULL AFTER made_sla,
  ADD COLUMN region             VARCHAR(30)       NULL AFTER reassignment_count,
  ADD COLUMN industry_code      VARCHAR(6)        NULL AFTER region;
