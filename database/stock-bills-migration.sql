CREATE TABLE IF NOT EXISTS stock_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_number VARCHAR(40) NOT NULL UNIQUE,
  stock_item_id INT NOT NULL,
  branch_id INT NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  item_code VARCHAR(40) NOT NULL,
  branch_name VARCHAR(120) NOT NULL,
  branch_code VARCHAR(30) NOT NULL,
  quantity_at_bill INT NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL,
  customer_name VARCHAR(160) NULL,
  note VARCHAR(255) NULL,
  generated_by INT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_bills_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
  CONSTRAINT fk_stock_bills_branch FOREIGN KEY (branch_id) REFERENCES stock_branches(id),
  CONSTRAINT fk_stock_bills_generated_by FOREIGN KEY (generated_by) REFERENCES employees(id)
);
