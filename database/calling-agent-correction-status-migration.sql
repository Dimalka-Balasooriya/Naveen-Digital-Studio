ALTER TABLE order_calling_state
  MODIFY COLUMN calling_status
  ENUM('Not Called','No Answer','Call Back','Confirmed','Wrong Number','Completed','Correction (Call Agent)')
  NOT NULL DEFAULT 'Not Called';
