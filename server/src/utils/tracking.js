import { query } from '../config/db.js';

let hasCheckedWorkflowColumns = false;

async function run(connection, sql, params = []) {
  if (connection) {
    const [rows] = await connection.execute(sql, params);
    return rows;
  }
  return query(sql, params);
}

export async function ensureStatusWorkflowSupport({ connection = null } = {}) {
  if (!hasCheckedWorkflowColumns) {
    const cancelledReasonRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'cancelled_reason'`
    );
    if (!Number(cancelledReasonRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN cancelled_reason VARCHAR(255) NULL AFTER paid_at');
    }

    const cancelledAtRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'cancelled_at'`
    );
    if (!Number(cancelledAtRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancelled_reason');
    }

    const paidAmountRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'paid_amount'`
    );
    if (!Number(paidAmountRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER paid_at');
    }

    const paymentNotesRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'payment_notes'`
    );
    if (!Number(paymentNotesRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN payment_notes VARCHAR(255) NULL AFTER paid_amount');
    }

    const userRoleRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'user_role'`
    );
    if (!Number(userRoleRows[0]?.column_count || 0)) {
      await run(connection, 'ALTER TABLE commissions ADD COLUMN user_role VARCHAR(50) NULL AFTER employee_id');
    }

    const commissionTypeRows = await run(
      connection,
      `SELECT COUNT(*) AS column_count
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'commissions'
         AND COLUMN_NAME = 'commission_type'`
    );
    if (!Number(commissionTypeRows[0]?.column_count || 0)) {
      await run(connection, "ALTER TABLE commissions ADD COLUMN commission_type VARCHAR(50) NOT NULL DEFAULT 'PRODUCTION' AFTER user_role");
    }

    hasCheckedWorkflowColumns = true;
  }

  await seedDefaultOrderStatuses({ connection });
}

const defaultOrderStatuses = [
  'New',
  'editing',
  'editing done',
  'editing sent',
  'correction',
  'correction done',
  'address received',
  'order confirmed',
  'billing done',
  'save',
  'save done',
  'on printing',
  'printing done',
  'issued for production',
  'collected by night branch',
  'collected by warehouse',
  'collecting by kb',
  'production ongoing',
  'issued for transport lorry/wheel',
  'order processing',
  'order reschedule 01',
  'order reschedule 02',
  'order reschedule 03',
  'complete',
  'returned'
];

export function isCompleteStatusName(statusName) {
  return ['complete', 'completed'].includes(String(statusName || '').trim().toLowerCase());
}

export function returnedCancelReason(statusName) {
  const normalized = String(statusName || '').trim().toLowerCase();
  if (['return', 'returned'].includes(normalized)) return 'Order returned';
  if (['cancel', 'cancelled', 'canceled'].includes(normalized)) return 'Order cancelled';
  return null;
}

export async function seedDefaultOrderStatuses({ connection = null } = {}) {
  for (const [index, name] of defaultOrderStatuses.entries()) {
    await run(
      connection,
      `INSERT INTO order_statuses (name, color, sort_order, is_final, is_active)
       SELECT ?, 'slate', ?, ?, TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM order_statuses existing_status WHERE LOWER(existing_status.name) = LOWER(?)
       )`,
      [name, index + 1, isCompleteStatusName(name) || ['returned'].includes(name), name]
    );
  }
}

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

export async function applyOrderStatusWorkflow({ orderId, statusId, connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  const statusRows = await run(connection, 'SELECT name FROM order_statuses WHERE id = ?', [statusId]);
  const statusName = String(statusRows[0]?.name || '').trim().toLowerCase();

  const cancellationReason = returnedCancelReason(statusName);
  if (cancellationReason) {
    if (cancellationReason === 'Order returned') {
      await deductReturnedOrderCommissions({ orderId, connection });
      return 'Order returned. Rs. 20 was deducted from every related commission.';
    }

    await cancelOrderCommissions({ orderId, reason: cancellationReason, connection });
    return `${cancellationReason}. Related commissions were removed.`;
  }

  return null;
}

function runnerFor(connection) {
  const runner = connection
    ? (sql, params) => connection.execute(sql, params)
    : (sql, params) => query(sql, params);
  return runner;
}

export async function cancelOrderCommissions({ orderId, reason = 'Order returned', connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  await run(
    connection,
    `UPDATE commissions
     SET is_payable = FALSE,
         commission_amount = 0,
         is_active = FALSE,
         cancelled_reason = ?,
         cancelled_at = NOW()
     WHERE order_id = ?`,
    [reason, orderId]
  );
}

export async function deductReturnedOrderCommissions({ orderId, connection = null }) {
  await ensureStatusWorkflowSupport({ connection });
  await run(
    connection,
    `UPDATE commissions
     SET commission_amount = GREATEST(commission_amount - 20, 0),
         cancelled_reason = 'Order returned - Rs. 20 deducted',
         cancelled_at = NOW()
     WHERE order_id = ?
       AND paid_at IS NULL
       AND cancelled_at IS NULL`,
    [orderId]
  );
}

export async function endActiveOrderCommissions({ orderId, commissionType = null, connection = null }) {
  const runner = runnerFor(connection);
  const typeClause = commissionType ? ' AND commission_type = ?' : '';
  const params = commissionType ? [orderId, commissionType] : [orderId];

  await runner(
    `UPDATE commissions
     SET is_active = FALSE, assignment_ended_at = NOW()
     WHERE order_id = ? AND is_active = TRUE${typeClause}`,
    params
  );
}

export async function createCommissionAssignment({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const runner = runnerFor(connection);

  await runner(
    `INSERT INTO commissions (order_id, employee_id, user_role, commission_type, assigned_by, commission_amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, employeeId, userRole, commissionType, assignedBy || null, commissionAmount || 0]
  );
  return null;
}

export async function updateCurrentCommission({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const runner = runnerFor(connection);
  const existing = await run(
    connection,
    `SELECT id
     FROM commissions
     WHERE order_id = ? AND employee_id = ? AND commission_type = ? AND is_active = TRUE
     ORDER BY assignment_started_at DESC, id DESC
     LIMIT 1`,
    [orderId, employeeId, commissionType]
  );

  if (existing.length) {
    await runner(
      `UPDATE commissions
       SET commission_amount = ?,
           user_role = COALESCE(?, user_role),
           assigned_by = COALESCE(?, assigned_by),
           is_payable = CASE WHEN cancelled_at IS NULL THEN is_payable ELSE FALSE END
       WHERE id = ?`,
      [commissionAmount || 0, userRole, assignedBy || null, existing[0].id]
    );
    return existing[0];
  }

  return createCommissionAssignment({ orderId, employeeId, assignedBy, commissionAmount, userRole, commissionType, connection });
}

export async function recordCommissionAssignment({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return;

  await createCommissionAssignment({ orderId, employeeId, assignedBy, commissionAmount, userRole, commissionType, connection });
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
  await ensureStatusWorkflowSupport({ connection });
  const runner = runnerFor(connection);

  await runner('UPDATE commissions SET is_payable = TRUE WHERE order_id = ? AND cancelled_at IS NULL', [orderId]);
}

export async function upsertCompletionCommission({
  orderId,
  employeeId,
  assignedBy,
  commissionAmount = 0,
  userRole = null,
  commissionType = 'PRODUCTION',
  connection = null
}) {
  if (!employeeId) return null;
  await ensureStatusWorkflowSupport({ connection });

  const existing = await run(
    connection,
    `SELECT id
     FROM commissions
     WHERE order_id = ? AND employee_id = ? AND commission_type = ? AND cancelled_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [orderId, employeeId, commissionType]
  );

  if (existing.length) {
    await run(
      connection,
      `UPDATE commissions
       SET commission_amount = ?,
           user_role = COALESCE(?, user_role),
           assigned_by = COALESCE(?, assigned_by),
           is_active = TRUE,
           is_payable = TRUE
       WHERE id = ?`,
      [commissionAmount || 0, userRole, assignedBy || null, existing[0].id]
    );
    return existing[0];
  }

  await run(
    connection,
    `INSERT INTO commissions (
       order_id, employee_id, user_role, commission_type, assigned_by,
       commission_amount, is_active, is_payable, assignment_started_at
     )
     VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, NOW())`,
    [orderId, employeeId, userRole, commissionType, assignedBy || null, commissionAmount || 0]
  );
  return null;
}
