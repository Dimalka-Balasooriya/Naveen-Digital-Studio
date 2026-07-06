SET @has_is_future_order := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'is_future_order'
);
SET @sql := IF(@has_is_future_order = 0,
  'ALTER TABLE orders ADD COLUMN is_future_order BOOLEAN NOT NULL DEFAULT FALSE AFTER is_fast',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_future_needed_date := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'future_needed_date'
);
SET @sql := IF(@has_future_needed_date = 0,
  'ALTER TABLE orders ADD COLUMN future_needed_date DATE NULL AFTER is_future_order',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_future_note := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'future_note'
);
SET @sql := IF(@has_future_note = 0,
  'ALTER TABLE orders ADD COLUMN future_note TEXT NULL AFTER future_needed_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_future_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND INDEX_NAME = 'idx_orders_future'
);
SET @sql := IF(@has_future_index = 0,
  'CREATE INDEX idx_orders_future ON orders (is_future_order, future_needed_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
