CREATE TABLE IF NOT EXISTS order_status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  from_status_id INT,
  to_status_id INT NOT NULL,
  changed_by INT NOT NULL,
  note TEXT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_history_from FOREIGN KEY (from_status_id) REFERENCES order_statuses(id),
  CONSTRAINT fk_status_history_to FOREIGN KEY (to_status_id) REFERENCES order_statuses(id),
  CONSTRAINT fk_status_history_employee FOREIGN KEY (changed_by) REFERENCES employees(id),
  INDEX idx_status_history_order (order_id, changed_at)
);

CREATE TABLE IF NOT EXISTS commissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  employee_id INT NOT NULL,
  assigned_by INT,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  assignment_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assignment_ended_at TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_payable BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_commission_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_commission_assigned_by FOREIGN KEY (assigned_by) REFERENCES employees(id),
  INDEX idx_commission_employee (employee_id),
  INDEX idx_commission_order (order_id)
);

CREATE TABLE IF NOT EXISTS employee_performance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  completed_orders INT NOT NULL DEFAULT 0,
  fast_orders_completed INT NOT NULL DEFAULT 0,
  average_completion_hours DECIMAL(10,2) DEFAULT 0,
  commission_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_performance_period (employee_id, period_start, period_end),
  CONSTRAINT fk_employee_performance_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

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

INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by, note, changed_at)
SELECT id, NULL, status_id, COALESCE(created_by, assigned_employee_id, 1), 'Initial imported status', created_at
FROM orders
WHERE NOT EXISTS (
  SELECT 1 FROM order_status_history h WHERE h.order_id = orders.id
);

INSERT INTO commissions (order_id, employee_id, assigned_by, commission_amount, assignment_started_at, is_active, is_payable, notes)
SELECT o.id, o.assigned_employee_id, o.created_by, 0, o.created_at, TRUE, s.name = 'Completed', 'Initial commission record'
FROM orders o
JOIN order_statuses s ON s.id = o.status_id
WHERE o.assigned_employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM commissions c WHERE c.order_id = o.id AND c.employee_id = o.assigned_employee_id
  );
