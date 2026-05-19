import { query } from '../config/db.js';

export async function recordStatusChange({ orderId, fromStatusId, toStatusId, changedBy, note = null, connection = null }) {
  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner(
    `INSERT INTO order_status_history (order_id, from_status_id, to_status_id, changed_by, note)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, fromStatusId || null, toStatusId, changedBy, note]
  );
}

export async function recordCommissionAssignment({ orderId, employeeId, assignedBy, commissionAmount = 0, connection = null }) {
  if (!employeeId) return;

  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner(
    `UPDATE commissions
     SET is_active = FALSE, assignment_ended_at = NOW()
     WHERE order_id = ? AND is_active = TRUE`,
    [orderId]
  );

  await runner(
    `INSERT INTO commissions (order_id, employee_id, assigned_by, commission_amount)
     VALUES (?, ?, ?, ?)`,
    [orderId, employeeId, assignedBy || null, commissionAmount || 0]
  );
}

export async function recordOrderAssignment({
  orderId,
  oldEmployeeId = null,
  newEmployeeId,
  assignedBy,
  assignedByRole,
  commissionAmount = 0,
  reason = null,
  taskId = null,
  connection = null
}) {
  if (!newEmployeeId) return;

  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner(
    `UPDATE order_assignments
     SET is_current = FALSE, assignment_ended_at = NOW()
     WHERE order_id = ? AND task_id <=> ? AND is_current = TRUE`,
    [orderId, taskId]
  );

  await runner(
    `INSERT INTO order_assignments (
      order_id, task_id, assigned_to_employee_id, assigned_by_admin_id,
      assigned_by_role, commission_amount
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, taskId, newEmployeeId, assignedBy, assignedByRole, commissionAmount || 0]
  );

  await runner(
    `INSERT INTO assignment_history (
      order_id, task_id, old_employee_id, new_employee_id,
      changed_by_admin_id, changed_by_role, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, taskId, oldEmployeeId || null, newEmployeeId, assignedBy, assignedByRole, reason]
  );
}

export async function markOrderCommissionsPayable({ orderId, connection = null }) {
  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);

  await runner('UPDATE commissions SET is_payable = TRUE WHERE order_id = ?', [orderId]);
}
