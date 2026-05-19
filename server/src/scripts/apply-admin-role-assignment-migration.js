import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  multipleStatements: true
});

await connection.query("INSERT IGNORE INTO roles (name) VALUES ('OWNER'), ('CO_ADMIN'), ('PRODUCTION_EMPLOYEE')");
await connection.query(`
  UPDATE employees e
  JOIN roles old_role ON old_role.id = e.role_id
  JOIN roles new_role ON new_role.name = 'OWNER'
  SET e.role_id = new_role.id
  WHERE old_role.name = 'admin'
`);
await connection.query(`
  UPDATE employees e
  JOIN roles old_role ON old_role.id = e.role_id
  JOIN roles new_role ON new_role.name = 'PRODUCTION_EMPLOYEE'
  SET e.role_id = new_role.id
  WHERE old_role.name = 'production'
`);

const [addressColumns] = await connection.query(`
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'address'
`);
if (!addressColumns.length) {
  await connection.query('ALTER TABLE employees ADD COLUMN address TEXT NULL');
}

await connection.query(`
  CREATE TABLE IF NOT EXISTS order_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    task_id INT NULL,
    assigned_to_employee_id INT NOT NULL,
    assigned_by_admin_id INT NOT NULL,
    assigned_by_role VARCHAR(50) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    assignment_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assignment_ended_at TIMESTAMP NULL,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_assignments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_assignments_task FOREIGN KEY (task_id) REFERENCES production_tasks(id),
    CONSTRAINT fk_order_assignments_assigned_to FOREIGN KEY (assigned_to_employee_id) REFERENCES employees(id),
    CONSTRAINT fk_order_assignments_assigned_by FOREIGN KEY (assigned_by_admin_id) REFERENCES employees(id),
    INDEX idx_order_assignments_order (order_id),
    INDEX idx_order_assignments_employee (assigned_to_employee_id)
  )
`);

await connection.query(`
  CREATE TABLE IF NOT EXISTS assignment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    task_id INT NULL,
    old_employee_id INT NULL,
    new_employee_id INT NOT NULL,
    changed_by_admin_id INT NOT NULL,
    changed_by_role VARCHAR(50) NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assignment_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_assignment_history_task FOREIGN KEY (task_id) REFERENCES production_tasks(id),
    CONSTRAINT fk_assignment_history_old_employee FOREIGN KEY (old_employee_id) REFERENCES employees(id),
    CONSTRAINT fk_assignment_history_new_employee FOREIGN KEY (new_employee_id) REFERENCES employees(id),
    CONSTRAINT fk_assignment_history_changed_by FOREIGN KEY (changed_by_admin_id) REFERENCES employees(id),
    INDEX idx_assignment_history_order (order_id, changed_at)
  )
`);

await connection.query(`
  INSERT INTO order_assignments (order_id, assigned_to_employee_id, assigned_by_admin_id, assigned_by_role, commission_amount, assignment_started_at, is_current)
  SELECT o.id, o.assigned_employee_id, COALESCE(o.created_by, 1), 'OWNER', COALESCE(c.commission_amount, 0), o.created_at, TRUE
  FROM orders o
  LEFT JOIN commissions c ON c.order_id = o.id AND c.employee_id = o.assigned_employee_id
  WHERE o.assigned_employee_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM order_assignments oa WHERE oa.order_id = o.id)
`);

await connection.end();
console.log('admin roles and assignment tracking ready');
