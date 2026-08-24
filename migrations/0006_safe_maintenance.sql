INSERT INTO settings(key, value, updated_at) VALUES ('content_revision', '0', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO NOTHING;

INSERT INTO settings(key, value, updated_at) VALUES ('audit_retention_days', '180', CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS content_revision_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  valid INTEGER NOT NULL CONSTRAINT content_revision_must_match CHECK (valid = 1)
);
