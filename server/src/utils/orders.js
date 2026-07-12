import { query } from '../config/db.js';

async function run(connection, sql, params) {
  if (connection) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

export async function ensureOrderNumberSequenceSupport(connection = null) {
  await run(
    connection,
    `CREATE TABLE IF NOT EXISTS order_number_sequences (
      order_date CHAR(8) PRIMARY KEY,
      last_number INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    []
  );
}

export async function createOrderNumber(connection = null) {
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const maxDailyOrderNumber = 999999;

  const existingRows = await run(
    connection,
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(order_number, '-', -1) AS UNSIGNED)), 0) AS last_number
     FROM orders
     WHERE order_number LIKE ?
       AND SUBSTRING_INDEX(order_number, '-', -1) REGEXP '^[0-9]{1,6}$'`,
    [`NDS-${today}-%`]
  );
  const existingLastNumber = Math.min(Number(existingRows[0]?.last_number || 0), maxDailyOrderNumber - 1);

  await run(
    connection,
    'INSERT IGNORE INTO order_number_sequences (order_date, last_number) VALUES (?, ?)',
    [today, existingLastNumber]
  );

  await run(
    connection,
    `UPDATE order_number_sequences
     SET last_number = ?
     WHERE order_date = ?
       AND (last_number < 0 OR last_number >= ?)`,
    [existingLastNumber, today, maxDailyOrderNumber]
  );

  await run(
    connection,
    `UPDATE order_number_sequences
     SET last_number = LAST_INSERT_ID(LEAST(GREATEST(last_number, ?), ?) + 1)
     WHERE order_date = ?`,
    [existingLastNumber, maxDailyOrderNumber - 1, today]
  );

  const rows = await run(connection, 'SELECT LAST_INSERT_ID() AS next_number', []);
  const nextNumber = Number(rows[0]?.next_number || 1);
  const next = String(nextNumber).padStart(3, '0');
  return `NDS-${today}-${next}`;
}

export async function ensureOrderTasks(orderId) {
  await query(
    `INSERT IGNORE INTO order_task_completions (order_id, task_id)
     SELECT :orderId, id FROM production_tasks WHERE is_active = TRUE`,
    { orderId }
  );
}
