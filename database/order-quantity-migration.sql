SET @has_order_quantity = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'order_quantity'
);

SET @order_quantity_sql = IF(
  @has_order_quantity = 0,
  'ALTER TABLE orders ADD COLUMN order_quantity INT NOT NULL DEFAULT 1',
  'SELECT ''orders.order_quantity already exists'''
);

PREPARE order_quantity_stmt FROM @order_quantity_sql;
EXECUTE order_quantity_stmt;
DEALLOCATE PREPARE order_quantity_stmt;

UPDATE orders
SET order_quantity = COALESCE(NULLIF(quantity, 0), 1)
WHERE order_quantity = 1;
