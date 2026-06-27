SET @catalog_unit_price_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE stock_catalog_items ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_catalog_items'
    AND COLUMN_NAME = 'unit_price'
);
PREPARE catalog_unit_price_stmt FROM @catalog_unit_price_sql;
EXECUTE catalog_unit_price_stmt;
DEALLOCATE PREPARE catalog_unit_price_stmt;

SET @stock_unit_price_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE stock_items ADD COLUMN unit_price DECIMAL(12,2) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_items'
    AND COLUMN_NAME = 'unit_price'
);
PREPARE stock_unit_price_stmt FROM @stock_unit_price_sql;
EXECUTE stock_unit_price_stmt;
DEALLOCATE PREPARE stock_unit_price_stmt;

CREATE TABLE IF NOT EXISTS stock_wholesale_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_number VARCHAR(40) NOT NULL UNIQUE,
  customer_name VARCHAR(160) NULL,
  note VARCHAR(255) NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  generated_by INT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_wholesale_bills_generated_by FOREIGN KEY (generated_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS stock_wholesale_bill_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  stock_item_id INT NULL,
  item_name VARCHAR(160) NOT NULL,
  item_code VARCHAR(40) NULL,
  branch_name VARCHAR(120) NULL,
  branch_code VARCHAR(30) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_wholesale_items_bill FOREIGN KEY (bill_id) REFERENCES stock_wholesale_bills(id),
  CONSTRAINT fk_stock_wholesale_items_stock FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
);
