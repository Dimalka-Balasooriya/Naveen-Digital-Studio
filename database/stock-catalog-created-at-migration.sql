SET @has_stock_catalog_created_at := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_catalog_items'
    AND COLUMN_NAME = 'created_at'
);

SET @stock_catalog_created_at_sql := IF(
  @has_stock_catalog_created_at = 0,
  'ALTER TABLE stock_catalog_items ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT "stock_catalog_items.created_at already exists"'
);

PREPARE stock_catalog_created_at_stmt FROM @stock_catalog_created_at_sql;
EXECUTE stock_catalog_created_at_stmt;
DEALLOCATE PREPARE stock_catalog_created_at_stmt;
