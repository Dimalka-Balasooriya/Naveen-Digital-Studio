import { z } from 'zod';
import { recordStatusChange } from '../utils/tracking.js';

export const correctionPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});
export const correctionCompletionSchema = z.object({ expected_history_id: z.number().int().nonnegative().safe() }).strict();
const error = (message, status) => Object.assign(new Error(message), { status });

// Prefer the existing main designer; support the existing current assignment model too.
const designerId = `COALESCE(
  (SELECT e.id FROM employees e JOIN roles r ON r.id=e.role_id
    WHERE e.id=o.assigned_employee_id AND UPPER(r.name) IN ('DESIGN_TEAM','DESIGN')),
  (SELECT a.assigned_to_employee_id FROM order_assignments a
    JOIN employees e ON e.id=a.assigned_to_employee_id JOIN roles r ON r.id=e.role_id
    WHERE a.order_id=o.id AND COALESCE(a.is_current, TRUE)=TRUE
      AND UPPER(r.name) IN ('DESIGN_TEAM','DESIGN')
    ORDER BY a.task_id IS NULL DESC, a.assignment_started_at DESC, a.id DESC LIMIT 1))`;
const historyVersion = `(SELECT COALESCE(MAX(h.id),0) FROM order_status_history h WHERE h.order_id=o.id)`;
const from = `FROM orders o JOIN order_statuses s ON s.id=o.status_id
  JOIN employees designer ON designer.id=${designerId}
  JOIN customers c ON c.id=o.customer_id JOIN products p ON p.id=o.product_id
  WHERE BINARY s.name='Correction' AND COALESCE(o.is_deleted,FALSE)=FALSE
    AND o.deleted_at IS NULL AND COALESCE(o.archived_from_active_list,FALSE)=FALSE`;
export const pendingCorrectionCountSql = `SELECT COUNT(*) AS total ${from}`;

export function correctionQueueQuery(input) {
  const { page, limit } = correctionPageSchema.parse(input);
  return { page, limit, sql: `SELECT o.id, o.order_number, o.customer_id,
    c.name AS customer_name, c.phone AS customer_phone, p.name AS product_name,
    p.description AS product_description, o.order_quantity, o.design_notes,
    designer.id AS original_designer_id, designer.name AS original_designer_name,
    o.is_fast, o.needed_date, s.name AS status_name, s.color AS status_color,
    ${historyVersion} AS correction_history_id,
    (SELECT h.note FROM order_status_history h WHERE h.order_id=o.id AND h.to_status_id=o.status_id
      ORDER BY h.id DESC LIMIT 1) AS correction_note,
    (SELECT h.notes FROM order_calling_history h JOIN order_calling_state cs ON cs.order_id=h.order_id
      WHERE h.order_id=o.id AND cs.calling_status='Correction (Call Agent)'
        AND h.new_status='Correction (Call Agent)' ORDER BY h.changed_at DESC,h.id DESC LIMIT 1) AS calling_correction_note
    ${from} ORDER BY o.is_fast DESC, o.needed_date ASC, o.created_at ASC, o.id ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}` };
}

export async function completeCorrection(connection, { orderId, user, body }) {
  if (user.role !== 'DESIGN_TEAM') throw error('Only designers can complete shared corrections.', 403);
  const { expected_history_id } = correctionCompletionSchema.parse(body);
  await connection.beginTransaction();
  try {
    // Serialize completion and status writes on this existing order, never reassign it.
    const [locked] = await connection.execute('SELECT id FROM orders WHERE id=? FOR UPDATE', [orderId]);
    if (!locked.length) throw error('Order not found.', 404);
    const [rows] = await connection.execute(`SELECT o.status_id, ${historyVersion} AS correction_history_id ${from} AND o.id=?`, [orderId]);
    if (!rows.length || Number(rows[0].correction_history_id) !== expected_history_id) {
      throw error('This correction has changed or was already completed. Refresh the panel.', 409);
    }
    const [statuses] = await connection.execute("SELECT id FROM order_statuses WHERE BINARY name='Correction Done'");
    if (statuses.length !== 1) throw error('The existing Correction Done status must be configured before completing corrections.', 409);
    const statusId = statuses[0].id;
    await connection.execute('UPDATE orders SET status_id=? WHERE id=?', [statusId, orderId]);
    // Correction Done has no commission/progress side effects in the existing workflow.
    // Avoid the generic workflow initializer here: it can execute DDL/seed statuses inside a transaction.
    await recordStatusChange({ orderId, fromStatusId: rows[0].status_id, toStatusId: statusId,
      changedBy: user.id, note: 'Correction completed from shared Correction panel', connection });
    await connection.execute('INSERT INTO order_activity (order_id, employee_id, action, details) VALUES (?, ?, ?, ?)',
      [orderId, user.id, 'Completed shared correction', 'Correction → Correction Done; original assignment preserved']);
    await connection.commit();
    return { status_id: statusId, status_name: 'Correction Done', message: 'Correction completed.' };
  } catch (err) { await connection.rollback(); throw err; }
}
