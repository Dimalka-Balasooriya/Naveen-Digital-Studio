SET @has_is_wholesale := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'is_wholesale'
);
SET @sql := IF(@has_is_wholesale = 0,
  'ALTER TABLE orders ADD COLUMN is_wholesale BOOLEAN NOT NULL DEFAULT FALSE AFTER is_future_order',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_wholesale_bill_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'wholesale_bill_id'
);
SET @sql := IF(@has_wholesale_bill_id = 0,
  'ALTER TABLE orders ADD COLUMN wholesale_bill_id INT NULL AFTER is_wholesale',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS wholesale_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  stock_item_id INT NULL,
  catalog_item_id INT NULL,
  item_name VARCHAR(180) NOT NULL,
  item_code VARCHAR(80) NULL,
  branch_name VARCHAR(120) NULL,
  branch_code VARCHAR(40) NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wholesale_order_items_order (order_id),
  CONSTRAINT fk_wholesale_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

SET @has_wholesale_item_catalog_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'wholesale_order_items'
    AND COLUMN_NAME = 'catalog_item_id'
);
SET @sql := IF(@has_wholesale_item_catalog_id = 0,
  'ALTER TABLE wholesale_order_items ADD COLUMN catalog_item_id INT NULL AFTER stock_item_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS stock_wholesale_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NULL,
  bill_number VARCHAR(40) NOT NULL UNIQUE,
  customer_name VARCHAR(160),
  note TEXT,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  generated_by INT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stock_wholesale_bills_order (order_id),
  CONSTRAINT fk_wholesale_bills_generated_by FOREIGN KEY (generated_by) REFERENCES employees(id)
);

SET @has_stock_wholesale_order_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_wholesale_bills'
    AND COLUMN_NAME = 'order_id'
);
SET @sql := IF(@has_stock_wholesale_order_id = 0,
  'ALTER TABLE stock_wholesale_bills ADD COLUMN order_id INT NULL AFTER id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_stock_wholesale_order_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_wholesale_bills'
    AND INDEX_NAME = 'idx_stock_wholesale_bills_order'
);
SET @sql := IF(@has_stock_wholesale_order_index = 0,
  'CREATE INDEX idx_stock_wholesale_bills_order ON stock_wholesale_bills(order_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
