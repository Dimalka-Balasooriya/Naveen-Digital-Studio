SET @has_employee_deleted_at = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'deleted_at'
);

SET @employee_management_sql = IF(
  @has_employee_deleted_at = 0,
  'ALTER TABLE employees ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active',
  'SELECT ''employees.deleted_at already exists'''
);

PREPARE employee_management_stmt FROM @employee_management_sql;
EXECUTE employee_management_stmt;
DEALLOCATE PREPARE employee_management_stmt;
