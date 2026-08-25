UPDATE categories
SET icon = 'fa-desktop',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'software'
  AND icon <> 'fa-desktop';

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
