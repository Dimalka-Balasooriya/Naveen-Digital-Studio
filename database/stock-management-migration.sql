CREATE TABLE IF NOT EXISTS stock_branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_name VARCHAR(120) NOT NULL,
  short_code VARCHAR(30) NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_branches_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  CONSTRAINT fk_stock_branches_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  item_id INT NULL,
  movement_type ENUM('ADD', 'REDUCE', 'CREATE', 'EDIT', 'DELETE') NOT NULL,
  quantity_change INT NOT NULL DEFAULT 0,
  previous_quantity INT NOT NULL DEFAULT 0,
  new_quantity INT NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  changed_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_movements_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
  CONSTRAINT fk_stock_movements_changed_by FOREIGN KEY (changed_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  item_code VARCHAR(40) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_stock_items_branch_code UNIQUE (branch_id, item_code),
  CONSTRAINT fk_stock_items_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
  CONSTRAINT fk_stock_items_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  CONSTRAINT fk_stock_items_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
);

SET @has_item_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'stock_movements'
    AND COLUMN_NAME = 'item_id'
);
SET @add_item_id_sql := IF(@has_item_id = 0, 'ALTER TABLE stock_movements ADD COLUMN item_id INT NULL AFTER branch_id', 'SELECT 1');
PREPARE add_item_id_stmt FROM @add_item_id_sql;
EXECUTE add_item_id_stmt;
DEALLOCATE PREPARE add_item_id_stmt;

INSERT INTO stock_branches (branch_name, short_code, quantity)
SELECT 'Kurunegala Branch', 'KUR', 0
WHERE NOT EXISTS (SELECT 1 FROM stock_branches WHERE short_code = 'KUR');

INSERT INTO stock_branches (branch_name, short_code, quantity)
SELECT 'Galgamuwa Branch', 'GAL', 0
WHERE NOT EXISTS (SELECT 1 FROM stock_branches WHERE short_code = 'GAL');
