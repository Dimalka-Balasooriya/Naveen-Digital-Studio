-- Adds recipient contact and parcel weight fields used by the special courier bill.
-- Safe to run multiple times.

SET @has_recipient_contact_number := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'recipient_contact_number'
);
SET @add_recipient_contact_number := IF(
  @has_recipient_contact_number = 0,
  'ALTER TABLE orders ADD COLUMN recipient_contact_number VARCHAR(30) NULL AFTER tracking_number',
  'SELECT ''orders.recipient_contact_number already exists'''
);
PREPARE stmt FROM @add_recipient_contact_number;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_parcel_weight := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orders'
    AND COLUMN_NAME = 'parcel_weight'
);
SET @add_parcel_weight := IF(
  @has_parcel_weight = 0,
  'ALTER TABLE orders ADD COLUMN parcel_weight VARCHAR(40) NULL DEFAULT ''1kg'' AFTER recipient_contact_number',
  'SELECT ''orders.parcel_weight already exists'''
);
PREPARE stmt FROM @add_parcel_weight;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
