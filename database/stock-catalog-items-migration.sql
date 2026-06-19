CREATE TABLE IF NOT EXISTS stock_catalog_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(160) NOT NULL,
  item_code VARCHAR(40) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_catalog_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  CONSTRAINT fk_stock_catalog_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
);

INSERT INTO stock_catalog_items (item_name, item_code, is_active, created_by, updated_by)
SELECT DISTINCT item_name, UPPER(item_code), TRUE, created_by, updated_by
FROM stock_items existing_item
WHERE existing_item.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM stock_catalog_items catalog_item
    WHERE LOWER(catalog_item.item_code) = LOWER(existing_item.item_code)
  );
