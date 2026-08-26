PRAGMA foreign_keys = ON;

ALTER TABLE sites ADD COLUMN private_status TEXT
  CHECK (private_status IS NULL OR private_status IN ('purchased', 'unlocked', 'frequent', 'backup'));

ALTER TABLE sites ADD COLUMN app_store_region TEXT
  CHECK (app_store_region IS NULL OR app_store_region IN ('cn', 'us'));

ALTER TABLE sites ADD COLUMN last_verified_at TEXT
  CHECK (last_verified_at IS NULL OR last_verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]');

CREATE TRIGGER IF NOT EXISTS sites_private_metadata_insert_guard
BEFORE INSERT ON sites
WHEN (
  NEW.hidden_collection_id IS NOT 'private-collection'
  AND (NEW.private_status IS NOT NULL OR NEW.app_store_region IS NOT NULL OR NEW.last_verified_at IS NOT NULL)
) OR (
  NEW.app_store_region IS NOT NULL
  AND (NEW.hidden_collection_id IS NOT 'private-collection' OR NEW.private_type IS NOT 'app')
)
BEGIN
  SELECT RAISE(ABORT, 'private_metadata_must_match');
END;

CREATE TRIGGER IF NOT EXISTS sites_private_metadata_update_guard
BEFORE UPDATE OF hidden_collection_id, private_type, private_status, app_store_region, last_verified_at ON sites
WHEN (
  NEW.hidden_collection_id IS NOT 'private-collection'
  AND (NEW.private_status IS NOT NULL OR NEW.app_store_region IS NOT NULL OR NEW.last_verified_at IS NOT NULL)
) OR (
  NEW.app_store_region IS NOT NULL
  AND (NEW.hidden_collection_id IS NOT 'private-collection' OR NEW.private_type IS NOT 'app')
)
BEGIN
  SELECT RAISE(ABORT, 'private_metadata_must_match');
END;

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
