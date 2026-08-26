PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hidden_collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  eyebrow TEXT NOT NULL,
  passphrase TEXT NOT NULL DEFAULT '',
  welcome TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO hidden_collections(id, name, icon, eyebrow, passphrase, welcome, enabled, sort_order)
VALUES (
  'new-world',
  COALESCE((SELECT value FROM settings WHERE key = 'hidden_name'), '新世界'),
  COALESCE((SELECT value FROM settings WHERE key = 'hidden_icon'), 'fa-door-open'),
  'SECRET COLLECTION',
  COALESCE((SELECT value FROM settings WHERE key = 'hidden_passphrase'), ''),
  COALESCE((SELECT value FROM settings WHERE key = 'hidden_welcome'), '欢迎踏入新世界的大门'),
  CASE WHEN COALESCE((SELECT value FROM settings WHERE key = 'hidden_enabled'), '1') = '0' THEN 0 ELSE 1 END,
  0
);

INSERT OR IGNORE INTO hidden_collections(id, name, icon, eyebrow, passphrase, welcome, enabled, sort_order)
VALUES (
  'private-collection',
  '私人收藏',
  'fa-lock',
  'PRIVATE COLLECTION',
  '',
  '欢迎回到你的私人收藏',
  0,
  1
);

ALTER TABLE sites ADD COLUMN hidden_collection_id TEXT REFERENCES hidden_collections(id) ON UPDATE CASCADE ON DELETE RESTRICT;

UPDATE sites
SET hidden_collection_id = 'new-world',
    updated_at = CURRENT_TIMESTAMP
WHERE is_hidden = 1
  AND hidden_collection_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sites_hidden_collection_order
  ON sites(hidden_collection_id, status, sort_order);

CREATE TRIGGER IF NOT EXISTS sites_hidden_collection_insert_guard
BEFORE INSERT ON sites
WHEN (NEW.is_hidden = 1 AND NEW.hidden_collection_id IS NULL)
  OR (NEW.is_hidden = 0 AND NEW.hidden_collection_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'hidden_collection_must_match');
END;

CREATE TRIGGER IF NOT EXISTS sites_hidden_collection_update_guard
BEFORE UPDATE OF is_hidden, hidden_collection_id ON sites
WHEN (NEW.is_hidden = 1 AND NEW.hidden_collection_id IS NULL)
  OR (NEW.is_hidden = 0 AND NEW.hidden_collection_id IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'hidden_collection_must_match');
END;

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
