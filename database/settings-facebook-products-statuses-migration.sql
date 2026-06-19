SET @has_whatsapp_number = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'facebook_pages'
    AND COLUMN_NAME = 'whatsapp_number'
);

SET @settings_sql = IF(
  @has_whatsapp_number = 0,
  'ALTER TABLE facebook_pages ADD COLUMN whatsapp_number VARCHAR(30) NULL AFTER name',
  'SELECT ''facebook_pages.whatsapp_number already exists'''
);

PREPARE settings_stmt FROM @settings_sql;
EXECUTE settings_stmt;
DEALLOCATE PREPARE settings_stmt;
