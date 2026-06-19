SET @has_order_deleted_at = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'deleted_at'
);

SET @order_deleted_at_sql = IF(
  @has_order_deleted_at = 0,
  'ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP NULL AFTER updated_at',
  'SELECT ''orders.deleted_at already exists'''
);

PREPARE order_deleted_at_stmt FROM @order_deleted_at_sql;
EXECUTE order_deleted_at_stmt;
DEALLOCATE PREPARE order_deleted_at_stmt;

SET @has_order_deleted_by = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'deleted_by'
);

SET @order_deleted_by_sql = IF(
  @has_order_deleted_by = 0,
  'ALTER TABLE orders ADD COLUMN deleted_by INT NULL AFTER deleted_at',
  'SELECT ''orders.deleted_by already exists'''
);

PREPARE order_deleted_by_stmt FROM @order_deleted_by_sql;
EXECUTE order_deleted_by_stmt;
DEALLOCATE PREPARE order_deleted_by_stmt;

SET @has_order_is_deleted = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'is_deleted'
);

SET @order_is_deleted_sql = IF(
  @has_order_is_deleted = 0,
  'ALTER TABLE orders ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE AFTER deleted_by',
  'SELECT ''orders.is_deleted already exists'''
);

PREPARE order_is_deleted_stmt FROM @order_is_deleted_sql;
EXECUTE order_is_deleted_stmt;
DEALLOCATE PREPARE order_is_deleted_stmt;

SET @has_order_archived = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'archived_from_active_list'
);

SET @order_archived_sql = IF(
  @has_order_archived = 0,
  'ALTER TABLE orders ADD COLUMN archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE AFTER is_deleted',
  'SELECT ''orders.archived_from_active_list already exists'''
);

PREPARE order_archived_stmt FROM @order_archived_sql;
EXECUTE order_archived_stmt;
DEALLOCATE PREPARE order_archived_stmt;
