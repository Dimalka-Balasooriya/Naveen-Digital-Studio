SET @has_assigned_co_admin_id = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'assigned_co_admin_id'
);

SET @assigned_co_admin_sql = IF(
  @has_assigned_co_admin_id = 0,
  'ALTER TABLE orders ADD COLUMN assigned_co_admin_id INT NULL AFTER assigned_employee_id',
  'SELECT ''orders.assigned_co_admin_id already exists'''
);

PREPARE assigned_co_admin_stmt FROM @assigned_co_admin_sql;
EXECUTE assigned_co_admin_stmt;
DEALLOCATE PREPARE assigned_co_admin_stmt;

INSERT INTO order_statuses (name, color, sort_order, is_final, is_active)
SELECT status_name, 'slate', sort_order, status_name IN ('complete', 'returned'), TRUE
FROM (
  SELECT 'New' AS status_name, 1 AS sort_order UNION ALL
  SELECT 'editing', 2 UNION ALL
  SELECT 'editing done', 3 UNION ALL
  SELECT 'editing sent', 4 UNION ALL
  SELECT 'correction', 5 UNION ALL
  SELECT 'correction done', 6 UNION ALL
  SELECT 'address received', 7 UNION ALL
  SELECT 'order confirmed', 8 UNION ALL
  SELECT 'billing done', 9 UNION ALL
  SELECT 'save', 10 UNION ALL
  SELECT 'save done', 11 UNION ALL
  SELECT 'on printing', 12 UNION ALL
  SELECT 'printing done', 13 UNION ALL
  SELECT 'issued for production', 14 UNION ALL
  SELECT 'collected by night branch', 15 UNION ALL
  SELECT 'collected by warehouse', 16 UNION ALL
  SELECT 'collecting by kb', 17 UNION ALL
  SELECT 'production ongoing', 18 UNION ALL
  SELECT 'issued for transport lorry/wheel', 19 UNION ALL
  SELECT 'order processing', 20 UNION ALL
  SELECT 'order reschedule 01', 21 UNION ALL
  SELECT 'order reschedule 02', 22 UNION ALL
  SELECT 'order reschedule 03', 23 UNION ALL
  SELECT 'complete', 24 UNION ALL
  SELECT 'returned', 25
) default_statuses
WHERE NOT EXISTS (
  SELECT 1
  FROM order_statuses existing_status
  WHERE LOWER(existing_status.name) = LOWER(default_statuses.status_name)
);

UPDATE order_statuses
SET sort_order = CASE LOWER(name)
    WHEN 'new' THEN 1
    WHEN 'editing' THEN 2
    WHEN 'editing done' THEN 3
    WHEN 'editing sent' THEN 4
    WHEN 'correction' THEN 5
    WHEN 'correction done' THEN 6
    WHEN 'address received' THEN 7
    WHEN 'order confirmed' THEN 8
    WHEN 'billing done' THEN 9
    WHEN 'save' THEN 10
    WHEN 'save done' THEN 11
    WHEN 'on printing' THEN 12
    WHEN 'printing done' THEN 13
    WHEN 'issued for production' THEN 14
    WHEN 'collected by night branch' THEN 15
    WHEN 'collected by warehouse' THEN 16
    WHEN 'collecting by kb' THEN 17
    WHEN 'production ongoing' THEN 18
    WHEN 'issued for transport lorry/wheel' THEN 19
    WHEN 'order processing' THEN 20
    WHEN 'order reschedule 01' THEN 21
    WHEN 'order reschedule 02' THEN 22
    WHEN 'order reschedule 03' THEN 23
    WHEN 'complete' THEN 24
    WHEN 'completed' THEN 24
    WHEN 'returned' THEN 25
    WHEN 'return' THEN 25
    ELSE sort_order
  END,
  is_final = CASE
    WHEN LOWER(name) IN ('complete', 'completed', 'returned', 'return') THEN TRUE
    ELSE is_final
  END,
  is_active = TRUE
WHERE LOWER(name) IN (
  'new', 'editing', 'editing done', 'editing sent', 'correction', 'correction done',
  'address received', 'order confirmed', 'billing done', 'save', 'save done',
  'on printing', 'printing done', 'issued for production', 'collected by night branch',
  'collected by warehouse', 'collecting by kb', 'production ongoing',
  'issued for transport lorry/wheel', 'order processing', 'order reschedule 01',
  'order reschedule 02', 'order reschedule 03', 'complete', 'completed',
  'returned', 'return'
);
