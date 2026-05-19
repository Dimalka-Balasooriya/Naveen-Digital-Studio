INSERT INTO roles (id, name) VALUES
  (1, 'OWNER'),
  (2, 'PRODUCTION_EMPLOYEE'),
  (3, 'CO_ADMIN');

INSERT INTO employees (id, role_id, name, email, phone, password_hash, is_active) VALUES
  (1, 1, 'Naveen Admin', 'admin@naveendigitalstudio.com', '+94770000001', '$2a$10$2OpcuJrXTMXOEvbkj0WizeNnodu.LsD3c80MxpwTvcg4ZIh/76qii', TRUE),
  (2, 2, 'Kasun Perera', 'kasun@naveendigitalstudio.com', '+94770000002', '$2a$10$2OpcuJrXTMXOEvbkj0WizeNnodu.LsD3c80MxpwTvcg4ZIh/76qii', TRUE),
  (3, 2, 'Amali Silva', 'amali@naveendigitalstudio.com', '+94770000003', '$2a$10$2OpcuJrXTMXOEvbkj0WizeNnodu.LsD3c80MxpwTvcg4ZIh/76qii', TRUE);

INSERT INTO facebook_pages (id, name, url, is_active) VALUES
  (1, 'Naveen Digital Studio Main', 'https://facebook.com/naveendigitalstudio', TRUE),
  (2, 'Custom Frames Sri Lanka', 'https://facebook.com/customframessl', TRUE),
  (3, 'Wedding Memories Frames', 'https://facebook.com/weddingmemoriesframes', TRUE);

INSERT INTO products (id, name, description, base_price, is_active) VALUES
  (1, 'A4 Photo Frame', 'Customized A4 printed frame', 2800.00, TRUE),
  (2, 'A3 Premium Frame', 'Large premium wall frame', 5200.00, TRUE),
  (3, 'LED Couple Frame', 'Custom couple frame with LED effect', 7500.00, TRUE),
  (4, 'Birthday Collage Frame', 'Personalized birthday collage', 4200.00, TRUE);

INSERT INTO order_statuses (id, name, color, sort_order, is_final, is_active) VALUES
  (1, 'New', 'sky', 1, FALSE, TRUE),
  (2, 'Designing', 'violet', 2, FALSE, TRUE),
  (3, 'Printing', 'amber', 3, FALSE, TRUE),
  (4, 'Framing', 'orange', 4, FALSE, TRUE),
  (5, 'Ready', 'emerald', 5, FALSE, TRUE),
  (6, 'Completed', 'green', 6, TRUE, TRUE),
  (7, 'Returned', 'rose', 7, TRUE, TRUE);

INSERT INTO production_tasks (id, name, description, sort_order, is_active) VALUES
  (1, 'Confirm Photo Quality', 'Check image resolution and print suitability', 1, TRUE),
  (2, 'Prepare Design', 'Create and approve the frame artwork', 2, TRUE),
  (3, 'Print Artwork', 'Print final artwork', 3, TRUE),
  (4, 'Frame Assembly', 'Assemble artwork and frame', 4, TRUE),
  (5, 'Final Quality Check', 'Inspect product before delivery', 5, TRUE);

INSERT INTO customers (id, name, phone, address, notes) VALUES
  (1, 'Dinuka Fernando', '+94771111111', 'Negombo', 'Prefers WhatsApp updates'),
  (2, 'Hashini Jayawardena', '+94772222222', 'Colombo 05', 'Wedding gift order'),
  (3, 'Ramesh Kumar', '+94773333333', 'Kandy', 'Needs courier delivery'),
  (4, 'Tharushi Perera', '+94774444444', 'Gampaha', 'Birthday surprise');

INSERT INTO orders (id, order_number, customer_id, product_id, facebook_page_id, status_id, assigned_employee_id, needed_date, is_fast, quantity, order_quantity, total_amount, advance_amount, production_progress, design_notes, created_by, created_at) VALUES
  (1, 'NDS-20260518-001', 1, 2, 1, 2, 2, '2026-05-22', FALSE, 1, 1, 5200.00, 2000.00, 35, 'Use bright family photo layout', 1, '2026-05-18 09:15:00'),
  (2, 'NDS-20260518-002', 2, 3, 3, 3, 3, '2026-05-20', TRUE, 1, 1, 7500.00, 3000.00, 55, 'Gold theme with couple names', 1, '2026-05-18 10:20:00'),
  (3, 'NDS-20260517-003', 3, 1, 2, 5, 2, '2026-05-19', TRUE, 2, 2, 5600.00, 2500.00, 90, 'Courier by evening', 1, '2026-05-17 14:45:00'),
  (4, 'NDS-20260516-004', 4, 4, 1, 6, 3, '2026-05-18', FALSE, 1, 1, 4200.00, 4200.00, 100, 'Pink and white collage', 1, '2026-05-16 11:30:00');

INSERT INTO order_task_completions (order_id, task_id, completed_by, is_completed, completed_at) VALUES
  (1, 1, 2, TRUE, '2026-05-18 10:00:00'),
  (1, 2, 2, TRUE, '2026-05-18 12:30:00'),
  (2, 1, 3, TRUE, '2026-05-18 11:15:00'),
  (2, 2, 3, TRUE, '2026-05-18 13:00:00'),
  (2, 3, 3, TRUE, '2026-05-18 15:00:00'),
  (3, 1, 2, TRUE, '2026-05-17 16:00:00'),
  (3, 2, 2, TRUE, '2026-05-17 17:15:00'),
  (3, 3, 2, TRUE, '2026-05-18 09:00:00'),
  (3, 4, 2, TRUE, '2026-05-18 13:40:00'),
  (4, 1, 3, TRUE, '2026-05-16 13:00:00'),
  (4, 2, 3, TRUE, '2026-05-16 15:00:00'),
  (4, 3, 3, TRUE, '2026-05-17 09:10:00'),
  (4, 4, 3, TRUE, '2026-05-17 11:25:00'),
  (4, 5, 3, TRUE, '2026-05-17 14:00:00');

INSERT INTO reminders (order_id, employee_id, title, message, remind_at, interval_minutes, is_read, created_by) VALUES
  (2, 3, 'Fast order deadline', 'LED Couple Frame should move to framing today.', '2026-05-18 16:30:00', 30, FALSE, 1),
  (3, 2, 'Courier preparation', 'A4 Photo Frame order needs packing and courier label.', '2026-05-18 17:00:00', 30, FALSE, 1);

INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by, note, changed_at) VALUES
  (1, NULL, 1, 1, 'Order created', '2026-05-18 09:15:00'),
  (1, 1, 2, 2, 'Design started', '2026-05-18 12:30:00'),
  (2, NULL, 1, 1, 'Order created', '2026-05-18 10:20:00'),
  (2, 1, 2, 3, 'Artwork started', '2026-05-18 13:00:00'),
  (2, 2, 3, 3, 'Sent to print', '2026-05-18 15:00:00'),
  (3, NULL, 1, 1, 'Order created', '2026-05-17 14:45:00'),
  (3, 1, 5, 2, 'Ready for courier', '2026-05-18 13:40:00'),
  (4, NULL, 1, 1, 'Order created', '2026-05-16 11:30:00'),
  (4, 1, 6, 3, 'Delivered and completed', '2026-05-17 14:00:00');

INSERT INTO commissions (order_id, employee_id, assigned_by, commission_amount, assignment_started_at, is_active, is_payable, notes) VALUES
  (1, 2, 1, 450.00, '2026-05-18 09:15:00', TRUE, FALSE, 'Design commission'),
  (2, 3, 1, 700.00, '2026-05-18 10:20:00', TRUE, FALSE, 'Fast order commission'),
  (3, 2, 1, 500.00, '2026-05-17 14:45:00', TRUE, FALSE, 'Courier-ready order'),
  (4, 3, 1, 400.00, '2026-05-16 11:30:00', TRUE, TRUE, 'Completed order commission');
