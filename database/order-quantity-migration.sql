ALTER TABLE orders
ADD COLUMN order_quantity INT NOT NULL DEFAULT 1;

UPDATE orders
SET order_quantity = COALESCE(NULLIF(quantity, 0), 1)
WHERE order_quantity = 1;
