SET @has_commission_user_role = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commissions'
    AND COLUMN_NAME = 'user_role'
);

SET @commission_user_role_sql = IF(
  @has_commission_user_role = 0,
  'ALTER TABLE commissions ADD COLUMN user_role VARCHAR(50) NULL AFTER employee_id',
  'SELECT ''commissions.user_role already exists'''
);

PREPARE commission_user_role_stmt FROM @commission_user_role_sql;
EXECUTE commission_user_role_stmt;
DEALLOCATE PREPARE commission_user_role_stmt;

SET @has_commission_type = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commissions'
    AND COLUMN_NAME = 'commission_type'
);

SET @commission_type_sql = IF(
  @has_commission_type = 0,
  'ALTER TABLE commissions ADD COLUMN commission_type VARCHAR(50) NOT NULL DEFAULT ''PRODUCTION'' AFTER user_role',
  'SELECT ''commissions.commission_type already exists'''
);

PREPARE commission_type_stmt FROM @commission_type_sql;
EXECUTE commission_type_stmt;
DEALLOCATE PREPARE commission_type_stmt;

UPDATE commissions c
JOIN employees e ON e.id = c.employee_id
JOIN roles r ON r.id = e.role_id
SET c.user_role = COALESCE(c.user_role, r.name),
    c.commission_type = COALESCE(c.commission_type, CASE WHEN r.name = 'CO_ADMIN' THEN 'CO_ADMIN' ELSE 'PRODUCTION' END);
