CREATE TABLE IF NOT EXISTS order_bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  manual_price DECIMAL(10,2) NOT NULL,
  generated_by_id INT NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_bills_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_bills_generated_by FOREIGN KEY (generated_by_id) REFERENCES employees(id),
  INDEX idx_order_bills_order (order_id),
  INDEX idx_order_bills_generated_at (generated_at)
);
