PRAGMA foreign_keys = ON;

ALTER TABLE sites ADD COLUMN private_type TEXT
  CHECK (private_type IS NULL OR private_type IN ('app', 'website', 'resource', 'other'));

UPDATE sites
SET private_type = 'other',
    updated_at = CURRENT_TIMESTAMP
WHERE hidden_collection_id = 'private-collection';

CREATE TRIGGER IF NOT EXISTS sites_private_type_insert_guard
BEFORE INSERT ON sites
WHEN (NEW.hidden_collection_id = 'private-collection' AND NEW.private_type IS NULL)
  OR (NEW.hidden_collection_id <> 'private-collection' AND NEW.private_type IS NOT NULL)
  OR (NEW.hidden_collection_id IS NULL AND NEW.private_type IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'private_type_must_match');
END;

CREATE TRIGGER IF NOT EXISTS sites_private_type_update_guard
BEFORE UPDATE OF hidden_collection_id, private_type ON sites
WHEN (NEW.hidden_collection_id = 'private-collection' AND NEW.private_type IS NULL)
  OR (NEW.hidden_collection_id <> 'private-collection' AND NEW.private_type IS NOT NULL)
  OR (NEW.hidden_collection_id IS NULL AND NEW.private_type IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'private_type_must_match');
END;

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
