CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  phone VARCHAR(30),
  address TEXT,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE attendance_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  login_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logout_time TIMESTAMP NULL,
  logout_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  INDEX idx_attendance_employee_date (employee_id, attendance_date),
  INDEX idx_attendance_date (attendance_date)
);

CREATE TABLE facebook_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  whatsapp_number VARCHAR(30),
  url VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  color VARCHAR(30) NOT NULL DEFAULT 'slate',
  sort_order INT NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE production_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE courier_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  phone VARCHAR(30) NOT NULL UNIQUE,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  product_id INT NOT NULL,
  facebook_page_id INT,
  courier_service_id INT,
  tracking_number VARCHAR(120),
  status_id INT NOT NULL,
  assigned_employee_id INT,
  assigned_co_admin_id INT,
  needed_date DATE NOT NULL,
  is_fast BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INT NOT NULL DEFAULT 1,
  order_quantity INT NOT NULL DEFAULT 1,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  advance_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  production_progress INT NOT NULL DEFAULT 0,
  design_notes TEXT,
  return_reason TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  deleted_by INT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  archived_from_active_list BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_orders_facebook_page FOREIGN KEY (facebook_page_id) REFERENCES facebook_pages(id),
  CONSTRAINT fk_orders_courier_service FOREIGN KEY (courier_service_id) REFERENCES courier_services(id),
  CONSTRAINT fk_orders_status FOREIGN KEY (status_id) REFERENCES order_statuses(id),
  CONSTRAINT fk_orders_assigned_employee FOREIGN KEY (assigned_employee_id) REFERENCES employees(id),
  CONSTRAINT fk_orders_assigned_co_admin FOREIGN KEY (assigned_co_admin_id) REFERENCES employees(id),
  CONSTRAINT fk_orders_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  INDEX idx_orders_needed_date (needed_date),
  INDEX idx_orders_fast (is_fast),
  INDEX idx_orders_assignee (assigned_employee_id),
  INDEX idx_orders_assigned_co_admin (assigned_co_admin_id)
);

CREATE TABLE order_task_completions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  task_id INT NOT NULL,
  completed_by INT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_task (order_id, task_id),
  CONSTRAINT fk_task_completion_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_completion_task FOREIGN KEY (task_id) REFERENCES production_tasks(id),
  CONSTRAINT fk_task_completion_employee FOREIGN KEY (completed_by) REFERENCES employees(id)
);

CREATE TABLE reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  employee_id INT,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  remind_at DATETIME NOT NULL,
  interval_minutes INT DEFAULT 30,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reminders_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_reminders_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_reminders_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  INDEX idx_reminders_due (remind_at, is_read)
);

CREATE TABLE order_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  employee_id INT,
  action VARCHAR(120) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE order_bills (
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

CREATE TABLE order_status_history (
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

CREATE TABLE commissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  employee_id INT NOT NULL,
  user_role VARCHAR(50),
  commission_type VARCHAR(50) NOT NULL DEFAULT 'PRODUCTION',
  assigned_by INT,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  assignment_started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assignment_ended_at TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_payable BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMP NULL,
  cancelled_reason VARCHAR(255),
  cancelled_at TIMESTAMP NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_commission_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_commission_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_commission_assigned_by FOREIGN KEY (assigned_by) REFERENCES employees(id),
  INDEX idx_commission_employee (employee_id),
  INDEX idx_commission_order (order_id)
);

CREATE TABLE employee_performance (
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

CREATE TABLE order_assignments (
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
  CONSTRAINT fk_order_assignments_assigned_by FOREIGN KEY (assigned_by_admin_id) REFERENCES employees(id)
);

CREATE TABLE assignment_history (
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
  CONSTRAINT fk_assignment_history_changed_by FOREIGN KEY (changed_by_admin_id) REFERENCES employees(id)
);
