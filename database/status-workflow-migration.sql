SET @has_commission_cancelled_reason = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commissions'
    AND COLUMN_NAME = 'cancelled_reason'
);

SET @commission_cancelled_reason_sql = IF(
  @has_commission_cancelled_reason = 0,
  'ALTER TABLE commissions ADD COLUMN cancelled_reason VARCHAR(255) NULL AFTER paid_at',
  'SELECT ''commissions.cancelled_reason already exists'''
);

PREPARE commission_cancelled_reason_stmt FROM @commission_cancelled_reason_sql;
EXECUTE commission_cancelled_reason_stmt;
DEALLOCATE PREPARE commission_cancelled_reason_stmt;

SET @has_commission_cancelled_at = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commissions'
    AND COLUMN_NAME = 'cancelled_at'
);

SET @commission_cancelled_at_sql = IF(
  @has_commission_cancelled_at = 0,
  'ALTER TABLE commissions ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_reason',
  'SELECT ''commissions.cancelled_at already exists'''
);

PREPARE commission_cancelled_at_stmt FROM @commission_cancelled_at_sql;
EXECUTE commission_cancelled_at_stmt;
DEALLOCATE PREPARE commission_cancelled_at_stmt;

INSERT INTO order_statuses (name, color, sort_order, is_final, is_active)
SELECT 'Rearrange', 'purple', next_sort_order, FALSE, TRUE
FROM (
  SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM order_statuses
) status_seed
WHERE NOT EXISTS (
  SELECT 1 FROM order_statuses existing_status WHERE existing_status.name = 'Rearrange'
);
