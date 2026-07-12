-- Naveen Digital Studio - Business Data Reset
-- ------------------------------------------------------------
-- Use this when you want a fresh system before real shop usage.
--
-- This clears old/sample operational data:
-- orders, customers, order history, commissions, bills, reports,
-- attendance logs, messages, and stock sample/inventory data.
--
-- This keeps core setup/login data:
-- roles, employees/users, order statuses, products, Facebook pages,
-- courier services, and production task definitions.
--
-- IMPORTANT:
-- 1. Take a database backup before running this file.
-- 2. Run this only on the database you want to clean.
-- 3. Do not run this if you need old order/report/history data.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS order_number_sequences (
  order_date CHAR(8) PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Internal messages
DELETE FROM message_recipients;
DELETE FROM messages;

-- Attendance and generated performance snapshots
DELETE FROM attendance_logs;
DELETE FROM employee_performance;

-- Stock bills/history/sample inventory
DELETE FROM stock_wholesale_bill_items;
DELETE FROM stock_wholesale_bills;
DELETE FROM stock_bills;
DELETE FROM stock_movements;
DELETE FROM stock_items;
DELETE FROM stock_catalog_items;
DELETE FROM stock_branches;

-- Order-related child/history tables
DELETE FROM order_task_completions;
DELETE FROM reminders;
DELETE FROM order_activity;
DELETE FROM order_bills;
DELETE FROM commissions;
DELETE FROM assignment_history;
DELETE FROM order_assignments;
DELETE FROM order_status_history;

-- Orders and customers
DELETE FROM orders;
DELETE FROM customers;
DELETE FROM order_number_sequences;

-- Reset auto increment counters
ALTER TABLE message_recipients AUTO_INCREMENT = 1;
ALTER TABLE messages AUTO_INCREMENT = 1;
ALTER TABLE attendance_logs AUTO_INCREMENT = 1;
ALTER TABLE employee_performance AUTO_INCREMENT = 1;
ALTER TABLE stock_wholesale_bill_items AUTO_INCREMENT = 1;
ALTER TABLE stock_wholesale_bills AUTO_INCREMENT = 1;
ALTER TABLE stock_bills AUTO_INCREMENT = 1;
ALTER TABLE stock_movements AUTO_INCREMENT = 1;
ALTER TABLE stock_items AUTO_INCREMENT = 1;
ALTER TABLE stock_catalog_items AUTO_INCREMENT = 1;
ALTER TABLE stock_branches AUTO_INCREMENT = 1;
ALTER TABLE order_task_completions AUTO_INCREMENT = 1;
ALTER TABLE reminders AUTO_INCREMENT = 1;
ALTER TABLE order_activity AUTO_INCREMENT = 1;
ALTER TABLE order_bills AUTO_INCREMENT = 1;
ALTER TABLE commissions AUTO_INCREMENT = 1;
ALTER TABLE assignment_history AUTO_INCREMENT = 1;
ALTER TABLE order_assignments AUTO_INCREMENT = 1;
ALTER TABLE order_status_history AUTO_INCREMENT = 1;
ALTER TABLE orders AUTO_INCREMENT = 1;
ALTER TABLE customers AUTO_INCREMENT = 1;

-- Recreate default stock branches with empty quantity.
INSERT INTO stock_branches (branch_name, short_code, quantity)
VALUES
  ('Kurunegala Branch', 'KUR', 0),
  ('Galgamuwa Branch', 'GAL', 0);

SET FOREIGN_KEY_CHECKS = 1;

-- Quick check after running:
-- SELECT COUNT(*) AS orders_count FROM orders;
-- SELECT COUNT(*) AS customers_count FROM customers;
-- SELECT COUNT(*) AS stock_items_count FROM stock_items;
