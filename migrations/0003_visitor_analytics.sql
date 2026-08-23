CREATE TABLE IF NOT EXISTS visitor_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64),
  path TEXT NOT NULL,
  referrer_host TEXT,
  device_type TEXT NOT NULL CHECK (device_type IN ('mobile', 'tablet', 'desktop', 'other')),
  browser TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  country_code TEXT,
  region TEXT,
  city TEXT,
  minute_bucket TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visitor_events_occurred_at ON visitor_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor_time ON visitor_events(visitor_hash, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_location ON visitor_events(country_code, region, city);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_events_dedupe ON visitor_events(visitor_hash, path, minute_bucket);

INSERT INTO settings(key, value, updated_at) VALUES ('analytics_enabled', '1', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO NOTHING;
INSERT INTO settings(key, value, updated_at) VALUES ('analytics_retention_days', '90', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO NOTHING;
