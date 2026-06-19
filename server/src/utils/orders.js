import { query } from '../config/db.js';

async function run(connection, sql, params) {
  if (connection) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

export async function createOrderNumber(connection = null) {
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rows = await run(
    connection,
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(order_number, '-', -1) AS UNSIGNED)), 0) AS last_number
     FROM orders
     WHERE order_number LIKE ?`,
    [`NDS-${today}-%`]
  );
  const next = String((rows[0]?.last_number || 0) + 1).padStart(3, '0');
  return `NDS-${today}-${next}`;
}

export async function ensureOrderTasks(orderId) {
  await query(
    `INSERT IGNORE INTO order_task_completions (order_id, task_id)
     SELECT :orderId, id FROM production_tasks WHERE is_active = TRUE`,
    { orderId }
  );
}
