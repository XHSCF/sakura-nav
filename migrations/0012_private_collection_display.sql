PRAGMA foreign_keys = ON;

ALTER TABLE hidden_collections ADD COLUMN private_type_config_json TEXT NOT NULL DEFAULT '[]';

UPDATE hidden_collections
SET private_type_config_json = '[{"id":"all","name":"全部","icon":"fa-layer-group"},{"id":"app","name":"已购应用","icon":"fa-mobile-alt"},{"id":"website","name":"私人网站","icon":"fa-globe"},{"id":"resource","name":"备用资源","icon":"fa-archive"},{"id":"other","name":"未分类","icon":"fa-tags"}]',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'private-collection';

UPDATE settings
SET value = CAST(value AS INTEGER) + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'content_revision';
