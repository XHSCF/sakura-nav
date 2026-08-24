ALTER TABLE sites ADD COLUMN maintenance_status TEXT NOT NULL DEFAULT 'normal'
  CHECK (maintenance_status IN ('normal', 'review', 'unavailable'));

CREATE INDEX IF NOT EXISTS idx_sites_maintenance_status
  ON sites(maintenance_status, status, is_hidden);

CREATE TABLE IF NOT EXISTS content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_versions_created_at
  ON content_versions(created_at DESC);

CREATE TABLE IF NOT EXISTS site_click_daily (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, day)
);

CREATE INDEX IF NOT EXISTS idx_site_click_daily_day
  ON site_click_daily(day DESC);

CREATE TABLE IF NOT EXISTS site_click_minute (
  minute_bucket TEXT PRIMARY KEY NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0 AND clicks <= 3000)
);

CREATE TABLE IF NOT EXISTS site_click_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  valid INTEGER NOT NULL CONSTRAINT site_click_limit_must_match CHECK (valid = 1)
);

INSERT INTO settings(key, value, updated_at) VALUES
  ('click_analytics_enabled', '1', CURRENT_TIMESTAMP),
  ('click_analytics_retention_days', '90', CURRENT_TIMESTAMP),
  ('content_version_limit', '20', CURRENT_TIMESTAMP),
  ('announcement_text', '', CURRENT_TIMESTAMP),
  ('announcement_enabled', '0', CURRENT_TIMESTAMP),
  ('announcement_starts_at', '', CURRENT_TIMESTAMP),
  ('announcement_ends_at', '', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO NOTHING;

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
