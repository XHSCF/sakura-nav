PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  primary_url TEXT NOT NULL,
  primary_label TEXT,
  secondary_url TEXT,
  secondary_label TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  added_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CHECK ((is_hidden = 1 AND category_id IS NULL) OR (is_hidden = 0 AND category_id IS NOT NULL)),
  CHECK ((secondary_url IS NULL AND secondary_label IS NULL) OR (secondary_url IS NOT NULL AND secondary_label IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_sites_public_order ON sites(is_hidden, status, category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sites_updated_at ON sites(updated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('hidden_id', 'new-world'),
  ('hidden_name', '新世界'),
  ('hidden_icon', 'fa-door-open'),
  ('hidden_passphrase', '开门'),
  ('hidden_welcome', '欢迎踏入新世界的大门'),
  ('hidden_enabled', '1');
