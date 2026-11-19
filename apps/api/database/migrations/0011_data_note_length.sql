-- 0011_data_note_length
-- The demonstration organisations carry a three-line source note (Source / Changed / Added) in organisation.data_note,
-- which does not fit in the original 600 characters.

ALTER TABLE organisation
  MODIFY COLUMN data_note VARCHAR(1200) NULL;
