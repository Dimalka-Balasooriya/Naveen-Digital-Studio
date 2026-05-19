import { query } from '../config/db.js';

export async function createOrderNumber() {
  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rows = await query(
    'SELECT COUNT(*) AS count FROM orders WHERE order_number LIKE :prefix',
    { prefix: `NDS-${today}-%` }
  );
  const next = String((rows[0]?.count || 0) + 1).padStart(3, '0');
  return `NDS-${today}-${next}`;
}

export async function ensureOrderTasks(orderId) {
  await query(
    `INSERT IGNORE INTO order_task_completions (order_id, task_id)
     SELECT :orderId, id FROM production_tasks WHERE is_active = TRUE`,
    { orderId }
  );
}
