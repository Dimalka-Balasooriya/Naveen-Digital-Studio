INSERT IGNORE INTO roles (name) VALUES ('DESIGN_TEAM');

UPDATE employees e
JOIN roles current_role ON current_role.id = e.role_id
JOIN roles design_role ON design_role.name = 'DESIGN_TEAM'
SET e.role_id = design_role.id
WHERE current_role.name = 'PRODUCTION_EMPLOYEE';

INSERT INTO order_statuses (name, color, sort_order, is_final, is_active)
SELECT 'Production Done', '#059669', seed.next_sort_order, FALSE, TRUE
FROM (SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM order_statuses) seed
WHERE NOT EXISTS (
  SELECT 1
  FROM order_statuses
  WHERE LOWER(name) = LOWER('Production Done')
);
