import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306)
});

const [columns] = await connection.query(
  `SELECT COLUMN_NAME
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'orders'
     AND COLUMN_NAME = 'order_quantity'`
);

if (!columns.length) {
  await connection.query('ALTER TABLE orders ADD COLUMN order_quantity INT NOT NULL DEFAULT 1');
}

await connection.query('UPDATE orders SET order_quantity = COALESCE(NULLIF(quantity, 0), 1) WHERE order_quantity = 1');
await connection.end();

console.log('order_quantity ready');
