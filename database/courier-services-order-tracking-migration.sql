CREATE TABLE IF NOT EXISTS courier_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET @has_courier_service_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'courier_service_id'
);
SET @add_courier_service_id := IF(
  @has_courier_service_id = 0,
  'ALTER TABLE orders ADD COLUMN courier_service_id INT NULL AFTER facebook_page_id',
  'SELECT ''orders.courier_service_id already exists'''
);
PREPARE stmt FROM @add_courier_service_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_tracking_number := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'tracking_number'
);
SET @add_tracking_number := IF(
  @has_tracking_number = 0,
  'ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(120) NULL AFTER courier_service_id',
  'SELECT ''orders.tracking_number already exists'''
);
PREPARE stmt FROM @add_tracking_number;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
